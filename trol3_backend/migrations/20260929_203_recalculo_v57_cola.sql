-- 203 · Recalcular la base con el motor v5.7 (claude/90): pensión Ley 73 a la fecha del derecho +
-- incrementos de febrero, salario inicial→final (Nubarium) y curva cuando no hay trayectoria.
-- Además COMBINA consultas: si el SISEC más reciente no trae "MODIFICACION DE SALARIO" pero una
-- consulta anterior sí (2,321 clientes), se injertan las modificaciones de la anterior en los
-- empleos del mismo registro patronal, hasta la fecha de emisión de la anterior. El SISEC reciente
-- manda en todo lo demás (semanas, empleos nuevos, bajas).
-- Prioridad: 0 con experto · 1 Ley 73 de 55+ · 2 resto. Calculos con mass_refresh; Docs, OpenAI y
-- hoja CALCULADORA siguen apagados (Raul, 29-sep).

-- ---------------------------------------------------------------- combinar consultas
create or replace function public.sisec_combinar(p_nuevo jsonb, p_viejo jsonb)
returns jsonb
language plpgsql stable set search_path to 'public' as $$
declare
  ev_n jsonb := p_nuevo #> '{employment_history_json,data,employment_events}';
  ev_v jsonb := p_viejo #> '{employment_history_json,data,employment_events}';
  hist jsonb := p_nuevo #> '{employment_history_json,data,employment_history}';
  emi_v date;
  eventos jsonb; n_mods int;
