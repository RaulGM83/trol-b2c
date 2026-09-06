-- 116 — la vista de escenarios pregunta la versión del motor sin abrir config.
--
-- 113b le puso `security_invoker` a `v_escenarios_cerrados` para tapar un hoyo
-- real: la vista corría con los permisos de su dueño y le habría entregado los
-- snapshots a cualquier `authenticated`. Pero al correr ahora como el asesor,
-- la vista se topa con lo que lee por dentro: `trol3.config`, para comparar la
-- versión del motor del escenario contra la actual.
--
-- `authenticated` no tiene —ni debe tener— permiso sobre esa tabla: ahí viven
-- `api_key`, `ip_hash_salt` y los webhooks de todos los proveedores. Darle
-- select para arreglar la vista habría cambiado un hoyo por uno peor.
--
-- Se expone entonces UNA sola cosa, la que la vista necesita: la versión del
-- motor, por una función `security definer` que no deja pasar nada más.

create or replace function trol3.motor_version_actual()
returns text
language sql
stable
security definer
set search_path to 'trol3', 'public'
as $$
  select valor from trol3.config where clave = 'motor_version_actual'
$$;

comment on function trol3.motor_version_actual is
  'La versión de motor vigente. Existe para que las vistas con security_invoker no necesiten permiso sobre trol3.config, que guarda llaves y webhooks. 116.';

revoke all on function trol3.motor_version_actual() from public;
grant execute on function trol3.motor_version_actual() to authenticated;

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
  e.inputs -> 'resumen' as resumen
from trol3.escenarios e
left join trol3.miembros m on m.id = e.creado_por
where e.tipo like 'calc\_%';

alter view trol3.v_escenarios_cerrados set (security_invoker = true);

comment on view trol3.v_escenarios_cerrados is
  'Escenarios cerrados sin el snapshot. Hereda el RLS de la tabla (113b) y ya no necesita permiso sobre config (116).';

grant select on trol3.v_escenarios_cerrados to authenticated;