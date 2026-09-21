-- 163: "Cobrado" — el experto registra el pago y el sistema cumple solo.
--
-- El dinero de Trol entra por el chat (link de Mercado Pago o SPEI con
-- comprobante), no por /checkout: 6 órdenes pagadas ahí en toda su historia. Lo
-- que seguía a mano era lo de DESPUÉS de cobrar: acordarse de pedir la consulta,
-- habilitar el beneficio y avisarle al cliente. Esto lo hace una sola llamada.
--
-- registrar_cobro(persona, producto, medio, referencia):
--   1. deja la orden en trol3.ordenes como 'cumplida' (el trigger de órdenes
--      otorga los beneficios del producto, igual que con un pago web);
--   2. si el producto es una extracción, pide la consulta de verdad —por Jordan,
--      forzada, notificando— y si no se puede pedir NO se registra nada (la
--      excepción deshace la orden): mejor un error a la vista que un cobro sin dato;
--   3. devuelve qué hizo, para que la app le confirme al cliente por WhatsApp.
-- Sólo miembros del equipo. OJO: pedir_consulta cuesta dinero (Jordan $13).

create or replace function trol3.registrar_cobro(p_persona uuid, p_producto text, p_medio text default 'transferencia', p_referencia text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $function$
declare
  mid uuid := trol3.current_miembro_id();
  pr record; oid uuid; r jsonb; tipo_consulta text; hizo text;
begin
  if auth.uid() is not null and not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  if not exists (select 1 from trol3.personas where id = p_persona) then raise exception 'persona_no_existe'; end if;
  select * into pr from trol3.productos where codigo = p_producto and activo;
  if not found then raise exception 'producto_no_existe'; end if;
  if coalesce(pr.precio_mxn, 0) <= 0 then raise exception 'producto_sin_precio'; end if;

  -- Dos clics al mismo botón no son dos cobros.
  if exists (select 1 from trol3.ordenes o where o.persona_id = p_persona and o.producto = pr.codigo
              and o.estado = 'cumplida' and o.created_at > now() - interval '10 minutes') then
    raise exception 'cobro_duplicado';
  end if;

  insert into trol3.ordenes (persona_id, producto, monto, puntos_aplicados, estado, payment_provider, payment_ref, paid_at, metadata)
  values (p_persona, pr.codigo, pr.precio_mxn, 0, 'cumplida', coalesce(nullif(p_medio, ''), 'transferencia'), nullif(p_referencia, ''), now(),
          jsonb_build_object('registrado_por', mid, 'via', 'registrar_cobro'))
  returning id into oid;

  tipo_consulta := case pr.codigo
    when 'actualizacion_datos' then 'imss_historial'
    when 'extraccion_sisec'    then 'imss_historial'
    when 'consulta_issste'     then 'issste'
  end;

  if tipo_consulta is not null then
    r := trol3.pedir_consulta(p_persona, tipo_consulta, 'asesor', mid, 'cliente', true,
                              'cobrado por el experto: ' || pr.nombre, true,
                              case when tipo_consulta = 'imss_historial' then 'jordan' end);
    if not coalesce((r->>'ok')::boolean, false) then
      raise exception 'no_se_pudo_pedir_la_consulta: %', coalesce(r->>'motivo', r::text);
    end if;
    hizo := 'consulta';
  elsif coalesce(array_length(pr.beneficios, 1), 0) > 0 then
    hizo := 'beneficio';
  else
    hizo := 'solo_registro';
  end if;

  perform trol3.registrar_interaccion(p_persona, 'nota', 'asesor', mid, 'saliente',
    'Recibimos tu pago de ' || pr.nombre || '.' ||
      case hizo when 'consulta' then ' Ya estamos consultando tu información; te avisamos por WhatsApp en cuanto llegue.'
                when 'beneficio' then ' Ya quedó activo en tu cuenta.'
                else '' end,
    true, jsonb_build_object('cobro', pr.codigo, 'orden_id', oid));

  return jsonb_build_object('ok', true, 'orden_id', oid, 'producto', pr.codigo, 'nombre', pr.nombre,
                            'monto', pr.precio_mxn, 'hizo', hizo, 'consulta_id', r->>'consulta_id');
end $function$;

revoke all on function trol3.registrar_cobro(uuid, text, text, text) from public, anon;
grant execute on function trol3.registrar_cobro(uuid, text, text, text) to authenticated, service_role;