-- Aplicada en Supabase el 29-oct-2026 como "249_precalix" (numeración de repo: 267)
-- 249 · Precalix: precalificación Infonavit por API ($0 piloto) sustituye al broker como proveedor por defecto.
-- El broker (asesores.broker) queda como respaldo manual (p_proveedor := 'broker_infonavit').
-- Ver claude/113-precalix.md

-- 1. Proveedor y webhook
insert into trol3.proveedores (codigo, nombre, costo_unitario, compromiso_mensual, activo, config)
values ('precalix', 'Precalix · precalificación Infonavit (API)', 0, 0, true,
        jsonb_build_object('tipo','infonavit','canal','api','base','https://www.precalix.app/api/v1','producto','mejora',
                           'solicitudes_por_hora',30,'peticiones_por_hora',1200,'precio_futuro','$4 MXN IVA incl. (Stripe apagado)'))
on conflict (codigo) do update set nombre = excluded.nombre, costo_unitario = 0, activo = true, config = excluded.config;

insert into trol3.config (clave, valor) values ('webhook_precalix', 'https://eltrolfinanciero.app.n8n.cloud/webhook/precalix-consulta')
on conflict (clave) do update set valor = excluded.valor, updated_at = now();

-- 2. pedir_consulta: infonavit → precalix por defecto; candados comunes a los dos proveedores de infonavit
create or replace function trol3.pedir_consulta(p_persona uuid, p_tipo text, p_actor trol3.actor_tipo default 'asesor', p_actor_id uuid default null, p_pagador text default null, p_notificar boolean default false, p_motivo text default null, p_forzar boolean default false, p_proveedor text default null)
returns jsonb language plpgsql security definer set search_path to 'trol3','public' as $function$
declare cid uuid; prov text; costo numeric; canal record; pol text := 'belvo_first'; abierta record; espera int; tiene_dato boolean; v_nss text; prov_inf text;
begin
  if auth.uid() is not null and not trol3.es_miembro() and (p_actor <> 'cliente' or p_persona <> trol3.current_persona_id()) then raise exception 'no_autorizado'; end if;
  if p_actor = 'asesor' and p_actor_id is null then p_actor_id := trol3.current_miembro_id(); end if;
  espera := coalesce((select valor::int from trol3.config where clave = 'consulta_espera_min'), 10);
  if p_tipo = 'infonavit' then
    prov_inf := coalesce(p_proveedor, 'precalix');
    if prov_inf not in ('precalix','broker_infonavit') then return jsonb_build_object('ok', false, 'motivo', 'proveedor_desconocido'); end if;
    if p_actor not in ('asesor','sistema') then
      return jsonb_build_object('ok', false, 'motivo', 'solo_asesor', 'detalle', 'La precalificación Infonavit la pide un asesor.');
    end if;
    select c.id, c.proveedor, c.created_at into abierta from trol3.consultas c
     where c.persona_id = p_persona and c.tipo = 'infonavit' and c.estado in ('solicitada','en_proceso')
     order by c.created_at desc limit 1;
    if found then
      return jsonb_build_object('ok', false, 'motivo', 'consulta_en_curso', 'consulta_id', abierta.id, 'proveedor', abierta.proveedor, 'desde', abierta.created_at);
    end if;
    select coalesce(nullif(trim(p.nss),''), nullif(trim(cl.nss),'')) into v_nss
      from trol3.personas p left join public.clientes cl on cl.id = p.legacy_cliente_id where p.id = p_persona;
    if v_nss is null or v_nss !~ '^\d{11}$' then
      return jsonb_build_object('ok', false, 'motivo', 'falta_nss', 'detalle', 'Se necesita el NSS (11 dígitos) para pedir la precalificación Infonavit.');
    end if;
    if not p_forzar and exists (select 1 from trol3.datos d join trol3.consultas c on c.id = d.consulta_id
        where d.persona_id = p_persona and c.tipo = 'infonavit' and c.proveedor in ('precalix','broker_infonavit') and d.obtenido_en > now() - interval '30 days') then
      return jsonb_build_object('ok', false, 'motivo', 'validado_vigente', 'detalle', 'Ya hay precalificación Infonavit de los últimos 30 días.');
    end if;
  end if;
  if not p_forzar and p_tipo in ('imss_historial','cda','issste') then
    select c.id, c.proveedor, c.created_at into abierta from trol3.consultas c
     where c.persona_id = p_persona and c.tipo = p_tipo and c.estado in ('solicitada','en_proceso') and c.created_at > now() - (espera||' minutes')::interval
     order by c.created_at desc limit 1;
    if found then
      return jsonb_build_object('ok', false, 'motivo', 'consulta_en_curso', 'consulta_id', abierta.id, 'proveedor', abierta.proveedor, 'desde', abierta.created_at,
        'reintentar_en_seg', greatest(0, ceil(extract(epoch from (abierta.created_at + (espera||' minutes')::interval - now()))))::int);
    end if;
  end if;
  if p_tipo in ('imss_ventanilla','vigencia_imss') and exists (select 1 from trol3.consultas c where c.persona_id = p_persona and c.tipo = p_tipo and c.estado in ('solicitada','en_proceso')) then
    return jsonb_build_object('ok', false, 'motivo', case p_tipo when 'imss_ventanilla' then 'ventanilla_en_curso' else 'vigencia_en_curso' end);
  end if;
  if not p_forzar and p_actor <> 'asesor' and p_tipo = 'imss_historial' and exists (
    select 1 from trol3.datos d where d.persona_id = p_persona and d.campo = 'semanas_cotizadas' and d.capa='validado' and d.obtenido_en > now() - interval '90 days') then
    return jsonb_build_object('ok', false, 'motivo', 'validado_vigente');
  end if;
  select c.* into canal from trol3.personas p join trol3.canales c on c.codigo = p.canal_origen where p.id = p_persona;
  if found then pol := canal.politica_proveedor; end if;
  select coalesce((select (cf.valor::jsonb) ->> p.codigo_origen from trol3.config cf where cf.clave = 'politica_proveedor_codigo'), pol) into pol
    from trol3.personas p where p.id = p_persona;
  if p_actor = 'asesor' then pol := 'jordan_first'; end if;
  prov := coalesce(p_proveedor, case p_tipo
    when 'imss_historial'  then (case when pol = 'jordan_first' then 'jordan' else 'belvo' end)
    when 'cda'             then 'cda'
    when 'issste'          then 'nubarium'
    when 'infonavit'       then 'precalix'
    when 'calculo_base'    then 'sisec'
    when 'pdf_semanas'     then 'pdf_semanas'
    when 'imss_ventanilla' then 'jordan_ventanilla'
    when 'acta'            then 'jordan_actas'
    when 'vigencia_imss'   then 'jordan_vigencia'
    else null end);
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
          case when prov in ('broker_infonavit','precalix') then jsonb_build_object('nss', v_nss) else '{}'::jsonb end)
  returning id into cid;
  return jsonb_build_object('ok', true, 'consulta_id', cid, 'proveedor', prov, 'costo', costo);
