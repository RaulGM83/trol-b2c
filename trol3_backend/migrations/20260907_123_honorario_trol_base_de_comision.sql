-- ===========================================================================
-- 123 — El honorario de Trol es la base de la comisión del aliado.
--
-- 122 devengaba sobre `valor_estimado`, que NO es lo que Trol cobra: en las
-- oportunidades de vivienda ese campo guarda el saldo Infonavit del cliente
-- (~$500 mil). Un 20% sobre eso habría devengado ~$100 mil por referido. El
-- porcentaje siempre fue sobre el honorario; lo que faltaba era el honorario.
--
-- Se captura aparte del cierre a propósito. Cerrar una venta no puede quedar
-- detenido porque todavía no se sabe cuánto se va a cobrar, así que la
-- oportunidad se marca ganada hoy y el honorario entra cuando exista. La
-- comisión nace en ese segundo momento, no en el primero.
-- ===========================================================================

alter table trol3.oportunidades
  add column if not exists honorario_trol numeric;

comment on column trol3.oportunidades.honorario_trol is
  'Lo que Trol cobra por esta operación. Base de la comisión del aliado que refirió (122/123). Distinto de valor_estimado, que es el beneficio del cliente.';

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

  v_pct := v_ref.comision_pct;
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
              -- Corregir el honorario corrige lo que se debe. Lo ya pagado no
              -- se toca: eso se arregla hablando, no reescribiendo el saldo.
              where trol3.comisiones.estado = 'devengada';
  exception when others then
    raise warning 'no se pudo devengar la comisión de la oportunidad %: %', new.id, sqlerrm;
  end;

  return new;
end $$;

-- Una oportunidad puede nacer ya ganada (alta manual de algo que se cerró
-- fuera). Antes sólo se miraba el UPDATE y ese caso se perdía.
drop trigger if exists devengar_comision on trol3.oportunidades;
create trigger devengar_comision
  after insert or update on trol3.oportunidades
  for each row execute function trol3.tg_devengar_comision();

-- Las ganadas de un referido que todavía no traen honorario: es lo único que
-- separa a un aliado de su comisión, así que se ve en su pantalla.
create or replace view trol3.v_ganadas_sin_honorario as
select o.id            as oportunidad_id,
       o.codigo,
       o.persona_id,
       o.cerrada_en,
       o.valor_estimado,
       r.aliado_id,
       a.nombre        as aliado_nombre,
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
