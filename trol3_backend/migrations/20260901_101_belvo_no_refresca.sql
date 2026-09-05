-- 101 — Belvo es caché. Confirmado por Raúl y por la evidencia del lote del
-- 1-sep: de 68 reportes que devolvió, solo 10 eran del último mes; 20 tenían
-- más de un año. Belvo entrega el reporte congelado en el link, no uno nuevo
-- del IMSS. Jordan sí consulta en vivo (y por eso cuesta $13 contra $2.50).
--
-- Consecuencia: para una persona que YA tiene semanas validadas, pedir un
-- imss_historial por Belvo no puede traer nada que no tengamos. Es gasto sin
-- resultado, y peor: la consulta se cierra como 'completada' y todo el mundo
-- cree que se refrescó. El 100% de los 3,710 de campaña ya tiene dato, así que
-- cualquier refresh masivo por Belvo habría sido dinero tirado completo.
--
-- Esta guarda no cobra y no falla en silencio: regresa el motivo y le dice al
-- llamador cómo pedirlo bien. Quien de verdad quiera refrescar pasa
-- p_proveedor := 'jordan' a propósito, o p_forzar := true si sabe lo que hace.

create or replace function trol3.pedir_consulta(
  p_persona uuid, p_tipo text,
  p_actor trol3.actor_tipo default 'asesor'::trol3.actor_tipo,
  p_actor_id uuid default null, p_pagador text default null,
  p_notificar boolean default false, p_motivo text default null,
  p_forzar boolean default false, p_proveedor text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'trol3', 'public'
as $function$
declare cid uuid; prov text; costo numeric; canal record; pol text := 'belvo_first'; abierta record; espera int;
        tiene_dato boolean;
begin
  if auth.uid() is not null and not trol3.es_miembro() and (p_actor <> 'cliente' or p_persona <> trol3.current_persona_id()) then raise exception 'no_autorizado'; end if;
  if p_actor = 'asesor' and p_actor_id is null then p_actor_id := trol3.current_miembro_id(); end if;

  espera := coalesce((select valor::int from trol3.config where clave = 'consulta_espera_min'), 10);

  if not p_forzar and p_tipo in ('imss_historial','cda','issste','infonavit') then
    select c.id, c.proveedor, c.created_at into abierta
      from trol3.consultas c
     where c.persona_id = p_persona and c.tipo = p_tipo
       and c.estado in ('solicitada','en_proceso')
       and c.created_at > now() - (espera||' minutes')::interval
     order by c.created_at desc limit 1;
    if found then
      return jsonb_build_object('ok', false, 'motivo', 'consulta_en_curso',
        'consulta_id', abierta.id, 'proveedor', abierta.proveedor, 'desde', abierta.created_at,
        'reintentar_en_seg', greatest(0, ceil(extract(epoch from (abierta.created_at + (espera||' minutes')::interval - now()))))::int);
    end if;
  end if;

  if not p_forzar and p_actor <> 'asesor' and p_tipo = 'imss_historial' and exists (
      select 1 from trol3.datos d where d.persona_id = p_persona and d.campo = 'semanas_cotizadas' and d.capa='validado' and d.obtenido_en > now() - interval '90 days') then
    return jsonb_build_object('ok', false, 'motivo', 'validado_vigente');
  end if;

  select c.* into canal from trol3.personas p join trol3.canales c on c.codigo = p.canal_origen where p.id = p_persona;
  if found then pol := canal.politica_proveedor; end if;
  if p_actor = 'asesor' then pol := 'jordan_first'; end if;
  prov := coalesce(p_proveedor, case p_tipo when 'imss_historial' then (case when pol = 'jordan_first' then 'jordan' else 'belvo' end)
                                when 'cda' then 'cda' when 'issste' then 'nubarium' when 'infonavit' then 'jordan_infonavit'
                                when 'calculo_base' then 'sisec' when 'pdf_semanas' then 'pdf_semanas' else null end);

  -- 101: Belvo es caché. Si ya hay reporte validado, no puede aportar nada.
  if not p_forzar and p_tipo = 'imss_historial' and prov = 'belvo' then
    select exists (select 1 from trol3.datos d
                    where d.persona_id = p_persona and d.campo = 'semanas_cotizadas' and d.capa = 'validado')
      into tiene_dato;
    if tiene_dato then
      return jsonb_build_object('ok', false, 'motivo', 'belvo_no_refresca',
        'detalle', 'Belvo devuelve el reporte congelado en el link; esta persona ya tiene semanas validadas. Para traer dato nuevo usa p_proveedor := ''jordan'' (consulta viva, mas caro).',
        'proveedor_sugerido', 'jordan');
    end if;
  end if;

  select coalesce(costo_unitario,0) into costo from trol3.proveedores where codigo = prov;
  insert into trol3.consultas (persona_id, tipo, proveedor, solicitante_tipo, solicitante_id, pagador, costo, notificar_cliente, motivo)
  values (p_persona, p_tipo, prov, p_actor, p_actor_id,
          coalesce(p_pagador, case when p_actor='cliente' then 'cliente' when p_actor='aliado' then 'aliado:'||coalesce(p_actor_id::text,'') else 'trol' end),
          coalesce(costo,0), coalesce(p_notificar,false), p_motivo)
  returning id into cid;
  return jsonb_build_object('ok', true, 'consulta_id', cid, 'proveedor', prov, 'costo', costo);
end $function$;

comment on function trol3.pedir_consulta is
  'Pide una consulta a proveedor. 101: bloquea imss_historial por Belvo cuando la persona ya tiene semanas validadas — Belvo es cache y no puede traer nada nuevo. Para refrescar de verdad, p_proveedor := jordan.';