end $function$;

-- 3. Despacho: la consulta precalix se manda a n8n al crearse
create or replace function trol3.tg_consulta_despachar() returns trigger
language plpgsql security definer set search_path to 'trol3','public','extensions' as $function$
declare c record; p record; url text; payload jsonb; correo text; tel text; begin
  if new.estado <> 'solicitada' or new.legacy_proceso_id is not null then return new; end if;
  if new.tipo = 'infonavit' and new.proveedor = 'precalix' then
    select valor into url from trol3.config where clave = 'webhook_precalix';
    if coalesce(url,'') = '' then update trol3.consultas set error = 'Webhook de precalix no configurado (trol3.config)' where id = new.id; return new; end if;
    payload := jsonb_build_object('consulta_id', new.id, 'persona_id', new.persona_id, 'nss', new.payload_in->>'nss', 'origen', 'trol3');
    perform net.http_post(url := url, body := payload, headers := '{"content-type":"application/json","X-Supabase-Source":"trol3"}'::jsonb);
    update trol3.consultas set estado = 'en_proceso', error = null, payload_in = coalesce(payload_in,'{}'::jsonb) || jsonb_build_object('despachada_at', now()) where id = new.id;
    return new;
  end if;
  if new.tipo in ('cda','issste') then
    select * into p from trol3.personas where id = new.persona_id;
    if p.curp is null then
      update trol3.consultas set error = 'Falta CURP: la consulta se disparará sola al capturarla' where id = new.id;
      return new;
    end if;
    select valor into url from trol3.config where clave = case new.tipo when 'cda' then 'webhook_cda' else 'webhook_issste' end;
    if coalesce(url,'') = '' then update trol3.consultas set error = 'Webhook de '||new.tipo||' no configurado (trol3.config)' where id = new.id; return new; end if;
    if new.tipo = 'issste' then
      select coalesce((select cl.email from public.clientes cl where cl.id = p.legacy_cliente_id),
                      (select ct.valor from trol3.contactos ct where ct.persona_id = p.id and ct.tipo='email' order by ct.principal desc limit 1)) into correo;
      payload := jsonb_build_object('curp', p.curp, 'persona_id', p.id, 'trol3_consulta_id', new.id,
                                    'nombre', trim(coalesce(p.nombre,'')||' '||coalesce(p.apellidos,'')), 'email', correo,
                                    'cliente_id', p.legacy_cliente_id, 'origen', 'trol3');
    else
      payload := jsonb_build_object('curp', p.curp, 'persona_id', p.id, 'cliente_id', p.legacy_cliente_id, 'trol3_consulta_id', new.id, 'origen', 'trol3');
    end if;
    perform net.http_post(url := url, body := payload, headers := '{"content-type":"application/json"}'::jsonb);
    update trol3.consultas set estado = 'en_proceso', error = null where id = new.id;
    return new;
  end if;
  if new.tipo = 'imss_historial' and new.proveedor in ('belvo','jordan') then
    select * into p from trol3.personas where id = new.persona_id;
    if p.curp is null then
      update trol3.consultas set error = 'Falta CURP: la consulta se disparará sola al capturarla' where id = new.id;
      return new;
    end if;
    if p.legacy_cliente_id is null then
      perform trol3.enlazar_legacy(new.persona_id);
      select * into p from trol3.personas where id = new.persona_id;
    end if;
    if p.legacy_cliente_id is null then
      update trol3.consultas set error = 'No se pudo crear el registro legacy del cliente (enlazar_legacy)' where id = new.id;
      perform trol3.emitir_evento(new.persona_id, 'consulta_pendiente_reflejo', 'sistema', null, jsonb_build_object('consulta_id', new.id, 'tipo', new.tipo, 'proveedor', new.proveedor));
      return new;
    end if;
    select cl.* into c from public.clientes cl where cl.id = p.legacy_cliente_id;
    if c.curp is distinct from p.curp then update public.clientes set curp = p.curp where id = c.id and not exists (select 1 from public.clientes x where x.curp = p.curp and x.id <> c.id); c.curp := p.curp; end if;
    select ct.normalizado into tel from trol3.contactos ct
      where ct.persona_id = p.id and ct.tipo = 'telefono' order by ct.principal desc, ct.verificado_at desc nulls last limit 1;
    tel := coalesce(tel, trol3.tel10(c.telefono));
    select valor into url from trol3.config where clave = case when new.proveedor = 'jordan' then 'webhook_jordan' else 'webhook_belvo' end;
    if coalesce(url,'') = '' then update trol3.consultas set error = 'Webhook de '||new.proveedor||' no configurado (trol3.config)' where id = new.id; return new; end if;
    if new.proveedor = 'jordan' then
      payload := jsonb_build_object('cliente_id', c.id, 'curp', c.curp, 'nss', coalesce(nullif(trim(p.nss),''), nullif(trim(c.nss),''), c.calculo_pensional->'diagnostico'->>'nss'), 'email', c.email, 'nombre', c.nombre,
                                    'telefono', tel, 'mobil', tel, 'drive_folder_id', c.drive_folder_id,
                                    'trol3_consulta_id', new.id, 'origen', 'trol3', 'notificar_cliente', new.notificar_cliente);
      update public.clientes set sisec_refresh_solicitado_at = now() where id = c.id;
      perform net.http_post(url := url, body := payload, headers := '{"content-type":"application/json","X-Supabase-Source":"trol3"}'::jsonb);
    else
      payload := jsonb_build_object('cliente_id', c.id, 'id_hubspot', c.id_hubspot, 'curp', c.curp, 'email', c.email, 'nombre', c.nombre, 'apellidos', c.apellidos, 'telefono', coalesce(tel, c.telefono),
                                    'fecha_nacimiento', c.fecha_nacimiento, 'edad', date_part('year', age(c.fecha_nacimiento))::int, 'edo_republica', c.edo_republica, 'interes_reciente', case when coalesce(new.notificar_cliente, false) then c."Interes_reciente" else 'Refresh Belvo' end, 'notify_client', coalesce(new.notificar_cliente, false),
                                    'ultima_fecha_sisec', c."última_fecha_sisec", 'trol3_consulta_id', new.id, 'origen', 'trol3', 'notificar_cliente', new.notificar_cliente);
      perform net.http_post(url := url, body := payload, headers := '{"content-type":"application/json"}'::jsonb);
    end if;
    update trol3.consultas set estado = 'en_proceso', error = null where id = new.id;
  end if;
  return new;
