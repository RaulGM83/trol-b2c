-- 121 — cambiar de escenario sin volver a empezar.
--
-- `abrir_diagnostico` fija los escenarios al crear el documento y ahí se
-- quedaban: si el asesor cerraba otro mejor, o se equivocó de escenario, la
-- única salida era abrir un diagnóstico nuevo y perder lo que ya había escrito.
-- Los planes de vivienda sí se podían cambiar (119) y los escenarios no, que
-- es justo al revés de lo que importa: los escenarios son los que dan las
-- cifras.
--
-- Función aparte, no un parámetro más de `abrir_diagnostico`: eso habría
-- creado una sobrecarga y PostgREST deja de saber a cuál llamar (109b, 110b).

create or replace function trol3.ligar_escenarios(
  p_diagnostico uuid,
  p_escenarios  uuid[]
)
returns void
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_persona uuid; v_n int;
begin
  if trol3.current_miembro_id() is null then raise exception 'no_autorizado'; end if;

  select persona_id into v_persona from trol3.diagnosticos where id = p_diagnostico;
  if v_persona is null then raise exception 'diagnostico_no_encontrado'; end if;

  -- Vaciarlos NO se permite: un diagnóstico sin escenario es exactamente el
  -- problema que este rediseño vino a resolver.
  if p_escenarios is null or array_length(p_escenarios, 1) is null then
    raise exception 'sin_escenarios'
      using hint = 'El diagnóstico necesita al menos un escenario cerrado.';
  end if;

  select count(*) into v_n
    from trol3.escenarios e
   where e.id = any(p_escenarios) and e.persona_id = v_persona;
  if v_n <> array_length(p_escenarios, 1) then
    raise exception 'escenario_ajeno'
      using hint = 'Todos los escenarios deben existir y ser de esta persona.';
  end if;

  update trol3.diagnosticos
     set escenario_ids = p_escenarios,
         actualizado_por = trol3.current_miembro_id()
   where id = p_diagnostico;
end $$;

comment on function trol3.ligar_escenarios is
  'Cambia qué escenarios cerrados le dan las cifras al diagnóstico. Exige al menos uno. 121.';

grant execute on function trol3.ligar_escenarios(uuid, uuid[]) to authenticated;