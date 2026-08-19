// ============================================================================
// Motor de asesoría Infonavit — convertir el saldo de la Subcuenta de Vivienda
// en una inversión inmobiliaria antes del retiro, en vez de dejarlo al ~4% anual.
//
// Puerto literal de `motor_asesoria.mjs`, validado celda a celda contra la hoja
// `Asesoria` de Trol_Asesoria_Infonavit_v4_2.xlsx. NO cambiar la aritmética sin
// volver a correr los casos golden: cada número aquí sostiene una propuesta que
// se le entrega a un cliente.
//
// Reglas de negocio incorporadas (ver Producto_Infonavit_Contexto.md §3):
//  1. Plazo = MIN(30, 70 − edad del titular mayor). En conyugal manda el mayor.
//  2. El crédito financia escrituración + notariales del crédito, menos el saldo aplicado.
//  3. La aportación patronal del 5% se aplica al crédito sólo mientras se cotiza.
//  4. El flujo de renta usa la retención REAL de cada mes, no `renta − PMT` constante.
//  5. Ley 73: el saldo vuelve en efectivo. Ley 97: se convierte en pensión y conserva
//     su valor salvo que la persona quedara en PMG (`conserva_valor` por titular).
//  6. La venta se modela libre de ISR (exención de casa habitación, LISR 93-XIX).
//  7. Verificación interna: bloques ≡ efectivo − notariales − contrafactual.
// ============================================================================

/** Tabla oficial Infonavit por nivel salarial mensual (3.69% – 10.45%). */
export const TASAS_INFONAVIT: ReadonlyArray<{ salario_desde: number; tasa: number }> = [
  { salario_desde: 0, tasa: 0.0369 }, { salario_desde: 9272.19, tasa: 0.0388 },
  { salario_desde: 9628.81, tasa: 0.0407 }, { salario_desde: 9985.44, tasa: 0.0426 },
  { salario_desde: 10342.06, tasa: 0.0445 }, { salario_desde: 10698.68, tasa: 0.0464 },
  { salario_desde: 11055.3, tasa: 0.0483 }, { salario_desde: 11411.93, tasa: 0.0502 },
  { salario_desde: 11768.55, tasa: 0.0521 }, { salario_desde: 12125.17, tasa: 0.054 },
  { salario_desde: 12481.79, tasa: 0.0559 }, { salario_desde: 12838.42, tasa: 0.0578 },
  { salario_desde: 13195.04, tasa: 0.0596 }, { salario_desde: 13551.66, tasa: 0.0615 },
  { salario_desde: 13908.28, tasa: 0.0634 }, { salario_desde: 14264.91, tasa: 0.0653 },
  { salario_desde: 14621.53, tasa: 0.0672 }, { salario_desde: 14978.15, tasa: 0.0691 },
  { salario_desde: 15334.77, tasa: 0.071 }, { salario_desde: 15691.4, tasa: 0.0729 },
  { salario_desde: 16048.02, tasa: 0.0748 }, { salario_desde: 16404.64, tasa: 0.0767 },
  { salario_desde: 16761.26, tasa: 0.0786 }, { salario_desde: 17117.89, tasa: 0.0805 },
  { salario_desde: 17474.51, tasa: 0.0819 }, { salario_desde: 17831.13, tasa: 0.0833 },
  { salario_desde: 18187.75, tasa: 0.0847 }, { salario_desde: 18544.37, tasa: 0.0861 },
  { salario_desde: 18901, tasa: 0.0876 }, { salario_desde: 19257.62, tasa: 0.089 },
  { salario_desde: 19614.24, tasa: 0.0904 }, { salario_desde: 19970.86, tasa: 0.0918 },
  { salario_desde: 20327.49, tasa: 0.0932 }, { salario_desde: 20684.11, tasa: 0.0946 },
  { salario_desde: 21040.73, tasa: 0.096 }, { salario_desde: 21397.35, tasa: 0.0974 },
  { salario_desde: 21753.98, tasa: 0.0989 }, { salario_desde: 22110.6, tasa: 0.1003 },
  { salario_desde: 22467.22, tasa: 0.1017 }, { salario_desde: 22823.84, tasa: 0.1031 },
  { salario_desde: 23180.47, tasa: 0.1045 },
];

