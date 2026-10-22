-- 255 — asesoria_vista.numeros aprende el régimen de Mod 40 y los tres caminos
-- (claude/106): pension_mod40_futuro, pension_mod10_futuro, mod40_regimen,
-- mod40_sbc_tope, mod40_permitida y mod40_caminos (de v_expediente.kv). Los lee
-- el copiloto (lib/trol3/copiloto.ts) y el paso 3 de la asesoría. Edición
-- quirúrgica sobre la definición viva; idempotente.
do $mig$
declare src text;
  ancla text := E'''pension_mod40_retro'', e.pension_mod40_retro, ''costo_retro'', e.costo_retro, ''limite_mod40'', e.limite_mod40),';
  nuevo text := E'''pension_mod40_retro'', e.pension_mod40_retro, ''costo_retro'', e.costo_retro, ''limite_mod40'', e.limite_mod40,\n'
             || E'                                  -- 255 (claude/106): régimen de Mod 40 y los tres caminos (motor v5.8)\n'
             || E'                                  ''pension_mod40_futuro'', e.pension_mod40_futuro, ''pension_mod10_futuro'', trol3.jnum(e.kv->''pension_mod10_futuro''->''v''),\n'
             || E'                                  ''mod40_regimen'', e.kv->''mod40_regimen''->>''v'', ''mod40_sbc_tope'', trol3.jnum(e.kv->''mod40_sbc_tope''->''v''),\n'
             || E'                                  ''mod40_permitida'', trol3.jbool(e.kv->''mod40_permitida''->''v''), ''mod40_caminos'', e.kv->''mod40_caminos''->''v''),';
begin
  src := pg_get_functiondef('trol3.asesoria_vista'::regproc);
  if position('255 (claude/106)' in src) > 0 then raise notice '255 ya aplicada'; return; end if;
  if (length(src) - length(replace(src, ancla, ''))) / length(ancla) <> 1 then
    raise exception '255: el ancla de numeros no aparece exactamente una vez en asesoria_vista';
  end if;
  src := replace(src, ancla, nuevo);
  execute src;
end $mig$;
