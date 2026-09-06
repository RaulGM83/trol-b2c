-- 115b — las puertas del diagnóstico.

-- Abrir un borrador sobre los escenarios cerrados que se le indiquen.
-- Exige al menos uno: un diagnóstico sin escenario es el problema que este
-- rediseño vino a resolver.
create or replace function trol3.abrir_diagnostico(
  p_persona    uuid,
  p_escenarios uuid[],
  p_hechos     jsonb default '{}'::jsonb,
  p_motor_version text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_id uuid; v_yo uuid; v_n int;
begin
  v_yo := trol3.current_miembro_id();
  if v_yo is null then raise exception 'no_autorizado'; end if;

  if p_escenarios is null or array_length(p_escenarios, 1) is null then
    raise exception 'sin_escenarios'
      using hint = 'Cierra un escenario en la calculadora antes de abrir el diagnóstico.';
  end if;

  -- Que los escenarios existan y sean de esta persona: un documento que cita
  -- números de otro cliente es peor que uno vacío.
  select count(*) into v_n
    from trol3.escenarios e
   where e.id = any(p_escenarios) and e.persona_id = p_persona;
  if v_n <> array_length(p_escenarios, 1) then
    raise exception 'escenario_ajeno'
      using hint = 'Todos los escenarios deben existir y ser de esta persona.';
  end if;

  insert into trol3.diagnosticos
    (persona_id, escenario_ids, contenido, motor_version, creado_por, actualizado_por)
  values
    (p_persona, p_escenarios,
     jsonb_build_object('hechos', coalesce(p_hechos, '{}'::jsonb),
                        'narrativa', '{}'::jsonb,
                        'acuerdos', ''),
     p_motor_version, v_yo, v_yo)
  returning id into v_id;

  perform trol3.registrar_interaccion(
    p_persona, 'nota', 'asesor', v_yo, 'interna',
    'Abrió el diagnóstico avanzado', false,
    jsonb_build_object('diagnostico_id', v_id));

  return v_id;
end $$;

comment on function trol3.abrir_diagnostico is
  'Abre el borrador sobre uno o más escenarios cerrados de esa persona. 115b.';


-- Guardar. El merge es por bloque: el asesor puede reescribir la narrativa sin
-- tocar los hechos, y viceversa cuando se regeneran los hechos.
create or replace function trol3.guardar_diagnostico(
  p_diagnostico uuid,
  p_narrativa   jsonb default null,
  p_acuerdos    text  default null,
  p_hechos      jsonb default null,
  p_redactor    text  default null
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

  update trol3.diagnosticos
     set contenido = contenido
                   || case when p_narrativa is null then '{}'::jsonb
                           else jsonb_build_object('narrativa',
                                  coalesce(contenido->'narrativa','{}'::jsonb) || p_narrativa) end
                   || case when p_acuerdos is null then '{}'::jsonb
                           else jsonb_build_object('acuerdos', p_acuerdos) end
                   || case when p_hechos is null then '{}'::jsonb
                           else jsonb_build_object('hechos', p_hechos) end,
         redactor = coalesce(p_redactor, redactor),
         actualizado_por = v_yo
   where id = p_diagnostico;

  if not found then raise exception 'diagnostico_no_encontrado'; end if;
end $$;

comment on function trol3.guardar_diagnostico is
  'Guarda por bloque: narrativa, acuerdos o hechos, sin pisar los otros. 115b.';


create or replace function trol3.estado_diagnostico(
  p_diagnostico uuid,
  p_estado      text
)
returns void
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_yo uuid; v_persona uuid;
begin
  v_yo := trol3.current_miembro_id();
  if v_yo is null then raise exception 'no_autorizado'; end if;
  if p_estado not in ('borrador', 'revisado', 'entregado') then
    raise exception 'estado_invalido';
  end if;

  update trol3.diagnosticos
     set estado = p_estado,
         entregado_en = case when p_estado = 'entregado' then coalesce(entregado_en, now()) end,
         actualizado_por = v_yo
   where id = p_diagnostico
  returning persona_id into v_persona;

  if v_persona is null then raise exception 'diagnostico_no_encontrado'; end if;

  if p_estado = 'entregado' then
    perform trol3.registrar_interaccion(
      v_persona, 'nota', 'asesor', v_yo, 'interna',
      'Entregó el diagnóstico avanzado', false,
      jsonb_build_object('diagnostico_id', p_diagnostico));
  end if;
end $$;

comment on function trol3.estado_diagnostico is
  'Mueve el documento entre borrador, revisado y entregado. 115b.';


-- La lista, sin el contenido pesado.
create or replace view trol3.v_diagnosticos as
select
  d.id, d.persona_id, d.estado, d.escenario_ids,
  d.redactor, d.motor_version,
  d.creado_en, d.actualizado_en, d.entregado_en,
  c.nombre as creado_por_nombre,
  a.nombre as actualizado_por_nombre,
  (d.contenido->'narrativa') is not null
    and d.contenido->'narrativa' <> '{}'::jsonb as tiene_narrativa,
  length(coalesce(d.contenido->>'acuerdos','')) > 0 as tiene_acuerdos,
  (select count(*) from trol3.tareas t
    where t.origen = 'diagnostico' and t.origen_id = d.id
      and t.estado = 'pendiente') as tareas_abiertas
from trol3.diagnosticos d
left join trol3.miembros c on c.id = d.creado_por
left join trol3.miembros a on a.id = d.actualizado_por;

alter view trol3.v_diagnosticos set (security_invoker = true);

comment on view trol3.v_diagnosticos is
  'Diagnósticos sin el contenido pesado, con sus tareas abiertas. Hereda el RLS. 115b.';

grant select on trol3.v_diagnosticos to authenticated;

grant execute on function trol3.abrir_diagnostico(uuid, uuid[], jsonb, text) to authenticated;
grant execute on function trol3.guardar_diagnostico(uuid, jsonb, text, jsonb, text) to authenticated;
grant execute on function trol3.estado_diagnostico(uuid, text) to authenticated;
