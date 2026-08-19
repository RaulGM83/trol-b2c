// ============================================================================
// Motor Ley 97 — port fiel de la hoja "Calculadora 97" del Excel CALCULADORA.
// Proyección mensual de saldo AFORE (cuotas + rendimiento 3% real) y pensión
// por renta vitalicia (URV) contra la PMG. Celdas citadas en comentarios.
// ============================================================================

import {
  CESANTIA97_ANIOS,
  CESANTIA97_PCT,
  PMG97_ANIO_REFERENCIA,
  PMG97_GRUPOS,
  PMG97_SEMANAS_MINIMAS,
  UMA,
  URV,
} from './tablas';
import type {
  EntradaCalculo,
  EstatusPension97,
  RazonNegativa97,
  ResultadoLey97,
  SalidaNegativa97,
} from './types';
import {
  addDias,
  addMeses,
  DIAS_ANIO,
  DIAS_ANIO_RETIRO,
  DIAS_MES_PENSION,
  diasDelMes,
  diasEntre,
  lookupAprox,
  parseISO,
  porAnio,
} from './util';

const RENDIMIENTO_REAL = 1.03; // rendimiento real anual de la proyección
const MAX_MESES = 716; // filas 5:721
const FACTOR_RETIRO = 0.81; // castigo del Excel al convertir saldo→pensión
const CESANTIA_ANIO_TOPE = 2030;

function grupoPMG(ratio: number): number {
  return ratio < 2 ? 1 : ratio < 3 ? 2 : ratio < 4 ? 3 : ratio < 5 ? 4 : 5; // K8
}

function grupoCesantia(ratio: number): number {
  // K18 (sin el +1 del índice de fila de Excel): grupo 1..7
  return ratio < 1.5 ? 1 : ratio < 2 ? 2 : ratio < 2.5 ? 3 : ratio < 3 ? 4 : ratio < 3.5 ? 5 : ratio < 4 ? 6 : 7;
}

function cesantiaPct(grupo: number, anio: number): number {
  const a = Math.min(anio, CESANTIA_ANIO_TOPE);
  // HLOOKUP TRUE sobre años
  let idx = 0;
  CESANTIA97_ANIOS.forEach((y, i) => {
    if (y <= a) idx = i;
  });
  return CESANTIA97_PCT[grupo - 1][idx];
}

