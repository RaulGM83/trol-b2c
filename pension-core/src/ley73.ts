// ============================================================================
// Motor Ley 73 — port fiel de la hoja "Calculadora 73" del Excel CALCULADORA.
// Cada bloque cita la celda original. Validado contra el Excel en __tests__.
// ============================================================================

import {
  AJUSTE_EDAD,
  COSTO_MOD10,
  COSTO_MOD40_FUTURO,
  COSTO_MOD40_RETRO,
  CUANTIAS_LEY73,
  PMG_LEY73,
  REDONDEO_INCREMENTO,
  SALARIO_MINIMO,
  UMA,
} from './tablas';
import type { DesgloseRetro, EntradaCalculo, ResultadoLey73 } from './types';
import {
  addDias,
  addMeses,
  DIAS_ANIO,
  DIAS_ANIO_RETIRO,
  DIAS_MES,
  DIAS_MES_PENSION,
  diasDelMes,
  diasEntre,
  inicioMes,
  inpcMes,
  lookupAprox,
  mesAnterior,
  parseISO,
  porAnio,
  round,
} from './util';

const MESES_BASE_250 = 57; // el Excel pondera el salario de 250 semanas sobre 57 meses
const MAX_MESES_SERIE_RETRO = 60; // filas 5:64
const MAX_MESES_SERIE_FUTURA = 199; // filas 5:203

/** Serie de meses retroactivos: del mes actual hacia atrás hasta la última cotización. */
function mesesRetro(hoy: Date, ultimaCot: Date): Date[] {
  const out: Date[] = [];
  let m = inicioMes(hoy); // M5
  while (out.length < MAX_MESES_SERIE_RETRO) {
    out.push(m);
    // M6 = IF((M5-H6)<0,"",mes anterior): continúa mientras el mes actual >= última cot.
    if (diasEntre(ultimaCot, m) < 0) break;
    m = mesAnterior(m);
  }
  return out;
}

