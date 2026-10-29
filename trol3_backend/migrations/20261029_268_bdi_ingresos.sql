-- Aplicada en Supabase el 29-oct-2026 como "250_bdi_ingresos" (numeración de repo: 268)
-- 250 · Buró de Ingresos (BDI) como fuente de ingresos SAT + ISSSTE; Belvo y Nubarium fuera del camino por defecto.
-- Ver claude/113-precalix-y-buro-de-ingresos.md §B

-- 1. Belvo fuera: no se pide más (Jordan first sin respaldo). Nubarium: sigue registrado pero inactivo.
update trol3.proveedores set activo = false where codigo in ('belvo','nubarium');
update trol3.canales set politica_proveedor = 'jordan_first' where politica_proveedor = 'belvo_first';
update trol3.config set valor = '[]', updated_at = now() where clave = 'evento_fallback_belvo';
update trol3.config set valor = replace(valor, 'belvo_first', 'jordan_first'), updated_at = now() where clave in ('politica_proveedor_codigo','politica_proveedor_antes_finnosummit');

-- 2. Proveedor BDI y webhook
insert into trol3.proveedores (codigo, nombre, costo_unitario, compromiso_mensual, activo, config)
values ('bdi', 'Buró de Ingresos (Palenca) · nómina SAT + ISSSTE', 0, 0, true,
        jsonb_build_object('tipo','ingresos','base','https://api.burodeingresos.com','consentimiento','ip_address en POST /verifications (desde 15-nov-2026)',
                           'entrega','profile + invoices nómina + employments (issste; imss anunciado, no entregado)','costo','por confirmar'))
on conflict (codigo) do update set nombre = excluded.nombre, activo = true, config = excluded.config;
insert into trol3.config (clave, valor) values ('webhook_bdi', 'https://eltrolfinanciero.app.n8n.cloud/webhook/bdi-verificacion')
on conflict (clave) do update set valor = excluded.valor, updated_at = now();

-- 3. Campos grupo ingresos (sólo asesor: no visibles al cliente ni al aliado) + empalme ISSSTE/IMSS
insert into trol3.catalogo_campos (campo, nombre, grupo, tipo, unidad, vigencia_dias, editable_cliente, visible_cliente, visible_aliado, orden) values
  ('ingreso_bruto_mensual',  'Ingreso bruto mensual (nómina SAT, promedio 3 meses)', 'ingresos', 'num',  'mxn_mensual', 90, false, false, false, 80),
  ('ingreso_neto_mensual',   'Ingreso neto mensual (nómina SAT)',                    'ingresos', 'num',  'mxn_mensual', 90, false, false, false, 81),
  ('isr_mensual',            'ISR retenido mensual (nómina SAT)',                    'ingresos', 'num',  'mxn_mensual', 90, false, false, false, 82),
  ('deducciones_otras',      'Otras deducciones en nómina (créditos, etc.)',         'ingresos', 'json', null,          90, false, false, false, 83),
  ('patron_nomina',          'Patrón según nómina SAT',                              'ingresos', 'text', null,          90, false, false, false, 84),
  ('patron_rfc',             'RFC del patrón (nómina SAT)',                          'ingresos', 'text', null,          90, false, false, false, 85),
  ('empleo_vigente_sat',     'Empleo vigente según SAT (nómina en los últimos 45 días)', 'ingresos', 'bool', null,      90, false, false, false, 86),
  ('ultima_nomina_fecha',    'Fecha del último recibo de nómina',                    'ingresos', 'date', null,          90, false, false, false, 87),
  ('periodicidad_nomina',    'Periodicidad de la nómina',                            'ingresos', 'text', null,          90, false, false, false, 88),
  ('semanas_cotizadas_bdi',  'Semanas cotizadas IMSS según BDI (referencia)',        'ingresos', 'num',  'semanas',     90, false, false, false, 89),
  ('empalme_issste_imss',    'Cotiza en ISSSTE e IMSS al mismo tiempo (empalme)',    'issste',   'bool', null,          180, false, false, false, 63)
on conflict (campo) do nothing;

