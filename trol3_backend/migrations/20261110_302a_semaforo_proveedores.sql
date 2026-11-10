-- 302a — Semáforo de proveedores y apagador manual (Raúl, 10-nov-2026: "un semáforo de si los servicios están
-- entregando información consistente y, si lo tenemos deshabilitado, que pase directo a pedir información mínima o SISEC").
--
-- · proveedores.habilitado: apagador manual (miembros). Deshabilitado = las consultas nuevas se quedan `solicitada` con
--   error 'Proveedor deshabilitado…' y NO se mandan a n8n; al habilitarlo, `habilitar_proveedor` las redespacha
--   (cancela + reinserta, mismo patrón que redespachar_pendientes). cerrar_consultas_colgadas las respeta.
-- · salud_proveedor(codigo): verde / amarillo / rojo / sin_datos a partir de las consultas de las últimas 24 h
--   (completadas vs sin_resultado/error) y de las colgadas (en_proceso > 20 min). Deshabilitado = rojo.
-- · v_infonavit_aliado: con Precalix en rojo, puede_capturar es inmediato (manual_desde = pide_infonavit_en).
--   v_resultado_aliado: con Jordan en rojo, sugerir_sisec desde el inicio. semaforo_proveedores() para pantallas.
-- Aplicada por MCP el 10-nov-2026.

alter table trol3.proveedores add column if not exists habilitado boolean not null default true;
alter table trol3.proveedores add column if not exists habilitado_cambiado_en timestamptz;
alter table trol3.proveedores add column if not exists habilitado_cambiado_por uuid;
alter table trol3.proveedores add column if not exists nota_estado text;
comment on column trol3.proveedores.habilitado is 'Apagador manual (302a): false = las consultas nuevas esperan sin mandarse al proveedor y el aliado pasa directo al camino mínimo / SISEC.';

-- ───────────────────────── Salud por consultas recientes ─────────────────────────
create or replace function trol3.salud_proveedor(p_codigo text)
returns jsonb language plpgsql stable security definer set search_path to 'trol3', 'public' as $$
declare v_tipo text; v_hab boolean; v_nota text; ok24 int; fail24 int; colg int; ult_ok timestamptz; ult_fail timestamptz; term72 int; est text; motivo text;
begin
  v_tipo := case p_codigo when 'jordan' then 'imss_historial' when 'precalix' then 'infonavit' when 'bdi' then 'ingresos' else null end;
  select habilitado, nota_estado into v_hab, v_nota from trol3.proveedores where codigo = p_codigo;
  if v_tipo is null or v_hab is null then return jsonb_build_object('codigo', p_codigo, 'estado', 'sin_datos'); end if;
  select count(*) filter (where estado = 'completada' and completed_at > now() - interval '24 hours'),
         count(*) filter (where estado in ('sin_resultado','error') and coalesce(completed_at, updated_at) > now() - interval '24 hours' and coalesce(error,'') not like 'Falta CURP%' and coalesce(error,'') not like 'Proveedor deshabilitado%'),
         count(*) filter (where estado = 'en_proceso' and updated_at < now() - interval '20 minutes'),
         max(completed_at) filter (where estado = 'completada'),
         max(coalesce(completed_at, updated_at)) filter (where estado in ('sin_resultado','error')),
         count(*) filter (where estado in ('completada','sin_resultado','error') and coalesce(completed_at, updated_at) > now() - interval '72 hours')
    into ok24, fail24, colg, ult_ok, ult_fail, term72
    from trol3.consultas
   where proveedor = p_codigo and tipo = v_tipo and created_at > now() - interval '14 days';
  if not v_hab then est := 'rojo'; motivo := coalesce(v_nota, 'Deshabilitado a mano');
  elsif ok24 = 0 and (fail24 >= 2 or colg >= 2) then est := 'rojo'; motivo := format('Sin respuestas buenas en 24 h (%s fallidas, %s colgadas)', fail24, colg);
  elsif ok24 = 0 and (fail24 = 1 or colg = 1) then est := 'amarillo'; motivo := 'Una consulta fallida o colgada y ninguna buena en 24 h';
  elsif ok24 > 0 and fail24 >= ok24 then est := 'amarillo'; motivo := format('Falla la mitad o más (%s buenas, %s fallidas en 24 h)', ok24, fail24);
  elsif term72 = 0 then est := 'sin_datos'; motivo := 'Sin consultas terminadas en 72 h';
  else est := 'verde'; motivo := format('%s buenas, %s fallidas en 24 h', ok24, fail24);
  end if;
  return jsonb_build_object('codigo', p_codigo, 'tipo', v_tipo, 'habilitado', v_hab, 'estado', est, 'motivo', motivo,
    'ok_24h', ok24, 'fallidas_24h', fail24, 'colgadas', colg, 'ultima_ok', ult_ok, 'ultima_fallida', ult_fail, 'nota', v_nota);
end $$;

create or replace function trol3.proveedor_en_rojo(p_codigo text)
returns boolean language sql stable security definer set search_path to 'trol3', 'public' as $$
  select (trol3.salud_proveedor(p_codigo)->>'estado') = 'rojo';
$$;

-- Para pantallas (equipo y aliados): los tres que importan en el flujo.
create or replace function trol3.semaforo_proveedores()
returns table(codigo text, nombre text, salud jsonb, en_espera int)
language sql stable security definer set search_path to 'trol3', 'public' as $$
  select p.codigo, p.nombre, trol3.salud_proveedor(p.codigo),
         (select count(*)::int from trol3.consultas c where c.proveedor = p.codigo and c.estado = 'solicitada' and coalesce(c.error,'') like 'Proveedor deshabilitado%')
    from trol3.proveedores p where p.codigo in ('jordan','precalix','bdi') order by array_position(array['jordan','precalix','bdi'], p.codigo);
$$;
grant execute on function trol3.salud_proveedor(text) to authenticated;
grant execute on function trol3.proveedor_en_rojo(text) to authenticated;
grant execute on function trol3.semaforo_proveedores() to authenticated;

-- ───────────────────────── Apagador: no despachar y redespachar al encender ─────────────────────────
create or replace function trol3.habilitar_proveedor(p_codigo text, p_habilitado boolean, p_nota text default null)
returns jsonb language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare r record; n int := 0; v_m uuid;
begin
  if not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  v_m := trol3.current_miembro_id();
  update trol3.proveedores set habilitado = p_habilitado, habilitado_cambiado_en = now(), habilitado_cambiado_por = v_m,
         nota_estado = case when p_habilitado then null else coalesce(nullif(btrim(p_nota),''), nota_estado) end
   where codigo = p_codigo;
  if not found then raise exception 'proveedor_desconocido'; end if;
  if p_habilitado then
    for r in select * from trol3.consultas c where c.proveedor = p_codigo and c.estado = 'solicitada' and c.legacy_proceso_id is null
               and coalesce(c.error,'') like 'Proveedor deshabilitado%' order by c.created_at loop
      update trol3.consultas set estado = 'cancelada', error = coalesce(error,'')||' · redespachada al habilitar' where id = r.id;
      insert into trol3.consultas (persona_id, tipo, proveedor, solicitante_tipo, solicitante_id, pagador, costo, notificar_cliente, motivo, payload_in)
      values (r.persona_id, r.tipo, r.proveedor, r.solicitante_tipo, r.solicitante_id, r.pagador, r.costo, r.notificar_cliente, coalesce(r.motivo,'')||' (redespacho)', r.payload_in);
      n := n + 1;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'habilitado', p_habilitado, 'redespachadas', n);