export interface TitularInfonavit {
  /** 73 | 97. Un titular vacío (crédito individual) va en 0. */
  regimen: number;
  /** Años, con decimales: define el plazo del crédito. */
  edad: number;
  /** Salario MENSUAL registrado ante el IMSS (SBC diario × 30.4, topado a 25 UMA). */
  salario_imss: number;
  /** Saldo de la Subcuenta de Vivienda. */
  ssv: number;
  /** Meses que seguirá cotizando: mientras cotiza, la aportación patronal amortiza. */
  meses_cotizando: number;
  /** Ingreso real mensual, para el tope de deducción de intereses reales. */
  ingreso_real: number;
  /** Otras deducciones personales anuales que ya usa (compiten por el mismo tope). */
  deducciones_usadas: number;
  /** Ley 97: proporción del saldo que conserva valor. 1.0 salvo que quedara en PMG. */
  conserva_valor: number;
}

export interface ClienteInfonavit {
  titulares: TitularInfonavit[];
  /** Sustituye a la tasa ponderada calculada. */
  tasa_manual?: number;
}

export interface InmuebleInfonavit {
  avaluo: number;
  escrituracion: number;
  costo_aliado: number;
  renta: number;
  plusvalia: number;
  /** Siempre se financian dentro del crédito: suben monto, retención e intereses. */
  notariales_credito: number;
  /** Si el aliado no los cubre, el cliente los paga de contado al inicio. */
  notariales_adicionales: number;
  comision_desarrollador: number;
  aliado_cubre_notariales: boolean;
}

export interface SupuestosInfonavit {
  r_ssv: number;
  inflacion: number;
  aport_patronal: number;
  mantenimiento: number;
  gestion: number;
  aplica_gestion: boolean;
  comision_venta: number;
  base_plusvalia: 'escrituracion' | 'avaluo';
  uma_mensual: number;
  monto_max_credito: number;
  horizontes: number[];
  max_meses_motor: number;
}

export interface PalancasInfonavit {
  plusvalia: number;
  alterno: number;
  pct_deuda: number;
  tasa_deuda: number;
  corte_anios: number;
}

export const SUPUESTOS_DEFAULT: SupuestosInfonavit = {
  r_ssv: 0.04, inflacion: 0.04, aport_patronal: 0.05,
  mantenimiento: 0.10, gestion: 0.20, aplica_gestion: true,
  comision_venta: 0.05, base_plusvalia: 'escrituracion',
  uma_mensual: 3586.68, monto_max_credito: 2935002,
  horizontes: [18, 24, 36, 60], max_meses_motor: 96,
};

export const PALANCAS_DEFAULT: PalancasInfonavit = {
  plusvalia: 0.06, alterno: 0.08, pct_deuda: 0.20, tasa_deuda: 0.20, corte_anios: 10,
};

const T2_VACIO: TitularInfonavit = {
  regimen: 0, edad: 0, salario_imss: 0, ssv: 0,
  meses_cotizando: 0, ingreso_real: 0, deducciones_usadas: 0, conserva_valor: 1.0,
};

export function tasaInfonavit(salario: number): number {
  if (salario <= 0) return 0;
  let tasa = TASAS_INFONAVIT[TASAS_INFONAVIT.length - 1].tasa;
  for (const f of TASAS_INFONAVIT) {
    if (salario >= f.salario_desde) tasa = f.tasa; else break;
  }
  return tasa;
}

interface ClienteDerivado {
  ssv_total: number; salario: number; aport_mensual: number; tasa: number; plazo: number;
  tope_deduccion: number; marginal: number; monto_max: number; meses_cot: number;
  t1: TitularInfonavit; t2: TitularInfonavit;
}

