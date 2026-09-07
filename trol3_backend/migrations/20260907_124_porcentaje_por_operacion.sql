-- ===========================================================================
-- 124 — El porcentaje se puede pactar operación por operación.
--
-- 123 dejó la base bien (el honorario de Trol) pero el porcentaje seguía
-- siendo uno solo por aliado. En la práctica no lo es: una operación grande,
-- una que costó el doble de trabajo o un acuerdo especial mueven el trato de
-- esa venta sin mover el trato de la relación.
--
-- El ajuste vive en la OPORTUNIDAD, no en la comisión ya devengada. Si viviera
-- en la comisión, la siguiente corrección del honorario —que recalcula— lo
-- borraría en silencio. Aquí el trigger lo vuelve a leer cada vez.
--
-- Vacío significa "el de siempre": el porcentaje del aliado. No se copia al
-- crear la oportunidad a propósito, para que cambiar el trato general sí
-- alcance a lo que todavía no se ha pagado.
-- ===========================================================================

alter table trol3.oportunidades
  add column if not exists comision_pct_aliado numeric;

comment on column trol3.oportunidades.comision_pct_aliado is
  'Porcentaje pactado sólo para esta operación (124). Vacío = el del aliado. Se lee al devengar, no se congela.';

alter table trol3.oportunidades
  drop constraint if exists oportunidades_comision_pct_rango;
alter table trol3.oportunidades
  add constraint oportunidades_comision_pct_rango
  check (comision_pct_aliado is null or (comision_pct_aliado > 0 and comision_pct_aliado <= 1));

create or replace function trol3.tg_devengar_comision()
returns trigger
language plpgsql
security definer
set search_path = trol3, public
as $$
declare v_ref record; v_pct numeric; v_base numeric;
begin
  if new.estado <> 'ganada' then return new; end if;

  -- Sin honorario capturado no hay de dónde sacar el porcentaje. No es un
  -- error ni un pendiente de la venta: la pantalla de referidores persigue
  -- las ganadas que todavía no lo traen.
  v_base := coalesce(new.honorario_trol, 0);
  if v_base <= 0 then return new; end if;

  select r.id, r.aliado_id, a.comision_pct
    into v_ref
    from trol3.referidos r
    join trol3.aliados a on a.id = r.aliado_id
   where r.persona_id = new.persona_id
     and r.estado = 'atribuido'
     and a.activo
   order by r.creado_en
   limit 1;

  if v_ref.id is null then return new; end if;

  -- Lo pactado para esta operación manda; si no hay nada, el trato de siempre.
  v_pct := coalesce(new.comision_pct_aliado, v_ref.comision_pct);
  if v_pct is null then return new; end if;

  -- Nada de lo que pase aquí debe poder impedir que una venta se cierre. La
  -- comisión es un efecto secundario del negocio, no un requisito suyo.
  begin
    insert into trol3.comisiones
      (aliado_id, referido_id, persona_id, oportunidad_id, base, pct, monto)
    values
      (v_ref.aliado_id, v_ref.id, new.persona_id, new.id,
       v_base, v_pct, round(v_base * v_pct, 2))
    on conflict (oportunidad_id) where oportunidad_id is not null
    do update set base = excluded.base,
                  pct  = excluded.pct,
                  monto = excluded.monto
              -- Corregir los términos corrige lo que se debe. Lo ya pagado no
              -- se toca: eso se arregla hablando, no reescribiendo el saldo.
              where trol3.comisiones.estado = 'devengada';
  exception when others then
    raise warning 'no se pudo devengar la comisión de la oportunidad %: %', new.id, sqlerrm;
  end;

  return new;
end $$;

-- La pantalla necesita saber, en la misma fila, qué porcentaje se le va a
-- aplicar a esa venta cuando entre el honorario: el de la operación si lo hay,
-- si no el del aliado. Se recrea (no `or replace`) porque cambia el orden de
-- las columnas.
drop view if exists trol3.v_ganadas_sin_honorario;
create view trol3.v_ganadas_sin_honorario as
select o.id            as oportunidad_id,
       o.codigo,
       o.persona_id,
       o.cerrada_en,
       o.valor_estimado,
       o.comision_pct_aliado,
       r.aliado_id,
       a.nombre        as aliado_nombre,
       a.comision_pct  as aliado_pct,
       coalesce(o.comision_pct_aliado, a.comision_pct) as pct_efectivo,
       p.nombre,
       p.apellidos
  from trol3.oportunidades o
  join trol3.referidos r on r.persona_id = o.persona_id and r.estado = 'atribuido'
  join trol3.aliados a   on a.id = r.aliado_id and a.activo
  join trol3.personas p  on p.id = o.persona_id
 where o.estado = 'ganada'
   and coalesce(o.honorario_trol, 0) <= 0
   and trol3.es_miembro();

alter view trol3.v_ganadas_sin_honorario set (security_invoker = true);
grant select on trol3.v_ganadas_sin_honorario to authenticated;
