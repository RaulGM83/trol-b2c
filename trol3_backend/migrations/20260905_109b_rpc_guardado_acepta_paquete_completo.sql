-- 109b — las dos RPC de guardado aceptan el paquete completo.
--
-- `p_datos` trae los nueve campos de "Datos a utilizar". Los dos parámetros
-- viejos (p_disponible_afore, p_infonavit) siguen existiendo y siguen ganando
-- cuando llegan con valor, así que un llamador viejo no nota el cambio.
--
-- Ojo con `create or replace` aquí: agregar parámetros (aunque tengan default)
-- NO reemplaza la función, crea una sobrecarga — y dos funciones con el mismo
-- nombre dejan a PostgREST sin saber a cuál llamar. Por eso se dropea primero
-- la firma vieja por su lista de argumentos exacta.
--
-- El merge es el de siempre: lo que no se manda conserva su valor anterior.
-- Un campo sólo se borra si viaja explícitamente en p_borrar.

drop function if exists public.guardar_saldos_corregidos(uuid, text, numeric, numeric);
drop function if exists trol3.guardar_saldos_consulta_aliado(uuid, numeric, numeric);

create function public.guardar_saldos_corregidos(
  p_id uuid,
  p_scope text,
  p_disponible_afore numeric default null,
  p_infonavit numeric default null,
  p_datos jsonb default null,
  p_borrar text[] default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'trol3', 'auth', 'pg_temp'
as $function$
declare
  v_partner record;
  v_prev jsonb;
  v_semilla jsonb;
  v_nuevo jsonb;
  v_datos jsonb;
  v_now timestamptz := now();
  k text;
begin
  if p_scope not in ('consulta', 'cliente') then
    raise exception 'Scope inválido: %', p_scope
      using errcode = 'P0001', hint = 'invalid_scope';
  end if;

  v_datos := trol3.limpiar_datos_a_utilizar(p_datos);
  if p_disponible_afore is not null then
    if p_disponible_afore < 0 then
      raise exception 'Los saldos no pueden ser negativos'
        using errcode = 'P0001', hint = 'negative_amount';
    end if;
    v_datos := v_datos || jsonb_build_object('disponible_afore', p_disponible_afore);
  end if;
  if p_infonavit is not null then
    if p_infonavit < 0 then
      raise exception 'Los saldos no pueden ser negativos'
        using errcode = 'P0001', hint = 'negative_amount';
    end if;
    v_datos := v_datos || jsonb_build_object('infonavit', p_infonavit);
  end if;

  if v_datos = '{}'::jsonb and coalesce(array_length(p_borrar, 1), 0) = 0 then
    raise exception 'Nada que guardar'
      using errcode = 'P0001', hint = 'empty_payload';
  end if;

  if p_scope = 'consulta' then
    select id, is_admin into v_partner
    from public.partners where auth_user_id = auth.uid() limit 1;
    if v_partner is null then
      raise exception 'No partner found for authenticated user'
        using errcode = 'P0001', hint = 'auth_partner_missing';
    end if;
    select saldos_corregidos, calculo_pensional->'saldos' into v_prev, v_semilla
    from public.partner_transactions
    where id = p_id and (partner_id = v_partner.id or v_partner.is_admin)
    for update;
    if not found then
      raise exception 'Consulta not found for partner'
        using errcode = 'P0002', hint = 'consulta_not_found';
    end if;
  else
    if not public.is_advisor_user() then
      raise exception 'Solo asesores pueden guardar saldos de clientes'
        using errcode = 'P0001', hint = 'not_advisor';
    end if;
    select saldos_corregidos, calculo_pensional->'saldos' into v_prev, v_semilla
    from public.clientes where id = p_id for update;
    if not found then
      raise exception 'Cliente not found'
        using errcode = 'P0002', hint = 'cliente_not_found';
    end if;
  end if;

  v_nuevo := coalesce(v_prev, '{}'::jsonb) || v_datos;

  if p_borrar is not null then
    foreach k in array p_borrar loop
      if k = any (trol3.campos_datos_a_utilizar()) then
        v_nuevo := v_nuevo - k;
      end if;
    end loop;
  end if;

  v_nuevo := v_nuevo || jsonb_build_object(
    'estimados_semilla', coalesce(v_semilla, 'null'::jsonb),
    'actualizado_at', v_now,
    'actualizado_por', auth.uid());

  if p_scope = 'consulta' then
    update public.partner_transactions
       set saldos_corregidos = v_nuevo, updated_at = v_now where id = p_id;
  else
    update public.clientes set saldos_corregidos = v_nuevo where id = p_id;
  end if;

  return v_nuevo;
end;
$function$;

comment on function public.guardar_saldos_corregidos(uuid, text, numeric, numeric, jsonb, text[]) is
  'Guarda los datos a utilizar del cliente o de una consulta de aliado. 109b: acepta el paquete completo en p_datos (nueve campos) además de los dos parámetros viejos, que siguen ganando cuando vienen con valor.';

grant execute on function public.guardar_saldos_corregidos(uuid, text, numeric, numeric, jsonb, text[]) to authenticated;


create function trol3.guardar_saldos_consulta_aliado(
  p_consulta uuid,
  p_disponible_afore numeric default null,
  p_infonavit numeric default null,
  p_datos jsonb default null,
  p_borrar text[] default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'trol3', 'public'
as $function$
declare v_prev jsonb; v_semilla jsonb; v_nuevo jsonb; v_datos jsonb;
        v_now timestamptz := now(); k text;
begin
  if not trol3.es_miembro() then raise exception 'no_autorizado'; end if;

  v_datos := trol3.limpiar_datos_a_utilizar(p_datos);
  if p_disponible_afore is not null then
    if p_disponible_afore < 0 then raise exception 'Los saldos no pueden ser negativos'; end if;
    v_datos := v_datos || jsonb_build_object('disponible_afore', p_disponible_afore);
  end if;
  if p_infonavit is not null then
    if p_infonavit < 0 then raise exception 'Los saldos no pueden ser negativos'; end if;
    v_datos := v_datos || jsonb_build_object('infonavit', p_infonavit);
  end if;
  if v_datos = '{}'::jsonb and coalesce(array_length(p_borrar, 1), 0) = 0 then
    raise exception 'Nada que guardar';
  end if;

  select saldos_corregidos_trol, calculo_pensional->'saldos' into v_prev, v_semilla
  from trol3.consultas_aliados where id = p_consulta for update;
  if not found then raise exception 'consulta_no_encontrada'; end if;

  v_nuevo := coalesce(v_prev, '{}'::jsonb) || v_datos;
  if p_borrar is not null then
    foreach k in array p_borrar loop
      if k = any (trol3.campos_datos_a_utilizar()) then v_nuevo := v_nuevo - k; end if;
    end loop;
  end if;
  v_nuevo := v_nuevo || jsonb_build_object(
    'estimados_semilla', coalesce(v_semilla, 'null'::jsonb),
    'actualizado_at', v_now,
    'actualizado_por', trol3.current_miembro_id());

  update trol3.consultas_aliados set saldos_corregidos_trol = v_nuevo where id = p_consulta;
  return v_nuevo;
end $function$;

comment on function trol3.guardar_saldos_consulta_aliado(uuid, numeric, numeric, jsonb, text[]) is
  'Guarda los datos a utilizar de una consulta de aliado. 109b: acepta el paquete completo en p_datos.';

grant execute on function trol3.guardar_saldos_consulta_aliado(uuid, numeric, numeric, jsonb, text[]) to authenticated;