export function computeLey73(entrada: EntradaCalculo): ResultadoLey73 {
  const { perfil, salario_60m, palancas } = entrada;
  const hoy = entrada.hoy ?? new Date();
  const anioHoy = hoy.getUTCFullYear();

  const fnac = parseISO(perfil.fecha_nacimiento);
  const edadActual = diasEntre(fnac, hoy) / DIAS_ANIO; // D12
  const edadRetiro = Math.max(palancas.edadRetiro, Math.max(60, edadActual)); // C21
  const fechaRetiro = addDias(hoy, (edadRetiro - edadActual) * DIAS_ANIO_RETIRO - 1); // D22
  const pct = palancas.pctTiempoCotizando; // C24
  const salarioMod40 = palancas.salarioMod40; // C26

  // H6: última cotización (si está empleado, hoy)
  const ultimaCotValida = parseISO(perfil.fechas.ultima_cotizacion_valida);
  const ultimaCotMod40 = perfil.fechas.ultima_cotizacion_mod40
    ? parseISO(perfil.fechas.ultima_cotizacion_mod40)
    : null;
  const ultimaCot =
    perfil.status_empleo === 'empleado'
      ? hoy
      : ultimaCotMod40 && ultimaCotMod40 > ultimaCotValida
        ? ultimaCotMod40
        : ultimaCotValida;

  // C30/D31: Mod40 retroactivo hoy
  const aplicaRetroHoy = perfil.aplica_mod40 && diasEntre(hoy, ultimaCot) < 0;
  const semanasRecuperablesRetro = aplicaRetroHoy ? diasEntre(ultimaCot, hoy) / 7 : 0; // D31
  const recuperaRetro = aplicaRetroHoy && palancas.recuperarSemanasMod40Retro; // C33

  // D16: semanas vigentes hoy
  const sem = perfil.semanas;
  const semanasVigentes = sem.cotizadas - sem.descontadas + sem.recuperadas;

  // D36: semanas al retiro
  const semanasRetiro =
    (diasEntre(hoy, fechaRetiro) * pct) / 7 +
    semanasVigentes +
    (recuperaRetro ? semanasRecuperablesRetro : 0) +
    (palancas.recuperarSemanasDescontadas ? sem.descontadas - sem.recuperadas : 0);

  // ---- Promedios salariales ponderados (K3..K13) ----
  const mesesFuturos = Math.min(
    Math.round((diasEntre(hoy, fechaRetiro) / DIAS_MES) * pct),
    MESES_BASE_250,
  ); // K4
  const mesesRetroSal = Math.min(
    recuperaRetro ? Math.trunc((semanasRecuperablesRetro * 7) / DIAS_MES) : 0,
    MESES_BASE_250 - mesesFuturos,
  ); // K5
  const mesesPasados = Math.max(MESES_BASE_250 - mesesFuturos - mesesRetroSal, 0); // K3

  const prom = (vals: number[], n: number) => {
    const v = vals.slice(0, Math.max(n, 0));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  const scPasado = prom(salario_60m.map((m) => m.salario_diario), mesesPasados); // K6
  const smPasado = prom(salario_60m.map((m) => m.salario_minimo), mesesPasados); // K9

  // Serie retro (N/S): salario y salario mínimo por mes retroactivo
  const serieRetro = mesesRetro(hoy, ultimaCot);
  const salarioRetroMes = (m: Date) =>
    palancas.salarioCotizacionRetro === 'MINIMO'
      ? Math.max(porAnio(SALARIO_MINIMO, m.getUTCFullYear()), perfil.salario_diario_registrado) // N: MÍNIMO
      : porAnio(UMA, ultimaCot.getUTCFullYear()) * 25; // N: MÁXIMO (25 UMA del año de última cot.)
  const scRetro = prom(serieRetro.map(salarioRetroMes), serieRetro.length); // K7
  const smRetro = prom(
    serieRetro.map((m) => porAnio(SALARIO_MINIMO, m.getUTCFullYear())),
    serieRetro.length,
  ); // K11
  const smFuturo = porAnio(SALARIO_MINIMO, anioHoy - 1); // K10 (AJ38: SM del año previo)

  const salarioCot250 =
    (mesesPasados * scPasado + mesesFuturos * salarioMod40 + mesesRetroSal * scRetro) /
    MESES_BASE_250; // K8
  const salarioMin250 =
    (mesesPasados * smPasado + mesesFuturos * smFuturo + mesesRetroSal * smRetro) / 60; // K12 (÷60 en el Excel)
  const factorSalarial = Math.max(1, salarioCot250 / salarioMin250); // K13

  // ---- Pensión (D38..D43) ----
  const negativa = !(semanasRetiro > 500);
  const [, cuantia, incremento] = lookupAprox(
    factorSalarial,
    CUANTIAS_LEY73 as Array<[number, number, number]>,
  );
  const cuantiaBasica = negativa ? 0 : cuantia * salarioCot250 * 365 * 1.11; // D38
  const bloques = (semanasRetiro - 500) / 52;
  const fraccion = (bloques - Math.trunc(bloques)) * 52;
  const [, extra] = lookupAprox(fraccion, REDONDEO_INCREMENTO as Array<[number, number]>);
  const incrementos = negativa
    ? 0
    : incremento * salarioCot250 * 365 * 1.11 * (Math.trunc(bloques) + extra); // D39
  const asignaciones = (cuantiaBasica + incrementos) * 0.15; // D40
  const [, ajusteEdad] = lookupAprox(
    Math.round(edadRetiro),
    AJUSTE_EDAD as Array<[number, number]>,
  ); // D41
  const pensionCalculada = ((cuantiaBasica + incrementos + asignaciones) * ajusteEdad) / 12; // K15
  const pensionMinima =
    pct === 0
      ? porAnio(PMG_LEY73, ultimaCot.getUTCFullYear())
      : porAnio(PMG_LEY73, fechaRetiro.getUTCFullYear()); // K16
  const pensionMaxima = porAnio(UMA, anioHoy) * 25 * DIAS_MES_PENSION; // K17
  const pensionMensual = negativa
    ? null
    : round(Math.min(pensionMaxima, Math.max(pensionCalculada, pensionMinima)), -2); // D43

  // ---- Costo Mod40 retroactivo (P/Q/R → D47..D49) ----
  let retro: DesgloseRetro | null = null;
  if (recuperaRetro) {
    const m5 = inicioMes(hoy);
    const inpcHoy = inpcMes(m5);
    let cuotaBase = 0,
      actualizaciones = 0,
      recargos = 0;
    serieRetro.forEach((m, i) => {
      const salarioMensual = salarioRetroMes(m) * diasDelMes(m); // O
      const p = lookupAprox(m.getUTCFullYear(), objToPairs(COSTO_MOD40_RETRO))[1] * salarioMensual; // P
      const q = (inpcHoy / inpcMes(m) - 1) * p; // Q
      const r = i === 0 ? 0 : (p + q) * 0.0147 * (diasEntre(m, m5) / DIAS_MES_PENSION); // R
      cuotaBase += p;
      actualizaciones += q;
      recargos += r;
    });
    retro = {
      meses: serieRetro.length,
      cuotaBase,
      actualizaciones,
      recargos,
      total: cuotaBase + actualizaciones + recargos,
    };
  }

  // ---- Costo estrategia futura (V..AB → D50, D53, D54) ----
  const mesesFuturosSerie: Date[] = [];
  for (let i = 1; i <= MAX_MESES_SERIE_FUTURA; i++) {
    const v = addMeses(hoy, i); // V
    if (diasEntre(v, fechaRetiro) <= 0) break;
    mesesFuturosSerie.push(v);
  }
  // El countdown X del Excel deja fuera el último mes de la serie (el "+X6"
  // sobre el texto " " produce error→0), así que se costean total-1 meses.
  const mesesActivos = mesesFuturosSerie.slice(0, Math.max(mesesFuturosSerie.length - 1, 0));
  const total = mesesActivos.length;
  let costoEstrategiaFutura = 0;
  let costoMensualPrimerMes = 0;
  let modalidadPrimerMes: 10 | 40 | null = null;
  mesesActivos.forEach((v, i) => {
    const x = total - i; // X: meses restantes al retiro
    const y = x > 60 ? porAnio(SALARIO_MINIMO, anioHoy) : salarioMod40; // Y
    const z = y * diasDelMes(v); // Z
    const modalidad: 10 | 40 =
      diasEntre(ultimaCot, v) / 365 > 5 ? 10 : x > 60 ? 10 : 40; // AA
    const anio = v.getUTCFullYear();
    let costo: number; // AB
    if (modalidad === 10) {
      const [, tasa, inc] = lookupAprox(y, COSTO_MOD10 as Array<[number, number, number]>);
      costo = (tasa + inc * (anio - 2024)) * z;
    } else {
      costo =
        (COSTO_MOD40_FUTURO.tasa2024 +
          COSTO_MOD40_FUTURO.incrementoAnual *
            Math.min(anio - COSTO_MOD40_FUTURO.anioBase, COSTO_MOD40_FUTURO.maxAniosIncremento)) *
        z;
    }
    if (i === 0) {
      costoMensualPrimerMes = costo;
      modalidadPrimerMes = modalidad;
    }
    costoEstrategiaFutura += costo;
  });
  costoEstrategiaFutura *= pct; // D50

  const advertenciaConservacion =
    !perfil.conserva_derechos && diasEntre(hoy, fechaRetiro) < 365; // D44

  return {
    ley: 'Ley73',
    pensionMensual,
    negativa,
    detalle: {
      edadActual,
      fechaRetiro,
      semanasRetiro,
      salarioCot250,
      salarioMin250,
      factorSalarial,
      cuantiaBasica,
      incrementos,
      asignaciones,
      ajusteEdad,
      pensionMinima,
      pensionMaxima,
      advertenciaConservacion,
    },
    retro,
    aplicaRetroHoy,
    semanasRecuperablesRetro,
    costoEstrategiaFutura,
    costoMensualPrimerMes,
    modalidadPrimerMes,
    costoTotal: (retro?.total ?? 0) + costoEstrategiaFutura, // D51
  };
}

function objToPairs(rec: Record<number, number>): Array<[number, number]> {
  return Object.entries(rec)
    .map(([k, v]) => [Number(k), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);
}