exception when others then
  update trol3.consultas set error = sqlerrm where id = new.id; return new;
end $function$;

-- 4. Registro del id de Precalix y validación al entregar
create or replace function trol3.precalix_enviada(p_consulta uuid, p_precalix_id text, p_folio text default null)
returns jsonb language plpgsql security definer set search_path to 'trol3','public' as $function$
begin
  if auth.uid() is not null and not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  update trol3.consultas
     set estado = 'en_proceso', error = null, updated_at = now(),
         payload_in = coalesce(payload_in,'{}'::jsonb) || jsonb_build_object('precalix_id', p_precalix_id, 'folio_precalix', p_folio, 'enviada_at', now())
   where id = p_consulta and proveedor = 'precalix' and estado in ('solicitada','en_proceso');
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_esta_en_cola'); end if;
  return jsonb_build_object('ok', true);
end $function$;

create or replace function trol3.precalix_valida(p_consulta uuid, p_precalix_id text)
returns jsonb language sql security definer set search_path to 'trol3','public' as $function$
  select coalesce((select jsonb_build_object('ok', true, 'persona_id', c.persona_id, 'nss', c.payload_in->>'nss', 'estado', c.estado)
                     from trol3.consultas c
                    where c.id = p_consulta and c.proveedor = 'precalix' and c.estado in ('solicitada','en_proceso')
                      and (c.payload_in->>'precalix_id' = p_precalix_id or c.payload_in->>'precalix_id' is null)), jsonb_build_object('ok', false));
