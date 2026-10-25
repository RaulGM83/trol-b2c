// ============================================================================
// Motor Ley 73 — port fiel de la hoja "Calculadora 73" del Excel CALCULADORA.
// Cada bloque cita la celda original. Validado contra el Excel en __tests__.
// ============================================================================

import {
  AJUSTE_EDAD,
  COSTO_MOD10,
  COSTO_MOD40_FUTURO,
  CUANTIAS_LEY73,
  PMG_LEY73,
  REDONDEO_INCREMENTO,
  SALARIO_MINIMO,
  UMA,
} from './tablas';
import type {
  DesgloseRetro,
  EntradaCalculo,
  EstatusPension73,
  RazonNegativa73,
  ResultadoLey73,
} from './types';
import { lineasCapturaMod40 } from './mod40-lineas';
import { regimenMod40 } from './mod40-ventana';
import {
  factorIncrementosFebrero,
  fechaDelDerecho,
  montoActualizado,
  retroactivoDesdeDerecho,
} from './derecho73';
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

  // Arranque del plan: la inscripción a Mod 40/10. Default `hoy`, y con eso el
  // cálculo es idéntico al de siempre. Lo único que se recorta aquí es el
  // pasado —no se firma ayer—; `detalle.fechaTramite` dice con cuál corrió.
  //
  // El tope superior NO se recorta contra `fechaRetiro`: esa fecha trae el "−1
  // día" del Excel (D22), así que cuando el cliente se pensiona a su edad de
  // hoy queda un día ANTES que hoy y recortar ahí acortaba la línea de captura
  // un día. El límite lo pone la UI con `max`, y el tramo futuro se protege
  // abajo con `diasFuturos`.
  const fechaPedida = entrada.fechaTramite ?? hoy;
  const fechaTramite = diasEntre(hoy, fechaPedida) < 0 ? hoy : fechaPedida;
  /** Días de cotización futura: del arranque al retiro, nunca negativos. */
  const diasFuturos = Math.max(0, diasEntre(fechaTramite, fechaRetiro));

  // H6: última cotización real (la baja). Para el empleado, ver abajo.
  const ultimaCotValida = parseISO(perfil.fechas.ultima_cotizacion_valida);
  const ultimaCotMod40 = perfil.fechas.ultima_cotizacion_mod40
    ? parseISO(perfil.fechas.ultima_cotizacion_mod40)
    : null;
  const empleado = perfil.status_empleo === 'empleado';
  const ultimaCotReal =
    ultimaCotMod40 && ultimaCotMod40 > ultimaCotValida ? ultimaCotMod40 : ultimaCotValida;

  // ---- Régimen de Mod 40 (claude/106) ----------------------------------
  // Antes del corte (22-oct-2026) corre el mundo viejo completo. Después:
  // sin retro, salario futuro topado, una sola modalidad, y el empleado puede
  // dejar un hueco entre su baja y el arranque del plan.
  const ultimaModalidad =
    entrada.ultimaModalidad ??
    (ultimaCotMod40 && ultimaCotMod40 >= ultimaCotValida ? 'mod40' : 'obligatorio');
  // Baja del empleado: antes del corte era la fecha de arranque (y el tramo
  // entre hoy y el arranque lo cubría el retro). Después del corte es una
  // palanca: sigue empleado hasta `fechaBaja` (default: hasta el arranque),
  // recortada a [hoy, fechaTramite].
  const fechaBajaPedida = entrada.fechaBaja ?? fechaTramite;
  const fechaBajaNueva =
    diasEntre(hoy, fechaBajaPedida) < 0
      ? hoy
      : diasEntre(fechaBajaPedida, fechaTramite) < 0
        ? fechaTramite
        : fechaBajaPedida;
  // Ventana del art. 218/220 a la fecha de trámite: 5 años desde la baja (12
  // meses si la última fue Mod 40). Para el desempleado manda el expediente.
  const limiteMod40Local = addMeses(
    empleado ? fechaBajaNueva : ultimaCotReal,
    ultimaModalidad === 'mod40' && !empleado ? 12 : 60,
  );
  const reg = regimenMod40(null, fechaTramite, {
    corte: entrada.corteRegimen,
    hoy,
    ultimoSbc: entrada.ultimoSbc ?? perfil.salario_diario_registrado,
    ultimaModalidad,
    sinBaja: empleado,
    conservaDerechos: perfil.conserva_derechos,
    limiteExpediente: empleado
      ? limiteMod40Local
      : (perfil.fechas.limite_inscripcion_mod40 ?? limiteMod40Local),
  });
  const antesDelCorte = reg.antesDelCorte;
  const fechaBaja = antesDelCorte ? fechaTramite : fechaBajaNueva;
  const ultimaCot = empleado ? fechaBaja : ultimaCotReal;
  /** Días que sigue empleado entre hoy y su baja (sólo después del corte). */
  const diasEmpleo = empleado && !antesDelCorte ? Math.max(0, diasEntre(hoy, fechaBaja)) : 0;
  const huecoMeses = antesDelCorte ? 0 : Math.max(0, diasEntre(ultimaCot, fechaTramite)) / DIAS_MES;

  // C30/D31: Mod40 retroactivo a la fecha de arranque. Después del corte, nunca.
  const aplicaRetroHoy =
    antesDelCorte && perfil.aplica_mod40 && diasEntre(fechaTramite, ultimaCot) < 0;
  const semanasRecuperablesRetro = aplicaRetroHoy
    ? diasEntre(ultimaCot, fechaTramite) / 7
    : 0; // D31
  const recuperaRetro = aplicaRetroHoy && palancas.recuperarSemanasMod40Retro; // C33

  // Modalidad y salario futuros. Después del corte el salario se topa según la
  // modalidad y se avisa; antes del corte el salario es el de la palanca y la
  // modalidad la decide mes a mes la columna AA (ver abajo).
  const avisosRegimen = [...reg.avisos];
  let modalidadFutura: 'mod40' | 'mod10' | null = null;
  let sbcTope: number | null = null;
  let salarioFuturo = salarioMod40;
  if (!antesDelCorte && pct > 0) {
    const pedida = palancas.modalidadFutura ?? (reg.mod40Permitida ? 'mod40' : 'mod10');
    if (pedida === 'mod40' && !reg.mod40Permitida) {
      modalidadFutura = 'mod10';
      avisosRegimen.push(
        reg.motivoNoPermitida === 'mod10_previa'
          ? 'Como vienes de Modalidad 10 no puedes contratar Modalidad 40: el escenario corre en Modalidad 10.'
          : reg.motivoNoPermitida === 'derechos_perdidos'
            ? 'Sin conservación de derechos no se contrata Modalidad 40: el escenario corre en Modalidad 10, que es la vía para recuperarlos.'
            : 'La ventana para inscribirte a Modalidad 40 ya venció a esta fecha: el escenario corre en Modalidad 10.',
      );
    } else {
      modalidadFutura = pedida;
    }
    sbcTope = modalidadFutura === 'mod40' ? (reg.sbcTopeMod40 ?? reg.sbcTopeMod10) : reg.sbcTopeMod10;
    salarioFuturo = Math.min(sbcTope, Math.max(reg.sbcPiso, salarioMod40));
    if (salarioFuturo < salarioMod40 - 0.005) {
      avisosRegimen.push(
        modalidadFutura === 'mod40'
          ? `El salario del escenario se recortó al tope de la Modalidad 40 ($${Math.round(sbcTope).toLocaleString('es-MX')} diarios). Para cotizar más alto, la vía es la Modalidad 10.`
          : `El salario del escenario se recortó al tope de 25 UMA ($${Math.round(sbcTope).toLocaleString('es-MX')} diarios).`,
      );
    }
  }

  // D16: semanas vigentes hoy
  const sem = perfil.semanas;
  const semanasVigentes = sem.cotizadas - sem.descontadas + sem.recuperadas;

  // D36: semanas al retiro. El tramo futuro arranca en `fechaTramite`, no en
  // `hoy`: si no, el hueco entre hoy y la inscripción contaría DOS veces —una
  // como retroactivo pagado y otra como cotización futura. Después del corte
  // el empleado suma además lo que cotiza con su patrón hasta su baja.
  const semanasRetiro =
    (diasFuturos * pct) / 7 +
    diasEmpleo / 7 +
    semanasVigentes +
    (recuperaRetro ? semanasRecuperablesRetro : 0) +
    (palancas.recuperarSemanasDescontadas ? sem.descontadas - sem.recuperadas : 0) +
    (palancas.ajusteSemanas ?? 0);

  // ---- Promedios salariales ponderados (K3..K13) ----
  // Tres tramos, del más reciente al más viejo: futuro (Mod 40/10), medio
  // (antes del corte: el retro pagado; después: lo que sigue cotizando con su
  // patrón hasta la baja) y pasado (los 60 meses de la semilla).
  const mesesFuturos = Math.min(
    Math.round((diasFuturos / DIAS_MES) * pct),
    MESES_BASE_250,
  ); // K4
  const mesesRetroSal = Math.min(
    recuperaRetro ? Math.trunc((semanasRecuperablesRetro * 7) / DIAS_MES) : 0,
    MESES_BASE_250 - mesesFuturos,
  ); // K5
  const mesesEmpleo = Math.min(Math.round(diasEmpleo / DIAS_MES), MESES_BASE_250 - mesesFuturos);
  const mesesMedio = antesDelCorte ? mesesRetroSal : mesesEmpleo;
  const mesesPasados = Math.max(MESES_BASE_250 - mesesFuturos - mesesMedio, 0); // K3

  const prom = (vals: number[], n: number) => {
    const v = vals.slice(0, Math.max(n, 0));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };
  const scPasado = prom(salario_60m.map((m) => m.salario_diario), mesesPasados); // K6
  const smPasado = prom(salario_60m.map((m) => m.salario_minimo), mesesPasados); // K9

  // Serie retro (N/S): salario y salario mínimo por mes retroactivo
  const serieRetro = mesesRetro(fechaTramite, ultimaCot);
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
  // Tramo medio: retro (antes del corte) o empleo hasta la baja (después).
  const scMedio = antesDelCorte ? scRetro : perfil.salario_diario_registrado;
  const smMedio = antesDelCorte ? smRetro : smFuturo;

  // Mod 10 escalonada (claude/107 decisión 9): sólo después del corte y en Mod 10.
  const escalon =
    !antesDelCorte && modalidadFutura === 'mod10' && palancas.mod10EscalonMeses != null
      ? Math.max(0, Math.round(palancas.mod10EscalonMeses))
      : null;
  const smEscalon = porAnio(SALARIO_MINIMO, anioHoy);
  const salarioFuturoProm =
    escalon == null || mesesFuturos === 0
      ? salarioFuturo
      : (Math.min(escalon, mesesFuturos) * salarioFuturo +
          Math.max(mesesFuturos - escalon, 0) * Math.min(salarioFuturo, smEscalon)) /
        mesesFuturos;
  const salarioCot250 =
    (mesesPasados * scPasado + mesesFuturos * salarioFuturoProm + mesesMedio * scMedio) /
    MESES_BASE_250; // K8
  const salarioMin250 =
    (mesesPasados * smPasado + mesesFuturos * smFuturo + mesesMedio * smMedio) / 60; // K12 (÷60 en el Excel)
  const factorSalarial = Math.max(1, salarioCot250 / salarioMin250); // K13

  // ---- Conservación de derechos (Art. 150/151 LSS) ----
  // Segundo requisito, independiente de las semanas: quien dejó de cotizar
  // conserva sus derechos por 1/4 del tiempo cubierto; vencido ese plazo no
  // puede pensionarse por Ley 73 hasta REACTIVAR con nuevas cotizaciones.
  //
  // Después del corte, con hueco, la conservación se mide al ARRANQUE del plan
  // (claude/106 §3b): el empleado que deja de cotizar y espera puede perderla
  // en el hueco; el desempleado la pierde en `fin_conservacion_derechos`.
  const finConservacion = perfil.fechas.fin_conservacion_derechos
    ? parseISO(perfil.fechas.fin_conservacion_derechos)
    : null;
  // 2026.10.25.1: el empleado cotiza hoy, así que hoy conserva (la semilla de
  // n8n ≤ v5.8.1 marca sin conservación a quien cotiza en un registro abierto).
  const conservaHoy = empleado || perfil.conserva_derechos;
  const conservaAlInicio = antesDelCorte
    ? conservaHoy
    : empleado
      ? huecoMeses * DIAS_MES <= (semanasVigentes * 7) / 4
      : perfil.conserva_derechos && (!finConservacion || diasEntre(fechaTramite, finConservacion) >= 0);
  const gapMeses = antesDelCorte
    ? Math.max(0, perfil.gap_meses)
    : empleado
      ? huecoMeses
      : Math.max(perfil.gap_meses, huecoMeses);
  // Art. 151: I ≤3 años → reconocimiento inmediato al reingresar; II >3 y ≤6
  // años → 26 semanas; III >6 años → 52 semanas.
  const semanasParaReactivar = conservaAlInicio
    ? 0
    : gapMeses <= 36
      ? 0
      : gapMeses <= 72
        ? 26
        : 52;
  // Reactivar exige REINGRESAR al régimen: incluso en la fracc. I (0 semanas
  // extra) el reconocimiento ocurre "al momento de la reinscripción". Con
  // pct=0 no vuelve a cotizar, así que no reactiva aunque el gap sea corto.
  // Con pct=0 la conservación que cuenta es la de HOY (`conserva_derechos`).
  const semanasFuturas = (diasFuturos * pct) / 7;
  const reactiva =
    pct === 0
      ? empleado && !antesDelCorte
        ? conservaAlInicio
        : conservaHoy
      : conservaAlInicio || semanasFuturas >= semanasParaReactivar;
  const pierdeConservacion = !reactiva;

  // ---- Pensión (D38..D43) ----
  // 2026.10.25.2: 500 semanas alcanzan (Raúl, 25-oct; antes exigía más de 500).
  const faltanSemanas = !(semanasRetiro >= 500);
  const negativa = faltanSemanas || pierdeConservacion;
  const [, cuantia, incremento] = lookupAprox(
    factorSalarial,
    CUANTIAS_LEY73 as Array<[number, number, number]>,
  );
  // El CÁLCULO solo depende de las semanas; la conservación se aplica al final,
  // para poder decirle cuánto le tocaría si reactiva.
  const cuantiaBasica = faltanSemanas ? 0 : cuantia * salarioCot250 * 365 * 1.11; // D38
  const bloques = (semanasRetiro - 500) / 52;
  const fraccion = (bloques - Math.trunc(bloques)) * 52;
  const [, extra] = lookupAprox(fraccion, REDONDEO_INCREMENTO as Array<[number, number]>);
  const incrementos = faltanSemanas
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

  // ---- Fecha del derecho con 0 % de cotización (motor v5.7, claude/90) ----
  // Quien ya no va a cotizar gana su derecho en D = la más tardía entre su
  // última cotización y los 60 años. Con Mod 40 retro la última cotización es
  // la fecha de trámite (la línea cubre hasta ahí); si hoy cotiza, es el día que
  // deja de hacerlo (también la fecha de trámite). El monto se calcula a D —edad
  // a D con la regla del .5, mínima garantizada del año de D— y sube cada
  // febrero con la inflación. Pensionarse después sin cotizar NO sube el factor
  // de edad: sólo mueve el retroactivo (tope 12 meses) y lo que se pierde de más.
  // Aplica aunque D sea futura (p. ej. 57 años sin cotizar: su D son los 60).
  // Cotizando (pct > 0) no aplica: el derecho se gana al retiro.
  const ultimaCotDerecho = recuperaRetro ? fechaTramite : ultimaCot;
  const fechaDerecho = fechaDelDerecho(fnac, ultimaCotDerecho);
  const aplicaDerecho =
    entrada.reglaDerecho !== false && pct === 0 && !faltanSemanas && !pierdeConservacion;
  let derecho: ResultadoLey73['derecho'] = null;
  let formulaD = 0;
  let pmgD = 0;
  let montoDerecho: number | null = null;
  if (aplicaDerecho) {
    const edadD = diasEntre(fnac, fechaDerecho) / DIAS_ANIO;
    const [, ajusteD] = lookupAprox(Math.round(edadD), AJUSTE_EDAD as Array<[number, number]>);
    formulaD = ((cuantiaBasica + incrementos + asignaciones) * ajusteD) / 12;
    pmgD = porAnio(PMG_LEY73, fechaDerecho.getUTCFullYear());
    montoDerecho = montoActualizado(formulaD, pmgD, pensionMaxima, fechaDerecho, hoy);
    derecho = {
      fecha: fechaDerecho,
      edad: edadD,
      ajusteEdad: ajusteD,
      pensionALaFecha: Math.min(pensionMaxima, Math.max(formulaD, pmgD)),
      factorActualizacion: factorIncrementosFebrero(fechaDerecho, hoy),
    };
  }

  // D43. Monto que le corresponde por semanas y salario, antes del filtro de
  // conservación: es lo que vería si reactiva sus derechos.
  const montoPorSemanas = faltanSemanas
    ? null
    : round(
        montoDerecho ?? Math.min(pensionMaxima, Math.max(pensionCalculada, pensionMinima)),
        -2,
      );
  const pensionMensual = negativa ? null : montoPorSemanas;
  // Solo tiene sentido ofrecerlo cuando la conservación es el ÚNICO obstáculo.
  const pensionSiReactiva = pierdeConservacion && !faltanSemanas ? montoPorSemanas : null;

  // ---- Retroactivo al pensionarse (tope 12 meses) ----
  // El derecho se adquiere al cumplir TODOS los requisitos: 60 años, más de
  // 500 semanas y estar dado de baja → la fecha es la más reciente entre
  // cumplir 60 y la última cotización. Solo aplica si se pensiona sin volver
  // a cotizar (pct = 0). Con Mod 40 retro, D es la fecha de trámite (fin de la
  // línea), así que no se cruza con los meses pagados al IMSS. Con la
  // conservación vencida tampoco: `negativa` ya lo cubre.
  let retroactivoAlPensionarse: ResultadoLey73['retroactivoAlPensionarse'] = null;
  if (pct === 0 && !negativa && pensionMensual !== null) {
    const fechaDerechos = fechaDerecho;
    const mesesDesdeDerecho = Math.max(0, Math.round(diasEntre(fechaDerechos, fechaRetiro) / DIAS_MES));
    const meses = Math.min(12, mesesDesdeDerecho);
    // Lo que pasa de 12 meses ya no se cobra: esperar sin cotizar cuesta.
    const mesesPerdidos = Math.max(0, mesesDesdeDerecho - 12);
    if (meses > 0) {
      // Con el derecho ya ganado cada mensualidad lleva el incremento de su mes
      // (un retroactivo que cruza febrero no es parejo).
      const monto = derecho
        ? round(retroactivoDesdeDerecho(formulaD, pmgD, pensionMaxima, fechaDerecho, fechaRetiro, meses), -2)
        : pensionMensual * meses;
      retroactivoAlPensionarse = { fechaDerechos, meses, monto, mesesPerdidos, montoPerdido: pensionMensual * mesesPerdidos };
    }
  }

  // ---- Costo Mod40 retroactivo (P/Q/R → D47..D49) ----
  // Es la MISMA línea de captura que cotiza el proyecto Mod 40, así que sale de
  // la misma función: si aquí se recalculara aparte, la pestaña "Calculadora 73"
  // y la de "Mod40 Retroactivo" cobrarían distinto por lo mismo. Precisión
  // diaria y prorrateo de los extremos desde el 24-ago-2026 (`claude/21`).
  let retro: DesgloseRetro | null = null;
  if (recuperaRetro) {
    const lineas = lineasCapturaMod40({
      ultimaCotizacion: ultimaCot,
      fechaTramite,
      umas: 25,
      // 'MINIMO' hace que el salario del tramo no sea plano: va mes a mes.
      sdiPorMes:
        palancas.salarioCotizacionRetro === 'MINIMO' ? salarioRetroMes : undefined,
      serieINPC: entrada.serieINPC,
      // Sin `mesesMax`: se toma el default del art. 219 (60 meses), el mismo
      // que usa el proyecto Mod 40 y el mismo con el que `serieRetro` de arriba
      // promedia los salarios. Si aquí se topara distinto, las dos pestañas de
      // la calculadora volverían a cobrar cosas distintas.
    });
    retro = {
      meses: lineas.meses,
      cuotaBase: lineas.retro,
      actualizaciones: lineas.actualizaciones,
      recargos: lineas.recargos,
      total: lineas.total,
    };
  }

  // ---- Costo estrategia futura (V..AB → D50, D53, D54) ----
  const mesesFuturosSerie: Date[] = [];
  for (let i = 1; i <= MAX_MESES_SERIE_FUTURA; i++) {
    const v = addMeses(fechaTramite, i); // V
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
    // Antes del corte (hoja): salario mínimo en Mod 10 mientras falten más de
    // 60 meses y el salario de la palanca en los últimos 60 (Mod 40). Después
    // del corte no se combinan modalidades: toda la serie va en la elegida y
    // al salario ya topado.
    const y = antesDelCorte
      ? x > 60
        ? porAnio(SALARIO_MINIMO, anioHoy)
        : salarioMod40
      : escalon != null && x > escalon
        ? Math.min(salarioFuturo, smEscalon) // Mod 10 escalonada: mínimo para sumar semanas
        : salarioFuturo; // Y
    const z = y * diasDelMes(v); // Z
    const modalidad: 10 | 40 = antesDelCorte
      ? diasEntre(ultimaCot, v) / 365 > 5
        ? 10
        : x > 60
          ? 10
          : 40 // AA
      : modalidadFutura === 'mod10'
        ? 10
        : 40;
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

  // `negativa_sin_reactivacion` = sería negativa MIENTRAS no reactive. Si el
  // bloqueo son las semanas (y no la conservación), reactivar no lo resuelve.
  const status: EstatusPension73 = !negativa
    ? 'viable'
    : pierdeConservacion
      ? 'negativa_sin_reactivacion'
      : 'negativa';

  const razon: RazonNegativa73 | null = negativa
    ? {
        faltanSemanas,
        pierdeConservacion,
        semanasActuales: Math.round(semanasVigentes),
        semanasAlRetiro: Math.round(semanasRetiro),
        semanasRequeridas: 500,
        // Derivadas de las semanas ya redondeadas para que la resta cuadre en
        // pantalla (ver nota equivalente en ley97.ts).
        semanasFaltantes: Math.max(0, 500 - Math.round(semanasRetiro)),
        gapMeses,
        semanasParaReactivar,
        finConservacion: perfil.fechas.fin_conservacion_derechos,
      }
    : null;

  return {
    ley: 'Ley73',
    pensionMensual,
    status,
    negativa,
    razon,
    pensionSiReactiva,
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
      ajusteEdad: derecho ? derecho.ajusteEdad : ajusteEdad,
      pensionMinima: derecho ? pmgD * derecho.factorActualizacion : pensionMinima,
      pensionMaxima,
      advertenciaConservacion,
      fechaTramite,
      regimenMod40: reg.regimen,
      antesDelCorte,
      modalidadFutura: antesDelCorte
        ? modalidadPrimerMes === 10
          ? 'mod10'
          : modalidadPrimerMes === 40
            ? 'mod40'
            : null
        : modalidadFutura,
      mod40Permitida: reg.mod40Permitida,
      mod10EscalonMeses: escalon,
      motivoNoPermitida: reg.motivoNoPermitida,
      sbcTope,
      salarioFuturo,
      fechaBaja: ultimaCot,
      huecoMeses,
      avisosRegimen,
    },
    retro,
    aplicaRetroHoy,
    semanasRecuperablesRetro,
    retroactivoAlPensionarse,
    derecho,
    costoEstrategiaFutura,
    costoMensualPrimerMes,
    modalidadPrimerMes,
    costoTotal: (retro?.total ?? 0) + costoEstrategiaFutura, // D51
  };
}
