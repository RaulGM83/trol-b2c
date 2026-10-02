-- 208 · cambio_afore con AFORE conocida (1-oct-2026). Decisión de Raul: las «mejores» son
-- Profuturo y SURA. Caso Jorge Antonio Miramontes: declaró Inbursa con $2.45 M y la 206 le
-- cerró la oportunidad porque "ya sabíamos la AFORE" sin comparar contra nada.
--
-- Regla:
--   · AFORE desconocida y saldo RCV97 > saldo_min → `posible` (falta afore_actual), como en 206.
--   · AFORE conocida, saldo > saldo_min y NO está en umbrales.afore_top → `detectada`.
--   · AFORE conocida y en afore_top → no es oportunidad (se cierra no_aplica).
-- La comparación ignora mayúsculas y busca la palabra dentro del nombre
-- ("Profuturo GNP", "AFORE SURA").

do $$
declare def text; a text; b text;
begin
  perform set_config('trol3.skip_reeval', '1', true);
  execute $q$update trol3.catalogo_oportunidades
             set umbrales = (coalesce(umbrales,'{}'::jsonb) - 'top_n') || '{"afore_top":["profuturo","sura"]}'::jsonb,
                 descripcion = 'Saldo RCV97 mayor a 400,000. AFORE desconocida: posible (se pregunta en el paso 0). AFORE conocida y fuera de las mejores (umbrales.afore_top: Profuturo, SURA): detectada. Si ya está en una de las mejores no es oportunidad.',
                 siguiente_paso = 'Si no sabemos la AFORE, preguntarla en el paso 0. Si está fuera de Profuturo/SURA, comparativo con su historia (es simulación: «rondaría») y traspaso con agente certificado. Nunca prometer rendimiento.'
           where codigo = 'cambio_afore'$q$;

  def := pg_get_functiondef('trol3.evaluar_persona(uuid)'::regprocedure);

  a := '  if e.afore_actual is null and e.saldo_rcv97 is not null and e.saldo_rcv97 > afore_saldo_min then' || E'\n' ||
       '    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, ''cambio_afore'', null, jsonb_build_object(''saldo_rcv97'', e.saldo_rcv97), ''Saldo de ''||trol3.mxn(e.saldo_rcv97)||'' y no sabemos la AFORE: preguntarla y comparar'', null, ''{afore_actual}'', ''posible'');' || E'\n' ||
       '  end if;';
  if position(a in def) = 0 then raise exception '208: ancla cambio_afore no encontrada'; end if;
  b := '  if e.saldo_rcv97 is not null and e.saldo_rcv97 > afore_saldo_min then' || E'\n' ||
       '    if e.afore_actual is null then' || E'\n' ||
       '      codigos := codigos || trol3._up_op(p_id, e.cabecera_id, ''cambio_afore'', null, jsonb_build_object(''saldo_rcv97'', e.saldo_rcv97), ''Saldo de ''||trol3.mxn(e.saldo_rcv97)||'' y no sabemos la AFORE: preguntarla y comparar'', null, ''{afore_actual}'', ''posible'');' || E'\n' ||
       '    elsif not exists (select 1 from jsonb_array_elements_text(coalesce(afore_top, ''["profuturo","sura"]''::jsonb)) t(nombre)' || E'\n' ||
       '                      where position(lower(t.nombre) in lower(e.afore_actual)) > 0) then' || E'\n' ||
       '      -- 208: AFORE conocida y fuera de las mejores (Profuturo, SURA).' || E'\n' ||
       '      codigos := codigos || trol3._up_op(p_id, e.cabecera_id, ''cambio_afore'', null, jsonb_build_object(''saldo_rcv97'', e.saldo_rcv97, ''afore_actual'', e.afore_actual), ''Está en ''||e.afore_actual||'' con ''||trol3.mxn(e.saldo_rcv97)||'': comparar contra Profuturo/SURA'', null);' || E'\n' ||
       '    end if;' || E'\n' ||
       '  end if;';
  def := replace(def, a, b);

  -- umbral afore_top junto a afore_saldo_min
  a := '  afore_saldo_min := coalesce((u->>''saldo_min'')::numeric, 400000);';
  if position(a in def) = 0 then raise exception '208: ancla afore_saldo_min no encontrada'; end if;
  def := replace(def, a, a || E'\n' || '  afore_top := u->''afore_top'';');
  a := '        afore_saldo_min numeric; cp_min numeric;';
  if position(a in def) = 0 then raise exception '208: ancla declare no encontrada'; end if;
  def := replace(def, a, '        afore_saldo_min numeric; cp_min numeric; afore_top jsonb;');

  execute def;
  perform set_config('trol3.skip_reeval', '', true);
end $$;