function derivarCliente(cliente: ClienteInfonavit, sup: SupuestosInfonavit): ClienteDerivado {
  const t1 = cliente.titulares[0];
  const t2 = cliente.titulares[1] ?? T2_VACIO;
  const ssv_total = t1.ssv + t2.ssv;
  const salario = t1.salario_imss + t2.salario_imss;
  const aport = t1.salario_imss * sup.aport_patronal * (t1.meses_cotizando > 0 ? 1 : 0)
              + t2.salario_imss * sup.aport_patronal * (t2.meses_cotizando > 0 ? 1 : 0);
  const tasa1 = tasaInfonavit(t1.salario_imss);
  const tasa2 = t2.salario_imss > 0 ? tasaInfonavit(t2.salario_imss) : 0;
  let tasa: number;
  if (cliente.tasa_manual) tasa = cliente.tasa_manual;
  else if (salario === 0) tasa = TASAS_INFONAVIT[TASAS_INFONAVIT.length - 1].tasa;
  else tasa = (tasa1 * t1.salario_imss + tasa2 * t2.salario_imss) / salario;
  // En crédito conyugal el plazo lo determina el titular de MAYOR edad.
  const plazo = Math.max(1, Math.min(30, 70 - Math.max(t1.edad, t2.edad)));
  const ingresoAnual = Math.max(t1.ingreso_real ?? 0, t2.ingreso_real ?? 0) * 12;
  // LISR 151-IV: menor entre 15% del ingreso anual y 5 UMA anuales, neto de lo ya usado.
  const topeDeduccion = Math.max(0, Math.min(ingresoAnual * 0.15, 5 * sup.uma_mensual * 12)
    - Math.max(t1.deducciones_usadas ?? 0, t2.deducciones_usadas ?? 0));
  const marginal = ingresoAnual > 3_000_000 ? 0.35 : ingresoAnual > 1_300_000 ? 0.34
                 : ingresoAnual > 1_000_000 ? 0.32 : 0.30;
  const dos = t1.salario_imss > 0 && t2.salario_imss > 0;
  return {
    ssv_total, salario, aport_mensual: aport, tasa, plazo,
    tope_deduccion: topeDeduccion, marginal,
    // Infonavit SUMA el monto máximo de cada titular en crédito conyugal.
    monto_max: sup.monto_max_credito * (dos ? 2 : 1),
    meses_cot: Math.max(t1.meses_cotizando, t2.meses_cotizando), t1, t2,
  };
}

export interface OperacionInfonavit {
  esc: number; base: number; renta_neta: number; saldo_apl: number; remanente: number;
  credito: number; pmt: number; not_credito: number; not_cliente: number;
  pct_salario: number; flujo_mensual: number;
}

function operacion(dc: ClienteDerivado, inm: InmuebleInfonavit, sup: SupuestosInfonavit): OperacionInfonavit {
  const esc = inm.escrituracion;
  const base = sup.base_plusvalia === 'avaluo' ? inm.avaluo : esc;
  const renta_neta = inm.renta * (1 - sup.mantenimiento)
                   - inm.renta * sup.gestion * (sup.aplica_gestion ? 1 : 0);
  const K = inm.notariales_credito;
  const saldo_apl = Math.min(dc.ssv_total, esc + K);
  // Si el SSV supera escrituración + notariales, el sobrante SIGUE en Infonavit.
  const remanente = Math.max(0, dc.ssv_total - esc - K);
  const credito = Math.max(0, esc + K - dc.ssv_total);
  let pmt = 0;
  if (credito > 0) {
    const i = dc.tasa / 12, n = dc.plazo * 12;
    pmt = credito * i / (1 - Math.pow(1 + i, -n)); // sistema francés
  }
  const not_cliente = inm.aliado_cubre_notariales ? 0 : inm.notariales_adicionales;
  return {
    esc, base, renta_neta, saldo_apl, remanente, credito, pmt,
    not_credito: K, not_cliente,
    pct_salario: dc.salario ? pmt / dc.salario : 0,
    flujo_mensual: renta_neta - pmt,
  };
}

