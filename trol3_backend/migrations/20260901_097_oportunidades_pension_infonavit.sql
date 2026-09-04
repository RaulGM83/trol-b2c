-- 097 — Oportunidades visibles en /mi: fuera "Retiro de Infonavit al pensionarse",
-- y "pension_hoy" pasa a llamarse "Candidato a pensionarse" con la regla ampliada.
--
-- Decisiones (Raúl, 1-sep-2026):
--  1. retiro_infonavit_pension se apaga y sus oportunidades abiertas se cierran
--     como no_aplica. El retiro de la subcuenta de vivienda sigue siendo real,
--     pero como oportunidad en el tablero del cliente no aporta: se disparaba
--     para 2,073 personas por el solo hecho de tener saldo y 60 años, así que
--     competía con lo que sí requiere decisión.
--  2. pension_hoy deja de exigir que el motor ya le haya calculado un monto
--     (pension_base > 0). Quien cumple edad + semanas + derechos ES candidato
--     aunque todavía no sepamos cuánto le toca; el monto faltante se declara en
--     datos_faltantes y el motivo lo dice explícitamente.

-- 1. Catálogo -----------------------------------------------------------------
update trol3.catalogo_oportunidades
   set activo = false
 where codigo = 'retiro_infonavit_pension';

update trol3.catalogo_oportunidades
   set nombre = 'Candidato a pensionarse',
       descripcion = 'Ley 73, 60 años o más, 500+ semanas y derechos vigentes: ya cumple los requisitos para iniciar el trámite.'
 where codigo = 'pension_hoy';

-- 2. Motor --------------------------------------------------------------------
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
  ya_pens := (e.estatus_nomina = 'pensionado');

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

-- 3. Cierre masivo de la oportunidad retirada ---------------------------------
update trol3.oportunidades
   set estado = 'no_aplica', cerrada_en = now(),
       nota_estado = coalesce(nota_estado, 'Cerrada por migración 097: la oportunidad se retiró del catálogo')
 where codigo = 'retiro_infonavit_pension'
   and estado in ('posible','detectada','presentada');

-- 4. Guarda en /mi: una oportunidad inactiva en el catálogo no debe pintarse ---
-- mi_misiones unía contra catalogo_oportunidades sin mirar `activo`, así que
-- apagar una del catálogo no bastaba para sacarla de la pantalla. Ahora sí.
create or replace function trol3.mi_misiones()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'trol3', 'public'
as $function$
declare pid uuid := trol3.current_persona_id(); e record; m jsonb := '[]'::jsonb; ck jsonb; ult record; falt int; puede_ahorrar boolean; inf_credito boolean; inf_saldo boolean; inf_ok boolean; clabe text; instr text; inf_detalle text;
        cot_issste boolean; st_issste text; issste_activa boolean; ident text; msg_ident text;
