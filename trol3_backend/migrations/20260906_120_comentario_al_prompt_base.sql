-- 120 — un comentario puede acabar en el prompt base, no sólo en el bloque
-- vigente.
--
-- 117 asumió un solo destino para una observación: el bloque de ajustes, que
-- tiene número de versión. Pero el destino natural de un comentario estructural
-- —"en Ley 97 no menciones conservación de derechos"— es el PROMPT BASE, que
-- vive en el repo y se versiona distinto. Sin dónde anotarlo, esos comentarios
-- se quedaban abiertos para siempre o se marcaban promovidos sin decir a dónde.

alter table trol3.diagnostico_feedback
  add column if not exists promovida_prompt_version text;

comment on column trol3.diagnostico_feedback.promovida_prompt_version is
  'Versión del prompt base donde quedó, cuando el ajuste se consolidó en el repo en vez del bloque vigente. 120.';


-- OJO: agregarle un parámetro a una función existente con `create or replace`
-- crea una SOBRECARGA, no un reemplazo, y PostgREST deja de saber a cuál
-- llamar. Ya rompió dos veces (109b, 110b). Por eso se tira primero, con la
-- lista de argumentos EXACTA de la versión anterior.
drop function if exists trol3.actualizar_feedback(uuid, text, text, text, int);

create or replace function trol3.actualizar_feedback(
  p_id          uuid,
  p_estado      text default null,
  p_instruccion text default null,
  p_comentario  text default null,
  p_version     int  default null,
  p_prompt_version text default null
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
         promovida_version = coalesce(p_version, promovida_version),
         promovida_prompt_version =
           coalesce(nullif(btrim(coalesce(p_prompt_version,'')),''), promovida_prompt_version)
   where id = p_id;

  if not found then raise exception 'feedback_no_encontrado'; end if;
end $$;

comment on function trol3.actualizar_feedback is
  'Mueve una observación entre abierto, probado, promovido y descartado, y deja dicho a dónde acabó: al bloque vigente (p_version) o al prompt base (p_prompt_version). Sólo admin. 120.';

grant execute on function trol3.actualizar_feedback(uuid, text, text, text, int, text) to authenticated;


-- La columna nueva va en medio, y `create or replace view` no sabe insertar:
-- se tira y se rehace. La vista no la referencia nadie más.
drop view if exists trol3.v_redactor_feedback;

create view trol3.v_redactor_feedback as
select
  f.id, f.diagnostico_id, f.seccion, f.comentario, f.instruccion,
  f.estado, f.promovida_version, f.promovida_prompt_version,
  f.creado_en, f.actualizado_en,
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
  'Observaciones con su cliente y a dónde acabó cada una. Hereda el RLS (sólo admin). 120.';

grant select on trol3.v_redactor_feedback to authenticated;