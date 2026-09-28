-- 196 · Re-parseo de los SISEC de Jordan en B2B (partner_transactions) con v2.2+mov y recálculo v5.6
-- (claude/89). Igual que 195 pero para consultas de aliados:
--   · sólo status 'completed' y producto normal o CHECKUP (DIAGNOSTICO_AVANZADO queda fuera: al cambiar
--     calculo_pensional dispara la generación del diagnóstico avanzado);
--   · el PDF se toma de documento_sisec_url (id de Drive) o, si falta, se busca por CURP;
--   · Calculos corre con mass_refresh (sin correo al aliado ni webhooks externos);
--   · mientras dure el lote, un trigger conserva las ligas de documentos que Calculos dejaría vacías
--     (Docs apagados en Calculos). Se quita al terminar (196b).

create table if not exists public.reparse_jordan_b2b_cola (
  transaction_id uuid primary key references public.partner_transactions(id) on delete cascade,
  curp text not null,
  file_id text,
  parser_anterior text,
  estado text not null default 'pendiente' check (estado in ('pendiente','procesando','ok','sin_pdf','error')),
  archivo_drive text,
  modificaciones int,
  detalle text,
  intentos int not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table public.reparse_jordan_b2b_cola enable row level security;

insert into public.reparse_jordan_b2b_cola (transaction_id, curp, file_id, parser_anterior)
select pt.id, upper(trim(pt.curp)), substring(pt.documento_sisec_url from '/d/([A-Za-z0-9_-]+)'),
       pt.json_sisec->'data'->'employment_info'->>'parser_version'
from public.partner_transactions pt left join public.products pr on pr.id = pt.product_id
where pt.json_sisec->'data'->'employment_info'->>'parser_version' in ('v2.0', 'v2.0+bloques4')
  and pt.status = 'completed'
  and coalesce(pr.code, '') not in ('DIAGNOSTICO_AVANZADO', 'DIAGNOSTICO_AVANZADO_SESION')
  and length(trim(coalesce(pt.curp, ''))) = 18
on conflict (transaction_id) do nothing;

create or replace function public.reparse_jordan_b2b_tomar(p_n int default 25)
returns table (transaction_id uuid, curp text, file_id text)
language sql security definer set search_path to 'public' as $$
  update public.reparse_jordan_b2b_cola q
     set estado = 'procesando', intentos = q.intentos + 1, actualizado_en = now()
   where q.transaction_id in (
     select x.transaction_id from public.reparse_jordan_b2b_cola x
      where x.estado = 'pendiente' or (x.estado = 'procesando' and x.actualizado_en < now() - interval '30 minutes' and x.intentos < 3)
      order by x.creado_en, x.transaction_id limit greatest(1, least(p_n, 100))
      for update skip locked)
  returning q.transaction_id, q.curp, q.file_id;
$$;

create or replace function public.reparse_jordan_b2b_guardar(p_tx uuid, p_archivo text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare t record; mods int; ehj jsonb; ev jsonb;
begin
  ehj := p_payload -> 'employment_history_json';
  ev := ehj #> '{data,employment_events}';
  if ehj is null or jsonb_typeof(ev) <> 'array' or jsonb_array_length(ev) = 0 then
    update public.reparse_jordan_b2b_cola set estado = 'error', archivo_drive = p_archivo,
           detalle = 'el PDF no dio eventos', actualizado_en = now() where transaction_id = p_tx;
    return jsonb_build_object('ok', false);
  end if;
  select count(*) into mods from jsonb_array_elements(ev) e where e->>'event_type' = 'salary_modification';
  update public.partner_transactions set json_sisec = ehj where id = p_tx;
  select * into t from public.partner_transactions where id = p_tx;
  update public.reparse_jordan_b2b_cola set estado = 'ok', archivo_drive = p_archivo, modificaciones = mods,
         detalle = null, actualizado_en = now() where transaction_id = p_tx;
  return jsonb_build_object('ok', true, 'transaction_id', t.id, 'curp', t.curp, 'nombre', t.nombre,
    'email', t.email, 'partner', t.partner, 'drive_folder_id', t.drive_folder_id,
    'EstadoRep', t.estado_republica, 'link_sisec', t.documento_sisec_url,
    'fecha_sisec', ehj #>> '{data,employment_info,emission_date}', 'modificaciones', mods);
end $$;

create or replace function public.reparse_jordan_b2b_marcar(p_tx uuid, p_estado text, p_detalle text default null)
returns void language sql security definer set search_path to 'public' as $$
  update public.reparse_jordan_b2b_cola set estado = p_estado, detalle = p_detalle, actualizado_en = now()
   where transaction_id = p_tx;
$$;

revoke all on function public.reparse_jordan_b2b_tomar(int), public.reparse_jordan_b2b_guardar(uuid, text, jsonb),
  public.reparse_jordan_b2b_marcar(uuid, text, text) from public, anon, authenticated;
grant execute on function public.reparse_jordan_b2b_tomar(int), public.reparse_jordan_b2b_guardar(uuid, text, jsonb),
  public.reparse_jordan_b2b_marcar(uuid, text, text) to service_role;

-- Temporal: conserva las ligas de documentos de las consultas en la cola mientras Calculos corre sin Docs.
create or replace function public.tg_reparse_conserva_docs() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from public.reparse_jordan_b2b_cola q where q.transaction_id = new.id) then
    if coalesce(new.documento_checkup_url, '') = '' then new.documento_checkup_url := old.documento_checkup_url; end if;
    if coalesce(new.documento_diagnostico_url, '') = '' then new.documento_diagnostico_url := old.documento_diagnostico_url; end if;
  end if;
  return new;
end $$;
drop trigger if exists zz_reparse_conserva_docs on public.partner_transactions;
create trigger zz_reparse_conserva_docs before update on public.partner_transactions
  for each row execute function public.tg_reparse_conserva_docs();
