-- 251 — Catálogo y evaluar_persona tras el acuerdo DOF 21-oct-2026 (claude/106).
--
-- · `mod40_retro` se APAGA (D1): sin retro no hay servicio que ejecute Trol o
--   un aliado. Queda como historia, igual que `mod40_prospectiva`.
-- · `pension_hoy` presenta los TRES caminos (D2): pensionarse ya · Mod 40
--   topada · Mod 10 a 25 UMA. Los números los escribe n8n v5.8 en el dato
--   `mod40_caminos`; aquí sólo se leen (`v_expediente.kv`).
-- · `reactivacion_mod10` avisa que después de la Mod 10 no hay Mod 40.
-- · `evaluar_persona` pierde el bloque de Mod 40 (incluida la rama «aplica en
--   N meses» de la 206). Se edita quirúrgicamente sobre la definición viva:
--   cada fragmento debe aparecer EXACTAMENTE una vez o la migración aborta.

-- 1. Catálogo ----------------------------------------------------------------
update trol3.catalogo_oportunidades set
  activo = false,
  proveedor_externo = null,
  en_lista_trabajo = false,
  descripcion = 'APAGADA (251, acuerdo del Consejo Técnico DOF 21-oct-2026): desde el 22-oct-2026 la Modalidad 40 no se paga hacia atrás. ' || descripcion,
  siguiente_paso = null
where codigo = 'mod40_retro';

update trol3.catalogo_oportunidades set
  frase_corta = 'Ya cumples edad, semanas y derechos; vemos si te conviene tramitar ya o cotizar unos meses más por tu cuenta.',
  descripcion = 'Ley 73, no pensionado, 60 años o más, 500 semanas o más y derechos vigentes. Trae los tres caminos: pensión hoy, Mod 40 (topada a tu último salario + 1 UMA) y Mod 10 (hasta 25 UMA).',
  siguiente_paso = 'Presentar los tres caminos (hoy · Mod 40 · Mod 10 a 12 y 24 meses). Si 12 meses de cotización no se recuperan en 36 meses de aumento, tramitar ya; si cotiza, elegir modalidad y fecha de inicio en la calculadora. Confirmar fecha real de baja (retroactivo de pensión tope 12 meses). Llamar primero a quien más está perdiendo.'
where codigo = 'pension_hoy';

update trol3.catalogo_oportunidades set
  siguiente_paso = siguiente_paso || ' Ojo (acuerdo DOF 21-oct-2026): después de una Mod 10 no se puede contratar Mod 40; la pensión será la del promedio de hoy.'
where codigo = 'reactivacion_mod10' and siguiente_paso not like '%acuerdo DOF 21-oct-2026%';

-- 2. Línea de los tres caminos para el motivo -------------------------------
-- Estructura de `mod40_caminos` (la escribe n8n v5.8, espejo de pension-core
-- `caminosLey73`): { pension_hoy: {pension, tramitable}, mod40: {aplica,
-- sbc_tope, opciones:[{meses, pension, costo_cuotas, pension_no_cobrada,
-- aumento, meses_recuperacion}]}, mod10: {...}, recomendacion, umbral_meses }.
create or replace function trol3._linea_caminos(c jsonb) returns text
language plpgsql immutable set search_path to 'trol3','public' as $fn$
declare o jsonb; s text; parte text;
begin
  if c is null or jsonb_typeof(c) <> 'object' then return null; end if;
  s := 'Hoy ' || coalesce(trol3.mxn(trol3.jnum(c->'pension_hoy'->'pension')), '?');
  foreach parte in array array['mod40','mod10'] loop
    if coalesce((c->parte->>'aplica')::boolean, true) then
      select x into o from jsonb_array_elements(coalesce(c->parte->'opciones','[]'::jsonb)) x order by (x->>'meses')::int limit 1;
      if o is not null then
        s := s || ' · ' || case parte when 'mod40' then 'Mod 40' else 'Mod 10' end
               || ' ' || (o->>'meses') || ' m ' || coalesce(trol3.mxn(trol3.jnum(o->'pension')), '?')
               || ' (cuotas ' || coalesce(trol3.mxn(trol3.jnum(o->'costo_cuotas')), '?')
               || case when o->>'meses_recuperacion' is not null then ', recupera en ' || round(trol3.jnum(o->'meses_recuperacion')) || ' m' else '' end
               || ')';
      end if;
    else
      s := s || ' · ' || case parte when 'mod40' then 'Mod 40 no aplica' else 'Mod 10 no aplica' end;
    end if;
  end loop;
  if c->>'recomendacion' is not null then
    s := s || ' → ' || case c->>'recomendacion' when 'pension_hoy' then 'tramitar ya' when 'mod40' then 'cotizar en Mod 40' when 'mod10' then 'cotizar en Mod 10' else 'sin recomendación' end;
  end if;
  return s;
