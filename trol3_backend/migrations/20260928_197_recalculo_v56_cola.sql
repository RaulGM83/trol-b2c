-- 197 · Recalcular con el motor v5.6 al resto de la base (claude/89): clientes cuya semilla no es v5.6,
-- con el SISEC que ya tienen guardado (su proceso más reciente con json_sisec). Sin re-parseo.
-- Prioridad: 0 con experto · 1 con semilla de motor viejo · 2 sin semilla. Calculos corre con mass_refresh
-- y con Docs, OpenAI y la hoja CALCULADORA apagados (Raul, 27-sep).

create table if not exists public.recalculo_v56_cola (
  cliente_id uuid primary key references public.clientes(id) on delete cascade,
  proceso_origen uuid not null,
  version_anterior text,
  prioridad int not null default 1,
  estado text not null default 'pendiente' check (estado in ('pendiente','procesando','enviado','ok','error')),
  proceso_nuevo uuid,
  detalle text,
  intentos int not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table public.recalculo_v56_cola enable row level security;
create index if not exists recalculo_v56_cola_pend on public.recalculo_v56_cola (estado, prioridad, creado_en);

insert into public.recalculo_v56_cola (cliente_id, proceso_origen, version_anterior, prioridad)
select p.cliente_id, p.id, c.calculo_pensional->'meta'->>'version_sistema',
       case when exists (select 1 from trol3.personas pe where pe.legacy_cliente_id = c.id and pe.cabecera_id is not null) then 0
            when c.calculo_pensional is not null then 1 else 2 end
from (
  select distinct on (pr.cliente_id) pr.id, pr.cliente_id
  from public.procesos pr
  where pr.json_sisec ? 'employment_history_json'
    and jsonb_typeof(pr.json_sisec #> '{employment_history_json,data,employment_events}') = 'array'
  order by pr.cliente_id, pr.created_at desc
) p join public.clientes c on c.id = p.cliente_id
where coalesce(c.calculo_pensional->'meta'->>'version_sistema', '') <> '2.6.0-saldos-v56'
  and length(trim(coalesce(c.curp, ''))) = 18
on conflict (cliente_id) do nothing;

-- Toma n, crea el proceso "Recalculo v5.6" con copia del SISEC y devuelve lo que Calculos necesita.
create or replace function public.recalculo_v56_tomar(p_n int default 25)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare r record; c record; j jsonb; pid uuid; salida jsonb := '[]'::jsonb;
begin
  for r in
    select q.cliente_id, q.proceso_origen from public.recalculo_v56_cola q
     where q.estado = 'pendiente' or (q.estado = 'procesando' and q.actualizado_en < now() - interval '30 minutes' and q.intentos < 3)
     order by q.prioridad, q.creado_en, q.cliente_id
     limit greatest(1, least(p_n, 200))
     for update skip locked
  loop
    select json_sisec into j from public.procesos where id = r.proceso_origen;
    select * into c from public.clientes where id = r.cliente_id;
    insert into public.procesos (cliente_id, tipo_servicio, estado, json_sisec, datos_entrada)
    values (r.cliente_id, 'Recalculo v5.6', 'DATA_READY', j,
            jsonb_build_object('origen', 'recalculo_v56', 'proceso_origen', r.proceso_origen))
    returning id into pid;
    update public.recalculo_v56_cola set estado = 'procesando', proceso_nuevo = pid, intentos = intentos + 1,
           actualizado_en = now() where cliente_id = r.cliente_id;
    salida := salida || jsonb_build_object(
      'cliente_id', c.id, 'process_id', pid, 'curp', c.curp, 'nombre', c.nombre, 'email', c.email,
      'drive_folder_id', c.drive_folder_id, 'EstadoRep', c.edo_republica, 'id_booster', c.id_booster,
      'fecha_sisec', coalesce(j #>> '{employment_history_json,data,employment_info,emission_date}', c."última_fecha_sisec"::text),
      'employment_history_json', j -> 'employment_history_json');
  end loop;
  return salida;
end $$;

-- Tras el lote: marca ok los que ya tienen semilla v5.6 y error los que Calculos no terminó.
create or replace function public.recalculo_v56_cerrar(p_minutos int default 10)
returns jsonb language sql security definer set search_path to 'public' as $$
  with u as (
    update public.recalculo_v56_cola q
       set estado = case when c.calculo_pensional->'meta'->>'version_sistema' = '2.6.0-saldos-v56'
                          and c.calculo_pensional_at >= q.actualizado_en - interval '1 minute' then 'ok' else 'error' end,
           detalle = case when c.calculo_pensional->'meta'->>'version_sistema' = '2.6.0-saldos-v56' then null
                          else 'Calculos no dejó semilla v5.6' end,
           actualizado_en = now()
      from public.clientes c
     where c.id = q.cliente_id and q.estado in ('procesando', 'enviado')
       and q.actualizado_en < now() - make_interval(mins => p_minutos)
    returning q.estado)
  select jsonb_object_agg(estado, n) from (select estado, count(*) n from u group by estado) x;
$$;

revoke all on function public.recalculo_v56_tomar(int), public.recalculo_v56_cerrar(int) from public, anon, authenticated;
grant execute on function public.recalculo_v56_tomar(int), public.recalculo_v56_cerrar(int) to service_role;
