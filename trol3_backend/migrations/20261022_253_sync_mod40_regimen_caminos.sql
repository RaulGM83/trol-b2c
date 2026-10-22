-- 253 — El puente public.clientes → trol3 aprende los campos del régimen de
-- Mod 40 (semilla v2.2, motor n8n v5.8, claude/106).
--
-- `sync_desde_cliente` ya escribe pension_mod40_futuro desde
-- cp->'diagnostico'; aquí se añaden, justo después de esa línea:
--   mod40_regimen, mod40_sbc_tope, mod40_permitida, pension_mod10_futuro,
--   costo_mensual_mod40, costo_mensual_mod10 (diagnostico) y
--   mod40_caminos (escenarios.caminos_mod40).
-- Edición quirúrgica sobre la definición viva: el ancla debe aparecer una
-- sola vez o aborta. Idempotente.
do $mig$
declare src text;
  ancla text := E'    perform trol3._dato_si_cambio(pid,\'pension_mod40_futuro\', to_jsonb(trol3.to_num_safe(cp->\'diagnostico\'->>\'pension_mod40_futuro\')),\'calculado\',\'pension_core\',at);\n';
  extra text := E'    -- 253: régimen de Mod 40 y los tres caminos (semilla v2.2, motor v5.8, claude/106)\n'
             || E'    perform trol3._dato_si_cambio(pid,\'mod40_regimen\', to_jsonb(nullif(cp->\'diagnostico\'->>\'mod40_regimen\',\'\')),\'calculado\',\'pension_core\',at);\n'
             || E'    perform trol3._dato_si_cambio(pid,\'mod40_sbc_tope\', to_jsonb(trol3.to_num_safe(cp->\'diagnostico\'->>\'mod40_sbc_tope\')),\'calculado\',\'pension_core\',at);\n'
             || E'    perform trol3._dato_si_cambio(pid,\'mod40_permitida\', case when (cp->\'diagnostico\'->>\'mod40_permitida\') ilike \'s%\' then \'true\'::jsonb when (cp->\'diagnostico\'->>\'mod40_permitida\') ilike \'n%\' then \'false\'::jsonb end,\'calculado\',\'pension_core\',at);\n'
             || E'    perform trol3._dato_si_cambio(pid,\'pension_mod10_futuro\', to_jsonb(trol3.to_num_safe(cp->\'diagnostico\'->>\'pension_mod10_futuro\')),\'calculado\',\'pension_core\',at);\n'
             || E'    perform trol3._dato_si_cambio(pid,\'costo_mensual_mod40\', to_jsonb(trol3.to_num_safe(cp->\'diagnostico\'->>\'costo_mensual_mod40\')),\'calculado\',\'pension_core\',at);\n'
             || E'    perform trol3._dato_si_cambio(pid,\'costo_mensual_mod10\', to_jsonb(trol3.to_num_safe(cp->\'diagnostico\'->>\'costo_mensual_mod10\')),\'calculado\',\'pension_core\',at);\n'
             || E'    perform trol3._dato_si_cambio(pid,\'mod40_caminos\', case when jsonb_typeof(cp->\'escenarios\'->\'caminos_mod40\') = \'object\' then cp->\'escenarios\'->\'caminos_mod40\' end,\'calculado\',\'pension_core\',at);\n';
begin
  src := pg_get_functiondef('trol3.sync_desde_cliente'::regproc);
  if position('253: régimen de Mod 40' in src) > 0 then raise notice '253 ya aplicada'; return; end if;
  if (length(src) - length(replace(src, ancla, ''))) / length(ancla) <> 1 then
    raise exception '253: el ancla de pension_mod40_futuro no aparece exactamente una vez en sync_desde_cliente';
  end if;
  src := replace(src, ancla, ancla || extra);
  execute src;
  raise notice '253: sync_desde_cliente reescrita (% chars)', length(src);
end $mig$;
