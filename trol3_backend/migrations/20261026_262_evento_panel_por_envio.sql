-- 262 · Panel del evento por envío (26-oct): el FIP mandó un 2º correo. evento_panel acepta
-- p_desde / p_hasta para cortar registros y clics por fecha, y config.evento_meta.<código>.envios
-- lista los envíos para que el panel los ofrezca como cortes. Agrega clics_ips (IPs distintas)
-- porque el escáner de correo infla los clics.
update trol3.config
   set valor = jsonb_set(valor::jsonb, '{fip2026,envios}',
         '[{"fecha":"2026-10-14","nombre":"1er correo"},{"fecha":"2026-10-26","nombre":"2º correo"}]'::jsonb)::text
 where clave = 'evento_meta';

drop function if exists trol3.evento_panel(text, integer);

create or replace function trol3.evento_panel(p_codigo text, p_limit integer default 400, p_desde timestamptz default null, p_hasta timestamptz default null)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'trol3', 'public'
as $function$
declare filas jsonb; res jsonb; meta jsonb; fecha date; clics int; clics_ips int;
begin
  if not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  select (cf.valor::jsonb) -> p_codigo into meta from trol3.config cf where cf.clave = 'evento_meta';
  fecha := nullif(meta ->> 'fecha', '')::date;
  select count(*), count(distinct ci.ip_hash) into clics, clics_ips from trol3.clics_invitacion ci
   where ci.codigo = p_codigo and (p_desde is null or ci.created_at >= p_desde) and (p_hasta is null or ci.created_at < p_hasta);

  with per0 as (
    select p.id, p.nombre, p.apellidos, p.curp, p.created_at, p.cabecera_id, p.app_visto_en, p.tako_conversacion_id,
           coalesce((select min(ev.created_at) from trol3.eventos ev where ev.persona_id = p.id and ev.tipo = 'consentimiento' and ev.payload ->> 'codigo' = p_codigo), p.created_at) as registrado_en,
           (p.codigo_origen is distinct from p_codigo) as ya_era_cliente
      from trol3.personas p
     where p.merged_into is null
       and (p.codigo_origen = p_codigo
            or exists (select 1 from trol3.eventos ev where ev.persona_id = p.id and ev.tipo = 'consentimiento' and ev.payload ->> 'codigo' = p_codigo))
  ), per as (
    select * from per0
     where (p_desde is null or registrado_en >= p_desde) and (p_hasta is null or registrado_en < p_hasta)
     order by registrado_en desc limit p_limit
  ), fila as (
    select per.*,
      (select ct.normalizado from trol3.contactos ct where ct.persona_id = per.id and ct.tipo = 'telefono' and ct.principal limit 1) as telefono,
      case when exists (select 1 from trol3.eventos ev where ev.persona_id = per.id and ev.tipo = 'consentimiento' and ev.payload ->> 'via' = 'web') then 'web'
           when exists (select 1 from trol3.eventos ev where ev.persona_id = per.id and ev.tipo = 'consentimiento' and ev.payload ->> 'canal' = 'evento') then 'pasillo'
           else 'chat' end as via,
      (select jsonb_build_object('id', x.id, 'estado', x.estado, 'proveedor', x.proveedor, 'error', x.error, 'creada_en', x.created_at, 'completada_en', x.completed_at, 'tipo', x.tipo)
         from trol3.consultas x where x.persona_id = per.id and x.tipo in ('imss_historial', 'imss_ventanilla') order by x.created_at desc limit 1) as consulta,
      (select count(*) from trol3.consultas x where x.persona_id = per.id and x.tipo in ('imss_historial', 'imss_ventanilla')) as intentos,
      exists (select 1 from trol3.consultas x where x.persona_id = per.id and x.tipo = 'imss_historial' and x.estado = 'completada') as tiene_historial,
      exists (select 1 from trol3.documentos d where d.persona_id = per.id and d.tipo = 'constancia_semanas') as tiene_constancia,
      e.ley, e.semanas, e.pension_base,
      trol3._base_listos(per.id) as base_listos,
      (select jsonb_build_object('inicio', c.inicio, 'estado', c.estado, 'miembro_id', c.miembro_id) from trol3.citas c
         where c.persona_id = per.id and c.estado <> 'cancelada' order by (c.inicio >= now()) desc, c.inicio desc limit 1) as cita,
      coalesce((select sum(o.monto) from trol3.ordenes o where o.persona_id = per.id and o.estado = 'cumplida'), 0) as pagado,
      (select m.nombre from trol3.miembros m where m.id = per.cabecera_id) as experto,
      (select jsonb_build_object('que', i.metadata ->> 'evento_accion', 'en', i.created_at, 'quien', (select m.nombre from trol3.miembros m where m.id = i.actor_id))
         from trol3.interacciones i where i.persona_id = per.id and i.metadata ? 'evento_accion' order by i.created_at desc limit 1) as seguimiento,
      exists (select 1 from trol3.interacciones i where i.persona_id = per.id and i.direccion = 'entrante') as escribio,
      (select max(i.created_at) from trol3.interacciones i where i.persona_id = per.id and i.metadata ->> 'evento' = 'consulta_lista') as aviso_lista
      from per left join lateral trol3._expediente_resumen(per.id) e on true
  )
  select coalesce(jsonb_agg(to_jsonb(f) order by f.registrado_en desc), '[]'::jsonb),
         jsonb_build_object(
           'clics', clics,
           'clics_ips', clics_ips,
           'desde', p_desde, 'hasta', p_hasta,
           'registrados', count(*),
           'ya_eran_clientes', count(*) filter (where f.ya_era_cliente),
           'registrados_previos', count(*) filter (where fecha is null or f.registrado_en::date < fecha),
           'registrados_evento', count(*) filter (where fecha is not null and f.registrado_en::date = fecha),
           'via', jsonb_build_object('web', count(*) filter (where f.via = 'web'), 'chat', count(*) filter (where f.via = 'chat'), 'pasillo', count(*) filter (where f.via = 'pasillo')),
           'sin_curp', count(*) filter (where f.curp is null),
           'con_historial', count(*) filter (where f.tiene_historial or f.tiene_constancia),
           'buscando', count(*) filter (where f.consulta is not null and not f.tiene_historial and not f.tiene_constancia
                                          and (f.consulta ->> 'estado') not in ('sin_resultado', 'error', 'cancelada')),
           'atoradas', count(*) filter (where f.consulta is not null and not f.tiene_historial and not f.tiene_constancia
                                          and (f.consulta ->> 'estado') in ('sin_resultado', 'error')),
           'entraron', count(*) filter (where f.app_visto_en is not null),
           'base_completa', count(*) filter (where f.base_listos >= 5),
           'con_sesion', count(*) filter (where f.cita is not null),
           'sesion_hecha', count(*) filter (where f.cita is not null and (f.cita ->> 'inicio')::timestamptz < now()),
           'pagaron', count(*) filter (where f.pagado > 0),
           'sin_aviso', count(*) filter (where (f.tiene_historial or f.tiene_constancia) and f.aviso_lista is null),
           'ingresos', coalesce(sum(f.pagado), 0),
           'meta', coalesce(meta, '{}'::jsonb))
    into filas, res
    from fila f;
  return jsonb_build_object('resumen', res, 'filas', filas);
end $function$;

grant execute on function trol3.evento_panel(text, integer, timestamptz, timestamptz) to authenticated, service_role;
revoke all on function trol3.evento_panel(text, integer, timestamptz, timestamptz) from public, anon;
grant execute on function trol3.evento_panel(text, integer, timestamptz, timestamptz) to service_role;
