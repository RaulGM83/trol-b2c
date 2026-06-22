// ============================================================================
// Proyecto Mod40 Retroactivo — port de la hoja "Mod40 Retroactivo" del Excel.
// Compara "sin proyecto" (escenario base) vs "con proyecto" (pagar Mod40
// retroactivo a 25 UMA) e itemiza los costos del despacho.
// ============================================================================

import {
  AJUSTE_EDAD,
  COSTO_MOD40_RETRO,
  CUANTIAS_LEY73,
  PMG_LEY73,
  REDONDEO_INCREMENTO,
  SALARIO_MINIMO,
  UMA,
  URV,
} from './tablas';
import { computeLey73 } from './ley73';
import type { EntradaCalculo, ProyectoMod40 } from './types';
import {
  addDias,
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

const MESES_BASE_250 = 57;
const MAX_MESES_RETRO = 60; // filas 5:64
const GESTORIAS = 80_000; // I13
const FINANCIAMIENTO_MESES = 6; // I19
const FINANCIAMIENTO_TASA = 0.047; // I20
const UMAS_PROYECTO_DEFAULT = 25; // F21
const MESES_CREDITO_DXN = 9; // I26 = pensión × 9 (Excel FAVH, jun-2026; antes ×8)

export interface EntradaProyecto extends EntradaCalculo {
  /**
   * Pensión mensual del escenario base (sin proyecto). Si se omite, se calcula
   * internamente con el motor Ley 73 (pct=0, sin recuperaciones, a la edad
   * mínima de retiro) — equivalente al "Escenario Base" del Excel.
   */
  pensionEscenarioBase?: number;
  /** Edad del escenario base (default: edad mínima de retiro). */
  edadEscenarioBase?: number;
  /** UMAs a las que se paga el proyecto (default 25 = tope). */
  umasProyecto?: number;
  /** Semanas extra a sumar al cálculo (C29 de la hoja, ej. semanas por reconocer). */
  semanasExtra?: number;
}

export function computeProyectoMod40(entrada: EntradaProyecto): ProyectoMod40 | null {
  const { perfil, saldos, salario_60m, palancas } = entrada;
  const hoy = entrada.hoy ?? new Date();
  const anioHoy = hoy.getUTCFullYear();

  const fnac = parseISO(perfil.fecha_nacimiento);
  const edadActual = diasEntre(fnac, hoy) / DIAS_ANIO; // C12
  const edadProyecto = Math.max(palancas.edadRetiro, Math.max(60, edadActual)); // F16
  const fechaRetiro = addDias(hoy, (edadProyecto - edadActual) * DIAS_ANIO_RETIRO - 1); // F17

  const ultimaCotValida = parseISO(perfil.fechas.ultima_cotizacion_valida);
  const ultimaCotMod40 = perfil.fechas.ultima_cotizacion_mod40
    ? parseISO(perfil.fechas.ultima_cotizacion_mod40)
    : null;
  const ultimaCot =
    perfil.status_empleo === 'empleado'
      ? hoy
      : ultimaCotMod40 && ultimaCotMod40 > ultimaCotValida
        ? ultimaCotMod40
        : ultimaCotValida; // O15

  const aplica = perfil.aplica_mod40 && diasEntre(hoy, ultimaCot) < 1; // F19
  if (!aplica) return null;

  const umasProyecto = entrada.umasProyecto ?? UMAS_PROYECTO_DEFAULT; // F21
  const semanasRec = diasEntre(ultimaCot, fechaRetiro) / 7; // F20: hasta la fecha de retiro
  const mesesRetroN = Math.trunc((semanasRec * 7) / DIAS_MES); // R5
  const mesesFuturos = 0; // R4 (R26 = 0% en la hoja)
  const mesesPasados = Math.max(MESES_BASE_250 - mesesFuturos - mesesRetroN, 0); // R3

  // ---- Serie retroactiva (T..AA), anclada en el MES DE RETIRO hacia atrás ----
  const salarioRetro = porAnio(UMA, ultimaCot.getUTCFullYear()) * umasProyecto; // U
  const t5 = inicioMes(fechaRetiro); // T5
  const inpcT5 = inpcMes(t5);
  const serie: Date[] = [];
  let m = t5;
  while (serie.length < MAX_MESES_RETRO) {
    serie.push(m);
    if (diasEntre(ultimaCot, m) < 0) break;
    m = mesAnterior(m);
  }
  let cuotaBase = 0, // ΣW → I7
    actualizaciones = 0, // ΣX → I8
    recargos = 0, // ΣY → I9
    retiro97 = 0; // ΣZ (2% que va a la AFORE)
  const costoPairs = Object.entries(COSTO_MOD40_RETRO)
    .map(([k, v]) => [Number(k), v] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  serie.forEach((mes, i) => {
    const vMensual = salarioRetro * diasDelMes(mes); // V
    const w = lookupAprox(mes.getUTCFullYear(), costoPairs)[1] * vMensual; // W
    const x = (inpcT5 / inpcMes(mes) - 1) * w; // X
    const y = i === 0 ? 0 : (w + x) * 0.0147 * (diasEntre(mes, t5) / DIAS_MES_PENSION); // Y
    cuotaBase += w;
    actualizaciones += x;
    recargos += y;
    retiro97 += vMensual * 0.02; // Z
  });
  const pagoImssTotal = cuotaBase + actualizaciones + recargos; // I10

  // ---- Pensión con proyecto (R6..R24 → L8) ----
  const prom = (vals: number[], n: number) => {
    const v = vals.slice(0, Math.max(n, 0));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  const scPasado = prom(salario_60m.map((s) => s.salario_diario), mesesPasados); // R6
  const smPasado = prom(salario_60m.map((s) => s.salario_minimo), mesesPasados); // R9
  const smRetro = prom(
    serie.map((s) => porAnio(SALARIO_MINIMO, s.getUTCFullYear())),
    serie.length,
  ); // R11
  const salarioCot250 = (mesesPasados * scPasado + mesesRetroN * salarioRetro) / MESES_BASE_250; // R8
  const salarioMin250 =
    (mesesPasados * smPasado + mesesFuturos * porAnio(SALARIO_MINIMO, anioHoy - 1) + mesesRetroN * smRetro) /
    60; // R12
  const factor = Math.max(1, salarioCot250 / salarioMin250); // R13

  const sem = perfil.semanas;
  const semanasVigentes = sem.cotizadas - sem.descontadas + sem.recuperadas; // C16
  const semanasExtra = entrada.semanasExtra ?? 0; // C29
  // R19. OJO: el Excel suma C14 (descontadas COMPLETAS), lo que doble-cuenta
  // las ya recuperadas. Regla de negocio (Raul, jun-2026): lo recuperable es
  // descontadas − recuperadas.
  const recuperables = Math.max(0, sem.descontadas - sem.recuperadas);
  const semanasRetiro =
    semanasVigentes +
    semanasExtra +
    semanasRec +
    (palancas.recuperarSemanasDescontadas ? recuperables : 0);

  const negativa = !(semanasRetiro > 500);
  const [, cuantia, incremento] = lookupAprox(
    factor,
    CUANTIAS_LEY73 as Array<[number, number, number]>,
  );
  const cuantiaBasica = cuantia * salarioCot250 * 365 * 1.11; // R21
  const bloques = (semanasRetiro - 500) / 52;
  const fraccion = (bloques - Math.trunc(bloques)) * 52;
  const [, extraSem] = lookupAprox(fraccion, REDONDEO_INCREMENTO as Array<[number, number]>);
  const incrementos = incremento * salarioCot250 * 365 * 1.11 * (Math.trunc(bloques) + extraSem); // R22
  const asignaciones = (cuantiaBasica + incrementos) * 0.15; // R23
  const [, ajuste] = lookupAprox(Math.round(edadProyecto), AJUSTE_EDAD as Array<[number, number]>); // R24
  const pensionCalc = ((cuantiaBasica + incrementos + asignaciones) * ajuste) / 12; // R15
  const pmg = porAnio(PMG_LEY73, ultimaCot.getUTCFullYear()); // R16 (pct futuro = 0)
  const tope = porAnio(UMA, anioHoy) * 25 * DIAS_MES_PENSION; // R17
  const pensionConProyecto = negativa
    ? 0
    : round(Math.min(tope, Math.max(pensionCalc, pmg)), -2); // L8

  // ---- Costos del despacho (H/I) ----
  // I14: escalonado por monto del pago IMSS (35% / 30% / 25%) — regla de
  // negocio confirmada por Raul; el Excel FAVH trae 30% plano por error.
  const gastosAdministrativos =
    pagoImssTotal < 375_000
      ? pagoImssTotal * 0.35
      : pagoImssTotal < 750_000
        ? pagoImssTotal * 0.3
        : pagoImssTotal * 0.25;
  const comisionApertura = (pagoImssTotal + GESTORIAS + gastosAdministrativos) * 0.03; // I15
  const costosTotal = GESTORIAS + gastosAdministrativos + comisionApertura; // I16
  const interes = (pagoImssTotal + costosTotal) * FINANCIAMIENTO_TASA * FINANCIAMIENTO_MESES; // I21
  // I22 del Excel suma meses + tasa + interés (verbatim para cuadrar con la hoja)
  const financiamientoTotal = FINANCIAMIENTO_MESES + FINANCIAMIENTO_TASA + interes; // I22
  const totalAPagar = pagoImssTotal + costosTotal + financiamientoTotal; // I25
  const creditoDxn = pensionConProyecto * MESES_CREDITO_DXN; // I26
  const retroactivoPension = pensionConProyecto * FINANCIAMIENTO_MESES; // I27
  const efectivoNeto = totalAPagar - creditoDxn - retroactivoPension; // I28

  // ---- Comparativo (E/F vs K/L) ----
  // Base "sin proyecto": de la entrada, o calculada con el motor Ley 73
  // (pct=0, sin recuperaciones, a la misma edad) = Escenario Base del Excel.
  let pensionBase = entrada.pensionEscenarioBase;
  let edadBase = entrada.edadEscenarioBase ?? edadProyecto;
  if (pensionBase === undefined) {
    const base = computeLey73({
      ...entrada,
      palancas: {
        ...palancas,
        edadRetiro: edadProyecto,
        pctTiempoCotizando: 0,
        recuperarSemanasDescontadas: false,
        recuperarSemanasMod40Retro: false,
      },
    });
    pensionBase = base.pensionMensual ?? 0;
    edadBase = edadProyecto;
  }
  const pensionSinProyecto = round(pensionBase, -2); // F8
  const filaUrv = lookupAprox(edadBase, URV as Array<[number, number, number]>);
  const anuidadBase = perfil.sexo === 'H' ? filaUrv[1] : filaUrv[2];
  const filaUrvProy = lookupAprox(edadProyecto, URV as Array<[number, number, number]>);
  const anuidadProy = perfil.sexo === 'H' ? filaUrvProy[1] : filaUrvProy[2];
  const valorPensionSin = round((anuidadBase * pensionSinProyecto * 12) / 0.8, -5); // F9
  const valorPensionCon = round((anuidadProy * pensionConProyecto * 12) / 0.8, -5); // L9
  // F10: efectivo al retiro sin proyecto = SAR92 + 30% del RCV97 + Infonavit.
  // OJO: el Excel aplica 0.3 DOS veces (C25 ya es RCV×0.3 y F10 lo vuelve a
  // multiplicar) → 9% efectivo. Regla de negocio confirmada por Raul (jun-2026):
  // es 30%. Aquí se aplica 30% — el Excel queda pendiente de corregir.
  const rcv = palancas.overrides?.rcv97 ?? saldos.rcv97;
  const sar = palancas.overrides?.sar92 ?? saldos.sar92;
  const inf = palancas.overrides?.infonavit ?? saldos.infonavit;
  const efectivoSin = round(sar + rcv * 0.3 + inf, -5); // F10 (corregido)
  const efectivoCon = efectivoSin + retiro97 - efectivoNeto; // L10
  const valorTotalSin = round(valorPensionSin + efectivoSin, -3); // F12
  const valorTotalCon = round(valorPensionCon + efectivoCon, -3); // L12

  return {
    sinProyecto: {
      pensionMensual: pensionSinProyecto,
      valorPension: valorPensionSin,
      valorTotal: valorTotalSin,
    },
    conProyecto: {
      pensionMensual: pensionConProyecto,
      valorPension: valorPensionCon,
      efectivoAlRetiro: efectivoCon,
      valorTotal: valorTotalCon,
    },
    pagoImss: {
      meses: serie.length,
      cuotaBase,
      actualizaciones,
      recargos,
      total: pagoImssTotal,
    },
    costos: {
      gestorias: GESTORIAS,
      gastosAdministrativos,
      comisionApertura,
      total: costosTotal,
    },
    financiamiento: {
      meses: FINANCIAMIENTO_MESES,
      tasa: FINANCIAMIENTO_TASA,
      interes,
      total: financiamientoTotal,
    },
    totalAPagar,
    creditoDxn: {
      credito: creditoDxn,
      retroactivo: retroactivoPension,
      efectivoNeto,
    },
    efectivo: {
      saldosDisponibles: efectivoSin,
      retiro97Recuperado: retiro97,
      totalDisponible: efectivoSin + retiro97,
      efectivoNetoAPagar: efectivoNeto,
      resultado: efectivoCon, // L10
    },
    multiplicadorPension: pensionSinProyecto ? pensionConProyecto / pensionSinProyecto : 0, // M8
    multiplicadorValor: valorTotalSin ? valorTotalCon / valorTotalSin : 0, // M12
  };
}
