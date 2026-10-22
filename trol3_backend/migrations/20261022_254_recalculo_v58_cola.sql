-- 254 — Recálculo masivo con el motor n8n v5.8 (claude/106 §10.4).
-- Misma mecánica que el recálculo v5.7 (cola + tomar/cerrar + workflow
-- "Recalcular base" encadenado): public.recalculo_v58_cola se siembra con
-- todos los Ley 73 que ya pasaron por el v5.7, usando el proceso MÁS RECIENTE
-- con json_sisec de cada cliente (si hubo consulta nueva después del 28-sep,
-- gana esa). Prioridad 1 = 60 años o más (candidatos a pension_hoy), 2 = resto.
-- Ley 97 no entra: el cambio es sólo de Mod 40.
-- Cierre: pg_cron `recalculo-v58-cerrar` cada 15 min; se quita al terminar.

create table if not exists public.recalculo_v58_cola (like public.recalculo_v57_cola including all);

create or replace function public.recalculo_v58_tomar(p_n integer default 25)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare r record; c record; j jsonb; pid uuid; salida jsonb := '[]'::jsonb;
begin
  update public.recalculo_v58_cola q set estado = 'ok', detalle = null, actualizado_en = now()
    from public.clientes cl
   where cl.id = q.cliente_id and q.estado = 'procesando'
     and cl.calculo_pensional->'meta'->>'version_sistema' like '2.8.%';
  for r in
    select q.cliente_id, q.proceso_origen from public.recalculo_v58_cola q
     where q.estado = 'pendiente' or (q.estado = 'procesando' and q.actualizado_en < now() - interval '30 minutes' and q.intentos < 3)
     order by q.prioridad, q.creado_en, q.cliente_id
     limit greatest(1, least(p_n, 200))
     for update skip locked
  loop
    select json_sisec into j from public.procesos where id = r.proceso_origen;
    select * into c from public.clientes where id = r.cliente_id;
    insert into public.procesos (cliente_id, tipo_servicio, estado, json_sisec, datos_entrada)
    values (r.cliente_id, 'Recalculo v5.8', 'DATA_READY', j,
            jsonb_build_object('origen', 'recalculo_v58', 'proceso_origen', r.proceso_origen))
    returning id into pid;
    update public.recalculo_v58_cola set estado = 'procesando', proceso_nuevo = pid, intentos = intentos + 1,
           actualizado_en = now() where cliente_id = r.cliente_id;
    salida := salida || jsonb_build_object(
      'cliente_id', c.id, 'process_id', pid, 'curp', c.curp, 'nombre', c.nombre, 'email', c.email,
      'drive_folder_id', c.drive_folder_id, 'EstadoRep', c.edo_republica, 'id_booster', c.id_booster,
      'fecha_sisec', coalesce(j #>> '{employment_history_json,data,employment_info,emission_date}', c."última_fecha_sisec"::text),
      'employment_history_json', j -> 'employment_history_json');
  end loop;
  return salida;
end $fn$;

create or replace function public.recalculo_v58_cerrar(p_minutos integer default 10)
returns jsonb language sql security definer set search_path to 'public' as $fn$
  with u as (
    update public.recalculo_v58_cola q
       set estado = case when c.calculo_pensional->'meta'->>'version_sistema' like '2.8.%'
                          and c.calculo_pensional_at >= q.actualizado_en - interval '1 minute' then 'ok' else 'error' end,
           detalle = case when c.calculo_pensional->'meta'->>'version_sistema' like '2.8.%' then null
                          else 'Calculos no dejó semilla v5.8' end,
           actualizado_en = now()
      from public.clientes c
     where c.id = q.cliente_id and q.estado = 'procesando'
       and q.actualizado_en < now() - make_interval(mins => p_minutos)
    returning q.estado)
  select coalesce(jsonb_object_agg(estado, n), '{}'::jsonb) from (select estado, count(*) n from u group by estado) x;
$fn$;

revoke all on function public.recalculo_v58_tomar(integer), public.recalculo_v58_cerrar(integer) from public, anon, authenticated;
grant execute on function public.recalculo_v58_tomar(integer), public.recalculo_v58_cerrar(integer) to service_role;

-- Siembra: Ley 73 (trol3) con proceso más reciente con json_sisec.
insert into public.recalculo_v58_cola (cliente_id, proceso_origen, proceso_viejo, version_anterior, prioridad, estado, intentos, creado_en, actualizado_en)
select q.cliente_id,
       (select pr.id from public.procesos pr where pr.cliente_id = q.cliente_id and pr.json_sisec is not null order by pr.created_at desc limit 1),
       null, 'v5.7',
       case when extract(year from age(p.fecha_nacimiento)) >= 60 then 1 else 2 end,
       'pendiente', 0, now(), now()
from public.recalculo_v57_cola q
join trol3.personas p on p.legacy_cliente_id = q.cliente_id and p.merged_into is null
where q.estado = 'ok'
  and exists (select 1 from trol3.v_mejor_dato d where d.persona_id = p.id and d.campo = 'ley' and d.valor#>>'{}' = 'Ley73')
  and not exists (select 1 from public.recalculo_v58_cola x where x.cliente_id = q.cliente_id);

-- Cierre periódico mientras corre el recálculo (quitar al terminar: select cron.unschedule('recalculo-v58-cerrar')).
select cron.schedule('recalculo-v58-cerrar', '*/15 * * * *', $$select public.recalculo_v58_cerrar(10)$$);
