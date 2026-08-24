// ============================================================================
// Proyecto Mod40 Retroactivo — port de la hoja "Mod40 Retroactivo" del Excel.
// Compara "sin proyecto" (escenario base) vs "con proyecto" (pagar Mod40
// retroactivo a 25 UMA) e itemiza los costos del despacho.
// ============================================================================

import {
  AJUSTE_EDAD,
  CUANTIAS_LEY73,
  PMG_LEY73,
  REDONDEO_INCREMENTO,
  SALARIO_MINIMO,
  UMA,
  URV,
} from './tablas';
import { computeLey73 } from './ley73';
import { lineasCapturaMod40, type LineasCapturaMod40 } from './mod40-lineas';
import { ventanaMod40, type RegistroHistorialMod40, type VentanaMod40 } from './mod40-ventana';
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
  lookupAprox,
  mesAnterior,
  parseISO,
  porAnio,
  round,
} from './util';

const MESES_BASE_250 = 57;
// Art. 219 LSS: el retro "de libro" son 5 años. El Excel validado contra
// líneas reales del IMSS NO topa ahí (sus casos cobran 62 y 63 meses), así
// que este número dejó de ser un corte y quedó como umbral de AVISO.
const MESES_RETRO_ART219 = 60;
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
  /**
   * Fecha en que se inicia el trámite (default: `hoy`, y a su vez `new Date()`).
   * Es el ancla de TODO el proyecto: mueve la ventana retroactiva, los meses de
   * pago, el año de UMA aplicable, la edad y las semanas acumuladas. Omitirla
   * deja el cálculo idéntico al de siempre ("a hoy").
   */
  fechaTramite?: Date;
  /**
   * Historial laboral, para clasificar la última baja y su ventana de reingreso
   * (art. 219 / 220 LSS). Sin él no hay `ventana` y solo se avisa que no se
   * pudo confirmar la modalidad.
   */
  historial?: RegistroHistorialMod40[] | null;
  /**
   * `limite_inscripcion_mod40` del expediente. Es el mejor dato: trol3 ya
   * corrigió ahí el límite de 12 meses. Si viene, manda sobre el cálculo local.
   */
  limiteInscripcionMod40?: string | Date | null;
}

/** Días entre dos fechas en meses "de calendario" aproximados, para copy. */
const enMeses = (dias: number) => Math.round(dias / DIAS_MES);

