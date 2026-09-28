-- 195 · Re-leer los SISEC de Jordan con el parser v2.2+mov y recalcular con el motor v5.6 (claude/89).
--
-- Cola de trabajo para el workflow de n8n "Re-parsear SISEC Jordan (v5.6)": toma lotes, busca el
-- PDF en Drive ("Sisec clientes"), lo parsea con movimientos, guarda un proceso nuevo y llama a
-- Calculos con mass_refresh (sin correos ni envíos a aliados). Sólo clientes (public.clientes)
-- cuya consulta más reciente vino del parser de Jordan que tiraba las modificaciones de salario.

create table if not exists public.reparse_jordan_cola (
  cliente_id uuid primary key references public.clientes(id) on delete cascade,
  curp text not null,
  parser_anterior text,
  proceso_anterior uuid,
  estado text not null default 'pendiente' check (estado in ('pendiente','procesando','ok','sin_pdf','error')),
  archivo_drive text,
  proceso_nuevo uuid,
  modificaciones int,
  detalle text,
  intentos int not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table public.reparse_jordan_cola enable row level security;

insert into public.reparse_jordan_cola (cliente_id, curp, parser_anterior, proceso_anterior)
select p.cliente_id, upper(trim(c.curp)), p.pv, p.id
from (
  select distinct on (pr.cliente_id) pr.id, pr.cliente_id,
    coalesce(pr.json_sisec->'employment_history_json'->'data'->'employment_info'->>'parser_version',
             pr.json_sisec->'data'->'employment_info'->>'parser_version') pv
  from public.procesos pr where pr.json_sisec is not null order by pr.cliente_id, pr.created_at desc
) p join public.clientes c on c.id = p.cliente_id
where p.pv like 'v2%' and p.pv not like '%+mov' and length(trim(coalesce(c.curp,''))) = 18
on conflict (cliente_id) do nothing;

-- Toma n pendientes (o 'procesando' atorados > 30 min) y los marca en proceso.
create or replace function public.reparse_jordan_tomar(p_n int default 25)
returns table (cliente_id uuid, curp text)
language sql security definer set search_path to 'public' as $$
  update public.reparse_jordan_cola q
     set estado = 'procesando', intentos = q.intentos + 1, actualizado_en = now()
   where q.cliente_id in (
     select x.cliente_id from public.reparse_jordan_cola x
      where x.estado = 'pendiente' or (x.estado = 'procesando' and x.actualizado_en < now() - interval '30 minutes' and x.intentos < 3)
      order by x.creado_en, x.cliente_id limit greatest(1, least(p_n, 100))
      for update skip locked)
  returning q.cliente_id, q.curp;
$$;

-- Guarda el SISEC re-parseado como proceso nuevo y devuelve lo que Calculos necesita.
create or replace function public.reparse_jordan_guardar(p_cliente uuid, p_archivo text, p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare c record; pid uuid; mods int; ev jsonb;
begin
  ev := p_payload #> '{employment_history_json,data,employment_events}';
  if p_payload is null or jsonb_typeof(ev) <> 'array' or jsonb_array_length(ev) = 0 then
    update public.reparse_jordan_cola set estado = 'error', archivo_drive = p_archivo,
           detalle = 'el PDF no dio eventos', actualizado_en = now() where cliente_id = p_cliente;
    return jsonb_build_object('ok', false);
  end if;
  select count(*) into mods from jsonb_array_elements(ev) e where e->>'event_type' = 'salary_modification';
  select * into c from public.clientes where id = p_cliente;
  insert into public.procesos (cliente_id, tipo_servicio, estado, json_sisec, datos_entrada)
  values (p_cliente, 'Recalculo v5.6', 'DATA_READY', p_payload,
          jsonb_build_object('origen', 'reparse_jordan_v56', 'archivo_drive', p_archivo))
  returning id into pid;
  update public.reparse_jordan_cola set estado = 'ok', archivo_drive = p_archivo, proceso_nuevo = pid,
         modificaciones = mods, detalle = null, actualizado_en = now() where cliente_id = p_cliente;
  return jsonb_build_object('ok', true, 'process_id', pid, 'client_id', c.id, 'curp', c.curp,
    'nombre', c.nombre, 'email', c.email, 'drive_folder_id', c.drive_folder_id,
    'EstadoRep', c.edo_republica, 'id_booster', c.id_booster,
    'fecha_sisec', p_payload #>> '{employment_history_json,data,employment_info,emission_date}',
    'modificaciones', mods);
end $$;

create or replace function public.reparse_jordan_marcar(p_cliente uuid, p_estado text, p_detalle text default null)
returns void language sql security definer set search_path to 'public' as $$
  update public.reparse_jordan_cola set estado = p_estado, detalle = p_detalle, actualizado_en = now()
   where cliente_id = p_cliente;
$$;

revoke all on function public.reparse_jordan_tomar(int), public.reparse_jordan_guardar(uuid, text, jsonb),
  public.reparse_jordan_marcar(uuid, text, text) from public, anon, authenticated;
