-- 246 · broker_infonavit: precalificación Infonavit (pantalla Banco del Bienestar / "Consulta Bansefi")
-- vía asesores.broker. Primera fuente REAL de saldo de vivienda: hasta hoy saldo_infonavit era un
-- estimado Trol (supone que nunca usó crédito). La capa 'validado' le gana sola (prioridad_capa).
-- Flujo: pedir_consulta(persona,'infonavit') -> cola (estado solicitada) -> ejecutor en navegador
-- crea la solicitud en el portal y marca broker_infonavit_enviada(id, folio) -> al estar lista sube
-- la imagen al webhook n8n "Broker Infonavit → trol3", que extrae los campos y llama
-- api-trol /consulta/resultado.

-- 1. Proveedor
insert into trol3.proveedores (codigo, nombre, costo_unitario, compromiso_mensual, activo, config)
values ('broker_infonavit', 'Broker · precalificación Infonavit (Banco del Bienestar)', 10, 0, true,
        jsonb_build_object('tipo','infonavit','portal','asesores.broker','servicio','CONSULTA_BANSEFI',
                           'canal','navegador','horario','L-V 9:00-18:30 CDMX','espera_horas_habiles',8))
on conflict (codigo) do update set nombre = excluded.nombre, config = excluded.config, activo = true;

-- 2. Campos nuevos (grupo infonavit). La precalificación cambia cada bimestre: vigencia 60 días.
insert into trol3.catalogo_campos (campo, nombre, grupo, tipo, unidad, vigencia_dias, editable_cliente, visible_cliente, visible_aliado, orden) values
  ('infonavit_monto_credito',    'Monto de crédito Infonavit',            'infonavit','number','mxn', 60, false, true,  true, 42),
  ('infonavit_capacidad_compra', 'Capacidad de compra',                   'infonavit','number','mxn', 60, false, true,  true, 43),
  ('infonavit_ahorro_minimo',    'Monto mínimo de ahorro para el crédito','infonavit','number','mxn', 60, false, true,  true, 44),
  ('infonavit_pago_mensual',     'Pago mensual estimado del crédito',     'infonavit','number','mxn', 60, false, true,  true, 45),
  ('relacion_laboral_vigente',   'Relación laboral vigente (Infonavit)',  'infonavit','bool',  null, 60, false, false, true, 46)
on conflict (campo) do update set nombre = excluded.nombre, grupo = excluded.grupo, vigencia_dias = excluded.vigencia_dias,
  editable_cliente = excluded.editable_cliente, visible_cliente = excluded.visible_cliente, orden = excluded.orden;