$function$;

-- 5. Cola para el barrido de n8n (consultas precalix que no cerraron)
create or replace view trol3.v_cola_precalix as
  select c.id as consulta_id, c.persona_id, c.estado, c.payload_in->>'nss' as nss, c.payload_in->>'precalix_id' as precalix_id,
         c.payload_in->>'folio_precalix' as folio_precalix, c.solicitante_tipo, c.motivo, c.created_at, c.updated_at
    from trol3.consultas c
   where c.proveedor = 'precalix' and c.estado in ('solicitada','en_proceso')
   order by c.created_at;

-- 6. Colgadas: precalix tarda ~1 min; se le dan 2 h (el barrido de n8n las cierra antes)
create or replace function trol3.cerrar_consultas_colgadas(p_minutos integer default null) returns integer
language plpgsql security definer set search_path to 'trol3','public' as $function$
declare m int; n int := 0; c record;
begin
  m := coalesce(p_minutos, (select valor::int from trol3.config where clave='consulta_espera_min'), 10);
  for c in
    select id, persona_id, tipo, proveedor, created_at, updated_at, estado
      from trol3.consultas
     where estado in ('solicitada','en_proceso')
       and legacy_proceso_id is null
       and coalesce(tipo,'') not in ('imss_ventanilla','acta')
       and (   (coalesce(proveedor,'') not in ('broker_infonavit','precalix') and created_at < now() - (m||' minutes')::interval)
            or (proveedor = 'precalix' and updated_at < now() - interval '2 hours')
            or (proveedor = 'broker_infonavit' and estado = 'solicitada' and created_at < now() - interval '3 days')
            or (proveedor = 'broker_infonavit' and estado = 'en_proceso' and updated_at < now() - interval '2 days'))
       and created_at > now() - interval '7 days'
       and coalesce(error,'') not like 'Falta CURP%'
     for update skip locked
  loop
    update trol3.consultas
       set estado = 'sin_resultado', completed_at = now(),
           error = case when c.proveedor = 'broker_infonavit' then 'Broker sin respuesta ('||c.estado::text||') — revisar en asesores.broker'
                        when c.proveedor = 'precalix' then 'Precalix sin respuesta en 2 h'
                        else 'Sin respuesta de '||coalesce(c.proveedor,'el proveedor')||' después de '||m||' min' end
     where id = c.id;
    perform trol3.emitir_evento(c.persona_id, 'consulta_sin_respuesta', 'sistema', null,
      jsonb_build_object('consulta_id', c.id, 'tipo', c.tipo, 'proveedor', c.proveedor, 'minutos', m));
    n := n + 1;
  end loop;
  return n;
