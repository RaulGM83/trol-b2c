-- 089: contraseña Infonavit (y futuras credenciales) cifrada, con revelar bajo bitácora.
-- Aplicada en Supabase el 28-ago-2026 vía MCP (supabase_migrations: 089_credenciales_cifradas).
-- La tabla no es legible por nadie (RLS sin políticas + revoke): solo se entra por las
-- funciones security definer, y cada guardado/revelado deja rastro en trol3.interacciones
-- (canal 'sistema'). La llave simétrica vive en Vault ('trol3_credenciales_key').

create table if not exists trol3.credenciales (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references trol3.personas(id) on delete cascade,
  servicio text not null default 'infonavit',
  usuario text,
  secreto bytea not null,
  actualizado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (persona_id, servicio)
);
alter table trol3.credenciales enable row level security;
revoke all on trol3.credenciales from anon, authenticated;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'trol3_credenciales_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'trol3_credenciales_key', 'Cifra trol3.credenciales (pgp_sym)');
  end if;
end $$;

create or replace function trol3._credenciales_key() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'trol3_credenciales_key';
$$;
revoke all on function trol3._credenciales_key() from public, anon, authenticated;

create or replace function trol3.guardar_credencial(p_persona uuid, p_secreto text, p_servicio text default 'infonavit', p_usuario text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_m uuid;
begin
  if not trol3.es_miembro() then raise exception 'Solo miembros del equipo'; end if;
  v_m := trol3.current_miembro_id();
  if coalesce(trim(p_secreto), '') = '' then raise exception 'La contraseña no puede ir vacía'; end if;
  insert into trol3.credenciales (persona_id, servicio, usuario, secreto, actualizado_por)
  values (p_persona, p_servicio, nullif(trim(p_usuario), ''), extensions.pgp_sym_encrypt(p_secreto, trol3._credenciales_key()), v_m)
  on conflict (persona_id, servicio) do update
    set secreto = excluded.secreto,
        usuario = coalesce(excluded.usuario, trol3.credenciales.usuario),
        actualizado_por = excluded.actualizado_por,
        updated_at = now();
  perform trol3.registrar_interaccion(p_persona, 'sistema', 'asesor', v_m, 'interna',
    'Guardó la contraseña de ' || p_servicio, false, jsonb_build_object('credencial', p_servicio));
end $$;

create or replace function trol3.revelar_credencial(p_persona uuid, p_servicio text default 'infonavit')
returns table (usuario text, secreto text, updated_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare v_m uuid;
begin
  if not trol3.es_miembro() then raise exception 'Solo miembros del equipo'; end if;
  v_m := trol3.current_miembro_id();
  if not exists (select 1 from trol3.credenciales c where c.persona_id = p_persona and c.servicio = p_servicio) then
    return;
  end if;
  perform trol3.registrar_interaccion(p_persona, 'sistema', 'asesor', v_m, 'interna',
    'Reveló la contraseña de ' || p_servicio, false, jsonb_build_object('credencial', p_servicio));
  return query
    select c.usuario, extensions.pgp_sym_decrypt(c.secreto, trol3._credenciales_key()), c.updated_at
    from trol3.credenciales c
    where c.persona_id = p_persona and c.servicio = p_servicio;
end $$;

create or replace function trol3.credencial_estado(p_persona uuid)
returns table (servicio text, usuario text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.servicio, c.usuario, c.updated_at
  from trol3.credenciales c
  where c.persona_id = p_persona and trol3.es_miembro();
$$;

grant execute on function trol3.guardar_credencial(uuid, text, text, text) to authenticated;
grant execute on function trol3.revelar_credencial(uuid, text) to authenticated;
grant execute on function trol3.credencial_estado(uuid) to authenticated;
