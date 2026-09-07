-- ===========================================================================
-- 126 — La puerta del aliado.
--
-- `v_referidos_aliado` (122) se escribió con `security_invoker`, pero nunca se
-- probó con un aliado adentro porque hasta ahora ninguno podía entrar. Así
-- como estaba NO habría funcionado: con security_invoker la vista lee las
-- tablas con los permisos de quien pregunta, y las políticas de `referidos`,
-- `personas`, `citas` y las demás son sólo de miembros. Humberto habría
-- entrado a su espacio y visto cero referidos, sin un solo error.
--
-- La corrección es hacer que estas vistas corran con los permisos del dueño y
-- que el filtro de adentro sea toda la frontera. Es a propósito y hay que
-- decirlo fuerte:
--
--   *** EL `where` DE ESTAS VISTAS ES LO ÚNICO QUE SEPARA A UN ALIADO DE LOS
--   DATOS DE OTRO. No hay RLS abajo que lo atrape si se rompe. ***
--
-- Por eso son listas blancas escritas a mano, nunca un `select *`, y por eso
-- `current_aliado_id()` —que es null para cualquiera que no sea un aliado
-- activo— va en todas.
-- ===========================================================================

-- Vuelve a correr con los permisos del dueño (postgres). El where de abajo
-- ya distingue: miembro ve todo, aliado ve lo suyo, nadie más ve nada.
alter view trol3.v_referidos_aliado reset (security_invoker);

-- Su propia ficha. Sin `nota` (comentarios internos sobre él), sin
-- `creado_por`, sin `partner_id`.
create or replace view trol3.v_aliado_yo as
select a.id,
       a.nombre,
       a.empresa,
       a.email,
       a.telefono,
       a.tipo,
       a.comision_pct,
       a.activo,
       (select ci.codigo
          from trol3.codigos_invitacion ci
         where ci.aliado_id = a.id
         order by ci.activo desc, ci.created_at
         limit 1) as codigo
  from trol3.aliados a
 where a.id = trol3.current_aliado_id();

-- Lo que se le debe y lo que ya se le pagó. Lleva `base` y `pct` a propósito:
-- se le prometió un porcentaje del honorario, y enseñarle el porcentaje
-- escondiéndole la base sería puro teatro — no podría comprobar su propio
-- número.
create or replace view trol3.v_comisiones_aliado as
select c.id,
       c.persona_id,
       trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellidos, '')) as cliente,
       c.base,
       c.pct,
       c.monto,
       c.estado,
       c.creado_en,
       c.pagada_en
  from trol3.comisiones c
  join trol3.personas p on p.id = c.persona_id
 where c.aliado_id = trol3.current_aliado_id()
   and c.estado <> 'cancelada';

grant select on trol3.v_aliado_yo, trol3.v_comisiones_aliado to authenticated;

comment on view trol3.v_aliado_yo is
  'Ficha propia del aliado. Corre como el dueño: el where es toda la frontera (126).';
comment on view trol3.v_comisiones_aliado is
  'Comisiones propias del aliado. Corre como el dueño: el where es toda la frontera (126).';

-- Para que pueda entrar hace falta que su usuario quede pegado a su ficha. La
-- vinculación por correo la hace la app con la llave de servicio en el primer
-- acceso, igual que con los miembros; aquí sólo se asegura que no haya dos
-- aliados peleándose el mismo usuario.
create unique index if not exists aliados_auth_user_unico
  on trol3.aliados (auth_user_id) where auth_user_id is not null;