export function computeLey97(entrada: EntradaCalculo): ResultadoLey97 {
  const { perfil, saldos, palancas } = entrada;
  const hoy = entrada.hoy ?? new Date();
  const anioHoy = hoy.getUTCFullYear();

  const fnac = parseISO(perfil.fecha_nacimiento);
  const edadActual = diasEntre(fnac, hoy) / DIAS_ANIO; // D12
  const edadRetiro = Math.max(palancas.edadRetiro, Math.max(60, edadActual)); // C26
  const fechaRetiro = addDias(hoy, (edadRetiro - edadActual) * DIAS_ANIO_RETIRO - 1); // D27
  const pct = palancas.pctTiempoCotizando; // C29
  const salario = palancas.salarioMod40; // C31

  const sem = perfil.semanas;
  // K28: semanas para cálculo (+ descontadas si las recupera)
  const semanasCalculo =
    sem.cotizadas - sem.descontadas + sem.recuperadas +
    (palancas.recuperarSemanasDescontadas ? sem.descontadas - sem.recuperadas : 0);

  const mesesPasados = (sem.cotizadas * 7) / DIAS_MES_PENSION; // K3
  const mesesFuturos = (diasEntre(hoy, fechaRetiro) * pct) / DIAS_MES_PENSION; // K4
  const ratioPasado = perfil.ratio_historico_salario_uma; // K5
  const ratioFuturo = salario / porAnio(UMA, anioHoy - 1); // K6 (UMA del año previo, AI6)
  const ratioPonderado =
    (mesesPasados * ratioPasado + mesesFuturos * ratioFuturo) / (mesesPasados + mesesFuturos); // K7

  // ---- PMG (K8..K16) ----
  const grupo = grupoPMG(ratioPonderado);
  const [, pmgBase, extraAnio, extraSem] = PMG97_GRUPOS[grupo - 1]; // K9/K15/K13
  const semanasRetiro = ((semanasCalculo * 7) / DIAS_MES_PENSION + mesesFuturos) * (DIAS_MES_PENSION / 7); // K10
  const semanasMinimasPMG = porAnio(PMG97_SEMANAS_MINIMAS, fechaRetiro.getUTCFullYear()); // K11
  const bloquesExtra = Math.min(10, (semanasRetiro - semanasMinimasPMG) / 25); // K12
  const aniosExtra = Math.min(5, edadRetiro - 60); // K14
  const pmg =
    ((pmgBase + bloquesExtra * extraSem + aniosExtra * extraAnio) /
      porAnio(UMA, PMG97_ANIO_REFERENCIA)) *
    porAnio(UMA, anioHoy); // K16

  // ---- URV ----
  const fila = lookupAprox(edadRetiro, URV as Array<[number, number, number]>);
  const urv = perfil.sexo === 'H' ? fila[1] : fila[2]; // K17

  // ---- Proyección mensual de aportaciones (N..AC) ----
  const gCes = grupoCesantia(ratioFuturo); // K18 - 1
  const umaCuotaSocial = porAnio(UMA, anioHoy) * 4; // W: tope de cuota social
  const av = palancas.ahorroVoluntarioMensual; // C52
  let aportacionesFV = 0; // SUM(Y)
  let infonavitFV = 0; // SUM(AA)
  let ahorroVoluntarioFV = 0; // SUM(AC)
  const meses: Date[] = [];
  for (let i = 1; i <= MAX_MESES; i++) {
    const n = addMeses(hoy, i);
    if (diasEntre(n, fechaRetiro) <= 0) break;
    meses.push(n);
  }
  // El countdown P del Excel deja en 0 el último mes de la serie (IFERROR del encadenado).
  const mesesActivos = meses.slice(0, Math.max(meses.length - 1, 0));
  mesesActivos.forEach((n) => {
    const dias = diasDelMes(n);
    const rMensual = salario * dias; // R
    const aporte =
      rMensual * 0.02 * pct + // S: retiro 2%
      (cesantiaPct(gCes, n.getUTCFullYear()) / 100) * rMensual * pct + // T: cesantía patrón
      rMensual * 0.01125 * pct + // U: cesantía empleado
      rMensual * 0.00225 * pct + // V: cesantía gobierno
      (salario < umaCuotaSocial ? 7 * dias : 0) * pct; // W: cuota social
    const fv = Math.pow(RENDIMIENTO_REAL, diasEntre(n, fechaRetiro) / DIAS_ANIO);
    aportacionesFV += aporte * fv; // Y
    infonavitFV += rMensual * 0.05 * pct * fv; // Z→AA
    ahorroVoluntarioFV += av * fv; // AB→AC
  });

  // ---- Saldos proyectados (K19..K21) ----
  const fvHoy = Math.pow(RENDIMIENTO_REAL, diasEntre(hoy, fechaRetiro) / DIAS_ANIO);
  const rcvBase = palancas.overrides?.rcv97 ?? saldos.rcv97; // K25
  const infBase = palancas.overrides?.infonavit ?? saldos.infonavit; // K26
  const avBase = palancas.overrides?.ahorroVoluntario ?? saldos.ahorro_voluntario; // K27
  const saldoAfore = rcvBase * fvHoy + aportacionesFV; // K19
  const usaCredito = palancas.usaCreditoInfonavit || saldos.credito_infonavit_vigente; // C45
  const saldoInfonavit = (infBase * fvHoy + infonavitFV) * (usaCredito ? 0 : 1); // K20
  const saldoAV = avBase * fvHoy + ahorroVoluntarioFV; // K21

  // ---- Pensiones (K22..K24) ----
  const negativa = !(semanasRetiro > semanasMinimasPMG);
  const pensionAfore = negativa ? null : Math.max((saldoAfore / urv) * FACTOR_RETIRO / 12, pmg); // K22
  const pensionAforeInfonavit = negativa
    ? null
    : Math.max(((saldoAfore + saldoInfonavit) / urv) * FACTOR_RETIRO / 12, pmg); // K23
  const pensionTotal = negativa ? null : pensionAforeInfonavit! + saldoAV / urv / 12; // K24

  // La negativa es un RESULTADO, no un dato faltante: se acompaña de su razón
  // (semanas que tiene vs. las que exige su año de retiro) y de su salida
  // (Art. 154 LSS: retiro en una sola exhibición + devolución de vivienda).
  const status: EstatusPension97 = negativa ? 'negativa' : 'viable';
  // Las faltantes se derivan de las semanas YA REDONDEADAS que se muestran, no
  // del float: semanasRetiro pasa por meses y regresa (×7/30.4 ×30.4/7), y el
  // residuo hacía que "862 de 1,000" reportara 139 faltantes en vez de 138.
  const semanasAlRetiro = Math.round(semanasRetiro);
  const semanasFaltantes = Math.max(0, semanasMinimasPMG - semanasAlRetiro);
  const razon: RazonNegativa97 | null = negativa
    ? {
        anioRetiro: fechaRetiro.getUTCFullYear(),
        semanasActuales: Math.round(semanasCalculo),
        semanasAlRetiro,
        semanasRequeridas: semanasMinimasPMG,
        semanasFaltantes,
      }
    : null;
  const salida: SalidaNegativa97 | null = negativa
    ? {
        retiroUnaExhibicion: saldoAfore,
        devolucionVivienda: saldoInfonavit, // ya viene en 0 si hay crédito vigente
        ahorroVoluntario: saldoAV,
        total: saldoAfore + saldoInfonavit + saldoAV,
        semanasFaltantes,
      }
    : null;

  return {
    ley: 'Ley97',
    pensionAfore,
    pensionAforeInfonavit,
    pensionTotal,
    status,
    negativa,
    razon,
    salida,
    detalle: {
      edadActual,
      fechaRetiro,
      semanasRetiro,
      semanasMinimasPMG,
      saldoAforeProyectado: saldoAfore,
      saldoInfonavitProyectado: saldoInfonavit,
      saldoAhorroVoluntario: saldoAV,
      urv,
      pmg,
      aportacionesFuturas: aportacionesFV,
    },
  };
}

