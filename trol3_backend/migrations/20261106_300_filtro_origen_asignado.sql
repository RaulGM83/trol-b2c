-- 300 — Filtro por origen y por asignado en "Todos los clientes" (Raúl, 6-nov-2026).
-- "Traídos por mí" = alta o liga del miembro (personas.miembro_origen_id), juntos. Desde hoy el alta del
-- equipo deja miembro_origen_id = quien la hace cuando no se eligió otro origen (app, altaPersona).
-- Función nueva (no se toca buscar_personas: sus sobrecargas ya dieron guerra en 110b).
-- Aplicada por MCP el 6-nov-2026.

create or replace function trol3.origen_clave(p_canal text, p_codigo text, p_miembro uuid, p_aliado uuid)
returns text language sql immutable as $$
  select case
    when p_aliado  is not null then 'aliado:' || p_aliado
    when p_canal = 'evento' and p_codigo is not null then 'evento:' || lower(p_codigo)
    when p_miembro is not null then 'miembro:' || p_miembro
    when p_canal in ('referido', 'referido_vip') then 'canal:referido'
    else 'canal:' || coalesce(p_canal, 'legacy') end;
$$;

-- Primer aliado que lo refirió (atribuido o por revisar), igual que buscar_personas (125).
create or replace function trol3._aliado_de(p_persona uuid)
returns uuid language sql stable as $$
  select r.aliado_id from trol3.referidos r where r.persona_id = p_persona and r.estado <> 'rechazado' order by r.creado_en limit 1;
$$;

create or replace function trol3.buscar_personas_filtro(
  p_q text, p_limit int default 50, p_offset int default 0, p_orden text default 'actividad', p_dir text default null,
  p_origen text default null, p_asignado text default null)
returns table(id uuid, nombre text, apellidos text, curp text, etapa text, cabecera_id uuid, telefono text, tel10 text,
              edad int, ley text, semanas numeric, created_at timestamptz, aliado_nombre text, referido_estado text,
              origen_clave text, origen_etiqueta text, total bigint)
