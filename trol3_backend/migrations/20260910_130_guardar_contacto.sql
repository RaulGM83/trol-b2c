-- 130 · El asesor corrige el correo (o teléfono) del cliente desde el expediente.
-- El contacto queda como principal para campañas futuras y se copia al legacy
-- (public.clientes), igual que el teléfono. Sólo miembros.
create or replace function trol3.guardar_contacto(p_persona uuid, p_tipo text, p_valor text)
returns jsonb
language plpgsql
security definer
set search_path to 'trol3','public'
as $$
declare
  v_norm text;
  v_id uuid;
  v_legacy uuid;
begin
  if not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  if p_tipo not in ('email','telefono') then raise exception 'tipo_invalido'; end if;

  if p_tipo = 'email' then
    v_norm := lower(trim(p_valor));
    if v_norm !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido'; end if;
  else
    v_norm := trol3.tel10(p_valor);
    if length(v_norm) < 10 then raise exception 'telefono_invalido'; end if;
  end if;

  -- El mismo contacto de la misma persona se reutiliza (índice único tipo+normalizado+persona).
  insert into trol3.contactos (persona_id, tipo, valor, normalizado, principal)
  values (p_persona, p_tipo, trim(p_valor), v_norm, true)
  on conflict (tipo, normalizado, persona_id) do update set valor = excluded.valor, principal = true
  returning id into v_id;

  update trol3.contactos set principal = false
   where persona_id = p_persona and tipo = p_tipo and id <> v_id and principal;

  -- Legacy: el correo del cliente vive también en public.clientes.
  select legacy_cliente_id into v_legacy from trol3.personas where id = p_persona;
  if v_legacy is not null and p_tipo = 'email' then
    update public.clientes set email = v_norm where id = v_legacy;
  end if;

  perform trol3.emitir_evento(p_persona, 'contacto_actualizado', 'asesor', trol3.current_miembro_id(),
    jsonb_build_object('tipo', p_tipo, 'valor', v_norm));

  return jsonb_build_object('ok', true, 'id', v_id, 'valor', v_norm);
end $$;

grant execute on function trol3.guardar_contacto(uuid, text, text) to authenticated;
