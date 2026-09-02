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
import {
  lineasCapturaMod40,
  MESES_MAX_ART219,
  type LineasCapturaMod40,
} from './mod40-lineas';
import { ventanaMod40, type RegistroHistorialMod40, type VentanaMod40 } from './mod40-ventana';
import type { EntradaCalculo, ProyectoMod40 } from './types';
import {
  addMeses,
  DIAS_ANIO,
  DIAS_MES,
  DIAS_MES_PENSION,
  diasEntre,
  inicioMes,
  lookupAprox,
  mesAnterior,
  parseISO,
  porAnio,
  round,
} from './util';

const MESES_BASE_250 = 57;
// Art. 219 LSS: el retro son 5 años. El tope vive en `mod40-lineas.ts` y se
// importa de ahí para que el costo y la serie salarial de abajo no se
// desincronicen nunca.
const MESES_RETRO_ART219 = MESES_MAX_ART219;
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
  /**
   * Ajuste de semanas (±) al cálculo (C29 de la hoja): positivas = por
   * reconocer, negativas = riesgo de no reconocimiento. Aplica también al
   * escenario base interno. Si se omite, usa palancas.ajusteSemanas.
   */
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
  /**
   * Deja calcular con el cliente por DEBAJO de 60 años a la fecha de trámite.
   * El producto no lo permite —este trámite es el de la pensión, y la Ley 73
   * arranca a los 60 (regla de Raúl, sep-2026)—, así que solo lo usan los
   * goldens que reproducen el Excel de referencia. Sin él, una fecha anterior
   * al cumpleaños 60 se recorre a ese día y se avisa.
   */
  permitirMenorDe60?: boolean;
}

