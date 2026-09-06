-- 113b — `v_escenarios_cerrados` tiene que respetar el RLS de la tabla.
--
-- Una vista en Postgres corre por default con los permisos de SU DUEÑO, no de
-- quien consulta. Eso significa que la vista creada en 113 se saltaba
-- `escenarios_lectura_miembro` y le habría entregado los snapshots a cualquier
-- usuario autenticado — incluidos los clientes, que entran a /mi con el mismo
-- rol `authenticated`.
--
-- La tabla excluye al cliente a propósito (ver el comentario de RLS en la
-- migración del 24-ago): el snapshot arrastra costos, gestorías y márgenes del
-- despacho. Una vista encima no puede deshacer esa decisión por descuido.
--
-- `security_invoker = true` hace que la vista corra con los permisos de quien
-- consulta, así que el RLS de la tabla vuelve a aplicar. Regla general: toda
-- vista sobre una tabla con RLS lo lleva, salvo que se quiera exponer de más y
-- se diga por qué.

alter view trol3.v_escenarios_cerrados set (security_invoker = true);

comment on view trol3.v_escenarios_cerrados is
  'Escenarios cerrados por el asesor, sin los jsonb pesados. security_invoker: hereda el RLS de trol3.escenarios, que es solo-miembros. 113/113b.';
