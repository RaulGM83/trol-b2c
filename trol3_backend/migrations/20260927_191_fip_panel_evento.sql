-- 191 · Panel del evento por código (claude/88 · 27-sep-2026)
--
-- Una sola RPC para la pantalla /trabajo/evento/panel: el embudo del código (clics → altas →
-- consultas → entraron a su cuenta → base de 5 → sesión → cobrado) contra la meta, y la lista
-- de personas con dónde va cada una y qué le toca al equipo (reintentar, ventanilla, pedir la
-- constancia, llamar). Las acciones ya existen (pedir_consulta, pedir_ventanilla, avisar,
-- registrar_interaccion); aquí sólo se lee.

insert into trol3.config (clave, valor) values
  ('evento_meta', '{"fip2026": {"registrados_previos": 70, "registrados_evento": 70, "ingresos": 300000, "fecha": "2026-10-21"}}')
on conflict (clave) do update set valor = excluded.valor;

create or replace function trol3.evento_panel(p_codigo text, p_limit int default 400)
returns jsonb
language plpgsql stable security definer set search_path to 'trol3', 'public' as $$
declare filas jsonb; res jsonb; meta jsonb; fecha date; clics int;
begin
  if not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  select (cf.valor::jsonb) -> p_codigo into meta from trol3.config cf where cf.clave = 'evento_meta';
  fecha := nullif(meta ->> 'fecha', '')::date;
  select count(*) into clics from trol3.clics_invitacion where codigo = p_codigo;

  with per as (
    select p.id, p.nombre, p.apellidos, p.curp, p.created_at, p.cabecera_id, p.app_visto_en, p.tako_conversacion_id
      from trol3.personas p where p.codigo_origen = p_codigo and p.merged_into is null
     order by p.created_at desc limit p_limit
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
      exists (select 1 from trol3.interacciones i where i.persona_id = per.id and i.direccion = 'entrante') as escribio
      from per left join trol3.v_expediente e on e.persona_id = per.id
  )
  select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at desc), '[]'::jsonb),
         jsonb_build_object(
           'clics', clics,
           'registrados', count(*),
           'registrados_previos', count(*) filter (where fecha is null or f.created_at::date < fecha),
           'registrados_evento', count(*) filter (where fecha is not null and f.created_at::date = fecha),
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
           'ingresos', coalesce(sum(f.pagado), 0),
           'meta', coalesce(meta, '{}'::jsonb))
    into filas, res
    from fila f;
  return jsonb_build_object('resumen', res, 'filas', filas);
end $$;
revoke all on function trol3.evento_panel(text, int) from public, anon;
grant execute on function trol3.evento_panel(text, int) to authenticated, service_role;