end $fn$;
revoke all on function trol3._linea_caminos(jsonb) from public, anon, authenticated;

-- 3. evaluar_persona: edición quirúrgica --------------------------------------
do $mig$
declare src text; n int;
  f1 text := E'        -- Modalidad 40\n        m40_meses int; v_ult date; v_nac date; d_derecho date; m40_hoy boolean; m40_pronto boolean; m40_nueva numeric; m40_urg date;';
  r1 text := E'        -- 251: Mod 40 sólo para el checklist; los tres caminos van en pension_hoy\n        v_nac date; v_caminos jsonb; v_regimen text; v_linea text;';
  f2 text := E'  select umbrales into u from trol3.catalogo_oportunidades where codigo = \'mod40_retro\';\n  m40_meses := coalesce((u->>\'meses_antes\')::int, 6);\n';
  f3 text := E'  select (valor#>>\'{}\')::date into v_ult from trol3.v_mejor_dato where persona_id = p_id and campo = \'ultima_cotizacion\' limit 1;\n';
  f4 text := E'  if not ya_pens and e.ley = \'Ley73\' and e.edad >= 60 and coalesce(e.semanas,0) >= 500 and derechos_ok then\n    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, \'pension_hoy\',\n            nullif(coalesce(e.pension_base,0),0) * 12,\n            jsonb_build_object(\'pension_mensual\', e.pension_base, \'edad\', e.edad, \'semanas\', e.semanas),\n            case when coalesce(e.pension_base,0) > 0\n                 then \'Cumple edad, semanas y derechos: tramitar la pensión\'\n                 else \'Cumple edad, semanas y derechos: tramitar la pensión; falta calcular cuánto le toca\' end,\n            null,\n            case when coalesce(e.pension_base,0) > 0 then \'{}\'::text[] else \'{pension_base}\'::text[] end);\n  end if;\n';
  r4 text := E'  -- 251: pension_hoy trae los tres caminos (hoy · Mod 40 · Mod 10) que escribe n8n v5.8 en `mod40_caminos`.\n  if not ya_pens and e.ley = \'Ley73\' and e.edad >= 60 and coalesce(e.semanas,0) >= 500 and derechos_ok then\n    v_caminos := e.kv->\'mod40_caminos\'->\'v\';\n    v_regimen := e.kv->\'mod40_regimen\'->>\'v\';\n    v_linea := trol3._linea_caminos(v_caminos);\n    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, \'pension_hoy\',\n            nullif(coalesce(e.pension_base,0),0) * 12,\n            jsonb_build_object(\'pension_mensual\', e.pension_base, \'edad\', e.edad, \'semanas\', e.semanas,\n                               \'regimen_mod40\', v_regimen, \'caminos\', v_caminos),\n            case when coalesce(e.pension_base,0) > 0\n                 then \'Cumple edad, semanas y derechos: tramitar la pensión\' || coalesce(\' · \' || v_linea, \'\')\n                 else \'Cumple edad, semanas y derechos: tramitar la pensión; falta calcular cuánto le toca\' end,\n            null,\n            case when coalesce(e.pension_base,0) > 0 then \'{}\'::text[] else \'{pension_base}\'::text[] end);\n  end if;\n';
  f5_ini text := E'  -- 206: una sola Modalidad 40.';
  f5_fin text := E'  -- 206: crédito a pensionados';
  r5 text := E'  -- 251: mod40_retro APAGADA (acuerdo DOF 21-oct-2026, claude/106). Sin retro no hay servicio\n  -- que ejecutar; los tres caminos (hoy · Mod 40 · Mod 10) van en pension_hoy.\n\n';
  p_ini int; p_fin int;
begin
  src := pg_get_functiondef('trol3.evaluar_persona'::regproc);
  if position('251: mod40_retro APAGADA' in src) > 0 then raise notice '251 ya aplicada'; return; end if;
  foreach n in array array[1,2,3,4] loop
    if (length(src) - length(replace(src, (array[f1,f2,f3,f4])[n], ''))) / length((array[f1,f2,f3,f4])[n]) <> 1 then
      raise exception '251: el fragmento % no aparece exactamente una vez en evaluar_persona', n;
    end if;
  end loop;
  p_ini := position(f5_ini in src); p_fin := position(f5_fin in src);
  if p_ini = 0 or p_fin = 0 or p_fin < p_ini then raise exception '251: no se encontró el bloque de Mod 40'; end if;
  src := substr(src, 1, p_ini - 1) || r5 || substr(src, p_fin);
  src := replace(src, f1, r1);
  src := replace(src, f2, '');
  src := replace(src, f3, '');
  src := replace(src, f4, r4);
  execute src;
  raise notice '251: evaluar_persona reescrita (% chars)', length(src);
end $mig$;
