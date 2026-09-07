-- 122c — las puertas del aliado referidor.

create or replace function trol3.alta_aliado(
  p_nombre text,
  p_tipo   text default 'asesor_seguros',
  p_empresa text default null,
  p_email  text default null,
  p_telefono text default null,
  p_comision_pct numeric default null,
  p_comision_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_yo uuid; v_id uuid; v_codigo text;
begin
  v_yo := trol3.current_miembro_id();
  if v_yo is null then raise exception 'no_autorizado'; end if;
  if coalesce(btrim(p_nombre), '') = '' then raise exception 'nombre_vacio'; end if;

  insert into trol3.aliados
    (nombre, tipo, empresa, email, telefono, comision_pct, comision_nota, creado_por)
  values
    (btrim(p_nombre), p_tipo, nullif(btrim(coalesce(p_empresa,'')),''),
     lower(nullif(btrim(coalesce(p_email,'')),'')), nullif(btrim(coalesce(p_telefono,'')),''),
     p_comision_pct, nullif(btrim(coalesce(p_comision_nota,'')),''), v_yo)
  returning id into v_id;

  -- Su link/QR nace con él: un aliado sin manera de referir no sirve de nada.
  -- El código es legible a propósito, para poder dictarlo por teléfono.
  v_codigo := regexp_replace(lower(split_part(btrim(p_nombre), ' ', 1)), '[^a-z0-9]', '', 'g')
              || '-' || substr(replace(v_id::text, '-', ''), 1, 4);

  insert into trol3.codigos_invitacion (codigo, tipo, aliado_id, etiqueta, activo)
  values (v_codigo, 'aliado', v_id, btrim(p_nombre), true)
  on conflict (codigo) do nothing;

  return v_id;
end $$;

comment on function trol3.alta_aliado is
  'Da de alta un aliado referidor y le crea su código de invitación. Sólo miembros. 122c.';


-- Registrar que un aliado refirió a alguien.
--
-- El estado NO lo decide quien llama: si la persona ya existía en Trol antes de
-- la referencia, entra como `por_revisar` y la decide un humano. Es la regla
-- que Raúl eligió sobre automatizarla con una ventana de meses.
create or replace function trol3.registrar_referido(
  p_aliado  uuid,
  p_persona uuid,
  p_origen  text default 'link'
)
returns uuid
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_id uuid; v_nueva boolean; v_creada timestamptz;
begin
  select created_at into v_creada from trol3.personas where id = p_persona;
  if v_creada is null then raise exception 'persona_no_encontrada'; end if;

  -- "Ya existía" se mide contra el momento de la referencia, con un minuto de
  -- gracia: una persona que se acaba de crear POR esta referencia no cuenta
  -- como preexistente.
  v_nueva := v_creada > now() - interval '1 minute';

  insert into trol3.referidos (aliado_id, persona_id, origen, ya_existia, estado)
  values (
    p_aliado, p_persona, p_origen, not v_nueva,
    case when v_nueva then 'atribuido' else 'por_revisar' end)
  on conflict (aliado_id, persona_id) do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id from trol3.referidos
     where aliado_id = p_aliado and persona_id = p_persona;
  end if;

  return v_id;
end $$;

comment on function trol3.registrar_referido is
  'Liga una persona a un aliado. Quien ya era cliente entra como por_revisar. 122c.';

-- La decide un miembro.
create or replace function trol3.decidir_referido(
  p_referido uuid,
  p_estado   text,
  p_nota     text default null
)
returns void
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_yo uuid;
begin
  v_yo := trol3.current_miembro_id();
  if v_yo is null then raise exception 'no_autorizado'; end if;
  if p_estado not in ('atribuido', 'rechazado', 'por_revisar') then
    raise exception 'estado_invalido';
  end if;

  update trol3.referidos
     set estado = p_estado,
         decidido_por = v_yo,
         decidido_en = now(),
         nota = coalesce(nullif(btrim(coalesce(p_nota,'')),''), nota)
   where id = p_referido;

  if not found then raise exception 'referido_no_encontrado'; end if;
end $$;

comment on function trol3.decidir_referido is
  'Atribuye o rechaza una referencia que quedó por revisar. Sólo miembros. 122c.';


-- El cliente apaga (o vuelve a encender) lo que su aliado ve de él.
create or replace function trol3.visibilidad_referido(p_referido uuid, p_visible boolean)
returns void
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
begin
  if trol3.current_miembro_id() is null then raise exception 'no_autorizado'; end if;
  update trol3.referidos set visible_para_aliado = p_visible where id = p_referido;
  if not found then raise exception 'referido_no_encontrado'; end if;
end $$;

comment on function trol3.visibilidad_referido is
  'Enciende o apaga lo que el aliado ve de esta persona. 122c.';


create or replace function trol3.pagar_comisiones(
  p_ids uuid[],
  p_referencia text default null
)
returns int
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_yo uuid; v_n int;
begin
  v_yo := trol3.current_miembro_id();
  if v_yo is null or not trol3.tiene_rol('admin') then raise exception 'no_autorizado'; end if;

  update trol3.comisiones
     set estado = 'pagada', pagada_en = now(), pagada_por = v_yo,
         referencia = coalesce(nullif(btrim(coalesce(p_referencia,'')),''), referencia)
   where id = any(p_ids) and estado = 'devengada';
  get diagnostics v_n = row_count;
  return v_n;
end $$;

comment on function trol3.pagar_comisiones is
  'Marca comisiones como pagadas. Sólo admin: es dinero saliendo. 122c.';

grant execute on function trol3.alta_aliado(text, text, text, text, text, numeric, text) to authenticated;
grant execute on function trol3.registrar_referido(uuid, uuid, text) to authenticated;
grant execute on function trol3.decidir_referido(uuid, text, text) to authenticated;
grant execute on function trol3.visibilidad_referido(uuid, boolean) to authenticated;
grant execute on function trol3.pagar_comisiones(uuid[], text) to authenticated;