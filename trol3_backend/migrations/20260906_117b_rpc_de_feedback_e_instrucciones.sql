-- 117b — las puertas del ciclo de ajuste.
--
-- Nota de método: NINGUNA de estas reemplaza una función existente con
-- parámetros nuevos. `create or replace` con una firma distinta crea una
-- SOBRECARGA, no un reemplazo, y PostgREST deja de saber a cuál llamar. Ya
-- pasó dos veces (109b, 110b). Por eso registrar la versión del prompt es una
-- función aparte y no un parámetro más de `guardar_diagnostico`.

-- Promover: el bloque nuevo entra activo y el anterior se apaga, en la misma
-- transacción. Nunca hay dos activos ni un hueco sin ninguno.
create or replace function trol3.promover_instrucciones(
  p_texto text,
  p_nota  text default null
)
returns int
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_yo uuid; v_version int;
begin
  v_yo := trol3.current_miembro_id();
  if v_yo is null or not trol3.tiene_rol('admin') then
    raise exception 'no_autorizado';
  end if;
  if coalesce(btrim(p_texto), '') = '' then
    raise exception 'instrucciones_vacias'
      using hint = 'Para quitar los ajustes, revierte a una versión anterior.';
  end if;

  update trol3.redactor_instrucciones set activa = false where activa;

  insert into trol3.redactor_instrucciones (texto, nota, activa, creado_por)
  values (btrim(p_texto), nullif(btrim(coalesce(p_nota, '')), ''), true, v_yo)
  returning version into v_version;

  return v_version;
end $$;

comment on function trol3.promover_instrucciones is
  'Publica un bloque de ajustes para todos los asesores. Sólo admin. 117b.';


-- Revertir es reactivar una versión que ya existió. No se reescribe la
-- historia: se vuelve a apuntar a un renglón viejo.
create or replace function trol3.activar_instrucciones(p_version int)
returns void
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
begin
  if not trol3.tiene_rol('admin') then raise exception 'no_autorizado'; end if;

  update trol3.redactor_instrucciones set activa = false where activa;
  update trol3.redactor_instrucciones set activa = true where version = p_version;
  if not found then raise exception 'version_no_encontrada'; end if;
end $$;

comment on function trol3.activar_instrucciones is
  'Vuelve a poner vigente una versión anterior del bloque. Sólo admin. 117b.';


-- ---------------------------------------------------------------------------

create or replace function trol3.crear_feedback(
  p_diagnostico uuid,
  p_comentario  text,
  p_seccion     text default null,
  p_instruccion text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_yo uuid; v_id uuid;
begin
  v_yo := trol3.current_miembro_id();
  if v_yo is null or not trol3.tiene_rol('admin') then
    raise exception 'no_autorizado';
  end if;
  if coalesce(btrim(p_comentario), '') = '' then
    raise exception 'comentario_vacio';
  end if;

  insert into trol3.diagnostico_feedback
    (diagnostico_id, seccion, comentario, instruccion, creado_por)
  values
    (p_diagnostico, nullif(btrim(coalesce(p_seccion, '')), ''),
     btrim(p_comentario), nullif(btrim(coalesce(p_instruccion, '')), ''), v_yo)
  returning id into v_id;

  return v_id;
end $$;

comment on function trol3.crear_feedback is
  'Guarda una observación sobre lo que escribió el redactor. Sólo admin. 117b.';


create or replace function trol3.actualizar_feedback(
  p_id          uuid,
  p_estado      text default null,
  p_instruccion text default null,
  p_comentario  text default null,
  p_version     int  default null
)
returns void
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
begin
  if not trol3.tiene_rol('admin') then raise exception 'no_autorizado'; end if;
  if p_estado is not null and p_estado not in ('abierto','probado','promovido','descartado') then
    raise exception 'estado_invalido';
  end if;

  update trol3.diagnostico_feedback
     set estado      = coalesce(p_estado, estado),
         instruccion = coalesce(nullif(btrim(coalesce(p_instruccion,'')),''), instruccion),
         comentario  = coalesce(nullif(btrim(coalesce(p_comentario,'')),''), comentario),
         promovida_version = coalesce(p_version, promovida_version)
   where id = p_id;

  if not found then raise exception 'feedback_no_encontrado'; end if;
end $$;

comment on function trol3.actualizar_feedback is
  'Mueve una observación entre abierto, probado, promovido y descartado. Sólo admin. 117b.';


-- ---------------------------------------------------------------------------

-- El ensayo vive en el documento porque su alcance ES el documento: se aplica
-- al regenerarlo y no toca a nadie más.
create or replace function trol3.guardar_ensayo(p_diagnostico uuid, p_ensayo text)
returns void
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
begin
  if not trol3.tiene_rol('admin') then raise exception 'no_autorizado'; end if;

  update trol3.diagnosticos
     set ensayo = nullif(btrim(coalesce(p_ensayo, '')), ''),
         actualizado_por = trol3.current_miembro_id()
   where id = p_diagnostico;

  if not found then raise exception 'diagnostico_no_encontrado'; end if;
end $$;

comment on function trol3.guardar_ensayo is
  'Instrucción que aplica sólo a este documento al regenerarlo. Sólo admin. 117b.';


-- Qué produjo esta narrativa. Función aparte a propósito: agregarle parámetros
-- a `guardar_diagnostico` habría creado una sobrecarga.
create or replace function trol3.registrar_redaccion(
  p_diagnostico  uuid,
  p_redactor     text default null,
  p_prompt_version text default null,
  p_instrucciones_version int default null
)
returns void
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
begin
  if trol3.current_miembro_id() is null then raise exception 'no_autorizado'; end if;

  update trol3.diagnosticos
     set redactor = coalesce(p_redactor, redactor),
         prompt_version = coalesce(p_prompt_version, prompt_version),
         instrucciones_version = p_instrucciones_version
   where id = p_diagnostico;

  if not found then raise exception 'diagnostico_no_encontrado'; end if;
end $$;

comment on function trol3.registrar_redaccion is
  'Deja escrito qué modelo, qué prompt y qué instrucciones escribieron esta narrativa. 117b.';


-- ---------------------------------------------------------------------------

-- Las observaciones con su contexto, para revisarlas juntas.
create or replace view trol3.v_redactor_feedback as
select
  f.id, f.diagnostico_id, f.seccion, f.comentario, f.instruccion,
  f.estado, f.promovida_version, f.creado_en, f.actualizado_en,
  m.nombre as creado_por_nombre,
  d.persona_id,
  p.nombre || ' ' || coalesce(p.apellidos, '') as persona_nombre,
  d.prompt_version, d.instrucciones_version
from trol3.diagnostico_feedback f
left join trol3.miembros m on m.id = f.creado_por
left join trol3.diagnosticos d on d.id = f.diagnostico_id
left join trol3.personas p on p.id = d.persona_id;

alter view trol3.v_redactor_feedback set (security_invoker = true);

comment on view trol3.v_redactor_feedback is
  'Observaciones con su cliente y la versión que las produjo. Hereda el RLS (sólo admin). 117b.';

grant select on trol3.v_redactor_feedback to authenticated;

grant execute on function trol3.promover_instrucciones(text, text) to authenticated;
grant execute on function trol3.activar_instrucciones(int) to authenticated;
grant execute on function trol3.crear_feedback(uuid, text, text, text) to authenticated;
grant execute on function trol3.actualizar_feedback(uuid, text, text, text, int) to authenticated;
grant execute on function trol3.guardar_ensayo(uuid, text) to authenticated;
grant execute on function trol3.registrar_redaccion(uuid, text, text, int) to authenticated;