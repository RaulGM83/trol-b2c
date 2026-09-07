-- ===========================================================================
-- 125 — Quién lo trajo, en la lista de clientes.
--
-- Un referido de un aliado NO es un cliente del aliado: es cliente de Trol y
-- vive en la misma lista que todos. Pero hasta ahora se veía idéntico a uno
-- que llegó por Facebook, y la única forma de saber quién lo trajo era irse a
-- la pantalla de aliados. La marca va donde ya se está mirando.
--
-- Se devuelve el nombre del aliado y el estado del referido. El estado importa
-- tanto como el nombre: `por_revisar` significa que esa referencia todavía no
-- es de nadie, y eso es una decisión pendiente, no un dato de adorno.
--
-- La función cambia su tipo de retorno, así que hay que TIRARLA primero: un
-- `create or replace` con columnas nuevas no reemplaza, falla. La firma de
-- entrada no se toca — ahí sí, un parámetro de más habría creado una
-- sobrecarga (109b, 110b).
-- ===========================================================================

drop function if exists trol3.buscar_personas(text, integer, text, text);

create function trol3.buscar_personas(
  p_q text,
  p_limit integer default 30,
  p_orden text default 'actividad'::text,
  p_dir text default null::text
)
returns table(
  id uuid, nombre text, apellidos text, curp text, etapa text, cabecera_id uuid,
  telefono text, tel10 text, edad integer, ley text, semanas numeric,
  created_at timestamp with time zone,
  aliado_nombre text, referido_estado text
)
language plpgsql
stable security definer
set search_path to 'trol3', 'public'
as $function$
declare sk text; dir text;
begin
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
    with q as (select trim(coalesce(%L,'')) s, trol3.tel10(coalesce(%L,'')) t10),
    ids as materialized (
      select p.id, row_number() over (order by %s %s) rn
      from trol3.personas p, q
      where trol3.es_miembro() and p.merged_into is null and (
        (length(q.s) < 4 and length(q.t10) < 10)
        or (length(q.t10) = 10 and exists (select 1 from trol3.contactos c where c.persona_id = p.id and c.normalizado = q.t10))
        or (length(q.s) >= 4 and (p.curp ilike q.s||'%%' or (coalesce(p.nombre,'')||' '||coalesce(p.apellidos,'')) ilike '%%'||q.s||'%%' or p.hubspot_id = q.s))
      )
      order by %s %s limit %s
    )
    select p.id, p.nombre, p.apellidos, p.curp, p.etapa, p.cabecera_id,
           (select c.valor from trol3.contactos c where c.persona_id = p.id and c.tipo='telefono' order by c.principal desc limit 1),
           (select c.normalizado from trol3.contactos c where c.persona_id = p.id and c.tipo='telefono' order by c.principal desc limit 1),
           extract(year from age(p.fecha_nacimiento))::int,
           (select v.valor#>>'{}' from trol3.v_mejor_dato v where v.persona_id=p.id and v.campo='ley'),
           (select trol3.jnum(v.valor) from trol3.v_mejor_dato v where v.persona_id=p.id and v.campo='semanas_cotizadas'),
           p.created_at,
           -- Quién lo trajo (125). El primero manda: si alguien más comparte
           -- su link después, no le quita el cliente a quien lo presentó.
           (select a.nombre from trol3.referidos r
              join trol3.aliados a on a.id = r.aliado_id
             where r.persona_id = p.id order by r.creado_en limit 1),
           (select r.estado from trol3.referidos r
             where r.persona_id = p.id order by r.creado_en limit 1)
    from trol3.personas p join ids on ids.id = p.id
    order by ids.rn
  $f$, p_q, p_q, sk, dir, sk, dir, p_limit);
end $function$;

comment on function trol3.buscar_personas is
  'Lista de clientes de /trabajo. Desde 125 trae también quién lo refirió y en qué estado está esa referencia.';
