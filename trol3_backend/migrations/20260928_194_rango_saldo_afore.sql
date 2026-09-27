-- 194 · Rango del saldo AFORE (motor v5.6 / contrafactual v1.9, claude/89).
--
-- El motor v5.6 de n8n entrega user_data.saldo_afore_rango = {piso, central,
-- techo, factor_piso, factor_techo, banderas} y "Build Diagnostico Bag" lo guarda
-- en la semilla como saldos.afore_rango. Aquí:
--   1) campo nuevo saldo_afore_rango (calculado, visible al cliente, no editable);
--   2) sync_desde_cliente lo baja de la semilla a trol3.datos;
--   3) base_asesoria lo expone en highlights.afore_rango para /mi y el paso 0.
-- Con semillas de motores anteriores no hay rango y todo se ve como antes.

insert into trol3.catalogo_campos (campo, nombre, grupo, tipo, unidad, vigencia_dias, editable_cliente, visible_cliente, visible_aliado, orden, prioridad_capa, base_asesoria)
values ('saldo_afore_rango', 'Rango estimado de tu AFORE (RCV + SAR 92)', 'afore', 'json', 'mxn', 90, false, true, true, 33, null, null)
on conflict (campo) do update set nombre = excluded.nombre, tipo = excluded.tipo, visible_cliente = excluded.visible_cliente;

do $$
declare src text;
begin
  src := pg_get_functiondef('trol3.sync_desde_cliente(uuid)'::regprocedure);
  if position('saldo_afore_rango' in src) > 0 then return; end if;
  src := replace(src,
    $a$    perform trol3._dato_si_cambio(pid,'saldo_sar92', cp->'saldos'->'sar92','calculado','pension_core',at);$a$,
    $b$    perform trol3._dato_si_cambio(pid,'saldo_sar92', cp->'saldos'->'sar92','calculado','pension_core',at);
    -- 194: rango del saldo AFORE (motor v5.6); ausente con motores anteriores
    if jsonb_typeof(cp->'saldos'->'afore_rango') = 'object' then
      perform trol3._dato_si_cambio(pid,'saldo_afore_rango', cp->'saldos'->'afore_rango','calculado','pension_core',at);
    end if;$b$);
  if position('saldo_afore_rango' in src) = 0 then raise exception 'parche 194 a sync_desde_cliente no encajó'; end if;
  execute src;
end $$;

do $$
declare src text;
begin
  src := pg_get_functiondef('trol3.base_asesoria(uuid)'::regprocedure);
  if position('afore_rango' in src) > 0 then return; end if;
  src := replace(src,
    $a$      'pension_base', e.pension_base, 'edad_base', edad_base, 'datos_al', e.ley_en, 'datos_vigentes', e.ley_vigente),$a$,
    $b$      'pension_base', e.pension_base, 'edad_base', edad_base, 'datos_al', e.ley_en, 'datos_vigentes', e.ley_vigente,
      -- 194: rango del saldo AFORE (RCV + SAR 92) del motor v5.6
      'afore_rango', (select d.valor from trol3.datos d where d.persona_id = p_persona and d.campo = 'saldo_afore_rango'
                       order by d.obtenido_en desc nulls last limit 1)),$b$);
  if position('afore_rango' in src) = 0 then raise exception 'parche 194 a base_asesoria no encajó'; end if;
  execute src;
end $$;
