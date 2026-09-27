-- 193 · FIP semana 2 (claude/88 · 28-sep-2026)
--
-- 1. Parada 2 "nos toca a nosotros" para TODO cliente con experto asignado (decisión 7 de Raul,
--    claude/87 punto 1): agendar con su experto; la sesión de cortesía conserva su texto.
-- 2. Parada 1 "Mándanos tu constancia" cuando el equipo la pidió (panel del evento).
-- 3. registrar_cobro acepta gestorías y monto (con IVA): de ahí sale el cashback del 5 %.
-- 4. Cashback: la lista "por depositar a Millas" y marcarlo depositado con su referencia.
-- 5. mi_millas trae el CDA (cuenta registrada / puede recibir ahorro).
-- 6. consulta_lista: la plantilla sale por código (fip2026 → fip_cuenta_lista) y el payload
--    lleva el código para que Lukas sepa de dónde viene.
-- 7. Recordatorio de sesión ~24 h antes (trol_recordatorio_sesion), con interruptor apagado
--    hasta que Meta apruebe la plantilla y esté pegado Lukas v20.7.

------------------------------------------------------------------------ 1 y 2 · parada_de
do $$
declare src text; i1 int; i2 int; nuevo text;
begin
  src := pg_get_functiondef('trol3.parada_de(uuid)'::regprocedure);
  if position('agendar_experto' in src) > 0 then return; end if;

  src := replace(src, '  experto text; op jsonb := null; cita_inicio timestamptz; cod_evento text;',
                      '  experto text; op jsonb := null; cita_inicio timestamptz; cod_evento text; cortesia boolean; pidio_constancia boolean;');

  src := replace(src, '  -- La oportunidad que manda: la más avanzada y, entre iguales, la que más vale.',
    $b$  -- 193: el equipo le pidió su Reporte de Semanas (panel del evento) y todavía no llega nada oficial.
  pidio_constancia := not info_oficial and exists (
    select 1 from trol3.interacciones i where i.persona_id = p_persona and i.metadata->>'evento_accion' = 'pedir_constancia'
       and i.created_at > now() - interval '14 days');

  -- La oportunidad que manda: la más avanzada y, entre iguales, la que más vale.$b$);

  i1 := position('    -- 192: sesión de cortesía (FIP/Millas): nos toca a nosotros, y el botón es agendar.' in src);
  i2 := position('    if coalesce(sub, '''') not in (''agendar_sesion'', ''sesion_agendada'') then' in src);
  if i1 = 0 or i2 = 0 or i2 < i1 then raise exception 'parche 193 a parada_de: no encontré el bloque de 192'; end if;
  nuevo := $b$    -- 192/193: con experto asignado la pelota es nuestra (claude/87 punto 1): agendar con él.
    if experto is not null then
      toca := 'trol';
      cortesia := trol3.tiene_beneficio(p_persona, 'sesion_experto');
      select c.inicio into cita_inicio from trol3.citas c where c.persona_id = p_persona and c.estado <> 'cancelada' and c.inicio > now() order by c.inicio limit 1;
      if cita_inicio is not null then
        sub := 'sesion_agendada';
        titulo := 'Tu sesión con ' || split_part(experto, ' ', 1) || ' es el ' || extract(day from cita_inicio at time zone 'America/Mexico_City')::int || ' de ' || meses[extract(month from cita_inicio at time zone 'America/Mexico_City')::int] || ' a las ' || to_char(cita_inicio at time zone 'America/Mexico_City', 'HH24:MI');
        texto := case when cortesia then 'Son 20 minutos para explicarte tus números y ver qué te conviene.' else 'Ahí te explica tus números y lo que encontramos en tu caso.' end || ' Si necesitas cambiarla, escríbenos.';
        cta := 'chat'; boton := 'Cambiar mi sesión'; frase := 'Ya tenemos tu información. Tu sesión ya está agendada.';
        mensaje_wa := 'Hola, vengo de mi cuenta Trol (app.trol.mx). Quiero cambiar la hora de mi sesión.';
      elsif cortesia then
        sub := 'agendar_sesion';
        titulo := split_part(experto, ' ', 1) || ' te va a contactar para tu sesión de 20 minutos';
        texto := 'Ya tenemos tus números. En la sesión te los explica en claro y ves qué te conviene hacer. Si prefieres, escoge tú la hora.';
        cta := 'agendar'; boton := 'Agendar mi sesión'; frase := 'Ya tenemos tu información. Sigue tu sesión de 20 minutos.';
        mensaje_wa := 'Hola, vengo de mi cuenta Trol (app.trol.mx). Quiero agendar mi sesión de 20 minutos.';
      else
        sub := 'agendar_experto';
        titulo := split_part(experto, ' ', 1) || ' te va a explicar ' || case when o.id is not null or jsonb_array_length(hallazgos) > 0 then 'lo que encontramos' else 'tus números' end;
        texto := texto || ' Te va a buscar; si prefieres, escoge tú la hora.';
        cta := 'agendar'; boton := 'Agendar con ' || split_part(experto, ' ', 1);
        frase := 'Ya tenemos tu información. ' || split_part(experto, ' ', 1) || ' te la va a explicar.';
      end if;
      if cortesia then
        pie := coalesce((select 'Cortesía de ' || (trol3.marca_evento(p.codigo_origen) ->> 'patrocinio') || '.' from trol3.personas p
                          where p.id = p_persona and trol3.marca_evento(p.codigo_origen) ->> 'patrocinio' is not null), pie);
      end if;
    end if;
$b$;
  src := substr(src, 1, i1 - 1) || nuevo || substr(src, i2);

  src := replace(src, E'    elsif esperando then\n      sub := ''esperando'';',
    $b$    elsif pidio_constancia then
      sub := 'pedir_constancia'; toca := 'cliente';
      titulo := 'Mándanos tu Reporte de Semanas Cotizadas';
      texto := 'El IMSS no nos entregó tu historial por la vía automática. Con tu reporte armamos tu asesoría igual: se baja en dos minutos en la página del IMSS con tu CURP y tu correo, y lo subes aquí o nos lo mandas por WhatsApp.';
      cta := 'constancia'; boton := 'Mejor se lo mando por WhatsApp';
      frase := 'Sólo falta tu Reporte de Semanas Cotizadas.';
      mensaje_wa := 'Hola, vengo de mi cuenta Trol (app.trol.mx). Les mando mi Reporte de Semanas Cotizadas.';
    elsif esperando then
      sub := 'esperando';$b$);

  if position('agendar_experto' in src) = 0 or position('pedir_constancia' in src) = 0 or position('pidio_constancia :=' in src) = 0 then
    raise exception 'parche 193 a parada_de no encajó completo';
  end if;
  execute src;
end $$;

------------------------------------------------------------------------ 3 · registrar_cobro con gestorías y monto
drop function if exists trol3.registrar_cobro(uuid, text, text, text);
create or replace function trol3.registrar_cobro(p_persona uuid, p_producto text, p_medio text default 'transferencia', p_referencia text default null, p_monto numeric default null)
returns jsonb
language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare
  mid uuid := trol3.current_miembro_id();
  pr record; g record; oid uuid; r jsonb; tipo_consulta text; hizo text; nom text; monto numeric; es_gestoria boolean := false; bens text[];
begin
  if auth.uid() is not null and not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  if not exists (select 1 from trol3.personas where id = p_persona) then raise exception 'persona_no_existe'; end if;

  select * into pr from trol3.productos where codigo = p_producto and activo;
  if found then
    nom := pr.nombre; bens := pr.beneficios;
    monto := coalesce(nullif(p_monto, 0), pr.precio_mxn);
  else
    -- 193: las gestorías se cobran igual, con el monto que se acordó (con IVA).
    select * into g from trol3.catalogo_productos_gestoria where codigo = p_producto and activo;
    if not found then raise exception 'producto_no_existe'; end if;
    es_gestoria := true; nom := g.nombre;
    monto := coalesce(nullif(p_monto, 0), nullif(g.honorario_default, 0));
  end if;
  if coalesce(monto, 0) <= 0 then raise exception 'producto_sin_precio'; end if;

  -- Dos clics al mismo botón no son dos cobros.
  if exists (select 1 from trol3.ordenes o where o.persona_id = p_persona and o.producto = p_producto
              and o.estado = 'cumplida' and o.created_at > now() - interval '10 minutes') then
    raise exception 'cobro_duplicado';
  end if;

  insert into trol3.ordenes (persona_id, producto, monto, puntos_aplicados, estado, payment_provider, payment_ref, paid_at, metadata)
  values (p_persona, p_producto, monto, 0, 'cumplida', coalesce(nullif(p_medio, ''), 'transferencia'), nullif(p_referencia, ''), now(),
          jsonb_build_object('registrado_por', mid, 'via', 'registrar_cobro', 'gestoria', es_gestoria,
                             'precio_lista', case when es_gestoria then g.honorario_default else pr.precio_mxn end))
  returning id into oid;

  tipo_consulta := case p_producto
    when 'actualizacion_datos' then 'imss_historial'
    when 'extraccion_sisec'    then 'imss_historial'
    when 'consulta_issste'     then 'issste'
  end;

  if tipo_consulta is not null then
    r := trol3.pedir_consulta(p_persona, tipo_consulta, 'asesor', mid, 'cliente', true,
                              'cobrado por el experto: ' || nom, true,
                              case when tipo_consulta = 'imss_historial' then 'jordan' end);
    if not coalesce((r->>'ok')::boolean, false) then
      raise exception 'no_se_pudo_pedir_la_consulta: %', coalesce(r->>'motivo', r::text);
    end if;
    hizo := 'consulta';
  elsif coalesce(array_length(bens, 1), 0) > 0 then
    hizo := 'beneficio';
  else
    hizo := 'solo_registro';
  end if;

  perform trol3.registrar_interaccion(p_persona, 'nota', 'asesor', mid, 'saliente',
    'Recibimos tu pago de ' || nom || '.' ||
      case hizo when 'consulta' then ' Ya estamos consultando tu información; te avisamos por WhatsApp en cuanto llegue.'
                when 'beneficio' then ' Ya quedó activo en tu cuenta.'
                else '' end,
    true, jsonb_build_object('cobro', p_producto, 'orden_id', oid));

  return jsonb_build_object('ok', true, 'orden_id', oid, 'producto', p_producto, 'nombre', nom,
                            'monto', monto, 'hizo', hizo, 'consulta_id', r->>'consulta_id',
                            'cashback', (select monto from trol3.cashback where orden_id = oid));
end $$;
revoke all on function trol3.registrar_cobro(uuid, text, text, text, numeric) from public, anon;
grant execute on function trol3.registrar_cobro(uuid, text, text, text, numeric) to authenticated, service_role;

------------------------------------------------------------------------ 4 · Por depositar a Millas
create or replace function trol3.cashback_lista(p_estado text default 'por_depositar', p_limit int default 300)
returns jsonb
language sql stable security definer set search_path to 'trol3', 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'persona_id', c.persona_id, 'nombre', trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellidos, '')),
           'curp', p.curp, 'codigo', p.codigo_origen, 'concepto', c.concepto, 'base', c.base, 'pct', c.pct, 'monto', c.monto,
           'estado', c.estado, 'fecha', c.created_at, 'referencia', c.referencia, 'depositado_en', c.depositado_en,
           'depositado_por', (select m.nombre from trol3.miembros m where m.id = c.depositado_por))
         order by c.created_at), '[]'::jsonb)
    from (select * from trol3.cashback where estado = p_estado order by created_at desc limit p_limit) c
    join trol3.personas p on p.id = c.persona_id
   where trol3.es_miembro();
$$;
revoke all on function trol3.cashback_lista(text, int) from public, anon;
grant execute on function trol3.cashback_lista(text, int) to authenticated, service_role;

create or replace function trol3.cashback_depositar(p_ids uuid[], p_referencia text)
returns jsonb
language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare mid uuid := trol3.current_miembro_id(); n int; total numeric; r record;
begin
  if not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  if nullif(btrim(p_referencia), '') is null then raise exception 'falta_referencia'; end if;
  with u as (
    update trol3.cashback set estado = 'depositado', referencia = btrim(p_referencia), depositado_en = now(), depositado_por = mid
     where id = any(p_ids) and estado = 'por_depositar'
    returning persona_id, monto)
  select count(*), coalesce(sum(monto), 0) into n, total from u;
  -- Que el cliente lo vea en su cuenta (sin WhatsApp: Tako avisa resultados, no ecos de acciones).
  for r in select persona_id, sum(monto) m from trol3.cashback where id = any(p_ids) and depositado_en = now() group by 1 loop
    perform trol3.registrar_interaccion(r.persona_id, 'nota', 'asesor', mid, 'saliente',
      'Depositamos ' || to_char(r.m, 'FM$999,999,990.00') || ' de cashback a tu ahorro para el retiro vía Millas para el Retiro.',
      true, jsonb_build_object('cashback', 'depositado', 'referencia', btrim(p_referencia)));
  end loop;
  return jsonb_build_object('ok', true, 'depositados', n, 'total', total);
end $$;
revoke all on function trol3.cashback_depositar(uuid[], text) from public, anon;
grant execute on function trol3.cashback_depositar(uuid[], text) to authenticated, service_role;

------------------------------------------------------------------------ 5 · mi_millas con CDA
create or replace function trol3.mi_millas() returns jsonb
language plpgsql stable security definer set search_path to 'trol3', 'public' as $$
declare pid uuid := trol3.current_persona_id(); movs jsonb; pct jsonb; est text; reg boolean; cda_en timestamptz;
begin
  if pid is null or not trol3.aliado_millas(pid) then return null; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'concepto', c.concepto, 'base', c.base, 'pct', c.pct, 'monto', c.monto,
                                              'estado', c.estado, 'fecha', c.created_at, 'depositado_en', c.depositado_en) order by c.created_at desc), '[]'::jsonb)
    into movs from trol3.cashback c where c.persona_id = pid and c.estado <> 'cancelado';
  select valor::jsonb into pct from trol3.config where clave = 'cashback_pct';
  select valor #>> '{}' into est from trol3.v_mejor_dato where persona_id = pid and campo = 'estatus_cda';
  select (valor #>> '{}')::boolean into reg from trol3.v_mejor_dato where persona_id = pid and campo = 'cuenta_registrada';
  select max(c.completed_at) into cda_en from trol3.consultas c where c.persona_id = pid and c.tipo = 'cda' and c.estado = 'completada';
  return jsonb_build_object(
    'clabe', nullif((select valor from trol3.config where clave = 'millas_clabe'), ''),
    'link', nullif((select valor from trol3.config where clave = 'millas_link'), ''),
    'referencia', (select curp from trol3.personas where id = pid),
    'pct', coalesce(pct, '{"asesoria": 10, "gestoria": 5}'::jsonb),
    'cda', jsonb_build_object('estatus', est, 'registrada', reg, 'al', cda_en),
    'movimientos', movs,
    'por_depositar', coalesce((select sum(monto) from trol3.cashback where persona_id = pid and estado = 'por_depositar'), 0),
    'depositado', coalesce((select sum(monto) from trol3.cashback where persona_id = pid and estado = 'depositado'), 0));
end $$;
grant execute on function trol3.mi_millas() to authenticated;

------------------------------------------------------------------------ 6 · consulta_lista por código
insert into trol3.config (clave, valor) values ('evento_plantilla_cuenta_lista', '{"fip2026": "fip_cuenta_lista"}')
on conflict (clave) do update set valor = excluded.valor;

do $$
declare src text;
begin
  src := pg_get_functiondef('trol3.tg_avisar_consulta_lista()'::regprocedure);
  if position('evento_plantilla_cuenta_lista' in src) > 0 then return; end if;
  src := replace(src, E'  base text; llave text; interruptor text;', E'  base text; llave text; interruptor text; cod text; plantilla text;');
  src := replace(src, E'  select ley, semanas into e from trol3.v_expediente where persona_id = new.persona_id;',
    E'  select ley, semanas into e from trol3.v_expediente where persona_id = new.persona_id;\n' ||
    E'  -- 193: la plantilla sale por el código de origen (fip2026 → fip_cuenta_lista); el resto, trol_reabrir.\n' ||
    E'  select p.codigo_origen into cod from trol3.personas p where p.id = new.persona_id;\n' ||
    E'  select coalesce((select (cf.valor::jsonb) ->> cod from trol3.config cf where cf.clave = ''evento_plantilla_cuenta_lista''), ''trol_reabrir'') into plantilla;');
  src := replace(src, E'''plantilla'', ''trol_reabrir'',', E'''plantilla'', plantilla,');
  src := replace(src, E'jsonb_build_object(''ley'', e.ley, ''semanas'', e.semanas)', E'jsonb_build_object(''ley'', e.ley, ''semanas'', e.semanas, ''codigo'', cod)');
  if position('''plantilla'', plantilla,' in src) = 0 or position('''codigo'', cod' in src) = 0 then
    raise exception 'parche 193 a tg_avisar_consulta_lista no encajó';
  end if;
  execute src;
end $$;

------------------------------------------------------------------------ 7 · Recordatorio de sesión
alter table trol3.citas add column if not exists recordada_en timestamptz;
insert into trol3.config (clave, valor) values ('recordatorio_sesion', 'off') on conflict (clave) do nothing;

create or replace function trol3.recordar_sesiones() returns int
language plpgsql security definer set search_path to 'trol3', 'public', 'extensions' as $$
declare r record; n int := 0; base text; llave text; hora text;
begin
  if coalesce((select valor from trol3.config where clave = 'recordatorio_sesion'), 'off') <> 'on' then return 0; end if;
  select valor into llave from trol3.config where clave = 'api_key';
  if coalesce(llave, '') = '' then return 0; end if;
  select coalesce((select valor from trol3.config where clave = 'api_trol_url'), 'https://orgagfdxygtjiwqvgckw.supabase.co/functions/v1/api-trol') into base;
  for r in
    select c.id, c.persona_id, c.inicio, c.meet_url, m.nombre as experto
      from trol3.citas c left join trol3.miembros m on m.id = c.miembro_id
     where c.persona_id is not null and c.estado = 'programada' and c.recordada_en is null
       and c.inicio between now() + interval '18 hours' and now() + interval '30 hours'
     order by c.inicio limit 50
  loop
    update trol3.citas set recordada_en = now() where id = r.id;
    hora := to_char(r.inicio at time zone 'America/Mexico_City', 'HH24:MI');
    perform net.http_post(
      url := base || '/avisar',
      headers := jsonb_build_object('content-type', 'application/json', 'x-trol-key', llave),
      body := jsonb_build_object(
        'persona_id', r.persona_id, 'evento', 'recordatorio_sesion', 'plantilla', 'trol_recordatorio_sesion',
        'resumen', 'Mañana a las ' || hora || ' es tu sesión' || coalesce(' con ' || split_part(r.experto, ' ', 1), '') || '.',
        'payload', jsonb_strip_nulls(jsonb_build_object('cita_id', r.id, 'inicio', r.inicio, 'hora', hora,
                                                        'experto', split_part(r.experto, ' ', 1), 'meet_url', r.meet_url))),
      timeout_milliseconds := 20000);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function trol3.recordar_sesiones() from public, anon, authenticated;

select cron.unschedule('trol3-recordar-sesiones') where exists (select 1 from cron.job where jobname = 'trol3-recordar-sesiones');
select cron.schedule('trol3-recordar-sesiones', '7 * * * *', 'select trol3.recordar_sesiones()');
