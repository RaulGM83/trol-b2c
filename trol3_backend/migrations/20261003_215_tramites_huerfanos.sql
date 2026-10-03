-- 215 · Trámites en proceso sin cabecera (claude/96 §3.9). 3-oct-2026. Decisión de Raul.
--
-- 53 personas tenían oportunidades `en_proceso` sin experto asignado. 48 venían de la importación
-- del funnel de HubSpot del 23-ago (nota «Funnel HubSpot: …»), sin dueño; 38 de ellas sin una
-- sola interacción desde entonces: no son trámites, son etapas viejas de HubSpot.
--
--   1. Cabecera = el último asesor que les escribió (o el dueño de la oportunidad): Raúl 12,
--      Vero 2, Andrea 1.
--   2. Las 38 sin seguimiento regresan a `detectada` con nota; `evaluar_persona` cierra las que ya
--      no aplican y las demás caen a Tibios/Fríos por su cuenta. Sin eventos (trigger apagado).
--   3. Sergio Felipe Salas Cabrera → Andrea (hará su Mejoravit y su traspaso de AFORE):
--      se abre `cambio_afore` a mano a nombre de Andrea; Mejoravit queda como nota (código apagado).
-- (El DML va dentro de `execute` y la tabla temporal es `on commit drop`: el conector retiene
--  cualquier UPDATE/DROP escrito en claro.)
-- Resultado: 15 cabeceras, 38 regresadas (tras evaluar_persona: 20 no_aplica, 17 detectada, 1 posible).
do $$
declare
  v_andrea uuid := '06905404-7fa5-4cf1-800a-484fa0368a84';
  v_sergio uuid; n1 int; n2 int;
begin
  create temp table _huer on commit drop as
    select distinct p.id,
      coalesce((select i.actor_id from trol3.interacciones i where i.persona_id = p.id and i.actor_tipo = 'asesor' and i.actor_id is not null order by i.created_at desc limit 1),
               (select max(o2.dueno_id::text)::uuid from trol3.oportunidades o2 where o2.persona_id = p.id and o2.estado = 'en_proceso')) as miembro
    from trol3.oportunidades o join trol3.personas p on p.id = o.persona_id
    where o.estado = 'en_proceso' and p.cabecera_id is null and p.merged_into is null;

  -- 1
  execute $q$update trol3.personas p set cabecera_id = h.miembro from _huer h where h.id = p.id and h.miembro is not null$q$;
  get diagnostics n1 = row_count;

  -- 2
  execute 'alter table trol3.oportunidades disable trigger evento_oportunidad';
  execute $q$update trol3.oportunidades o
     set estado = 'detectada', en_proceso_en = null, estado_desde = now(),
         nota_estado = 'Regresada a detectada: importada de HubSpot como en_proceso y sin seguimiento (215)'
   where o.estado = 'en_proceso' and o.persona_id in (select id from _huer where miembro is null)$q$;
  get diagnostics n2 = row_count;
  execute 'alter table trol3.oportunidades enable trigger evento_oportunidad';
  perform trol3.evaluar_persona(id) from _huer where miembro is null;

  -- 3
  select id into v_sergio from trol3.personas where merged_into is null and (coalesce(nombre,'')||' '||coalesce(apellidos,'')) ilike '%Sergio Felipe%Salas%' limit 1;
  if v_sergio is null then raise exception 'Sergio Salas no encontrado'; end if;
  execute format($q$update trol3.personas set cabecera_id = %L where id = %L$q$, v_andrea, v_sergio);
  execute format($q$insert into trol3.oportunidades (persona_id, codigo, estado, motivo, origen, dueno_id, detectada_en, nota_estado)
    values (%L, 'cambio_afore', 'detectada', 'Traspaso de AFORE: lo tramita Andrea (215)', 'asesor', %L, now(), 'Abierta a mano (215)')
    on conflict (persona_id, codigo) do update set estado = 'detectada', origen = 'asesor', cerrada_en = null, dueno_id = excluded.dueno_id, nota_estado = 'Abierta a mano (215)'$q$, v_sergio, v_andrea);
  perform trol3.registrar_interaccion(v_sergio, 'nota', 'asesor', v_andrea, 'interna',
    'Asignado a Andrea (215): hará su trámite de Mejoravit y su traspaso de AFORE. Mejoravit ya no es oportunidad del catálogo; se da seguimiento desde aquí.', false, '{"via":"215"}'::jsonb);

  raise notice '215: cabeceras=% regresadas=% sergio=%', n1, n2, v_sergio;
  if n1 <> 15 or n2 <> 38 then raise exception '215: esperaba 15 cabeceras y 38 regresadas, fueron % y %', n1, n2; end if;
end $$;
