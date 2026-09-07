-- 122b — lo que el aliado ve, y lo que se le devenga.

-- Quién está viendo. El análogo de `current_miembro_id()` para el otro lado.
create or replace function trol3.current_aliado_id()
returns uuid
language sql
stable
security definer
set search_path to 'trol3', 'public'
as $$
  select id from trol3.aliados where auth_user_id = auth.uid() and activo
$$;

comment on function trol3.current_aliado_id is
  'El aliado referidor autenticado, o null. 122b.';

revoke all on function trol3.current_aliado_id() from public;
grant execute on function trol3.current_aliado_id() to authenticated;


-- ---------------------------------------------------------------------------
-- EL PULSO.
--
-- Esta vista es el contrato de privacidad, y por eso es una LISTA BLANCA
-- escrita a mano y no un `select *` recortado: lo que no se nombra aquí no
-- puede llegarle al aliado ni por error. Se le enseña el avance y el resultado
-- —etapa, cita, diagnóstico entregado, qué contrató, la pensión estimada— y
-- NUNCA los saldos, las semanas, la historia laboral ni el expediente.
--
-- Decisión de Raúl (7-sep): "pulso más el resultado". Un asesor de seguros
-- necesita saber cómo le fue a su cliente para su propia conversación; no
-- necesita su saldo de AFORE.
-- ---------------------------------------------------------------------------

create or replace view trol3.v_referidos_aliado as
select
  r.id            as referido_id,
  r.aliado_id,
  r.persona_id,
  r.estado,
  r.origen,
  r.creado_en     as referido_en,

  p.nombre,
  p.apellidos,
  e.etapa,
  e.edad,
  e.ley,

  -- ¿Ya lo atendimos? Sin decir qué se dijo adentro.
  (select max(c.inicio) from trol3.citas c where c.persona_id = r.persona_id) as ultima_cita,
  (select max(d.entregado_en) from trol3.diagnosticos d
    where d.persona_id = r.persona_id and d.estado = 'entregado') as diagnostico_entregado_en,

  -- El resultado: la pensión del último escenario que el asesor CERRÓ. No la
  -- de la calculadora abierta: sólo lo que se le presentó al cliente.
  (select (x.inputs->'resumen'->>'pension_mensual')::numeric
     from trol3.escenarios x
    where x.persona_id = r.persona_id and x.tipo like 'calc\_%'
    order by x.creado_en desc limit 1) as pension_estimada,

  -- Qué contrató. Los nombres de producto, no los montos que pagó.
  (select string_agg(distinct pr.nombre, ', ')
     from trol3.ordenes o
     join trol3.productos pr on pr.codigo = o.producto
    where o.persona_id = r.persona_id and o.estado = 'pagada') as productos_contratados,

  -- Y lo suyo: qué se le ha devengado por esta persona.
  (select coalesce(sum(cm.monto), 0) from trol3.comisiones cm
    where cm.referido_id = r.id and cm.estado <> 'cancelada') as comision_devengada

from trol3.referidos r
join trol3.personas p   on p.id = r.persona_id
left join trol3.v_expediente e on e.persona_id = r.persona_id
where r.visible_para_aliado
  and (
    -- El aliado ve LO SUYO y sólo si la referencia ya se le atribuyó: una que
    -- está por revisar todavía no es suya.
    (r.aliado_id = trol3.current_aliado_id() and r.estado = 'atribuido')
    -- Y los miembros de Trol ven todo, para poder gestionarlo.
    or trol3.es_miembro()
  );

alter view trol3.v_referidos_aliado set (security_invoker = true);

comment on view trol3.v_referidos_aliado is
  'El pulso de un referido: avance y resultado, nunca saldos ni expediente. Lista blanca a mano. 122b.';

grant select on trol3.v_referidos_aliado to authenticated;


-- ---------------------------------------------------------------------------
-- La comisión se devenga sola cuando la oportunidad se gana.
--
-- Automático a propósito: si dependiera de que alguien se acuerde de
-- registrarla, el aliado acabaría reclamándola y nosotros buscándola.
-- ---------------------------------------------------------------------------

create or replace function trol3.tg_devengar_comision()
returns trigger
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_ref record; v_pct numeric; v_base numeric;
begin
  -- Sólo al CRUZAR a ganada, no en cada update de una ya ganada.
  if new.estado <> 'ganada' or coalesce(old.estado::text, '') = 'ganada' then
    return new;
  end if;

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

  -- Sin porcentaje pactado no se inventa uno. Queda sin devengar y se ve en la
  -- lista de aliados sin términos, que es un problema de negocio, no de datos.
  v_pct := v_ref.comision_pct;
  if v_pct is null then return new; end if;

  v_base := coalesce(new.valor_estimado, 0);
  if v_base <= 0 then return new; end if;

  insert into trol3.comisiones
    (aliado_id, referido_id, persona_id, oportunidad_id, base, pct, monto)
  values
    (v_ref.aliado_id, v_ref.id, new.persona_id, new.id,
     v_base, v_pct, round(v_base * v_pct, 2))
  on conflict (oportunidad_id) do nothing;

  return new;
end $$;

drop trigger if exists devengar_comision on trol3.oportunidades;
create trigger devengar_comision after update on trol3.oportunidades
  for each row execute function trol3.tg_devengar_comision();

comment on function trol3.tg_devengar_comision is
  'Devenga la comisión al cruzar una oportunidad a ganada. Congela base y pct. Sin pct pactado no inventa uno. 122b.';