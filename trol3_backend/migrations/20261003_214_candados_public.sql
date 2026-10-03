-- 214 · Candados en `public` (claude/96 §3.5). 3-oct-2026. Misma receta que 211b, con lista blanca.
--
-- Estado anterior: 84 funciones de `public` ejecutables por anon vía PUBLIC. Entre ellas
-- `procesar_pago_orden(orden)` (marcar una orden como pagada sin pagar), `registrar_baja(tel)`
-- (poner a cualquiera en no_contactar), `get_diagnostico_payload_cliente`, `admin_upsert_asesor`.
--
-- Quién llama qué (auditado en la app y en los 45 workflows activos de n8n):
--   · anon (n8n "v2 token+anon"): avisos_pendientes, avisos_marcar_enviado, registrar_baja_token
--     (las tres validan un token propio).
--   · authenticated (cliente en la app vieja /calculadora, puntos, checkout, encuesta, login):
--     declarar_saldo, desbloquear_con_puntos, estado_mision, otorgar_bienvenida,
--     otorgar_puntos_referido, registrar_referido, responder_encuesta_afore, saldo_puntos,
--     vincular_cliente_actual.
--   · políticas RLS: is_admin_user, is_advisor_user (anon y authenticated).
--   · todo lo demás lo llama n8n con la credencial "Supabase account" (service_role), api-trol o
--     la app con createAdminClient (procesar_pago_orden): service_role.
do $$
declare f text;
begin
  execute 'revoke execute on all functions in schema public from public, anon, authenticated';
  execute 'alter default privileges in schema public revoke execute on functions from public';
  execute 'grant execute on all functions in schema public to service_role';
  execute 'alter default privileges in schema public grant execute on functions to service_role';
  -- Políticas RLS y las tres con token propio: anon y authenticated.
  foreach f in array array['is_admin_user()', 'is_advisor_user()', 'avisos_pendientes(text)', 'avisos_marcar_enviado(text, uuid)', 'registrar_baja_token(text, text, text)']
  loop execute format('grant execute on function public.%s to anon, authenticated', f); end loop;
  -- La app vieja con sesión de cliente.
  foreach f in array array['declarar_saldo(jsonb)', 'desbloquear_con_puntos(text)', 'estado_mision()', 'otorgar_bienvenida()', 'otorgar_puntos_referido()',
                           'registrar_referido(text)', 'responder_encuesta_afore(jsonb)', 'saldo_puntos()', 'vincular_cliente_actual()']
  loop execute format('grant execute on function public.%s to authenticated', f); end loop;
end $$;
