-- 139: apagar secciones del PDF del diagnóstico.
--
-- Vive en `contenido.secciones_off` y no en una columna propia porque es parte
-- del documento, no de su ciclo de vida: se guarda con él, se reimprime con él
-- y sobrevive a `guardar_diagnostico`, que hace merge en la raíz de `contenido`.
--
-- Sólo apaga lo que el PDF imprime. La pantalla del asesor sigue enseñando todo.
create or replace function trol3.secciones_diagnostico(p_diagnostico uuid, p_off text[])
returns void
language plpgsql security definer set search_path to 'trol3', 'public'
as $function$
declare v_yo uuid;
begin
  v_yo := trol3.current_miembro_id();
  if v_yo is null then raise exception 'no_autorizado'; end if;

  update trol3.diagnosticos
     set contenido = coalesce(contenido, '{}'::jsonb)
                   || jsonb_build_object('secciones_off',
                        to_jsonb(coalesce(p_off, array[]::text[]))),
         actualizado_por = v_yo
   where id = p_diagnostico;

  if not found then raise exception 'diagnostico_no_encontrado'; end if;
end $function$;

revoke all on function trol3.secciones_diagnostico(uuid, text[]) from public;
grant execute on function trol3.secciones_diagnostico(uuid, text[]) to authenticated, service_role;
