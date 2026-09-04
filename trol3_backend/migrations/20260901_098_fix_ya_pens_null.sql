-- 098 - Bug de la migracion 094: `ya_pens := (e.estatus_nomina = 'pensionado')`
-- da NULL, no false, cuando la persona nunca se verifico en la nomina del IMSS
-- (13,248 de 14,233 expedientes). Y `not NULL` es NULL, asi que todas las
-- guardas `if not ya_pens and ...` quedaban en NULL y NO disparaban:
-- pension_hoy, mod40_retro, mod40_prospectiva, reactivar_derechos y
-- entender_situacion desaparecian para quien no hubieramos barrido en
-- Credifintech. Peor: la limpieza final de evaluar_persona las cerraba como
-- no_aplica en cuanto la persona se reevaluaba por cualquier motivo. Las
-- oportunidades que seguian vivas eran restos anteriores a 094, no resultado
-- del motor actual.
--
-- El arreglo es un coalesce. No verificado = no sabemos que este pensionado =
-- se le siguen ofreciendo las oportunidades, que es lo que 094 quiso preservar.

create or replace function trol3.evaluar_persona(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'trol3', 'public'
as $function$
declare e record; codigos text[] := '{}'; u_mej jsonb; mej_min numeric; mej_max numeric; ident text;
        um text; m40_vencida boolean := false; ya_pens boolean := false;
begin
  select * into e from trol3.v_expediente where persona_id = p_id;
  if not found then return '{}'::jsonb; end if;
  select umbrales into u_mej from trol3.catalogo_oportunidades where codigo = 'mejoravit_activo';
  mej_min := coalesce((u_mej->>'saldo_min')::numeric, 20000); mej_max := coalesce((u_mej->>'saldo_max')::numeric, 349999);
  select valor#>>'{}' into ident from trol3.v_mejor_dato where persona_id = p_id and campo = 'estatus_identidad';
  select valor#>>'{}' into um from trol3.v_mejor_dato where persona_id = p_id and campo = 'ultima_modalidad';
  m40_vencida := (um = 'mod40' and e.limite_mod40 is not null and e.limite_mod40 < current_date);
  -- 094: verificado en la nómina de pensiones del IMSS. No es lo mismo que
  -- status_empleo='pensionado' (declarado por el cliente o supuesto).
  -- 098: coalesce obligatorio. estatus_nomina null = no verificado, NO pensionado.
  ya_pens := coalesce(e.estatus_nomina = 'pensionado', false);

  if ident = 'por_confirmar' then perform trol3._ck(p_id, 'cuenta_sin_inconsistencias','alerta','alta','Confirma tu CURP: no encontramos tu información oficial con ella');
  elsif e.inconsistencia_imss is not null then perform trol3._ck(p_id, 'cuenta_sin_inconsistencias','alerta','alta', e.inconsistencia_imss);
  elsif e.ley is null and e.consultas_fallidas > 0 then perform trol3._ck(p_id, 'cuenta_sin_inconsistencias','alerta','alta','No fue posible obtener información del IMSS ('||e.consultas_fallidas||' intentos fallidos)');
  elsif e.ley is not null then perform trol3._ck(p_id, 'cuenta_sin_inconsistencias','ok','baja',null);
  else perform trol3._ck(p_id, 'cuenta_sin_inconsistencias','sin_dato','media','Sin consulta IMSS'); end if;

  if e.semanas_validadas is not null and e.semanas_declaradas is not null and e.semanas_declaradas - e.semanas_validadas >= 26 then
    perform trol3._ck(p_id, 'semanas_reconocidas','alerta','media','Declara '||e.semanas_declaradas||' semanas vs '||e.semanas_validadas||' reconocidas');
  elsif e.semanas_validadas is not null then perform trol3._ck(p_id, 'semanas_reconocidas','ok','baja',null);
  else perform trol3._ck(p_id, 'semanas_reconocidas','sin_dato','media','Sin semanas validadas'); end if;

  if e.afore_actual is null then perform trol3._ck(p_id, 'afore_top','sin_dato','baja','No sabemos tu AFORE');
  else perform trol3._ck(p_id, 'afore_top','ok','baja',e.afore_actual); end if;

  if e.cuenta_registrada is false then perform trol3._ck(p_id, 'cuenta_registrada','alerta','media','Cuenta AFORE sin registrar (CDA)');
  elsif e.cuenta_registrada is true then perform trol3._ck(p_id, 'cuenta_registrada','ok','baja',null);
  else perform trol3._ck(p_id, 'cuenta_registrada','sin_dato','baja',null); end if;

  if ya_pens then perform trol3._ck(p_id, 'derechos_vigentes','no_aplica','baja','Ya está pensionado');
  elsif e.ley = 'Ley97' then perform trol3._ck(p_id, 'derechos_vigentes','no_aplica','baja',null);
  elsif e.ley = 'Ley73' and e.conserva_derechos is false then perform trol3._ck(p_id, 'derechos_vigentes','alerta','alta','Derechos Ley 73 no vigentes');
  elsif e.ley = 'Ley73' and e.fin_conservacion is not null and e.fin_conservacion < current_date + 180 then perform trol3._ck(p_id, 'derechos_vigentes','alerta','alta','Derechos vencen '||e.fin_conservacion);
  elsif e.ley = 'Ley73' then perform trol3._ck(p_id, 'derechos_vigentes','ok','baja',null);
  else perform trol3._ck(p_id, 'derechos_vigentes','sin_dato','media',null); end if;

  if e.etapa in ('asesorado','cliente') then perform trol3._ck(p_id, 'situacion_entendida','ok','baja',null);
  else perform trol3._ck(p_id, 'situacion_entendida','alerta','baja','Pendiente sesión con asesor'); end if;

  if e.ley_en is null then perform trol3._ck(p_id, 'datos_vigentes','sin_dato','media',null);
  elsif e.ley_vigente is false then perform trol3._ck(p_id, 'datos_vigentes','alerta','media','Datos IMSS de '||to_char(e.ley_en,'DD-Mon-YYYY')||'; conviene actualizar');
  else perform trol3._ck(p_id, 'datos_vigentes','ok','baja',null); end if;

  if ident <> 'por_confirmar' or ident is null then
    if e.inconsistencia_imss is not null or (e.ley is null and e.consultas_fallidas > 0) then
      codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'inconsistencia_imss', null, '{}'::jsonb, coalesce(e.inconsistencia_imss,'Sin información IMSS tras consultas fallidas'), null);
    end if;
  end if;
  if e.semanas_validadas is not null and e.semanas_declaradas is not null and e.semanas_declaradas - e.semanas_validadas >= 26 then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'reconocimiento_semanas', null, jsonb_build_object('delta_semanas', e.semanas_declaradas - e.semanas_validadas), 'Posibles semanas no reconocidas', null);
  end if;
  if e.cuenta_registrada is false then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'cuenta_sin_registrar', null, '{}'::jsonb, 'Cuenta AFORE no registrada', null);
  end if;
  -- 094: reactivar derechos no aplica a quien ya está pensionado.
  if not ya_pens and e.ley = 'Ley73' and (e.conserva_derechos is false or (e.fin_conservacion is not null and e.fin_conservacion < current_date + 180)) then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'reactivar_derechos', coalesce(e.pension_base,0)*12, jsonb_build_object('pension_base', e.pension_base, 'fin_conservacion', e.fin_conservacion),
            case when e.conserva_derechos is false then 'Derechos no vigentes: reactivar para pensión Ley 73' else 'Derechos por vencer' end, e.fin_conservacion);
  end if;
  if e.afore_actual is null and e.saldo_rcv97 is not null and e.saldo_rcv97 > 50000 then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'cambio_afore', null, jsonb_build_object('saldo_rcv97', e.saldo_rcv97), 'Falta conocer la AFORE para comparar rendimiento', null, '{afore_actual}', 'posible');
  end if;
  -- 094: no se le ofrece pensionarse a quien la nómina del IMSS ya le paga.
  -- 097: ser candidato depende de edad + semanas + derechos. Que todavía no le
  -- hayamos calculado el monto es un dato faltante nuestro, no una razón para
  -- ocultarle que ya cumple los requisitos.
  if not ya_pens and e.ley = 'Ley73' and e.edad >= 60 and coalesce(e.semanas,0) >= 500 and coalesce(e.conserva_derechos,true) then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'pension_hoy',
            nullif(coalesce(e.pension_base,0),0) * 12,
            jsonb_build_object('pension_mensual', e.pension_base, 'edad', e.edad, 'semanas', e.semanas),
            case when coalesce(e.pension_base,0) > 0
                 then 'Cumple edad, semanas y derechos para pensionarse'
                 else 'Cumple edad, semanas y derechos para pensionarse; falta calcular cuánto le toca' end,
            null,
            case when coalesce(e.pension_base,0) > 0 then '{}'::text[] else '{pension_base}'::text[] end);
  end if;
  if not ya_pens and e.ley = 'Ley73' and coalesce(e.mod40_retro_aplica,false) and coalesce(e.pension_mod40_retro,0) > coalesce(e.pension_base,0) and not m40_vencida then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'mod40_retro', (e.pension_mod40_retro - coalesce(e.pension_base,0))*12,
            jsonb_build_object('pension_base', e.pension_base, 'pension_mod40', e.pension_mod40_retro, 'costo_retro', e.costo_retro, 'ultima_modalidad', um),
            case when um = 'mod40'
                 then 'Reingreso Mod 40 (baja de continuación voluntaria): ventana de 12 meses vence '||coalesce(e.limite_mod40::text,'?')||'; +'||round(e.pension_mod40_retro - coalesce(e.pension_base,0))||' MXN/mes'
                 else 'Mod 40 retroactiva aplica hoy: +'||round(e.pension_mod40_retro - coalesce(e.pension_base,0))||' MXN/mes' end,
            e.limite_mod40);
  end if;
  if not ya_pens and e.ley = 'Ley73' and e.edad < 60 and coalesce(e.pension_mod40_futuro,0) > coalesce(e.pension_base,0) * 1.15 and not m40_vencida then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'mod40_prospectiva', (e.pension_mod40_futuro - coalesce(e.pension_base,0))*12,
            jsonb_build_object('pension_base', e.pension_base, 'pension_mod40_futuro', e.pension_mod40_futuro, 'ultima_modalidad', um),
            case when um = 'mod40'
                 then 'Cotizar en Mod 40 mejora la pensión; reingreso en ventana de 12 meses, vence '||coalesce(e.limite_mod40::text,'?')
                 else 'Cotizar en Mod 40 mejora la pensión' end,
            case when um = 'mod40' then e.limite_mod40 else null end);
  end if;
  if not ya_pens and m40_vencida and coalesce(e.edad,0) < 60 then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'entender_situacion', null,
            jsonb_build_object('ultima_modalidad', um, 'limite_mod40', e.limite_mod40),
            'Ventana de reingreso a Mod 40 vencida ('||coalesce(e.limite_mod40::text,'?')||'): requiere 52 semanas en régimen obligatorio; revisar estrategia', null);
  end if;
  -- 094: liquidez para pensionados, con la capacidad real de la nómina.
  if ya_pens and coalesce(e.capacidad_credito,0) > 350 then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'credito_pension', e.capacidad_credito*12,
            jsonb_build_object('capacidad_mensual', e.capacidad_credito, 'pension_liquida', e.pension_nomina_liquida,
                               'pension_bruta', e.pension_nomina_bruta, 'prestamos_activos', e.prestamos_nomina),
            'Pensionado con capacidad de $'||round(e.capacidad_credito)||' al mes sobre su pensión', null);
  end if;
  if e.status_empleo = 'empleado' and coalesce(e.credito_infonavit,false) = false and coalesce(e.saldo_infonavit,0) between mej_min and mej_max then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'mejoravit_activo', e.saldo_infonavit, jsonb_build_object('saldo_infonavit', e.saldo_infonavit), 'Cotizando con saldo Infonavit < 350k y sin crédito: Mejoravit', null);
  end if;
  if e.status_empleo = 'empleado' and coalesce(e.saldo_infonavit,0) >= 500000 and coalesce(e.credito_infonavit,false) = false then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'credito_infonavit_activo', e.saldo_infonavit, jsonb_build_object('saldo_infonavit', e.saldo_infonavit), 'Saldo Infonavit alto sin crédito vigente', null);
  end if;
  -- 097: se retira retiro_infonavit_pension. La subcuenta de vivienda se sigue
  -- recuperando al pensionarse; simplemente dejó de ser una tarjeta en /mi.
  if e.status_empleo = 'empleado' and e.edad < 60 and coalesce(e.saldo_infonavit,0) between 150000 and 499999 and coalesce(e.credito_infonavit,false) = false then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'compra_inmueble', e.saldo_infonavit, jsonb_build_object('saldo_infonavit', e.saldo_infonavit), 'Capacidad de crédito Infonavit para vivienda', null);
  end if;
  if e.expectativa_pension is not null and coalesce(e.pension_base,0) > 0 and e.expectativa_pension > e.pension_base * 1.2 then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'ahorro_voluntario', (e.expectativa_pension - e.pension_base)*12, jsonb_build_object('brecha_mensual', e.expectativa_pension - e.pension_base), 'Brecha entre pensión estimada y expectativa', null);
  end if;
  if coalesce(e.dependientes,0) > 0 and coalesce(e.tiene_seguro,false) = false then
    codigos := codigos || trol3._up_op(p_id, e.cabecera_id, 'seguros', null, jsonb_build_object('dependientes', e.dependientes), 'Dependientes sin cobertura declarada', null);
  end if;

  update trol3.oportunidades o set estado = 'no_aplica', cerrada_en = now()
  where o.persona_id = p_id and o.estado in ('posible','detectada') and not (o.codigo = any(codigos));

  return jsonb_build_object('oportunidades', coalesce(array_length(codigos,1),0), 'identidad', ident, 'ya_pensionado', ya_pens);
end $function$;