export function computeProyectoMod40(entrada: EntradaProyecto): ProyectoMod40 | null {
  const { perfil, saldos, salario_60m, palancas } = entrada;
  // Ancla única del proyecto. `fechaTramite` gana; si no viene, se conserva el
  // comportamiento histórico ("a hoy") para que los goldens no se muevan.
  const fechaTramite = entrada.fechaTramite ?? entrada.hoy ?? new Date();
  const anioTramite = fechaTramite.getUTCFullYear();

  const fnac = parseISO(perfil.fecha_nacimiento);
  const edadActual = diasEntre(fnac, fechaTramite) / DIAS_ANIO; // C12 (a la fecha de trámite)
  const edadProyecto = Math.max(palancas.edadRetiro, Math.max(60, edadActual)); // F16
  const fechaRetiro = addDias(fechaTramite, (edadProyecto - edadActual) * DIAS_ANIO_RETIRO - 1); // F17

  const ultimaCotValida = parseISO(perfil.fechas.ultima_cotizacion_valida);
  const ultimaCotMod40 = perfil.fechas.ultima_cotizacion_mod40
    ? parseISO(perfil.fechas.ultima_cotizacion_mod40)
    : null;
  const ultimaCot =
    perfil.status_empleo === 'empleado'
      ? fechaTramite
      : ultimaCotMod40 && ultimaCotMod40 > ultimaCotValida
        ? ultimaCotMod40
        : ultimaCotValida; // O15

  const aplica = perfil.aplica_mod40 && diasEntre(fechaTramite, ultimaCot) < 1; // F19
  if (!aplica) return null;

  const umasProyecto = entrada.umasProyecto ?? UMAS_PROYECTO_DEFAULT; // F21
  const semanasRec = diasEntre(ultimaCot, fechaRetiro) / 7; // F20: hasta la fecha de retiro
  const mesesRetroN = Math.trunc((semanasRec * 7) / DIAS_MES); // R5
  const mesesFuturos = 0; // R4 (R26 = 0% en la hoja)
  const mesesPasados = Math.max(MESES_BASE_250 - mesesFuturos - mesesRetroN, 0); // R3

  const salarioRetro = porAnio(UMA, ultimaCot.getUTCFullYear()) * umasProyecto; // U

  // ---- Línea de captura del IMSS, con precisión DIARIA ---------------------
  // Antes esto era una serie de meses completos anclada en el MES DE RETIRO:
  // mover la fecha de trámite dentro de la quincena no cambiaba un peso. Ahora
  // lo calcula `lineasCapturaMod40`, que va del mes de la baja al mes del
  // trámite prorrateando los dos extremos por días — la fórmula validada al
  // centavo contra líneas de captura reales (ver `claude/21`).
  const lineas: LineasCapturaMod40 = lineasCapturaMod40({
    ultimaCotizacion: ultimaCot,
    fechaTramite,
    umas: umasProyecto,
    sdi: salarioRetro,
    serieINPC: entrada.serieINPC,
  });
  const cuotaBase = lineas.retro; // I7
  const actualizaciones = lineas.actualizaciones; // I8
  const recargos = lineas.recargos; // I9
  // Z: el 2% de retiro que se acredita en la AFORE sale de lo que DE VERDAD se
  // paga, así que va prorrateado igual que la cuota.
  const retiro97 = lineas.detalle.reduce(
    (a, d) => a + salarioRetro * d.dias * d.prorrateo * 0.02,
    0,
  );
  const pagoImssTotal = lineas.total; // I10

  // La serie mensual sigue viva SOLO para el lado de la pensión (el salario
  // mínimo promedio del tramo retroactivo, R11). Esa parte no cambió: se mide
  // hasta el MES DE RETIRO, que es hasta donde cuentan las semanas.
  const serie: Date[] = [];
  let m = inicioMes(fechaRetiro); // T5
  while (serie.length < MESES_RETRO_ART219) {
    serie.push(m);
    if (diasEntre(ultimaCot, m) < 0) break;
    m = mesAnterior(m);
  }

  // ---- Ventana de reingreso y avisos (nunca bloquean) --------------------
  const ventana: VentanaMod40 = ventanaMod40(entrada.historial, fechaTramite, {
    limiteExpediente: entrada.limiteInscripcionMod40,
    sbcReingreso: salarioRetro,
  });
  const avisos = [...ventana.avisos, ...lineas.avisos];

  // La línea cubre HASTA LA FECHA DE TRÁMITE. Si el retiro es posterior (el
  // cliente aún no cumple la edad), las semanas de ese hueco sí cuentan para la
  // pensión de abajo, pero NO están cobradas aquí: se pagan mes a mes como
  // Mod 40 vigente. Modelarlas es trabajo aparte (ver `claude/10`, pendientes).
  const mesesHastaRetiro =
    (fechaRetiro.getUTCFullYear() - fechaTramite.getUTCFullYear()) * 12 +
    (fechaRetiro.getUTCMonth() - fechaTramite.getUTCMonth());
  if (mesesHastaRetiro > 0) {
    avisos.push(
      `La línea de captura cubre hasta la fecha de trámite. Los ${mesesHastaRetiro} meses que faltan para el retiro se cotizan mes a mes en Modalidad 40 y NO están incluidos en este monto.`,
    );
  }

  // El tramo pasa de los 5 años del art. 219. La línea se cobra completa
  // (así viene en las líneas reales que sirvieron de referencia), pero el
  // asesor tiene que saber que ese excedente es terreno discutible.
  if (lineas.meses > MESES_RETRO_ART219) {
    avisos.push(
      `El periodo a cubrir son ${lineas.meses} meses, más de los 5 años del art. 219. La línea incluye el excedente; confírmalo con la subdelegación antes de comprometerlo.`,
    );
  }

  // Conservación de derechos (art. 150) medida a la fecha de trámite, no a hoy.
  const finConservacion = perfil.fechas.fin_conservacion_derechos
    ? parseISO(perfil.fechas.fin_conservacion_derechos)
    : null;
  if (finConservacion && diasEntre(fechaTramite, finConservacion) < 0) {
    avisos.push(
      `A la fecha de trámite tu conservación de derechos ya venció (fue el ${finConservacion.toISOString().slice(0, 10)}). Reactivarla exige volver a cotizar antes de pensionarte.`,
    );
  }

  if (edadActual < 60) {
    avisos.push(
      `A la fecha de trámite tendrías ${edadActual.toFixed(1)} años: la pensión Ley 73 arranca a los 60, así que el proyecto se calcula a esa edad.`,
    );
  }

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
    (mesesPasados * smPasado + mesesFuturos * porAnio(SALARIO_MINIMO, anioTramite - 1) + mesesRetroN * smRetro) /
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
  const tope = porAnio(UMA, anioTramite) * 25 * DIAS_MES_PENSION; // R17
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
      // El escenario base se mide a la MISMA fecha de trámite: comparar "con
      // proyecto" en 2027 contra "sin proyecto" hoy sería tramposo.
      hoy: fechaTramite,
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
    fechaTramite,
    ventana,
    avisos,
    lineas,
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
      meses: lineas.meses,
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