interface SerieMotor {
  saldo: number[]; interes_acum: number[]; flujo_acum: number[]; aport: number[];
  mes_liquida: number | null;
}

function simularMotor(op: OperacionInfonavit, dc: ClienteDerivado, sup: SupuestosInfonavit): SerieMotor {
  const meses = sup.max_meses_motor;
  const i = dc.tasa / 12;
  let saldo = op.credito, intAcum = 0, flujoAcum = 0;
  const S: SerieMotor = { saldo: [0], interes_acum: [0], flujo_acum: [0], aport: [0], mes_liquida: null };
  for (let m = 1; m <= meses; m++) {
    let interes = 0, ret = 0, aport = 0;
    if (op.credito > 0) {
      interes = saldo * i;
      ret = Math.min(op.pmt, saldo + interes);
      aport = Math.min(m <= dc.meses_cot ? dc.aport_mensual : 0,
                       Math.max(0, saldo + interes - ret));
      saldo = Math.max(0, saldo + interes - ret - aport);
    }
    intAcum += interes;
    // OJO: la retención REAL del mes, no la PMT nominal. Al liquidarse el crédito
    // la retención es cero y la renta queda íntegra (error #1 del contexto).
    flujoAcum += op.esc !== 0 ? op.renta_neta - ret : 0;
    S.saldo.push(saldo); S.interes_acum.push(intAcum);
    S.flujo_acum.push(flujoAcum); S.aport.push(aport);
    if (S.mes_liquida === null && op.credito > 0 && saldo <= 0) S.mes_liquida = m;
  }
  return S;
}

function fvAportaciones(dc: ClienteDerivado, sup: SupuestosInfonavit, t: number): number {
  const r = sup.r_ssv, mc = Math.min(t, dc.meses_cot);
  if (r === 0) return dc.aport_mensual * mc;
  const f = (Math.pow(1 + r, mc / 12) - 1) / (Math.pow(1 + r, 1 / 12) - 1);
  return dc.aport_mensual * f * Math.pow(1 + r, (t - mc) / 12);
}

function isrDevuelto(motor: SerieMotor, dc: ClienteDerivado, sup: SupuestosInfonavit, t: number): number {
  const factorReal = dc.tasa ? Math.max(0, (dc.tasa - sup.inflacion) / dc.tasa) : 0;
  return Math.min(motor.interes_acum[t] * factorReal, dc.tope_deduccion * t / 12) * dc.marginal;
}

/** No hacer nada: el saldo y las aportaciones creciendo al ritmo de Infonavit. */
function contrafactual(dc: ClienteDerivado, sup: SupuestosInfonavit, t: number): number {
  const r = sup.r_ssv;
  let saldo = 0;
  for (const ti of [dc.t1, dc.t2]) {
    const f = ti.regimen === 97 ? (ti.conserva_valor ?? 1) : 1;
    saldo += ti.ssv * f;
  }
  return saldo * Math.pow(1 + r, t / 12) + fvAportaciones(dc, sup, t);
}

function efectivoVenta(op: OperacionInfonavit, motor: SerieMotor, dc: ClienteDerivado, sup: SupuestosInfonavit, g: number, t: number): number {
  return op.base * Math.pow(1 + g, t / 12) * (1 - sup.comision_venta)
    - motor.saldo[t] + motor.flujo_acum[t]
    + isrDevuelto(motor, dc, sup, t)
    + op.remanente * Math.pow(1 + sup.r_ssv, t / 12);
}