begin
  if p_viejo is null or jsonb_typeof(ev_n) <> 'array' or jsonb_typeof(ev_v) <> 'array' or jsonb_typeof(hist) <> 'array' then
    return p_nuevo;
  end if;
  -- El nuevo ya trae modificaciones: no se toca.
  if exists (select 1 from jsonb_array_elements(ev_n) e where e->>'event_type' = 'salary_modification') then
    return p_nuevo;
  end if;
  emi_v := coalesce(nullif(p_viejo #>> '{employment_history_json,data,employment_info,emission_date}', '')::date,
                    (select max(left(e->>'event_date', 10)::date) from jsonb_array_elements(ev_v) e));

  with h as (
    select coalesce(nullif(x->>'registro_patronal', ''), x->>'employer') rp, (x->>'start_date')::date ini,
           least(coalesce((x->>'end_date')::date, emi_v), emi_v) fin,
           coalesce((x->>'end_date')::date, current_date) fin_n, (x->>'base_salary')::numeric sal_fin
      from jsonb_array_elements(hist) x where x->>'start_date' is not null
  ),
  v as (
    select e, coalesce(nullif(e->>'registro_patronal', ''), e->>'employer') rp, left(e->>'event_date', 10)::date d, e->>'event_type' t
      from jsonb_array_elements(ev_v) e
  ),
  -- modificaciones del viejo que caen dentro de un empleo del nuevo (mismo patrón)
  mods as (
    select distinct on (v.rp, v.d, v.e->>'base_salary') v.e, v.rp, h.ini
      from v join h on h.rp = v.rp and v.t = 'salary_modification' and v.d > h.ini and v.d < h.fin
  ),
  emp_con_mods as (select distinct rp, ini from mods),
  n as (
    select e, o, coalesce(nullif(e->>'registro_patronal', ''), e->>'employer') rp, left(e->>'event_date', 10)::date d, e->>'event_type' t
      from jsonb_array_elements(ev_n) with ordinality x(e, o)
  ),
  -- el reingreso del nuevo trae el salario FINAL; si el empleo tiene modificaciones se usa el del viejo
  n2 as (
    select case when n.t = 'reentry' and exists (select 1 from emp_con_mods m where m.rp = n.rp and m.ini = n.d)
                then coalesce((select jsonb_set(n.e, '{base_salary}', v.e->'base_salary') from v
                                where v.rp = n.rp and v.d = n.d and v.t = 'reentry' limit 1), n.e)
                else n.e end e, n.d, n.o
      from n
  ),
  -- el empleo sigue después de la consulta anterior: su salario final (del nuevo) entra a la mitad del
  -- tramo que la anterior no vio, para no quedarse con el último salario viejo hasta hoy
  extra as (
    select jsonb_build_object('employer', h.rp, 'registro_patronal', h.rp, 'event_type', 'salary_modification',
             'event_date', to_char(emi_v + (h.fin_n - emi_v) / 2, 'YYYY-MM-DD') || 'T00:00:00+00:00',
             'base_salary', h.sal_fin, 'sintetico', true) e,
           emi_v + (h.fin_n - emi_v) / 2 d
      from h join emp_con_mods m on m.rp = h.rp and m.ini = h.ini
     where h.fin_n > emi_v + 30 and h.sal_fin > 0
       and h.sal_fin <> (select (mm.e->>'base_salary')::numeric from mods mm where mm.rp = h.rp and mm.ini = h.ini
                          order by left(mm.e->>'event_date', 10) desc limit 1)
  ),
  todos as (
    select e, d, o from n2
    union all
    select m.e, left(m.e->>'event_date', 10)::date, 100000 from mods m
    union all
    select x.e, x.d, 100001 from extra x
  )
  select jsonb_agg(e order by d, o), (select count(*) from mods) into eventos, n_mods from todos;

  if coalesce(n_mods, 0) = 0 then return p_nuevo; end if;
  return jsonb_set(
           jsonb_set(p_nuevo, '{employment_history_json,data,employment_events}', eventos),
           '{employment_history_json,data,employment_info,combinado}',
           jsonb_build_object('modificaciones_injertadas', n_mods, 'emision_anterior', emi_v));
end $$;

-- ---------------------------------------------------------------- cola
create table if not exists public.recalculo_v57_cola (
  cliente_id uuid primary key references public.clientes(id) on delete cascade,
  proceso_origen uuid not null,
  proceso_viejo uuid,            -- consulta anterior con modificaciones (se combina)
  version_anterior text,
  prioridad int not null default 2,
  estado text not null default 'pendiente' check (estado in ('pendiente','procesando','ok','error')),
  proceso_nuevo uuid,
  detalle text,
  intentos int not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table public.recalculo_v57_cola enable row level security;
create index if not exists recalculo_v57_cola_pend on public.recalculo_v57_cola (estado, prioridad, creado_en);

insert into public.recalculo_v57_cola (cliente_id, proceso_origen, proceso_viejo, version_anterior, prioridad)
select p.cliente_id, p.id,
       -- consulta anterior con modificaciones (conteo precalculado en _calib_curva_procesos, claude/90)
       (select cp.pid from public._calib_curva_procesos cp
         where cp.cliente_id = p.cliente_id and cp.pid <> p.id and cp.nmod > 0
         order by cp.created_at desc limit 1),
       c.calculo_pensional->'meta'->>'version_sistema',
       case when exists (select 1 from trol3.personas pe where pe.legacy_cliente_id = c.id and pe.cabecera_id is not null) then 0
            when c.calculo_pensional->'meta'->>'ley' = 'Ley73'
                 and to_date(case when substr(c.curp,5,2)::int < 30 then '20' else '19' end || substr(c.curp,5,6), 'YYYYMMDD') < now() - interval '55 years' then 1
            else 2 end
from (
  select distinct on (pr.cliente_id) pr.id, pr.cliente_id, pr.json_sisec
  from public.procesos pr
  where pr.json_sisec ? 'employment_history_json'
    and jsonb_typeof(pr.json_sisec #> '{employment_history_json,data,employment_events}') = 'array'
  order by pr.cliente_id, pr.created_at desc
) p join public.clientes c on c.id = p.cliente_id
where length(trim(coalesce(c.curp, ''))) = 18
  and substr(c.curp, 5, 6) ~ '^[0-9]{6}$'
  and coalesce(c.calculo_pensional->'meta'->>'version_sistema', '') not like '2.7.%'
on conflict (cliente_id) do nothing;
-- Sólo se combina si el nuevo NO trae modificaciones
update public.recalculo_v57_cola q set proceso_viejo = null
  from public.procesos p
 where p.id = q.proceso_origen and q.proceso_viejo is not null
   and exists (select 1 from jsonb_array_elements(p.json_sisec #> '{employment_history_json,data,employment_events}') e
                where e->>'event_type' = 'salary_modification');

-- ---------------------------------------------------------------- tomar / cerrar
create or replace function public.recalculo_v57_tomar(p_n int default 25)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare r record; c record; j jsonb; jv jsonb; pid uuid; salida jsonb := '[]'::jsonb;
begin
  update public.recalculo_v57_cola q set estado = 'ok', detalle = null, actualizado_en = now()
    from public.clientes cl
   where cl.id = q.cliente_id and q.estado = 'procesando'
     and cl.calculo_pensional->'meta'->>'version_sistema' like '2.7.%';
  for r in
    select q.cliente_id, q.proceso_origen, q.proceso_viejo from public.recalculo_v57_cola q
     where q.estado = 'pendiente' or (q.estado = 'procesando' and q.actualizado_en < now() - interval '30 minutes' and q.intentos < 3)
     order by q.prioridad, q.creado_en, q.cliente_id
     limit greatest(1, least(p_n, 200))
     for update skip locked
  loop
    select json_sisec into j from public.procesos where id = r.proceso_origen;
    if r.proceso_viejo is not null then
      select json_sisec into jv from public.procesos where id = r.proceso_viejo;
      j := public.sisec_combinar(j, jv);
    end if;
    select * into c from public.clientes where id = r.cliente_id;
    insert into public.procesos (cliente_id, tipo_servicio, estado, json_sisec, datos_entrada)
    values (r.cliente_id, 'Recalculo v5.7', 'DATA_READY', j,
            jsonb_build_object('origen', 'recalculo_v57', 'proceso_origen', r.proceso_origen, 'proceso_viejo', r.proceso_viejo))
    returning id into pid;
    update public.recalculo_v57_cola set estado = 'procesando', proceso_nuevo = pid, intentos = intentos + 1,
           actualizado_en = now() where cliente_id = r.cliente_id;
    salida := salida || jsonb_build_object(
      'cliente_id', c.id, 'process_id', pid, 'curp', c.curp, 'nombre', c.nombre, 'email', c.email,
      'drive_folder_id', c.drive_folder_id, 'EstadoRep', c.edo_republica, 'id_booster', c.id_booster,
      'fecha_sisec', coalesce(j #>> '{employment_history_json,data,employment_info,emission_date}', c."última_fecha_sisec"::text),
      'employment_history_json', j -> 'employment_history_json');
  end loop;
  return salida;
end $$;

create or replace function public.recalculo_v57_cerrar(p_minutos int default 10)
returns jsonb language sql security definer set search_path to 'public' as $$
  with u as (
    update public.recalculo_v57_cola q
       set estado = case when c.calculo_pensional->'meta'->>'version_sistema' like '2.7.%'
                          and c.calculo_pensional_at >= q.actualizado_en - interval '1 minute' then 'ok' else 'error' end,
           detalle = case when c.calculo_pensional->'meta'->>'version_sistema' like '2.7.%' then null
                          else 'Calculos no dejó semilla v5.7' end,
           actualizado_en = now()
      from public.clientes c
     where c.id = q.cliente_id and q.estado = 'procesando'
       and q.actualizado_en < now() - make_interval(mins => p_minutos)
    returning q.estado)
  select jsonb_object_agg(estado, n) from (select estado, count(*) n from u group by estado) x;
$$;

revoke all on function public.recalculo_v57_tomar(int), public.recalculo_v57_cerrar(int), public.sisec_combinar(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.recalculo_v57_tomar(int), public.recalculo_v57_cerrar(int) to service_role;
