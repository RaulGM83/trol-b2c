-- 209 · Caminos cerrados: ver y partir de aquí (claude/94). 1-oct-2026.
--
-- Nada toca trol3.escenarios ni su trigger de inmutabilidad: el escenario que nace al
-- "partir de aquí" es una fila nueva y guarda `inputs.partio_de = <id del origen>`.
-- Aquí sólo:
--   1. la vista de la lista expone `partio_de` para pintar «ajuste de <etiqueta>» sin
--      cargar el snapshot;
--   2. `config.motor_version_actual` sube a la versión que calcula la app hoy
--      (pension-core@2026.09.30.3; seguía en 09.06.1 y la vista marcaba al revés
--      quién era "motor anterior").

create or replace view trol3.v_escenarios_cerrados as
select
  e.id,
  e.tipo,
  e.persona_id,
  e.consulta_aliado_id,
  e.creado_en,
  e.creado_por,
  m.nombre as creado_por_nombre,
  e.inputs ->> 'motor_version' as motor_version,
  (e.inputs ->> 'motor_version') = trol3.motor_version_actual() as motor_actual,
  e.inputs -> 'resumen' as resumen,
  (e.inputs ->> 'partio_de')::uuid as partio_de
from trol3.escenarios e
left join trol3.miembros m on m.id = e.creado_por
where e.tipo like 'calc\_%';

alter view trol3.v_escenarios_cerrados set (security_invoker = true);

comment on view trol3.v_escenarios_cerrados is
  'Escenarios cerrados sin el snapshot. Hereda el RLS de la tabla (113b). 209: partio_de = el camino del que se partió (inputs.partio_de).';

do $$
begin
  execute $q$update trol3.config set valor = 'pension-core@2026.09.30.3' where clave = 'motor_version_actual'$q$;
end $$;