export interface FilaHorizonte {
  horizonte: number;
  bloques: {
    I_inmueble: number; II_financiamiento: number; III_oportunidad: number; IV_rescate: number;
    detalle: {
      plusvalia_100: number; descuento: number; renta_acum: number; comision_venta: number;
      notariales_credito: number; notariales_cliente: number; intereses: number;
      isr_devuelto: number; oportunidad_saldo: number; aportaciones_netas: number;
    };
  };
  ventaja_venta: number;
  plusvalia_equilibrio: number;
  rendimiento_conservar_12m: number | null;
  efectivo: number;
  valor_liquidez: number;
  ventaja_corte: number;
}

export interface ResultadoInfonavit {
  cliente_derivado: {
    ssv_total: number; salario: number; aport_mensual: number; tasa: number; plazo: number;
    tope_deduccion: number; marginal: number; monto_max: number;
  };
  operacion: OperacionInfonavit;
  mes_liquida_credito: number | null;
  tabla: FilaHorizonte[];
  tasa_combinada: number;
  contrafactual_corte: number;
  veredicto: {
    mejor_horizonte: number; plusvalia_equilibrio: number;
    fuente_dominante: string; lectura_salida: string;
  };
  /** Informativas, NUNCA bloqueantes: son material de conversación, no un semáforo. */
  senales: string[];
}