begin
  if pid is null then return null; end if;
  select * into e from trol3.v_expediente where persona_id = pid;
  select jsonb_object_agg(item, estado) into ck from trol3.checklist_items where persona_id = pid;
  select * into ult from trol3.consultas c where c.persona_id = pid and c.tipo in ('imss_historial','calculo_base') order by created_at desc limit 1;
  select count(*) into falt from trol3.catalogo_campos c where c.editable_cliente and c.visible_cliente and c.grupo = 'contexto' and not exists (select 1 from trol3.datos d where d.persona_id = pid and d.campo = c.campo);
  select trol3.jbool(valor) into puede_ahorrar from trol3.v_mejor_dato v where v.persona_id = pid and v.campo = 'puede_recibir_ahorro';
  select trol3.jbool(valor) into cot_issste from trol3.v_mejor_dato v where v.persona_id = pid and v.campo = 'cotiza_issste';
  select d.valor#>>'{}' into st_issste from trol3.datos d where d.persona_id = pid and d.campo='status_issste' and d.capa='validado' and coalesce(d.vigente_hasta,'infinity') > now() order by d.obtenido_en desc limit 1;
  issste_activa := exists (select 1 from trol3.consultas cx where cx.persona_id = pid and cx.tipo='issste' and cx.estado in ('solicitada','en_proceso'));
  select valor#>>'{}' into ident from trol3.v_mejor_dato v where v.persona_id = pid and v.campo = 'estatus_identidad';
  select valor#>>'{}' into msg_ident from trol3.v_mejor_dato v where v.persona_id = pid and v.campo = 'inconsistencia_imss';

  inf_credito := exists (select 1 from trol3.datos d where d.persona_id = pid and d.campo = 'credito_infonavit_vigente' and d.origen_tipo in ('cliente','asesor','bot'));
  inf_saldo := exists (select 1 from trol3.datos d where d.persona_id = pid and d.campo = 'saldo_infonavit'
                        and d.capa in ('declarado','validado') and (d.vigente_hasta is null or d.vigente_hasta > now()));
  inf_ok := inf_credito and inf_saldo;
  inf_detalle := case
    when inf_ok then null
    when not inf_saldo and e.saldo_infonavit_estimado is not null
      then 'Con tu historial de salarios estimamos alrededor de $'||to_char(round(e.saldo_infonavit_estimado), 'FM999,999,999')||'. Ese número nos sirve para ver qué puertas se te abren, pero para armarte una propuesta formal necesitamos el saldo real: consúltalo en mi cuenta Infonavit y dínoslo.'
    when not inf_saldo then 'Consulta tu saldo en mi cuenta Infonavit y compártelo: con el dato real podemos armarte una propuesta formal.'
    else 'Falta decirnos si ya usaste tu crédito.' end;

  select valor into clabe from trol3.config where clave = 'millas_clabe'; select valor into instr from trol3.config where clave = 'millas_instrucciones';

  m := m || jsonb_build_object('nivel',1,'codigo','curp','titulo','Comparte tu CURP','por_que','Con tu CURP buscamos tu información oficial en el IMSS y en la CONSAR sin costo para ti.','esfuerzo','1 minuto','puntos',20,'estado', case when e.curp is not null then 'hecho' else 'pendiente' end,'cta','curp');

  -- Solo aparece cuando el IMSS no reconoció la CURP. Es gratis y puede
  -- resolver el caso completo sin que intervenga nadie.
  if ident = 'por_confirmar' then
    m := m || jsonb_build_object('nivel',1,'codigo','curp_confirmar','titulo','Confirma que tu CURP está bien escrita',
      'por_que','El IMSS no encontró a nadie con esa CURP. Casi siempre es un carácter mal capturado; corregirlo no cuesta nada y volvemos a buscar de inmediato.',
      'esfuerzo','1 minuto','puntos',0,'estado','atencion','detalle', msg_ident,'curp', e.curp,'cta','curp_confirmar');
  elsif ident = 'confirmada_con_problema' then
    m := m || jsonb_build_object('nivel',1,'codigo','curp_confirmar','titulo','Tu CURP es correcta pero el IMSS no la reconoce',
      'por_que','Confirmaste que tu CURP viene así en tu documento. Eso significa que el problema está en cómo quedó registrada tu cuenta, y hay que revisarlo con un experto.',
      'esfuerzo','Con tu experto','puntos',0,'estado','atencion','detalle', msg_ident,'curp', e.curp,'cta','hablar');
  end if;

  m := m || jsonb_build_object('nivel',1,'codigo','info_oficial','titulo','Obtener tu información oficial del IMSS','por_que','Semanas, régimen y salario reales: la base de todo.','esfuerzo','Nosotros lo hacemos','puntos',0,
        'estado', case when e.ley is not null and e.ley_capa = 'validado' then 'hecho' when e.curp is null then 'bloqueado' when ult.estado in ('solicitada','en_proceso') then 'en_proceso' when ident = 'por_confirmar' then 'bloqueado' when ult.estado in ('error','sin_resultado') or ck->>'cuenta_sin_inconsistencias' = 'alerta' then 'atencion' else 'pendiente' end,
        'detalle', case
            when ident = 'por_confirmar' then 'En cuanto confirmes o corrijas tu CURP volvemos a buscar.'
            when ident = 'confirmada_con_problema' then 'Tu CURP es correcta y aun así no aparece: tu experto te explica qué hay que corregir en tu cuenta.'
            when ult.estado in ('error','sin_resultado') or ck->>'cuenta_sin_inconsistencias' = 'alerta' then 'No pudimos obtener tu información: puede haber una inconsistencia en tu cuenta. Tu experto te ayuda a resolverlo.' else null end,
        'cta', case when e.curp is null then null when ident = 'por_confirmar' then null when ult.estado in ('error','sin_resultado') or ck->>'cuenta_sin_inconsistencias' = 'alerta' then 'hablar' else 'consulta_imss' end);

  m := m || jsonb_build_object('nivel',1,'codigo','issste','titulo','¿Has cotizado en el gobierno (ISSSTE)?','por_que','Si trabajaste en gobierno puedes tener años y derechos adicionales que cambian tu estrategia de pensión. Con tu CURP lo consultamos sin costo.','esfuerzo','1 minuto','puntos',10,
        'estado', case when cot_issste is false then 'hecho' when st_issste is not null then 'hecho' when issste_activa then 'en_proceso' when cot_issste is true then 'en_proceso' when e.curp is null then 'pendiente' else 'pendiente' end,
        'detalle', case when st_issste is not null then 'Resultado: '||st_issste||' en el ISSSTE.' when issste_activa or cot_issste is true then 'Estamos consultando tu historial en el ISSSTE; te avisamos cuando llegue.' when cot_issste is false then null else null end,
        'cta', case when cot_issste is null then 'issste' else null end);
  m := m || jsonb_build_object('nivel',1,'codigo','infonavit','titulo','Dinos el saldo real de tu Infonavit','por_que','Nosotros lo estimamos con tu historial de salarios, pero sólo tu cuenta tiene el número real. De ese saldo depende cuánto crédito te toca y cuánto recuperas al pensionarte.','esfuerzo','2 minutos','puntos',10,'estado', case when inf_ok then 'hecho' else 'pendiente' end,'detalle', inf_detalle,'cta','infonavit');
  m := m || jsonb_build_object('nivel',1,'codigo','contexto','titulo','Cuéntanos de ti','por_que','Tu meta, tus ingresos aproximados y tus dependientes cambian qué te conviene. Puedes saltarte lo que no quieras contestar.','esfuerzo','2 minutos','puntos',5*falt,'estado', case when falt = 0 then 'hecho' else 'pendiente' end,'detalle', case when falt > 0 then falt||' datos por completar' end,'cta','completar');
  m := m || jsonb_build_object('nivel',1,'codigo','semanas','titulo','Revisar que todas tus semanas estén reconocidas','por_que','Cada semana no reconocida baja tu pensión.','esfuerzo','Con tu experto','puntos',0,'estado', case when ck->>'semanas_reconocidas' = 'ok' then 'hecho' when ck->>'semanas_reconocidas' = 'alerta' then 'atencion' when e.ley is null then 'bloqueado' else 'pendiente' end,'cta','hablar');
  m := m || jsonb_build_object('nivel',1,'codigo','afore','titulo','Conocer y evaluar tu AFORE','por_que','La AFORE correcta puede darte más rendimiento sin que hagas nada más.','esfuerzo','1 minuto','puntos',50,'estado', case when e.afore_actual is not null then 'hecho' else 'pendiente' end,'cta','afore');
  m := m || jsonb_build_object('nivel',1,'codigo','cuenta_registrada','titulo','Tener tu cuenta AFORE registrada','por_que','Sin registro no puedes ahorrar ni hacer trámites. Lo validamos con la CONSAR.','esfuerzo','Trámite','puntos',0,
        'estado', case when coalesce(puede_ahorrar,false) or ck->>'cuenta_registrada' = 'ok' then 'hecho' when ck->>'cuenta_registrada' = 'alerta' then 'atencion' when e.curp is null then 'bloqueado' else 'en_proceso' end,
        'detalle', case when coalesce(puede_ahorrar,false) or ck->>'cuenta_registrada' = 'ok' then 'Validado con la CONSAR: tu cuenta está registrada.' when ck->>'cuenta_registrada' = 'alerta' then 'Tu cuenta aparece sin registrar; tu experto te dice cómo resolverlo.' when e.curp is not null then 'Lo estamos validando con la CONSAR.' end,'cta','hablar');
  m := m || jsonb_build_object('nivel',1,'codigo','entender','titulo','Entender tu situación con un experto','por_que','15 minutos que ordenan todo lo demás.','esfuerzo','Llamada','puntos',100,'estado', case when e.etapa in ('asesorado','cliente') then 'hecho' when exists (select 1 from trol3.citas c where c.persona_id = pid and c.estado='programada' and c.inicio > now()) then 'en_proceso' else 'pendiente' end,'cta','agendar');
  select m || coalesce(jsonb_agg(jsonb_build_object('nivel', co.nivel, 'codigo', 'op:'||o.codigo, 'titulo', co.nombre, 'por_que', coalesce(o.motivo, co.descripcion), 'valor', o.valor_estimado, 'esfuerzo', 'Con tu experto', 'puntos', 0,
        'estado', case o.estado when 'ganada' then 'hecho' when 'en_proceso' then 'en_proceso' when 'presentada' then 'recomendada' else 'pendiente' end, 'urgencia', o.urgencia_fecha, 'cta', 'hablar') order by co.nivel, o.valor_estimado desc nulls last), '[]'::jsonb)
    into m from trol3.oportunidades o join trol3.catalogo_oportunidades co on co.codigo = o.codigo where o.persona_id = pid and o.estado in ('detectada','presentada','en_proceso','ganada') and co.nivel in (2,3) and co.activo;
  m := m || jsonb_build_object('nivel',2,'codigo','referir','titulo','Invita a alguien que también quiera su pensión en claro','por_que','Ganas 100 puntos cuando llegue a su diagnóstico y 300 si contrata.','esfuerzo','1 minuto','puntos',100,'estado','pendiente','cta','referir');
  if coalesce(puede_ahorrar,false) then
    m := m || jsonb_build_object('nivel',3,'codigo','ahorro_millas','titulo','Ahorrar para tu retiro con Millas para el Retiro','por_que','Tu cuenta ya puede recibir ahorro voluntario: cada peso extra crece con el rendimiento de tu AFORE y es deducible.','esfuerzo','Una transferencia','puntos',0,'estado','pendiente','cta','ahorrar','detalle', coalesce(instr,''), 'clabe', nullif(clabe,''));
  end if;
  return m;
end $function$;
