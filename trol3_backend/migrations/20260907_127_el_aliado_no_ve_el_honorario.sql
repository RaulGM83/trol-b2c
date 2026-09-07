-- ===========================================================================
-- 127 — El aliado ve su comisión, no el honorario de Trol.
--
-- 126 le enseñaba `base` y `pct` con el argumento de que sin la base no puede
-- comprobar su número. El argumento sólo vale si el porcentaje está prometido,
-- y no lo está: no hay todavía un modelo estándar de comisiones, se está
-- pactando caso por caso mientras madura. Enseñar el honorario de cada
-- operación sería publicar nuestros precios antes de haber decidido cuáles son.
--
-- Se le queda lo que sí es suyo: cuánto, por quién, y si ya se le pagó. El día
-- que exista un esquema estándar y publicado, esto se puede volver a abrir —
-- y entonces sí, con la base a la vista.
-- ===========================================================================

-- Se recrea, no `or replace`: quitar columnas de una vista no se puede
-- reemplazar en caliente.
drop view if exists trol3.v_comisiones_aliado;
create view trol3.v_comisiones_aliado as
select c.id,
       c.persona_id,
       trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellidos, '')) as cliente,
       c.monto,
       c.estado,
       c.creado_en,
       c.pagada_en
  from trol3.comisiones c
  join trol3.personas p on p.id = c.persona_id
 where c.aliado_id = trol3.current_aliado_id()
   and c.estado <> 'cancelada';

grant select on trol3.v_comisiones_aliado to authenticated;

comment on view trol3.v_comisiones_aliado is
  'Comisiones propias del aliado, sin la base ni el porcentaje (127). Corre como el dueño: el where es toda la frontera.';