export function calcular(
  cliente: ClienteInfonavit,
  inmueble: InmuebleInfonavit,
  supuestos?: Partial<SupuestosInfonavit> | null,
  palancas?: Partial<PalancasInfonavit> | null,
): ResultadoInfonavit {
  const sup: SupuestosInfonavit = { ...SUPUESTOS_DEFAULT, ...(supuestos ?? {}) };
  const pal: PalancasInfonavit = { ...PALANCAS_DEFAULT, ...(palancas ?? {}) };
  const g = pal.plusvalia;
  const dc = derivarCliente(cliente, sup);
  const op = operacion(dc, inmueble, sup);
  const motor = simularMotor(op, dc, sup);
  const r = sup.r_ssv;

  const tabla: FilaHorizonte[] = [];
  for (const t of sup.horizontes) {
    const x = Math.pow(1 + g, t / 12);
    const plusv100 = op.base * (x - 1);
    const descuento = op.base - op.esc;
    const rentaAc = op.renta_neta * t;
    const comision = -op.base * x * sup.comision_venta;
    const b1 = plusv100 + descuento + rentaAc + comision - op.not_credito - op.not_cliente;
    const intereses = -motor.interes_acum[t];
    const isr = isrDevuelto(motor, dc, sup, t);
    const b2 = intereses + isr;
    let aportAplicadas = 0;
    for (let m = 1; m <= t; m++) aportAplicadas += motor.aport[m];
    const aportNeta = aportAplicadas - fvAportaciones(dc, sup, t);
    const oportSaldo = -op.saldo_apl * (Math.pow(1 + r, t / 12) - 1);
    const b3 = oportSaldo + aportNeta;
    let rescate = 0;
    for (const ti of [dc.t1, dc.t2])
      if (ti.regimen === 97) rescate += ti.ssv * (1 - (ti.conserva_valor ?? 1));
    const b4 = rescate * Math.pow(1 + r, t / 12);
    const ventaja = b1 + b2 + b3 + b4;
    const efv = efectivoVenta(op, motor, dc, sup, g, t);
    const cf = contrafactual(dc, sup, t);
    // Si esto no da cero, hay un error de cableado: no seguir con números falsos.
    const check = ventaja - (efv - op.not_cliente - cf);
    if (Math.abs(check) > 0.01) throw new Error(`check != 0 en t=${t}: ${check}`);
    const num = op.esc + op.not_credito + op.not_cliente - rentaAc - b2 - b3 - b4;
    const equilibrio = num <= 0 ? 0
      : Math.pow(num / (op.base * (1 - sup.comision_venta)), 12 / t) - 1;
    const efv12 = efectivoVenta(op, motor, dc, sup, g, t + 12);
    const marginal12 = efv ? efv12 / efv - 1 : null;
    const mesesCorte = Math.max(0, pal.corte_anios * 12 - t);
    const aDeuda = pal.pct_deuda * Math.max(0, efv);
    const aAlterno = Math.max(0, efv) - aDeuda;
    const valorCorte = aDeuda * Math.pow(1 + pal.tasa_deuda, mesesCorte / 12)
                     + aAlterno * Math.pow(1 + pal.alterno, mesesCorte / 12);
    const ritmoInf = Math.max(0, efv) * Math.pow(1 + r, mesesCorte / 12);
    tabla.push({
      horizonte: t,
      bloques: {
        I_inmueble: b1, II_financiamiento: b2, III_oportunidad: b3, IV_rescate: b4,
        detalle: {
          plusvalia_100: plusv100, descuento, renta_acum: rentaAc,
          comision_venta: comision, notariales_credito: -op.not_credito,
          notariales_cliente: -op.not_cliente, intereses, isr_devuelto: isr,
          oportunidad_saldo: oportSaldo, aportaciones_netas: aportNeta,
        },
      },
      ventaja_venta: ventaja, plusvalia_equilibrio: equilibrio,
      rendimiento_conservar_12m: marginal12, efectivo: efv,
      valor_liquidez: valorCorte - ritmoInf,
      ventaja_corte: valorCorte - op.not_cliente - contrafactual(dc, sup, pal.corte_anios * 12),
    });
  }

  const tasaCombinada = pal.pct_deuda * pal.tasa_deuda + (1 - pal.pct_deuda) * pal.alterno;
  let mejor = 0;
  tabla.forEach((f, k) => { if (f.ventaja_corte > tabla[mejor].ventaja_corte) mejor = k; });
  let salida: number | null = null;
  for (const f of tabla)
    if (f.rendimiento_conservar_12m !== null && f.rendimiento_conservar_12m < tasaCombinada) {
      salida = f.horizonte; break;
    }
  const det = tabla[mejor].bloques.detalle;
  const fuentes: Record<string, number> = {
    plusvalia: det.plusvalia_100 + det.descuento, renta: det.renta_acum,
    fiscal: det.isr_devuelto, rescate: tabla[mejor].bloques.IV_rescate,
    liquidez: tabla[mejor].valor_liquidez,
  };
  const dominante = Object.entries(fuentes).sort((a, b) => b[1] - a[1])[0][0];

  const senales: string[] = [];
  if (op.credito > dc.monto_max) senales.push('credito_excede_monto_maximo');
  if (op.pct_salario > 0.30) senales.push('retencion_arriba_30pct');
  if (op.flujo_mensual < 0) senales.push(`desembolso_mensual:${(-op.flujo_mensual).toFixed(0)}`);
  if (op.not_cliente > 0) senales.push(`notariales_cliente:${op.not_cliente.toFixed(0)}`);
  const edadTermino = Math.max(dc.t1.edad, dc.t2.edad) + dc.plazo;
  // Que el crédito rebase la edad de pensión NO bloquea: es dato de conversación.
  senales.push(`edad_al_termino:${edadTermino.toFixed(1)}`);

  return {
    cliente_derivado: {
      ssv_total: dc.ssv_total, salario: dc.salario,
      aport_mensual: dc.aport_mensual, tasa: dc.tasa, plazo: dc.plazo,
      tope_deduccion: dc.tope_deduccion, marginal: dc.marginal, monto_max: dc.monto_max,
    },
    operacion: op, mes_liquida_credito: motor.mes_liquida,
    tabla, tasa_combinada: tasaCombinada,
    contrafactual_corte: contrafactual(dc, sup, pal.corte_anios * 12),
    veredicto: {
      mejor_horizonte: tabla[mejor].horizonte,
      plusvalia_equilibrio: tabla[mejor].plusvalia_equilibrio,
      fuente_dominante: dominante,
      lectura_salida: salida !== null ? `vender cerca del mes ${salida}`
        : `conservar al menos ${sup.horizontes[sup.horizontes.length - 1]} meses`,
    },
    senales,
  };
}