language plpgsql stable security definer set search_path to 'trol3', 'public' as $function$
declare sk text; dir text;
begin
  if not trol3.es_miembro() then return; end if;
  sk := case p_orden
    when 'nombre'   then $k$lower(coalesce(p.nombre,'')||' '||coalesce(p.apellidos,''))$k$
    when 'curp'     then 'p.curp'
    when 'telefono' then $k$(select c.normalizado from trol3.contactos c where c.persona_id=p.id and c.tipo='telefono' order by c.principal desc limit 1)$k$
    when 'edad'     then 'extract(year from age(p.fecha_nacimiento))'
    when 'ley'      then $k$(select d.valor#>>'{}' from trol3.datos d where d.persona_id=p.id and d.campo='ley' order by case d.capa when 'validado' then 1 when 'calculado' then 2 else 3 end, d.obtenido_en desc limit 1)$k$
    when 'semanas'  then $k$(select trol3.jnum(d.valor) from trol3.datos d where d.persona_id=p.id and d.campo='semanas_cotizadas' order by case d.capa when 'validado' then 1 when 'calculado' then 2 else 3 end, d.obtenido_en desc limit 1)$k$
    when 'creado'   then 'p.created_at'
    else 'p.updated_at' end;
  dir := case when lower(coalesce(p_dir, case when p_orden in ('nombre','curp','telefono','ley') then 'asc' else 'desc' end)) = 'asc'
              then 'asc nulls last' else 'desc nulls last' end;
  return query execute format($f$
    with q as (select trim(coalesce(%1$L,'')) s, trol3.tel10(coalesce(%1$L,'')) t10),
    base as (
      select p.*, trol3._aliado_de(p.id) aliado_id
      from trol3.personas p, q
      where p.merged_into is null and (
        (length(q.s) < 4 and length(q.t10) < 10)
        or (length(q.t10) = 10 and exists (select 1 from trol3.contactos c where c.persona_id = p.id and c.normalizado = q.t10))
        or (length(q.s) >= 4 and (p.curp ilike q.s||'%%' or p.hubspot_id = q.s
            or not exists (
              select 1 from regexp_split_to_table(translate(lower(q.s), 'áéíóúüñàèìòù', 'aeiouunaeiou'), '\s+') w
               where w <> '' and position(w in translate(lower(coalesce(p.nombre,'')||' '||coalesce(p.apellidos,'')), 'áéíóúüñàèìòù', 'aeiouunaeiou')) = 0)))
      )
      and (%2$L is null or %2$L = '' or (%2$L = 'sin' and p.cabecera_id is null) or p.cabecera_id::text = %2$L)
    ),
    filtrada as (
      select b.*, trol3.origen_clave(b.canal_origen, b.codigo_origen, b.miembro_origen_id, b.aliado_id) oc from base b
    ),
    ids as materialized (
      select p.id, p.oc, p.aliado_id, row_number() over (order by %3$s %4$s) rn, count(*) over () tot
      from filtrada p
      where %5$L is null or %5$L = '' or (case split_part(%5$L, ':', 1)
        when 'miembro' then p.miembro_origen_id::text = split_part(%5$L, ':', 2)
        when 'aliado'  then p.aliado_id::text = split_part(%5$L, ':', 2)
        when 'evento'  then p.canal_origen = 'evento' and lower(coalesce(p.codigo_origen, '')) = split_part(%5$L, ':', 2)
        when 'canal'   then (case when p.canal_origen in ('referido','referido_vip') then 'referido' else coalesce(p.canal_origen, 'legacy') end) = split_part(%5$L, ':', 2)
        else false end)
      order by %3$s %4$s limit %6$s offset %7$s
    )
    select p.id, p.nombre, p.apellidos, p.curp, p.etapa, p.cabecera_id,
           (select c.valor from trol3.contactos c where c.persona_id = p.id and c.tipo='telefono' order by c.principal desc limit 1),
           (select c.normalizado from trol3.contactos c where c.persona_id = p.id and c.tipo='telefono' order by c.principal desc limit 1),
           extract(year from age(p.fecha_nacimiento))::int,
           (select v.valor#>>'{}' from trol3.v_mejor_dato v where v.persona_id=p.id and v.campo='ley'),
           (select trol3.jnum(v.valor) from trol3.v_mejor_dato v where v.persona_id=p.id and v.campo='semanas_cotizadas'),
           p.created_at,
           (select a.nombre from trol3.aliados a where a.id = ids.aliado_id),
           (select r.estado from trol3.referidos r where r.persona_id = p.id order by r.creado_en limit 1),
           ids.oc,
           case split_part(ids.oc, ':', 1)
             when 'miembro' then 'liga ' || split_part((select m.nombre from trol3.miembros m where m.id::text = split_part(ids.oc, ':', 2)), ' ', 1)
             when 'aliado'  then null  -- ya sale como marca de aliado
             when 'evento'  then upper(split_part(ids.oc, ':', 2)) || coalesce(' · ' || split_part((select m.nombre from trol3.miembros m join trol3.personas pp on pp.miembro_origen_id = m.id where pp.id = p.id), ' ', 1), '')
             else case split_part(ids.oc, ':', 2) when 'meta' then 'Meta' when 'referido' then 'referido' else null end end,
           ids.tot
    from trol3.personas p join ids on ids.id = p.id
    order by ids.rn
  $f$, p_q, p_asignado, sk, dir, p_origen, greatest(1, least(p_limit, 500)), greatest(0, p_offset));
end $function$;

-- Opciones del selector con su conteo.
create or replace function trol3.opciones_origen()
returns table(grupo text, clave text, etiqueta text, n bigint)
language sql stable security definer set search_path to 'trol3', 'public' as $$
  with p as (
    select p.*, trol3._aliado_de(p.id) aliado_id from trol3.personas p where p.merged_into is null and trol3.es_miembro()
  ), x as (
    select 1 o, 'Asesores' grupo, 'miembro:' || m.id clave, m.nombre etiqueta, count(*) n
      from p join trol3.miembros m on m.id = p.miembro_origen_id group by m.id, m.nombre
    union all
    select 2, 'Aliados', 'aliado:' || a.id, a.nombre, count(*) from p join trol3.aliados a on a.id = p.aliado_id group by a.id, a.nombre
    union all
    select 3, 'Eventos', 'evento:' || lower(p.codigo_origen), upper(p.codigo_origen), count(*) from p where p.canal_origen = 'evento' and p.codigo_origen is not null group by lower(p.codigo_origen), upper(p.codigo_origen)
    union all
    select 4, 'Canales', 'canal:' || c, case c when 'meta' then 'Meta' when 'organico' then 'Orgánico' when 'referido' then 'Referidos de clientes'
             when 'legacy' then 'Base histórica' when 'asesor' then 'Liga de asesor' when 'aliado' then 'Aliados (todos)' when 'evento' then 'Eventos (todos)' else c end, count(*)
      from (select case when canal_origen in ('referido','referido_vip') then 'referido' else coalesce(canal_origen, 'legacy') end c from p) z group by c
  )
  select grupo, clave, etiqueta, n from x order by o, n desc;
$$;

grant execute on function trol3.buscar_personas_filtro(text,int,int,text,text,text,text) to authenticated;
grant execute on function trol3.opciones_origen() to authenticated;