/**
 * Ley 97: qué proporción del saldo de la Subcuenta de Vivienda CONSERVA VALOR al pensionarse.
 *
 * El saldo se suma al AFORE y se convierte en pensión. Si la persona queda en Pensión Mínima
 * Garantizada, el sistema consume ese saldo pagando la pensión que de todos modos recibiría:
 * ahí el saldo no agrega nada y conviene rescatarlo antes (bloque IV de la asesoría Infonavit).
 *
 * 1 = lo conserva completo (está por encima de la PMG) · 0 = se consume entero.
 * Valores intermedios: sólo una parte del saldo la levanta por encima de la PMG.
 */
export function conservaValorSSV(r: ResultadoLey97): number {
  const { urv, saldoInfonavitProyectado: inf, saldoAforeProyectado: afore, pmg } = r.detalle;
  if (inf <= 0 || urv <= 0) return 1;
  const bruto = (inf / urv) * FACTOR_RETIRO / 12; // lo que aportaría si no hubiera piso
  if (bruto <= 0) return 1;
  const sinInf = Math.max((afore / urv) * FACTOR_RETIRO / 12, pmg);
  const conInf = Math.max(((afore + inf) / urv) * FACTOR_RETIRO / 12, pmg);
  return Math.min(1, Math.max(0, (conInf - sinInf) / bruto));
}