end $function$;

-- 7. Pedido automático (248) ahora por Precalix; "ya consultado" cuenta cualquier proveedor de infonavit
create or replace function trol3.broker_infonavit_auto(p_persona uuid, p_origen text default null) returns jsonb
language plpgsql security definer set search_path to 'trol3','public' as $function$
declare v_nss text; v_st text; v_fs date; v_ini date; n_hoy int; tope int; r jsonb;
begin
  if coalesce((select valor from trol3.config where clave='broker_infonavit_auto'),'off') <> 'on' then
    return jsonb_build_object('ok', false, 'motivo', 'apagado'); end if;
  select coalesce(nullif(trim(p.nss),''), nullif(trim(cl.nss),'')) into v_nss
    from trol3.personas p left join public.clientes cl on cl.id = p.legacy_cliente_id where p.id = p_persona and p.merged_into is null;
  if v_nss is null or v_nss !~ '^\d{11}$' then return jsonb_build_object('ok', false, 'motivo', 'sin_nss'); end if;
  select valor#>>'{}' into v_st from trol3.v_mejor_dato where persona_id = p_persona and campo = 'status_empleo' and capa = 'validado';
  if coalesce(v_st,'') <> 'empleado' then return jsonb_build_object('ok', false, 'motivo', 'no_cotiza'); end if;
  select trol3.to_date_safe(d.valor->'meta'->>'fecha_sisec'),
         (select min(trol3.to_date_safe(h->>'fecha_inicio')) from jsonb_array_elements(case when jsonb_typeof(d.valor->'historial')='array' then d.valor->'historial' else '[]'::jsonb end) h
           where coalesce(h->>'fecha_fin','') = '')
    into v_fs, v_ini from trol3.v_mejor_dato d where d.persona_id = p_persona and d.campo = 'semilla';
  if v_fs is null or v_fs < current_date - 30 then return jsonb_build_object('ok', false, 'motivo', 'sisec_viejo'); end if;
  if v_ini is null or v_ini > current_date - 90 then return jsonb_build_object('ok', false, 'motivo', 'menos_de_3_meses', 'inicio', v_ini); end if;
  if exists (select 1 from trol3.consultas c where c.persona_id = p_persona and c.tipo = 'infonavit' and c.proveedor in ('precalix','broker_infonavit') and c.created_at > now() - interval '60 days') then
    return jsonb_build_object('ok', false, 'motivo', 'ya_consultado'); end if;
  tope := coalesce((select valor::int from trol3.config where clave='broker_infonavit_auto_max_dia'), 40);
  select count(*) into n_hoy from trol3.consultas c where c.proveedor in ('precalix','broker_infonavit') and c.motivo like 'auto:%'
     and c.created_at >= (date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City');
  if n_hoy >= tope then return jsonb_build_object('ok', false, 'motivo', 'tope_diario', 'tope', tope); end if;
  r := trol3.pedir_consulta(p_persona, 'infonavit', 'sistema', null, 'trol', false,
         'auto: cotiza desde ' || v_ini::text || coalesce(' (' || p_origen || ')', ''), false, 'precalix');
  return r;
end $function$;

grant execute on function trol3.precalix_enviada(uuid, text, text) to service_role, authenticated;
grant execute on function trol3.precalix_valida(uuid, text) to service_role, authenticated;
grant select on trol3.v_cola_precalix to service_role, authenticated;
