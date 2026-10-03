-- 211b · El agujero real era PUBLIC (claude/96). Postgres da EXECUTE a PUBLIC en toda función
-- nueva; revocarle a `anon` no servía porque el permiso le llegaba por ahí. Se quita PUBLIC de
-- todo trol3 (y de lo futuro), se da EXECUTE explícito a authenticated y service_role, y se
-- vuelve a quitar a authenticated lo que es sólo del servicio (misma lista que 211).
do $$
declare f record;
begin
  execute 'revoke execute on all functions in schema trol3 from public';
  execute 'alter default privileges in schema trol3 revoke execute on functions from public';
  execute 'grant execute on all functions in schema trol3 to service_role';
  execute 'alter default privileges in schema trol3 grant execute on functions to service_role';
  execute 'grant execute on all functions in schema trol3 to authenticated';
  execute 'alter default privileges in schema trol3 grant execute on functions to authenticated';
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'trol3'
       and (p.proname like '\_%' escape '\'
            or p.proname like 'tg\_%' escape '\'
            or p.proname in ('resumen_bot', 'persona_por_telefono', 'persona_por_slug',
                             'sync_desde_cliente', 'sync_identidad', 'sync_saldos_corregidos', 'resultado_consulta',
                             'evaluar_persona', 'evaluar_gestoria', 'evaluar_reactivacion_mod10', 'evaluar_todos',
                             'migrar_desde_public', 'encolar_envio', 'marcar_envio', 'cola_envios_pendientes',
                             'redespachar_pendientes', 'registrar_conversacion_tako', 'registrar_referido_bot',
                             'registrar_salida', 'registrar_nomina_imss', 'otorgar_puntos_accion',
                             'aplicar_regla_cda', 'aplicar_regla_identidad', 'aplicar_nombre_sisec',
                             'derivar_ultima_modalidad', 'generar_checklist_oportunidad', 'cliente_por_codigo_referido',
                             'registrar_referido', 'emitir_evento', 'handoff', 'pendientes_nudge', 'carril_noche'))
  loop
    execute format('revoke execute on function %s from authenticated, anon', f.sig);
  end loop;
  -- Los helpers que usan las políticas RLS (leídos de pg_policies) los necesita cualquier rol que consulte tablas.
  execute 'grant execute on function trol3.es_miembro() to anon, authenticated';
  execute 'grant execute on function trol3.current_miembro_id() to anon, authenticated';
  execute 'grant execute on function trol3.current_persona_id() to anon, authenticated';
  execute 'grant execute on function trol3.current_aliado_id() to anon, authenticated';
  execute 'grant execute on function trol3.current_partner_id() to anon, authenticated';
  execute 'grant execute on function trol3.tiene_rol(trol3.rol_miembro) to anon, authenticated';
  execute 'grant execute on function trol3.partner_ve_persona(uuid) to anon, authenticated';
  -- Lo público: links de invitación y la página del evento.
  execute 'grant execute on function trol3.registrar_clic(text, text, text, text) to anon';
  execute 'grant execute on function trol3.marca_evento(text) to anon';
end $$;
