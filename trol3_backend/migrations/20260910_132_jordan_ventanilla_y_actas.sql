-- 132 · Jordan Ventanilla (semanas cotizadas por trámite presencial) y Actas del
-- Registro Civil, on demand desde la app. La app habla directo con Jordan
-- (lib/jordan); aquí sólo viven los catálogos y el mapeo de proveedor.
-- 1 crédito Jordan = $13: Ventanilla 4 créditos, acta 1.5 créditos.

insert into trol3.proveedores (codigo, nombre, costo_unitario, activo)
values ('jordan_ventanilla', 'Jordan · semanas en ventanilla IMSS', 52.00, true),
       ('jordan_actas',      'Jordan · actas del Registro Civil',    19.50, true)
on conflict (codigo) do update set nombre = excluded.nombre, costo_unitario = excluded.costo_unitario, activo = true;

-- Las actas son documentos del cliente: las sube el asesor a mano o llegan de
-- Jordan. El cliente las ve en /mi (visible_cliente).
insert into trol3.catalogo_documentos (tipo, nombre, gating, orden, origen, sube_cliente, sube_asesor, parseable, formatos, visible_cliente)
values ('acta_nacimiento', 'Acta de nacimiento', 'gratis', 10, 'subido', false, true, false, '{pdf}', true),
       ('acta_matrimonio', 'Acta de matrimonio', 'gratis', 11, 'subido', false, true, false, '{pdf}', true),
       ('acta_defuncion',  'Acta de defunción',  'gratis', 12, 'subido', false, true, false, '{pdf}', true),
       ('acta_divorcio',   'Acta de divorcio',   'gratis', 13, 'subido', false, true, false, '{pdf}', true)
on conflict (tipo) do nothing;

-- pedir_consulta: dos tipos nuevos. No los despacha tg_consulta_despachar (sólo
-- conoce cda/issste/imss_historial): la consulta nace `solicitada` y la app la
-- manda a Jordan y la pasa a `en_proceso` con el sid en payload_in.
CREATE OR REPLACE FUNCTION trol3.pedir_consulta(p_persona uuid, p_tipo text, p_actor trol3.actor_tipo DEFAULT 'asesor'::trol3.actor_tipo, p_actor_id uuid DEFAULT NULL::uuid, p_pagador text DEFAULT NULL::text, p_notificar boolean DEFAULT false, p_motivo text DEFAULT NULL::text, p_forzar boolean DEFAULT false, p_proveedor text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'trol3', 'public'
AS $function$
declare cid uuid; prov text; costo numeric; canal record; pol text := 'belvo_first'; abierta record; espera int; tiene_dato boolean;
begin
  if auth.uid() is not null and not trol3.es_miembro() and (p_actor <> 'cliente' or p_persona <> trol3.current_persona_id()) then raise exception 'no_autorizado'; end if;
  if p_actor = 'asesor' and p_actor_id is null then p_actor_id := trol3.current_miembro_id(); end if;
  espera := coalesce((select valor::int from trol3.config where clave = 'consulta_espera_min'), 10);
  if not p_forzar and p_tipo in ('imss_historial','cda','issste','infonavit') then
    select c.id, c.proveedor, c.created_at into abierta from trol3.consultas c
     where c.persona_id = p_persona and c.tipo = p_tipo and c.estado in ('solicitada','en_proceso') and c.created_at > now() - (espera||' minutes')::interval
     order by c.created_at desc limit 1;
    if found then
      return jsonb_build_object('ok', false, 'motivo', 'consulta_en_curso', 'consulta_id', abierta.id, 'proveedor', abierta.proveedor, 'desde', abierta.created_at,
        'reintentar_en_seg', greatest(0, ceil(extract(epoch from (abierta.created_at + (espera||' minutes')::interval - now()))))::int);
    end if;
  end if;
  -- Ventanilla: Jordan sólo admite un trámite pendiente por CURP; aquí el mismo candado, sin ventana de tiempo.
  if p_tipo = 'imss_ventanilla' and exists (select 1 from trol3.consultas c where c.persona_id = p_persona and c.tipo = p_tipo and c.estado in ('solicitada','en_proceso')) then
    return jsonb_build_object('ok', false, 'motivo', 'ventanilla_en_curso');
  end if;
  if not p_forzar and p_actor <> 'asesor' and p_tipo = 'imss_historial' and exists (
    select 1 from trol3.datos d where d.persona_id = p_persona and d.campo = 'semanas_cotizadas' and d.capa='validado' and d.obtenido_en > now() - interval '90 days') then
    return jsonb_build_object('ok', false, 'motivo', 'validado_vigente');
  end if;
  select c.* into canal from trol3.personas p join trol3.canales c on c.codigo = p.canal_origen where p.id = p_persona;
  if found then pol := canal.politica_proveedor; end if;
  if p_actor = 'asesor' then pol := 'jordan_first'; end if;
  prov := coalesce(p_proveedor, case p_tipo
    when 'imss_historial'  then (case when pol = 'jordan_first' then 'jordan' else 'belvo' end)
    when 'cda'             then 'cda'
    when 'issste'          then 'nubarium'
    when 'infonavit'       then 'jordan_infonavit'
    when 'calculo_base'    then 'sisec'
    when 'pdf_semanas'     then 'pdf_semanas'
    when 'imss_ventanilla' then 'jordan_ventanilla'
    when 'acta'            then 'jordan_actas'
    else null end);
  -- 101: Belvo es caché. Si ya hay reporte validado, no puede aportar nada.
  if not p_forzar and p_tipo = 'imss_historial' and prov = 'belvo' then
    select exists (select 1 from trol3.datos d where d.persona_id = p_persona and d.campo = 'semanas_cotizadas' and d.capa = 'validado') into tiene_dato;
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
