-- 214c · El portal de aliados (trol-portal, app vieja) llama RPCs de `public` con sesión de usuario.
-- La 214 las dejó sólo para service_role y Viraal recibió «permission denied for function create_consulta».
-- Se regresan a authenticated SOLO las que traen su propio candado (auth.uid() → partner, o is_admin_user()/is_advisor_user()).
grant execute on function public.create_consulta(text, jsonb) to authenticated;
grant execute on function public.actualizar_consulta(uuid) to authenticated;
grant execute on function public.activar_calculadora(uuid) to authenticated;
grant execute on function public.ampliar_consulta(uuid, text) to authenticated;
grant execute on function public.delegate_consulta(uuid, text, text, text, text) to authenticated;
grant execute on function public.guardar_saldos_corregidos(uuid, text, numeric, numeric, jsonb, text[]) to authenticated;
grant execute on function public.liberar_diagnostico(uuid) to authenticated;
grant execute on function public.list_aliados() to authenticated;
grant execute on function public.admin_activar_calculadora(uuid, boolean) to authenticated;
grant execute on function public.admin_set_documento_sisec(uuid, text) to authenticated;
grant execute on function public.admin_upsert_asesor(text, text) to authenticated;