-- 4. pedir_consulta: tipo ingresos → bdi; issste → bdi (nubarium sólo con p_proveedor); imss_historial → jordan siempre
create or replace function trol3.pedir_consulta(p_persona uuid, p_tipo text, p_actor trol3.actor_tipo default 'asesor', p_actor_id uuid default null, p_pagador text default null, p_notificar boolean default false, p_motivo text default null, p_forzar boolean default false, p_proveedor text default null)
returns jsonb language plpgsql security definer set search_path to 'trol3','public' as $function$
declare cid uuid; prov text; costo numeric; abierta record; espera int; v_nss text; prov_inf text;
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
  if p_tipo in ('ingresos','issste') and coalesce(p_proveedor,'bdi') = 'bdi' then
    if p_actor not in ('asesor','sistema') and coalesce(p_motivo,'') <> 'auto_cotiza_issste' then
      return jsonb_build_object('ok', false, 'motivo', 'solo_asesor', 'detalle', 'La consulta de ingresos la pide un asesor o el sistema.');
    end if;
    select c.id, c.proveedor, c.created_at into abierta from trol3.consultas c
     where c.persona_id = p_persona and c.proveedor = 'bdi' and c.estado in ('solicitada','en_proceso') order by c.created_at desc limit 1;
    if found then return jsonb_build_object('ok', false, 'motivo', 'consulta_en_curso', 'consulta_id', abierta.id, 'proveedor', 'bdi', 'desde', abierta.created_at); end if;
    if not exists (select 1 from trol3.personas p where p.id = p_persona and p.curp ~ '^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$') then
      return jsonb_build_object('ok', false, 'motivo', 'falta_curp', 'detalle', 'Se necesita la CURP para consultar el Buró de Ingresos.');
    end if;
    if not exists (select 1 from trol3.contactos ct where ct.persona_id = p_persona and ct.tipo = 'telefono' and ct.normalizado ~ '^\d{10}$') then
      return jsonb_build_object('ok', false, 'motivo', 'falta_telefono', 'detalle', 'Se necesita un teléfono de 10 dígitos (BDI lo usa para identificar a la persona).');
    end if;
    if not p_forzar and exists (select 1 from trol3.consultas c where c.persona_id = p_persona and c.proveedor = 'bdi' and c.estado = 'completada' and c.completed_at > now() - interval '90 days') then
      return jsonb_build_object('ok', false, 'motivo', 'validado_vigente', 'detalle', 'Ya hay consulta al Buró de Ingresos de los últimos 90 días.');
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
  prov := coalesce(p_proveedor, case p_tipo
    when 'imss_historial'  then 'jordan'
    when 'cda'             then 'cda'
    when 'issste'          then 'bdi'
    when 'ingresos'        then 'bdi'
    when 'infonavit'       then 'precalix'
    when 'calculo_base'    then 'sisec'
    when 'pdf_semanas'     then 'pdf_semanas'
    when 'imss_ventanilla' then 'jordan_ventanilla'
    when 'acta'            then 'jordan_actas'
    when 'vigencia_imss'   then 'jordan_vigencia'
    else null end);
  if prov = 'belvo' then
    return jsonb_build_object('ok', false, 'motivo', 'proveedor_retirado', 'detalle', 'Belvo ya no se usa (250). El historial IMSS se pide a Jordan.');
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

-- 5. Despacho: BDI (ingresos / issste) → n8n bdi-verificacion. ip_address: la que venga en payload_in (desde /mi) o ninguna (n8n usa la del servidor si BDI lo exige).
create or replace function trol3.tg_consulta_despachar() returns trigger
language plpgsql security definer set search_path to 'trol3','public','extensions' as $function$
declare c record; p record; url text; payload jsonb; correo text; tel text; v_rfc text; begin
  if new.estado <> 'solicitada' or new.legacy_proceso_id is not null then return new; end if;
  if new.proveedor = 'bdi' then
    select * into p from trol3.personas where id = new.persona_id;
    if p.curp is null then update trol3.consultas set error = 'Falta CURP: la consulta se disparará sola al capturarla' where id = new.id; return new; end if;
    select valor into url from trol3.config where clave = 'webhook_bdi';
    if coalesce(url,'') = '' then update trol3.consultas set error = 'Webhook de bdi no configurado (trol3.config)' where id = new.id; return new; end if;
    select ct.normalizado into tel from trol3.contactos ct where ct.persona_id = p.id and ct.tipo = 'telefono' and ct.normalizado ~ '^\d{10}$'
      order by ct.principal desc, ct.verificado_at desc nulls last limit 1;
    select coalesce((select ct.valor from trol3.contactos ct where ct.persona_id = p.id and ct.tipo='email' order by ct.principal desc limit 1),
                    (select cl.email from public.clientes cl where cl.id = p.legacy_cliente_id)) into correo;
    select valor#>>'{}' into v_rfc from trol3.v_mejor_dato where persona_id = p.id and campo = 'rfc';
    payload := jsonb_build_object('consulta_id', new.id, 'persona_id', p.id, 'tipo', new.tipo, 'curp', p.curp, 'phone', '+52'||tel, 'email', correo,
                                  'rfc', coalesce(nullif(trim(p.rfc),''), v_rfc), 'ip_address', new.payload_in->>'ip_address', 'origen', 'trol3');
    perform net.http_post(url := url, body := payload, headers := '{"content-type":"application/json","X-Supabase-Source":"trol3"}'::jsonb);
    update trol3.consultas set estado = 'en_proceso', error = null, payload_in = coalesce(payload_in,'{}'::jsonb) || jsonb_build_object('despachada_at', now(), 'curp', p.curp) where id = new.id;
    return new;
  end if;
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
  if new.tipo = 'imss_historial' and new.proveedor = 'jordan' then
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
    select valor into url from trol3.config where clave = 'webhook_jordan';
    if coalesce(url,'') = '' then update trol3.consultas set error = 'Webhook de jordan no configurado (trol3.config)' where id = new.id; return new; end if;
    payload := jsonb_build_object('cliente_id', c.id, 'curp', c.curp, 'nss', coalesce(nullif(trim(p.nss),''), nullif(trim(c.nss),''), c.calculo_pensional->'diagnostico'->>'nss'), 'email', c.email, 'nombre', c.nombre,
                                  'telefono', tel, 'mobil', tel, 'drive_folder_id', c.drive_folder_id,
                                  'trol3_consulta_id', new.id, 'origen', 'trol3', 'notificar_cliente', new.notificar_cliente);
    update public.clientes set sisec_refresh_solicitado_at = now() where id = c.id;
    perform net.http_post(url := url, body := payload, headers := '{"content-type":"application/json","X-Supabase-Source":"trol3"}'::jsonb);
    update trol3.consultas set estado = 'en_proceso', error = null where id = new.id;
  end if;
  return new;