-- 3. pedir_consulta: 'infonavit' va por defecto a broker_infonavit (jordan_infonavit sigue en api_pendiente).
--    Candados propios: cuesta dinero real, así que sólo lo piden asesor/sistema (no /mi ni el bot),
--    exige NSS y no repite si hay validado de < 30 días (salvo p_forzar). No hay ventana de 10 min:
--    una pendiente en cola bloquea otra.
create or replace function trol3.pedir_consulta(p_persona uuid, p_tipo text, p_actor trol3.actor_tipo DEFAULT 'asesor'::trol3.actor_tipo, p_actor_id uuid DEFAULT NULL::uuid, p_pagador text DEFAULT NULL::text, p_notificar boolean DEFAULT false, p_motivo text DEFAULT NULL::text, p_forzar boolean DEFAULT false, p_proveedor text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'trol3', 'public'
as $function$
declare cid uuid; prov text; costo numeric; canal record; pol text := 'belvo_first'; abierta record; espera int; tiene_dato boolean; v_nss text;
begin
  if auth.uid() is not null and not trol3.es_miembro() and (p_actor <> 'cliente' or p_persona <> trol3.current_persona_id()) then raise exception 'no_autorizado'; end if;
  if p_actor = 'asesor' and p_actor_id is null then p_actor_id := trol3.current_miembro_id(); end if;
  espera := coalesce((select valor::int from trol3.config where clave = 'consulta_espera_min'), 10);
  -- 246: el broker trabaja en fila humana; su pendiente no caduca a los 10 min
  if p_tipo = 'infonavit' and coalesce(p_proveedor, 'broker_infonavit') = 'broker_infonavit' then
    if p_actor not in ('asesor','sistema') then
      return jsonb_build_object('ok', false, 'motivo', 'solo_asesor', 'detalle', 'La precalificación Infonavit tiene costo: la pide un asesor.');
    end if;
    select c.id, c.created_at into abierta from trol3.consultas c
     where c.persona_id = p_persona and c.tipo = 'infonavit' and c.proveedor = 'broker_infonavit' and c.estado in ('solicitada','en_proceso')
     order by c.created_at desc limit 1;
    if found then
      return jsonb_build_object('ok', false, 'motivo', 'consulta_en_curso', 'consulta_id', abierta.id, 'proveedor', 'broker_infonavit', 'desde', abierta.created_at);
    end if;
    select coalesce(nullif(trim(p.nss),''), nullif(trim(cl.nss),'')) into v_nss
      from trol3.personas p left join public.clientes cl on cl.id = p.legacy_cliente_id where p.id = p_persona;
    if v_nss is null or v_nss !~ '^\d{11}$' then
      return jsonb_build_object('ok', false, 'motivo', 'falta_nss', 'detalle', 'Se necesita el NSS (11 dígitos) para pedir la precalificación Infonavit.');
    end if;
    if not p_forzar and exists (select 1 from trol3.datos d join trol3.consultas c on c.id = d.consulta_id
        where d.persona_id = p_persona and c.proveedor = 'broker_infonavit' and d.obtenido_en > now() - interval '30 days') then
      return jsonb_build_object('ok', false, 'motivo', 'validado_vigente', 'detalle', 'Ya hay precalificación Infonavit de los últimos 30 días.');
    end if;
  end if;
  if not p_forzar and p_tipo in ('imss_historial','cda','issste','infonavit') then
    select c.id, c.proveedor, c.created_at into abierta from trol3.consultas c
     where c.persona_id = p_persona and c.tipo = p_tipo and c.estado in ('solicitada','en_proceso') and c.created_at > now() - (espera||' minutes')::interval
     order by c.created_at desc limit 1;
    if found then
      return jsonb_build_object('ok', false, 'motivo', 'consulta_en_curso', 'consulta_id', abierta.id, 'proveedor', abierta.proveedor, 'desde', abierta.created_at,
        'reintentar_en_seg', greatest(0, ceil(extract(epoch from (abierta.created_at + (espera||' minutes')::interval - now()))))::int);
    end if;
  end if;
  -- Ventanilla y vigencia (219): Jordan sólo admite un trámite pendiente por CURP; aquí el mismo candado, sin ventana de tiempo.
  if p_tipo in ('imss_ventanilla','vigencia_imss') and exists (select 1 from trol3.consultas c where c.persona_id = p_persona and c.tipo = p_tipo and c.estado in ('solicitada','en_proceso')) then
    return jsonb_build_object('ok', false, 'motivo', case p_tipo when 'imss_ventanilla' then 'ventanilla_en_curso' else 'vigencia_en_curso' end);
  end if;
  if not p_forzar and p_actor <> 'asesor' and p_tipo = 'imss_historial' and exists (
    select 1 from trol3.datos d where d.persona_id = p_persona and d.campo = 'semanas_cotizadas' and d.capa='validado' and d.obtenido_en > now() - interval '90 days') then
    return jsonb_build_object('ok', false, 'motivo', 'validado_vigente');
  end if;
  select c.* into canal from trol3.personas p join trol3.canales c on c.codigo = p.canal_origen where p.id = p_persona;
  if found then pol := canal.politica_proveedor; end if;
  -- 190: política por código de origen (el FIP va Belvo primero aunque el canal evento sea Jordan)
  select coalesce((select (cf.valor::jsonb) ->> p.codigo_origen from trol3.config cf where cf.clave = 'politica_proveedor_codigo'), pol) into pol
    from trol3.personas p where p.id = p_persona;
  if p_actor = 'asesor' then pol := 'jordan_first'; end if;
  prov := coalesce(p_proveedor, case p_tipo
    when 'imss_historial'  then (case when pol = 'jordan_first' then 'jordan' else 'belvo' end)
    when 'cda'             then 'cda'
    when 'issste'          then 'nubarium'
    when 'infonavit'       then 'broker_infonavit'   -- 246 (antes jordan_infonavit, api_pendiente)
    when 'calculo_base'    then 'sisec'
    when 'pdf_semanas'     then 'pdf_semanas'
    when 'imss_ventanilla' then 'jordan_ventanilla'
    when 'acta'            then 'jordan_actas'
    when 'vigencia_imss'   then 'jordan_vigencia'
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
  insert into trol3.consultas (persona_id, tipo, proveedor, solicitante_tipo, solicitante_id, pagador, costo, notificar_cliente, motivo, payload_in)
  values (p_persona, p_tipo, prov, p_actor, p_actor_id,
          coalesce(p_pagador, case when p_actor='cliente' then 'cliente' when p_actor='aliado' then 'aliado:'||coalesce(p_actor_id::text,'') else 'trol' end),
          coalesce(costo,0), coalesce(p_notificar,false), p_motivo,
          case when prov = 'broker_infonavit' then jsonb_build_object('nss', v_nss) end)
  returning id into cid;
  return jsonb_build_object('ok', true, 'consulta_id', cid, 'proveedor', prov, 'costo', costo);
end $function$;

-- 4. El cierre automático de colgadas (10 min) no aplica al broker: fila humana en horario hábil.
--    Las suyas caducan a los 3 días sin folio, o 2 días después de enviadas.
create or replace function trol3.cerrar_consultas_colgadas(p_minutos integer DEFAULT NULL::integer)
 returns integer
 language plpgsql
 security definer
 set search_path to 'trol3', 'public'
as $function$
declare m int; n int := 0; c record;
begin
  m := coalesce(p_minutos, (select valor::int from trol3.config where clave='consulta_espera_min'), 10);
  for c in
    select id, persona_id, tipo, proveedor, created_at, updated_at, estado
      from trol3.consultas
     where estado in ('solicitada','en_proceso')
       and legacy_proceso_id is null
       and coalesce(tipo,'') not in ('imss_ventanilla','acta')   -- 138: on demand, cierre propio
       and (   (coalesce(proveedor,'') <> 'broker_infonavit' and created_at < now() - (m||' minutes')::interval)
            or (proveedor = 'broker_infonavit' and estado = 'solicitada' and created_at < now() - interval '3 days')
            or (proveedor = 'broker_infonavit' and estado = 'en_proceso' and updated_at < now() - interval '2 days'))
       and created_at > now() - interval '7 days'
       and coalesce(error,'') not like 'Falta CURP%'
     for update skip locked
  loop
    update trol3.consultas
       set estado = 'sin_resultado', completed_at = now(),
           error = case when c.proveedor = 'broker_infonavit'
                        then 'Broker sin respuesta ('||c.estado::text||') — revisar en asesores.broker'
                        else 'Sin respuesta de '||coalesce(c.proveedor,'el proveedor')||' después de '||m||' min' end
     where id = c.id;
    perform trol3.emitir_evento(c.persona_id, 'consulta_sin_respuesta', 'sistema', null,
      jsonb_build_object('consulta_id', c.id, 'tipo', c.tipo, 'proveedor', c.proveedor, 'minutos', m));
    n := n + 1;
  end loop;
  return n;
end $function$;

-- 5. Cola para el ejecutor (navegador): lo que falta enviar y lo que espera respuesta.
create or replace view trol3.v_cola_broker_infonavit as
select c.id as consulta_id, c.persona_id, c.estado, c.payload_in->>'nss' as nss,
       c.payload_in->>'folio_broker' as folio_broker,
       trim(coalesce(p.nombre,'')||' '||coalesce(p.apellidos,'')) as nombre,
       c.solicitante_tipo, c.motivo, c.created_at, c.updated_at
  from trol3.consultas c join trol3.personas p on p.id = c.persona_id
 where c.proveedor = 'broker_infonavit' and c.estado in ('solicitada','en_proceso')
 order by c.created_at;
revoke all on trol3.v_cola_broker_infonavit from anon, authenticated;

-- 6. El ejecutor registra el folio del portal al crear la solicitud (y con eso queda "en_proceso").
create or replace function trol3.broker_infonavit_enviada(p_consulta uuid, p_folio text)
 returns jsonb language plpgsql security definer set search_path to 'trol3','public' as $function$
begin
  if auth.uid() is not null and not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  update trol3.consultas
     set estado = 'en_proceso', error = null, updated_at = now(),
         payload_in = coalesce(payload_in,'{}'::jsonb) || jsonb_build_object('folio_broker', p_folio, 'enviada_at', now())
   where id = p_consulta and proveedor = 'broker_infonavit' and estado = 'solicitada';
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_esta_en_cola'); end if;
  return jsonb_build_object('ok', true);
end $function$;
revoke all on function trol3.broker_infonavit_enviada(uuid, text) from anon;

-- 7. El webhook n8n valida que el folio corresponda antes de escribir resultados.
create or replace function trol3.broker_infonavit_valida(p_consulta uuid, p_folio text)
 returns jsonb language sql security definer set search_path to 'trol3','public' as $function$
  select coalesce((select jsonb_build_object('ok', true, 'persona_id', c.persona_id, 'nss', c.payload_in->>'nss')
                     from trol3.consultas c
                    where c.id = p_consulta and c.proveedor = 'broker_infonavit' and c.estado = 'en_proceso'
                      and c.payload_in->>'folio_broker' = p_folio), jsonb_build_object('ok', false));
$function$;
revoke all on function trol3.broker_infonavit_valida(uuid, text) from anon, authenticated;

-- 246b: las funciones nacen con EXECUTE a PUBLIC; se cierra explícito.
revoke all on function trol3.broker_infonavit_valida(uuid, text) from public;
grant execute on function trol3.broker_infonavit_valida(uuid, text) to service_role;
revoke all on function trol3.broker_infonavit_enviada(uuid, text) from public;
grant execute on function trol3.broker_infonavit_enviada(uuid, text) to authenticated, service_role;
grant select on trol3.v_cola_broker_infonavit to service_role;