export function computeProyectoMod40(entrada: EntradaProyecto): ProyectoMod40 | null {
  const { perfil, saldos, salario_60m, palancas } = entrada;

  const fnac = parseISO(perfil.fecha_nacimiento);
  // El trámite de este proyecto ES el de la pensión: se paga el retroactivo y
  // se pensiona en el mismo acto. Por eso no puede ocurrir antes de cumplir 60
  // y por eso fecha y edad son UNA sola variable: mover una mueve la otra.
  const fechaMinimaTramite = addMeses(fnac, 60 * 12); // el día que cumple 60
  const fechaPedida = entrada.fechaTramite ?? entrada.hoy ?? new Date();
  const recorridaA60 =
    !entrada.permitirMenorDe60 && diasEntre(fechaPedida, fechaMinimaTramite) > 0;
  const fechaTramite = recorridaA60 ? fechaMinimaTramite : fechaPedida;
  const anioTramite = fechaTramite.getUTCFullYear();

  const edadActual = diasEntre(fnac, fechaTramite) / DIAS_ANIO; // C12 (a la fecha de trámite)
  // F16. `palancas.edadRetiro` ya NO mueve el retiro: la edad del proyecto es
  // la que se tiene el día del trámite. La palanca sobrevive en la UI, pero
  // ahí elegir una edad mueve la fecha, no el cálculo por su cuenta.
  const edadProyecto = Math.max(60, edadActual);
  // F17. El retiro ES el trámite. Antes se proyectaba hacia adelante cuando la
  // edad elegida era mayor que la del día, y ese hueco sumaba semanas que la
  // línea de captura nunca cobró.
  const fechaRetiro = fechaTramite;

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

  // F20/R5. Las semanas y los meses que suben la pensión salen de los días que
  // la línea DE VERDAD cobra: mismo prorrateo de los extremos y mismo tope de
  // 60 meses del art. 219. Antes se medían aparte, hasta la fecha de retiro, y
  // todo lo que quedaba entre el trámite y el retiro subía la pensión gratis.
  const diasPagados = lineas.detalle.reduce((a, d) => a + d.dias * d.prorrateo, 0);
  const semanasRec = diasPagados / 7;
  const mesesRetroN = Math.trunc(diasPagados / DIAS_MES); // R5
  const mesesFuturos = 0; // R4 (R26 = 0% en la hoja)
  // El promedio de 250 semanas se pondera sobre 57 meses: con un tramo retro
  // más largo, `mesesRetroN` empujaba el salario base POR ENCIMA del tope de
  // 25 UMA y la pensión salía al máximo por construcción. La Ley 73 ya topa
  // así (K4/K5); aquí faltaba.
  const mesesRetroSal = Math.min(mesesRetroN, MESES_BASE_250);
  const mesesPasados = Math.max(MESES_BASE_250 - mesesFuturos - mesesRetroSal, 0); // R3

  // La serie mensual sigue viva SOLO para el lado de la pensión (el salario
  // mínimo promedio del tramo retroactivo, R11), anclada en el mes del trámite
  // — que ahora es también el del retiro.
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

  // La línea cubre exactamente hasta la fecha de trámite, que es la del retiro:
  // ya no queda un tramo sin cobrar que después sume semanas.
  if (recorridaA60) {
    avisos.push(
      `El proyecto se calcula al ${fechaMinimaTramite.toISOString().slice(0, 10)}: es el día que cumple 60 años y el trámite no puede hacerse antes. La línea de captura cubre hasta esa fecha.`,
    );
  }

  // El aviso de "solo se cubren los últimos 60 meses" lo emite
  // `lineasCapturaMod40` y entra por `lineas.avisos`, arriba. No se duplica.

  // Conservación de derechos (art. 150) medida a la fecha de trámite, no a hoy.
  const finConservacion = perfil.fechas.fin_conservacion_derechos
    ? parseISO(perfil.fechas.fin_conservacion_derechos)
    : null;
  if (finConservacion && diasEntre(fechaTramite, finConservacion) < 0) {
    avisos.push(
      `A la fecha de trámite tu conservación de derechos ya venció (fue el ${finConservacion.toISOString().slice(0, 10)}). Reactivarla exige volver a cotizar antes de pensionarte.`,
    );
  }

  // Solo alcanzable con `permitirMenorDe60` (goldens del Excel).
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
  const salarioCot250 = (mesesPasados * scPasado + mesesRetroSal * salarioRetro) / MESES_BASE_250; // R8
  const salarioMin250 =
    (mesesPasados * smPasado + mesesFuturos * porAnio(SALARIO_MINIMO, anioTramite - 1) + mesesRetroSal * smRetro) /
    60; // R12
  const factor = Math.max(1, salarioCot250 / salarioMin250); // R13

  const sem = perfil.semanas;
  const semanasVigentes = sem.cotizadas - sem.descontadas + sem.recuperadas; // C16
  const semanasExtra = entrada.semanasExtra ?? palancas.ajusteSemanas ?? 0; // C29 / ajuste ±
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
      // proyecto" en 2027 contra "sin proyecto" hoy sería tramposo. Aquí las
      // dos fechas de Ley 73 colapsan en una: en este producto se paga y se
      // pensiona el mismo día.
      hoy: fechaTramite,
      fechaTramite,
      palancas: {
        ...palancas,
        edadRetiro: edadProyecto,
        pctTiempoCotizando: 0,
        recuperarSemanasDescontadas: false,
        recuperarSemanasMod40Retro: false,
        // El ajuste de semanas es corrección de datos, no estrategia: aplica
        // también a la base para comparar peras con peras.
        ajusteSemanas: semanasExtra,
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
  // "Disponible AFORE" (ago-2026): un solo número frente al asesor. Mientras
  // sea estimado = SAR92 + 30% del RCV97; si el asesor captura el dato real
  // (overrides.disponibleAfore), ese manda.
  const disponibleAfore = palancas.overrides?.disponibleAfore ?? sar + rcv * 0.3;
  // SIN redondeo (Raul, jul-2026): el Excel redondea F10 a cien miles
  // (ROUND(...,-5)), lo que ocultaba el efecto de corregir saldos y
  // distorsionaba los base. Los saldos pasan exactos.
  const efectivoSin = disponibleAfore + inf; // F10 (corregido, sin ROUND)
  const efectivoCon = efectivoSin + retiro97 - efectivoNeto; // L10
  // F12/L12 sin ROUND(-3): los totales arrastran los saldos exactos.
  const valorTotalSin = valorPensionSin + efectivoSin; // F12
  const valorTotalCon = valorPensionCon + efectivoCon; // L12

  return {
    fechaTramite,
    fechaMinimaTramite,
    recorridaA60,
    edadProyecto,
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