exception when others then
  update trol3.consultas set error = sqlerrm where id = new.id; return new;
end $function$;

-- 6. Al declarar cotiza_issste = true se pide la consulta a BDI (tipo ingresos: trae ISSSTE y SAT)
create or replace function trol3.tg_auto_issste() returns trigger
language plpgsql security definer set search_path to 'trol3','public' as $function$
declare act trol3.actor_tipo;
begin
  if new.campo = 'cotiza_issste' and new.valor = 'true'::jsonb and new.capa = 'declarado' then
    if not exists (select 1 from trol3.datos d where d.persona_id = new.persona_id and d.campo = 'status_issste'
                   and d.capa = 'validado' and coalesce(d.vigente_hasta, 'infinity') > now())
       and not exists (select 1 from trol3.consultas cx where cx.persona_id = new.persona_id and cx.proveedor = 'bdi'
                   and (cx.estado in ('solicitada','en_proceso') or (cx.estado = 'completada' and cx.completed_at > now() - interval '90 days'))) then
      act := case when auth.uid() is null then 'sistema' when trol3.es_miembro() then 'asesor' else 'cliente' end;
      perform trol3.pedir_consulta(new.persona_id, 'ingresos', act, case when act = 'asesor' then trol3.current_miembro_id() when act = 'cliente' then trol3.current_persona_id() end,
        'trol', false, 'auto_cotiza_issste', false, 'bdi');
    end if;
  end if;
  return new;
exception when others then return new;
end $function$;

-- 7. Registro del id de verificación y validación al recibir el webhook
create or replace function trol3.bdi_enviada(p_consulta uuid, p_verificacion_id text)
returns jsonb language plpgsql security definer set search_path to 'trol3','public' as $function$
begin
  update trol3.consultas set estado = 'en_proceso', error = null, updated_at = now(),
         payload_in = coalesce(payload_in,'{}'::jsonb) || jsonb_build_object('bdi_verificacion_id', p_verificacion_id, 'enviada_at', now())
   where id = p_consulta and proveedor = 'bdi' and estado in ('solicitada','en_proceso');
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_esta_en_cola'); end if;
  return jsonb_build_object('ok', true);
end $function$;

create or replace function trol3.bdi_valida(p_verificacion_id text default null, p_curp text default null)
returns jsonb language sql security definer set search_path to 'trol3','public' as $function$
  select coalesce((select jsonb_build_object('ok', true, 'consulta_id', c.id, 'persona_id', c.persona_id, 'tipo', c.tipo, 'curp', c.payload_in->>'curp')
                     from trol3.consultas c
                    where c.proveedor = 'bdi' and c.estado in ('solicitada','en_proceso')
                      and (c.payload_in->>'bdi_verificacion_id' = p_verificacion_id or (p_curp is not null and c.payload_in->>'curp' = p_curp))
                    order by c.created_at desc limit 1), jsonb_build_object('ok', false));
$function$;

create or replace view trol3.v_cola_bdi as
  select c.id as consulta_id, c.persona_id, c.tipo, c.estado, c.payload_in->>'curp' as curp, c.payload_in->>'bdi_verificacion_id' as verificacion_id, c.created_at, c.updated_at
    from trol3.consultas c where c.proveedor = 'bdi' and c.estado in ('solicitada','en_proceso') order by c.created_at;

grant execute on function trol3.bdi_enviada(uuid, text) to service_role, authenticated;
grant execute on function trol3.bdi_valida(text, text) to service_role, authenticated;
grant select on trol3.v_cola_bdi to service_role, authenticated;

-- 8. BDI tarda minutos (a veces más): 2 h antes de cerrar como colgada
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
       and (   (coalesce(proveedor,'') not in ('broker_infonavit','precalix','bdi') and created_at < now() - (m||' minutes')::interval)
            or (proveedor in ('precalix','bdi') and updated_at < now() - interval '2 hours')
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
                        when c.proveedor = 'bdi' then 'Buró de Ingresos sin respuesta en 2 h'
                        else 'Sin respuesta de '||coalesce(c.proveedor,'el proveedor')||' después de '||m||' min' end
     where id = c.id;
    perform trol3.emitir_evento(c.persona_id, 'consulta_sin_respuesta', 'sistema', null,
      jsonb_build_object('consulta_id', c.id, 'tipo', c.tipo, 'proveedor', c.proveedor, 'minutos', m));
    n := n + 1;
  end loop;
  return n;
end $function$;
