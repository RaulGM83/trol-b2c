-- ===========================================================================
-- 128 — El aliado puede dar de alta a alguien, no sólo mandarle su liga.
--
-- Es al revés que el link: ahí el cliente escribe y su teléfono queda
-- verificado en ese acto; aquí lo teclea el aliado y el cliente todavía no ha
-- dicho nada. Por eso NO se reusa `alta_por_telefono` —que además rechaza a
-- quien no es miembro y teclea un número ajeno— y por eso el contacto NO nace
-- verificado. Que se note la diferencia es parte del punto.
--
-- El consentimiento se guarda como TEXTO, no como un booleano. Un `true` no
-- dice qué le dijeron a esa persona; el día que alguien pregunte por qué
-- tenemos sus datos, la frase exacta que el aliado aceptó es todo el respaldo
-- que hay.
--
-- Lo que la función NO hace, a propósito, porque le toca a Trol y no a él: no
-- guarda la CURP ni pide la consulta al IMSS. Sólo valida la CURP y la
-- devuelve; la app las ejecuta con la llave de servicio, es decir como Trol.
-- ===========================================================================

alter table trol3.referidos
  add column if not exists consentimiento_texto text,
  add column if not exists consentimiento_en timestamptz;

comment on column trol3.referidos.consentimiento_texto is
  'La frase exacta que el aliado aceptó al dar de alta a esta persona (128). No un booleano: es el respaldo.';

create or replace function trol3.alta_por_aliado(
  p_tel text,
  p_nombre text default null,
  p_curp text default null,
  p_consentimiento text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_aliado uuid; t10 text; pid uuid; nueva boolean := false;
        v_ref uuid; v_curp text; v_otra uuid; v_suya text; cod text;
begin
  v_aliado := trol3.current_aliado_id();
  if v_aliado is null then raise exception 'no_autorizado'; end if;

  if coalesce(btrim(coalesce(p_consentimiento, '')), '') = '' then
    raise exception 'falta_consentimiento';
  end if;

  t10 := trol3.tel10(p_tel);
  if length(t10) < 10 then raise exception 'telefono_invalido'; end if;

  v_curp := nullif(upper(btrim(coalesce(p_curp, ''))), '');
  if v_curp is not null and v_curp !~ '^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z]{2}$' then
    raise exception 'curp_invalida';
  end if;

  perform pg_advisory_xact_lock(hashtext('trol3:alta:' || t10));

  pid := trol3.persona_por_telefono(t10);

  -- Dos formas de mezclar a dos personas distintas, las dos se frenan antes de
  -- escribir nada: que esa CURP ya sea de alguien más, o que ese teléfono ya
  -- sea de alguien con otra CURP.
  if v_curp is not null then
    select id into v_otra from trol3.personas
     where curp = v_curp and merged_into is null limit 1;
    if v_otra is not null and (pid is null or v_otra <> pid) then
      raise exception 'curp_de_otra_persona';
    end if;
    if pid is not null then
      select curp into v_suya from trol3.personas where id = pid;
      if v_suya is not null and v_suya <> v_curp then
        raise exception 'telefono_de_otra_persona';
      end if;
    end if;
  end if;

  if pid is null then
    select ci.codigo into cod from trol3.codigos_invitacion ci
     where ci.aliado_id = v_aliado order by ci.activo desc, ci.created_at limit 1;

    insert into trol3.personas (nombre, canal_origen, campania_origen, codigo_origen, etapa)
    values (nullif(btrim(coalesce(p_nombre, '')), ''), 'aliado', cod, cod, 'nuevo')
    returning id into pid;

    -- Sin `verificado_at`: el teléfono lo escribió el aliado, no su dueño. Se
    -- verifica solo la primera vez que esa persona nos escriba.
    insert into trol3.contactos (persona_id, tipo, valor, normalizado, principal)
    values (pid, 'telefono', t10, t10, true);

    nueva := true;
  elsif nullif(btrim(coalesce(p_nombre, '')), '') is not null then
    -- Sólo rellena huecos. Al que ya existía no se le reescribe nada.
    update trol3.personas set nombre = coalesce(nombre, btrim(p_nombre)) where id = pid;
  end if;

  -- Decide solo si se atribuye o queda por revisar, igual que por la liga.
  v_ref := trol3.registrar_referido(v_aliado, pid, 'alta_aliado');

  update trol3.referidos
     set consentimiento_texto = btrim(p_consentimiento),
         consentimiento_en = coalesce(consentimiento_en, now())
   where id = v_ref;

  perform trol3.emitir_evento(pid, 'alta_por_aliado', 'aliado', null,
    jsonb_build_object('aliado_id', v_aliado, 'nueva', nueva, 'con_curp', v_curp is not null));

  return jsonb_build_object(
    'persona_id', pid,
    'nueva', nueva,
    'referido_id', v_ref,
    -- La app la declara y dispara la consulta con la llave de servicio: eso lo
    -- hace Trol, no el aliado.
    'curp', v_curp,
    'estado', (select estado from trol3.referidos where id = v_ref));
end $$;

revoke all on function trol3.alta_por_aliado(text, text, text, text) from public;
grant execute on function trol3.alta_por_aliado(text, text, text, text) to authenticated;

comment on function trol3.alta_por_aliado is
  'Alta de una persona hecha por un aliado referidor (128). El teléfono NO queda verificado y el consentimiento es obligatorio.';