end $$;
grant execute on function trol3.habilitar_proveedor(text, boolean, text) to authenticated;

-- El despachador respeta el apagador: la consulta queda `solicitada` con el error explicativo.
create or replace function trol3.tg_consulta_despachar()
returns trigger language plpgsql security definer set search_path to 'trol3', 'public', 'extensions' as $function$
declare c record; p record; url text; payload jsonb; correo text; tel text; v_rfc text; begin
  if new.estado <> 'solicitada' or new.legacy_proceso_id is not null then return new; end if;
  if exists (select 1 from trol3.proveedores pr where pr.codigo = new.proveedor and not pr.habilitado) then
    update trol3.consultas set error = 'Proveedor deshabilitado: se despacha al habilitarlo (302a)' where id = new.id;
    return new;
  end if;
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

-- Las consultas en espera por apagador no se cierran como "sin respuesta".
create or replace function trol3.cerrar_consultas_colgadas(p_minutos integer default null)
returns integer language plpgsql security definer set search_path to 'trol3', 'public' as $function$
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
       and coalesce(error,'') not like 'Proveedor deshabilitado%'
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

-- ───────────────────────── Vistas del portal ─────────────────────────
create or replace view trol3.v_infonavit_aliado as
with base as (
  select r.id as referido_id, r.persona_id, r.estado as estado_ref, r.pide_infonavit_en, r.manual_capturado_en,
         p.nombre, p.apellidos, p.nss is not null as tiene_nss, p.curp is not null as tiene_curp,
         p.etapa = 'precliente' as precliente,
         exists (select 1 from trol3.contactos c where c.persona_id = r.persona_id and c.tipo = 'telefono') as tiene_telefono,
         (select c.estado::text from trol3.consultas c where c.persona_id = r.persona_id and c.tipo = 'infonavit' and c.estado <> 'cancelada' order by c.created_at desc limit 1) as consulta_estado,
         (select (d.valor #>> '{}')::numeric from trol3.datos d where d.persona_id = r.persona_id and d.campo = 'saldo_infonavit' and d.capa = 'validado' order by d.obtenido_en desc limit 1) as saldo_val,
         (select (d.valor #>> '{}')::numeric from trol3.datos d where d.persona_id = r.persona_id and d.campo = 'saldo_infonavit' and d.capa = 'declarado' and d.origen_tipo = 'aliado' order by d.obtenido_en desc limit 1) as saldo_dec,
         (select round((d.valor #>> '{}')::numeric * 30.4) from trol3.datos d where d.persona_id = r.persona_id and d.campo = 'salario_diario' and d.capa = 'declarado' and d.origen_tipo = 'aliado' order by d.obtenido_en desc limit 1) as salario_dec,
         (select (d.valor #>> '{}')::boolean from trol3.datos d where d.persona_id = r.persona_id and d.campo = 'relacion_laboral_vigente' and d.capa = 'declarado' and d.origen_tipo = 'aliado' order by d.obtenido_en desc limit 1) as relacion_dec,
         (select (d.valor #>> '{}')::numeric from trol3.datos d where d.persona_id = r.persona_id and d.campo = 'infonavit_monto_credito' and d.capa = 'validado' order by d.obtenido_en desc limit 1) as monto_credito,
         (select max(d.obtenido_en) from trol3.datos d where d.persona_id = r.persona_id and d.campo in ('saldo_infonavit','credito_infonavit_vigente','relacion_laboral_vigente') and d.capa = 'validado') as precalificado_en,
         exists (select 1 from trol3.datos d where d.persona_id = r.persona_id and d.campo = 'credito_infonavit_vigente' and d.capa = 'validado' and d.valor = 'true'::jsonb) as cred_vig,
         (select (d.valor #>> '{}')::boolean from trol3.datos d where d.persona_id = r.persona_id and d.campo = 'relacion_laboral_vigente' and d.capa = 'validado' order by d.obtenido_en desc limit 1) as relacion,
         (select jsonb_build_object('etapa', o.etapa_infonavit, 'en', o.etapa_infonavit_en, 'fechas', coalesce(o.tramite_infonavit -> 'fechas', '{}'::jsonb),
                 'casa', o.tramite_infonavit ->> 'casa', 'desarrollo', coalesce(pr.nombre_comercial, o.tramite_infonavit ->> 'desarrollo', pr.desarrollo),
                 'ubicacion', pr.ubicacion_comercial, 'conyugal', coalesce((o.tramite_infonavit ->> 'conyugal')::boolean, false), 'co_titular', o.tramite_infonavit ->> 'co_titular',
                 'comision', (select cm.estado from trol3.comisiones cm where cm.oportunidad_id = o.id and cm.estado <> 'cancelada' order by cm.creado_en desc limit 1))
            from trol3.oportunidades o left join trol3.proyectos_inmobiliarios pr on pr.id = o.proyecto_id
           where o.persona_id = r.persona_id and o.codigo in ('compra_inmueble','inversion_inmueble') and o.etapa_infonavit is not null
           order by o.etapa_infonavit_en desc nulls last limit 1) as tramite,
         (select coalesce(jsonb_agg(distinct d.tipo), '[]'::jsonb) from trol3.documentos d where d.persona_id = r.persona_id
           and d.tipo in ('identificacion','curp_doc','acta_nacimiento','acta_matrimonio','constancia_fiscal','comprobante_domicilio','recibo_nomina')) as docs,
         (select c.creado_en from trol3.cobros_consulta_aliado c where c.persona_id = r.persona_id) as cobrado_en
    from trol3.referidos r join trol3.personas p on p.id = r.persona_id
   where r.pide_infonavit_en is not null and r.visible_para_aliado and (r.aliado_id = trol3.current_aliado_id() or trol3.es_miembro())
)
select referido_id, persona_id, estado_ref, pide_infonavit_en, nombre, apellidos,
  case
    when estado_ref = 'por_revisar' then 'ya_cliente'
    when (tramite ->> 'etapa') is not null then 'en_tramite'
    when saldo_val is null and saldo_dec is not null and relacion_dec is false then 'sin_relacion'
    when saldo_val is null and saldo_dec is not null and saldo_dec < 100000 then 'saldo_bajo'
    when saldo_val is null and saldo_dec is not null then 'capturado'
    when consulta_estado in ('solicitada','en_proceso') then 'procesando'
    when cred_vig then 'credito_vigente'
    when relacion is false then 'sin_relacion'
    when saldo_val is not null and saldo_val < 100000 then 'saldo_bajo'
    when monto_credito is not null and saldo_val is not null then 'con_monto'
    when consulta_estado = 'sin_resultado' then 'no_califica'
    when not tiene_nss and tiene_curp then 'buscando_nss'
    when not tiene_nss then 'falta_nss'
    else 'procesando' end as resultado,
  case when estado_ref = 'por_revisar' then null else coalesce(saldo_val, saldo_dec) end as saldo,
  case when estado_ref = 'por_revisar' then null else monto_credito end as monto_credito,
  precalificado_en,
  case when estado_ref = 'por_revisar' then null else coalesce(tramite ->> 'etapa', case when monto_credito is not null and saldo_val >= 100000 then 'precalificado' end) end as etapa,
  case when estado_ref = 'por_revisar' then null else (tramite ->> 'en')::timestamptz end as etapa_en,
  case when estado_ref = 'por_revisar' then '[]'::jsonb else docs end as docs,
  case when estado_ref = 'por_revisar' then '{}'::jsonb else coalesce(tramite -> 'fechas', '{}'::jsonb) end as fechas,
  case when estado_ref = 'por_revisar' then null else tramite ->> 'desarrollo' end as inmueble,
  case when estado_ref = 'por_revisar' then null else tramite ->> 'ubicacion' end as inmueble_ubicacion,
  case when estado_ref = 'por_revisar' then null else tramite ->> 'casa' end as casa,
  case when estado_ref = 'por_revisar' then false else coalesce((tramite ->> 'conyugal')::boolean, false) end as conyugal,
  case when estado_ref = 'por_revisar' then null else tramite ->> 'co_titular' end as co_titular,
  case when estado_ref = 'por_revisar' then null else tramite ->> 'comision' end as comision_estado,
  -- 301
  case when estado_ref = 'por_revisar' then null when saldo_val is not null then 'validado' when saldo_dec is not null then 'declarado' end as saldo_capa,
  case when estado_ref = 'por_revisar' then null else salario_dec end as salario_mensual_declarado,
  case when estado_ref = 'por_revisar' then null else relacion_dec end as relacion_declarada,
  manual_capturado_en,
  -- 302a · con Precalix en rojo (o apagado) el camino mínimo es inmediato.
  case when trol3.proveedor_en_rojo('precalix') then pide_infonavit_en else pide_infonavit_en + interval '2 minutes' end as manual_desde,
  (saldo_val is null and now() >= (case when trol3.proveedor_en_rojo('precalix') then pide_infonavit_en else pide_infonavit_en + interval '2 minutes' end)
     and coalesce(consulta_estado, '') not in ('sin_resultado') and (tramite ->> 'etapa') is null) as puede_capturar,
  precliente, tiene_telefono, tiene_nss, tiene_curp, cobrado_en
from base;

create or replace view trol3.v_resultado_aliado as
with base as (
  select r.id as referido_id, r.persona_id, r.aliado_id, r.estado as estado_ref, r.creado_en as referido_en,
         p.nombre, p.apellidos, p.curp is not null as tiene_curp, p.etapa = 'precliente' as precliente,
         exists (select 1 from trol3.contactos c where c.persona_id = r.persona_id and c.tipo = 'telefono') as tiene_telefono,
         (select a.partner_id from trol3.aliados a where a.id = r.aliado_id) as partner_id,
         (select c.estado::text from trol3.consultas c where c.persona_id = r.persona_id and c.tipo = 'imss_historial' and c.estado <> 'cancelada' order by c.created_at desc limit 1) as consulta_estado,
         (select max(c.created_at) from trol3.consultas c where c.persona_id = r.persona_id and c.tipo = 'imss_historial' and c.estado <> 'cancelada') as consulta_en,
         (select c.creado_en from trol3.cobros_consulta_aliado c where c.persona_id = r.persona_id) as cobrado_en
    from trol3.referidos r join trol3.personas p on p.id = r.persona_id
   where r.visible_para_aliado and (r.aliado_id = trol3.current_aliado_id() or trol3.es_miembro())
)
select b.referido_id, b.persona_id, b.estado_ref, b.referido_en, b.nombre, b.apellidos,
  case
    when b.estado_ref = 'por_revisar' then 'ya_cliente'
    when e.semanas is not null and e.ley is not null then 'listo'
    when b.consulta_estado in ('solicitada','en_proceso') then 'consultando'
    when b.consulta_estado in ('error','sin_resultado') or coalesce(e.consultas_fallidas, 0) > 0 then 'fallida'
    when not b.tiene_curp then 'falta_curp'
    else 'consultando' end as estado,
  case when b.estado_ref = 'por_revisar' then null else e.edad end as edad,
  case when b.estado_ref = 'por_revisar' then null else e.ley end as ley,
  case when b.estado_ref = 'por_revisar' then null else e.semanas end as semanas,
  case when b.estado_ref = 'por_revisar' then null else e.status_empleo end as status_empleo,
  case when b.estado_ref = 'por_revisar' then null else e.conserva_derechos end as conserva_derechos,
  case when b.estado_ref = 'por_revisar' then null else e.fin_conservacion end as fin_conservacion,
  case when b.estado_ref = 'por_revisar' then null else e.afore_actual end as afore_actual,
  case when b.estado_ref = 'por_revisar' then null else e.pension_base end as pension_base,
  case when b.estado_ref = 'por_revisar' then null else e.pension_maxima end as pension_maxima,
  case when b.estado_ref = 'por_revisar' then null else e.saldo_rcv97 end as saldo_rcv97,
  case when b.estado_ref = 'por_revisar' then null else e.saldo_infonavit end as saldo_infonavit,
  case when b.estado_ref = 'por_revisar' then null else e.infonavit_monto_credito end as infonavit_monto_credito,
  case when b.estado_ref = 'por_revisar' then null else e.credito_infonavit_vigente end as credito_infonavit_vigente,
  case when b.estado_ref = 'por_revisar' then null else e.inconsistencia_imss end as inconsistencia_imss,
  case when b.estado_ref = 'por_revisar' then '[]'::jsonb else
    (select coalesce(jsonb_agg(jsonb_build_object('codigo', o.codigo, 'nombre', c.nombre_cliente, 'frase', c.frase_corta, 'estado', o.estado) order by c.orden), '[]'::jsonb)
       from trol3.oportunidades o join trol3.catalogo_oportunidades c on c.codigo = o.codigo
      where o.persona_id = b.persona_id and c.activo and o.estado in ('detectada','posible','presentada','interesada','en_proceso')) end as oportunidades,
  (select coalesce(jsonb_agg(jsonb_build_object('producto', o.producto, 'nombre', pr.nombre, 'en', o.paid_at) order by o.paid_at), '[]'::jsonb)
     from trol3.ordenes o join trol3.productos pr on pr.codigo = o.producto
    where o.persona_id = b.persona_id and o.estado in ('pagada','cumplida') and b.partner_id is not null and o.partner_id = b.partner_id) as compras,
  case when exists (select 1 from trol3.diagnosticos d where d.persona_id = b.persona_id and d.estado = 'entregado') then 'listo'
       when exists (select 1 from trol3.diagnosticos d where d.persona_id = b.persona_id and d.estado in ('borrador','revisado')) then 'en_elaboracion' end as diagnostico_estado,
  (select d.id from trol3.documentos d where d.persona_id = b.persona_id and d.tipo = 'diagnostico_avanzado' order by d.created_at desc limit 1) as diagnostico_doc_id,
  (select min(c.inicio) from trol3.citas c where c.persona_id = b.persona_id and c.inicio > now() and c.estado <> 'cancelada') as proxima_sesion,
  -- 301
  b.precliente, b.tiene_telefono, b.tiene_curp, b.consulta_en, b.cobrado_en,
  -- SISEC del aliado conviene cuando no hay CURP, la consulta falló o lleva más de un día sin responder.
  (b.estado_ref = 'atribuido' and e.semanas is null and (not b.tiene_curp or b.consulta_estado in ('error','sin_resultado')
     or (b.consulta_estado in ('solicitada','en_proceso') and b.consulta_en < now() - interval '1 day')
     or trol3.proveedor_en_rojo('jordan'))) as sugerir_sisec
from base b
left join lateral trol3.expediente_aliado(b.persona_id) e(edad, ley, semanas, status_empleo, conserva_derechos, fin_conservacion, afore_actual,
  pension_base, pension_maxima, saldo_rcv97, saldo_infonavit, infonavit_monto_credito, credito_infonavit_vigente, inconsistencia_imss, consultas_fallidas, cabecera_id) on true;

grant select on trol3.cobros_consulta_aliado to authenticated;
