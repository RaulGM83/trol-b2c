// ============================================================================
// Contrafactual Compara Afore — metodología v1.4 (18/19-jul-2026)
//
// Simula el saldo RCV-97 + SAR-92 que el cliente tendría hoy si sus recursos
// hubieran estado, buy-and-hold, en cada una de las AFOREs (método de
// unidades sobre precios de bolsa encadenados por generación). Reporta:
//   - canasta superior (top-3 por CAGR de precios, congelada por corte)
//   - mediana del sistema
//   - canasta baja (bottom-3)
//   - brecha "dejaste de ganar $X" vs canasta superior
//
// Módulo puro: recibe series de precios y historia laboral, no toca red/BD.
// Ver METODOLOGIA_CONTRAFACTUAL.md y ANALISIS_PRECIOS_ESTABILIDAD.md.
// ============================================================================

import type { EmpleoHistorial } from './historia-laboral';
import { UMA, SALARIO_MINIMO, CESANTIA97_ANIOS, CESANTIA97_PCT } from './tablas';
import { porAnio, parseISO, round } from './util';
import {
  TASA_RCV_BASE,
  TASA_RETIRO,
  TASA_CESANTIA_TRABAJADOR,
  TASA_CESANTIA_PATRON_PRE2023,
  CESANTIA97_BANDAS_UMA_SUP,
  CETES_92_97_MENSUAL,
  TASA_SAR92,
  CS_1997_DIARIA,
  CS_1997_ANIO,
  CS_2009,
  CS_2009_ANIO,
  CS_2021,
  CS_2021_1SM,
  CS_2021_ANIO,
  CS_2023_4A7_APROX,
  CS_2023_4A7_TOPE_UMA,
  TOPE_SBC_UMA,
  MES_INICIO_SAR92,
  MES_INICIO_RCV97,
} from './tablas-contrafactual';

// ----------------------------------------------------------------------------
// Tipos
// ----------------------------------------------------------------------------

/** Precio mensual (cierre de mes) de la serie generacional de una AFORE. */
export interface PrecioMes {
  mes: string; // 'YYYY-MM'
  precio: number;
}

export interface SerieAfore {
  afore: string;
  /** Serie mensual COMPLETA (con prefijo índice-industria ya empalmado si aplica). */
  precios: PrecioMes[];
  /** Primer mes con datos PROPIOS (sin prefijo industria), 'YYYY-MM'. */
  primerMesPropio: string;
}

export interface Canastas {
  superior: string[]; // p.ej. ['profuturo','sura','banamex'] — congelada por corte
  baja: string[];
}

export interface EntradaContrafactual {
  fecha_nacimiento: string; // ISO
  historia: EmpleoHistorial[]; // normalizada por historia-laboral.ts
  /** Ratio salario/UMA para imputar huecos de salario dentro de un empleo. */
  ratio_salario_uma?: number | null;
  series: SerieAfore[];
  canastas: Canastas;
  /**
   * Estimado de la metodología ANTERIOR (semilla/clientes.rcv97 + sar92).
   * Solo informativo — NO es benchmark ni afecta el flag (decisión 19-jul):
   * la campaña compara únicamente números calculados por este motor; el
   * saldo real entra hasta el unlock con estado de cuenta.
   */
  estimado_previo?: number | null;
  /**
   * Semanas cotizadas BRUTAS del SISEC (no netas: los retiros por desempleo
   * descuentan semanas pero no borran los periodos del historial).
   */
  semanas_cotizadas?: number | null;
  /**
   * v1.8 (F2): semanas DESCONTADAS brutas del SISEC (retiros por desempleo).
   * Ancla la calibración del modelo de retiros: >0 activa F2.
   */
  semanas_descontadas?: number | null;
  /** v1.8: modo de colocación de los retiros (default 'reciente'). */
  retiro_modo?: 'reciente' | 'antiguo';
  /**
   * v1.8: castigo plano TEMPORAL sobre TODOS los saldos (fracción 0..1).
   * Ajuste conservador mientras se acumula muestra real de saldos declarados;
   * se removerá (→ 0) cuando haya mejor calibración. Default 0.
   * No afecta el ranking (es uniforme) ni el factor_retiro_efectivo.
   */
  castigo_plano?: number | null;
  /**
   * Fecha del SISEC (emisión). La cobertura se calcula HASTA esta fecha para
   * no castigar/premiar a vigentes cuyo SISEC no se ha actualizado.
   */
  fecha_corte_semanas?: string | null;
  /**
   * v1.7: año de alta al IMSS (dígitos 3-4 del NSS). Permite acotar la
   * cobertura a la VENTANA QUE GENERA SALDO (desde may-92): las semanas de
   * carrera pre-92 no aportaron a SAR/RCV, así que no deben castigar el flag
   * cuando los eventos disponibles solo cubren la era con saldo.
   */
  anio_alta_nss?: number | null;
  /** Mes de valuación 'YYYY-MM'. Default: último mes común de las series. */
  hoy_mes?: string;
}

export interface SaldoAfore {
  afore: string;
  saldo: number;
  rcv97: number;
  sar92: number;
}

export interface ResultadoContrafactual {
  version: string;
  precios_corte: string; // mes de valuación
  saldos_por_afore: SaldoAfore[];
  canasta_superior: { afores: string[]; promedio: number; min: number; max: number };
  mediana_sistema: number;
  canasta_baja: { afores: string[]; promedio: number };
  desglose_referencia: { rcv97: number; sar92: number }; // de la canasta superior
  /** Gancho 100% interno: cuánto separa a la canasta top de la mediana y de la baja. */
  brecha_top_vs_mediana: number;
  brecha_top_vs_baja: number;
  /** Metodología anterior, SOLO informativa (no benchmark, no afecta flag). */
  referencia_previa: { estimado: number | null; delta_vs_mediana: number | null };
  /** meses simulados (ponderados por días) ÷ meses según semanas SISEC. null = sin semanas. */
  cobertura_historia: number | null;
  /**
   * v1.7: cobertura solo de la ventana que genera saldo (may-92 → corte),
   * descontando del denominador la carrera pre-92 máxima según año de alta
   * NSS. null si no hay NSS pre-92 o no hay semanas.
   */
  cobertura_ventana_saldo: number | null;
  /** Publicable si la cobertura total O la de ventana de saldo está en 0.7–1.3. */
  flag_publicable: boolean;
  /** Diagnóstico de insumos. */
  meses_cotizados: number;
  aportado_nominal: number; // suma de aportaciones sin rendimiento
  sar92_semilla: number; // B92 a jun-1997 (0 si no cotizó pre-97)
  supuestos: string[];
  /**
   * v1.8 (F2): retiros por desempleo modelados (fecha + fracción RCV + semanas).
   * [] si no hubo semanas descontadas o no se pudo reconstruir.
   */
  retiros_desempleo: RetiroModelado[];
  /**
   * Factor efectivo del modelo de retiros sobre el saldo RCV de la canasta
   * superior (adjustado/bruto). 1 = sin efecto. Diagnóstico/transparencia.
   */
  factor_retiro_efectivo: number;
}

// ----------------------------------------------------------------------------
// Utilería de meses 'YYYY-MM'
// ----------------------------------------------------------------------------

function mesIdx(mes: string): number {
  const [y, m] = mes.split('-').map(Number);
  return y * 12 + (m - 1);
}

function idxMes(idx: number): string {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function anioDe(mes: string): number {
  return Number(mes.slice(0, 4));
}

/** Días naturales del mes 'YYYY-MM'. */
function diasDelMesStr(mes: string): number {
  const [y, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// ----------------------------------------------------------------------------
// 1) SBC mensual desde la historia laboral
// ----------------------------------------------------------------------------

interface MesCotizado {
  mes: string;
  dias: number; // días cotizados del mes
  sbcDiario: number; // ya topado a 25 UMA
}

/**
 * Construye la serie mensual de (días cotizados, SBC diario) a partir de los
 * periodos de empleo. Empleos simultáneos: se suman los salarios (cotización
 * concurrente), topando a 25 UMA. Huecos de salario dentro de un empleo:
 * imputación con ratio_salario_uma × UMA del año.
 */
export function sbcMensual(
  historia: EmpleoHistorial[],
  desde: string,
  hasta: string,
  ratioSalarioUma?: number | null,
): MesCotizado[] {
  const d0 = mesIdx(desde);
  const d1 = mesIdx(hasta);
  const out: MesCotizado[] = [];

  const empleos = historia
    .filter((e) => e.fecha_inicio)
    .map((e) => ({
      ini: parseISO(e.fecha_inicio as string),
      fin: e.fecha_fin ? parseISO(e.fecha_fin) : null,
      salario: e.salario_base && e.salario_base > 0 ? e.salario_base : null,
    }));
  if (empleos.length === 0) return out;

  for (let i = d0; i <= d1; i++) {
    const mes = idxMes(i);
    const [y, m] = mes.split('-').map(Number);
    const mesIni = new Date(Date.UTC(y, m - 1, 1));
    const mesFin = new Date(Date.UTC(y, m, 0)); // último día del mes
    const nDias = mesFin.getUTCDate();

    let dias = 0;
    let salarioSum = 0;
    for (const e of empleos) {
      if (e.ini > mesFin) continue;
      if (e.fin && e.fin < mesIni) continue;
      // solapamiento del empleo con el mes
      const ini = e.ini > mesIni ? e.ini : mesIni;
      const fin = e.fin && e.fin < mesFin ? e.fin : mesFin;
      const dEmpleo = Math.max(0, (fin.getTime() - ini.getTime()) / 86_400_000 + 1);
      dias = Math.max(dias, Math.min(dEmpleo, nDias));
      const sal = e.salario ?? (ratioSalarioUma ? ratioSalarioUma * porAnio(UMA, y) : null);
      if (sal) salarioSum += sal;
    }
    if (dias <= 0 || salarioSum <= 0) continue;

    const tope = TOPE_SBC_UMA * porAnio(UMA, y);
    out.push({ mes, dias: round(dias, 2), sbcDiario: Math.min(salarioSum, tope) });
  }
  return out;
}

// ----------------------------------------------------------------------------
// 2) Tasas de aportación RCV y cuota social
// ----------------------------------------------------------------------------

/**
 * Tasa RCV total (fracción del SBC) para un año y nivel salarial dado.
 * - hasta 2022: 6.5% (retiro 2 + patrón 3.150 + trabajador 1.125 + Estado 0.225).
 * - 2023+: retiro 2 + patronal por banda/año (transitorio DOF 16-dic-2020) +
 *   trabajador 1.125. SIN 0.225% estatal (fracc. III derogada; el Estado
 *   aporta solo vía cuota social desde 2023).
 * - Banda "≤ 1.00 salario mínimo": patronal fija 3.150% todos los años.
 */
export function tasaRcv(anio: number, sbcDiario: number): number {
  if (anio < 2023) return TASA_RCV_BASE;
  const sm = porAnio(SALARIO_MINIMO, anio);
  let patronal: number;
  if (sbcDiario <= sm * 1.001) {
    patronal = TASA_CESANTIA_PATRON_PRE2023; // 3.150% fijo
  } else {
    const uma = porAnio(UMA, anio);
    const vecesUma = sbcDiario / uma;
    // Filas de CESANTIA97_PCT: A(≤1.5 UMA) … F(≤4.0), G(4.01+)
    let fila = CESANTIA97_BANDAS_UMA_SUP.length; // default: G
    for (let g = 0; g < CESANTIA97_BANDAS_UMA_SUP.length; g++) {
      if (vecesUma <= CESANTIA97_BANDAS_UMA_SUP[g]) {
        fila = g;
        break;
      }
    }
    const anioCol = Math.min(
      Math.max(anio, CESANTIA97_ANIOS[0]),
      CESANTIA97_ANIOS[CESANTIA97_ANIOS.length - 1],
    );
    const col = CESANTIA97_ANIOS.indexOf(anioCol);
    patronal = CESANTIA97_PCT[fila][col] / 100;
  }
  return TASA_RETIRO + patronal + TASA_CESANTIA_TRABAJADOR;
}

/**
 * Cuota social diaria (pesos corrientes del año) según el régimen vigente.
 * Montos nominales de cada decreto indexados por UMA (proxy de INPC).
 */
export function cuotaSocialDiaria(anio: number, sbcDiario: number): number {
  const uma = porAnio(UMA, anio);
  const sm = porAnio(SALARIO_MINIMO, anio);
  if (anio < 2009) {
    // 5.5% del SMG-DF jul-97 ($1.45), todos los salarios, indexado.
    return CS_1997_DIARIA * (uma / porAnio(UMA, CS_1997_ANIO));
  }
  if (anio < 2021) {
    // Tabla 2009 por veces salario mínimo, tope 15 SM.
    const vecesSm = sbcDiario / sm;
    const idx = uma / porAnio(UMA, CS_2009_ANIO);
    for (const [tope, monto] of CS_2009) {
      if (vecesSm <= tope) return monto * idx;
    }
    return 0; // > 15 SM
  }
  // Reforma 2021+: 1 SM → $10.75; bandas UMA hasta 4.00; transitorio 4.01-7.09.
  const idx = uma / porAnio(UMA, CS_2021_ANIO);
  if (sbcDiario <= sm * 1.001) return CS_2021_1SM * idx;
  const vecesUma = sbcDiario / uma;
  for (const [tope, monto] of CS_2021) {
    if (vecesUma <= tope) return monto * idx;
  }
  if (anio >= 2023 && vecesUma <= CS_2023_4A7_TOPE_UMA) return CS_2023_4A7_APROX * idx;
  return 0;
}

// ----------------------------------------------------------------------------
// 3) Semilla SAR-92 (may-1992 → jun-1997, capitalizada con CETES)
// ----------------------------------------------------------------------------

export function semillaSar92(meses: MesCotizado[]): number {
  const fin = mesIdx(MES_INICIO_RCV97) - 1; // jun-1997
  let saldo = 0;
  for (let i = mesIdx(MES_INICIO_SAR92); i <= fin; i++) {
    const mes = idxMes(i);
    // Serie mensual real (FRED/IFS = Banxico SF43936), % anual → mensual.
    const tasaMensual = (CETES_92_97_MENSUAL[mes] ?? 15) / 100 / 12;
    saldo *= 1 + tasaMensual;
    const mc = meses.find((x) => x.mes === mes);
    if (mc) saldo += TASA_SAR92 * mc.sbcDiario * mc.dias;
  }
  return saldo;
}

// ----------------------------------------------------------------------------
// 4) Motor principal
// ----------------------------------------------------------------------------

function precioEn(serie: Map<string, number>, mes: string, dir: 1 | -1 = -1): number | null {
  // Busca el precio del mes; si falta, camina hacia atrás (o adelante) hasta 12 meses.
  let i = mesIdx(mes);
  for (let k = 0; k <= 12; k++) {
    const p = serie.get(idxMes(i));
    if (p !== undefined) return p;
    i += dir;
  }
  return null;
}

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

// ----------------------------------------------------------------------------
// F2 — Modelo de retiros parciales por desempleo (v1.8)
//
// El motor buy-and-hold sobreestima el saldo de quien sacó dinero por
// desempleo: no solo faltan esos pesos, faltan sus rendimientos hasta hoy.
// F2 reconstruye CUÁNDO y CUÁNTO se retiró y quita las UNIDADES RCV en esa
// fecha, de modo que el rendimiento perdido queda capturado.
//
// Reglas de dominio (Raúl, 18-jul-2026):
//  · El trabajador retira el MÁXIMO posible en cada desempleo, tomando la
//    modalidad que le da MÁS dinero:
//      Modalidad A = 30 días del SBC reciente (topado a 10 salarios mínimos).
//                    NO está topada al 11.5% → puede quitar >11% de semanas.
//      Modalidad B = min( 90 días del salario promedio de las últimas 250 sem ,
//                         11.5% del saldo RCV ).
//      monto = max(A, B), acotado al saldo. fracción retirada = monto/saldo;
//      semanas descontadas por ese retiro = fracción × semanas acumuladas
//      EN ESE MOMENTO.
//  · No puede haber otro retiro en los 5 años siguientes (cooldown desde la
//    fecha del retiro).
//  · Solo se cuenta un retiro en un desempleo si las semanas descontadas que
//    faltan por explicar ≥ las que generaría un retiro topado ahí (si no,
//    sobre-explicaría → se busca un desempleo ANTERIOR: "enviar para atrás").
//  · Se calibra al total de `semanas_descontadas` (BRUTAS) del SISEC; las
//    recuperaciones (modalidad 10) no se re-suman: ya perdieron sus intereses.
// Las semanas se miden sobre la carrera BRUTA; el saldo se afecta solo en la
// subcuenta RCV-97 (el retiro por desempleo no toca el SAR-92).
// ----------------------------------------------------------------------------

const RETIRO_TOPE_PCT = 0.115; // 11.5% del saldo RCV (tope de Modalidad B)
const RETIRO_DIAS_A = 30; // Modalidad A: 30 días del SBC reciente
const RETIRO_DIAS_B = 90; // Modalidad B: 90 días del salario prom. 250 sem
const RETIRO_TOPE_SM_A = 10; // SBC de Modalidad A topado a 10 salarios mínimos
const RETIRO_COOLDOWN_MESES = 60; // 5 años entre retiros
const RETIRO_MIN_GAP_MESES = 2; // desempleo mínimo para calificar (≈46 días)
const RETIRO_VENTANA_SBC_MESES = 58; // ≈250 semanas para el salario promedio

export interface RetiroModelado {
  mes: string; // 'YYYY-MM' del retiro
  fraccion: number; // fracción de UNIDADES RCV retiradas en esa fecha
  semanas: number; // semanas descontadas atribuidas (escala SISEC)
}

/**
 * Reconstruye el calendario de retiros por desempleo que explica las
 * `semanasDescontadas` observadas, colocándolos en los desempleos reales de la
 * historia (más recientes primero; se salta un desempleo si un retiro topado
 * ahí sobre-explicaría lo que falta, empujando el retiro hacia atrás).
 * Devuelve las fracciones de unidades RCV a retirar en cada fecha (asc).
 */
export function reconstruirRetirosDesempleo(params: {
  meses: MesCotizado[]; // cotizados 1980→corte (con dias y sbcDiario)
  aportaciones: Array<{ mes: string; monto: number }>; // RCV mensual post-97
  serieRef: Map<string, number>; // precio "AFORE típica" (mediana del sistema) por mes
  semanasCotizadas: number; // brutas SISEC
  semanasDescontadas: number; // brutas SISEC
  mesCorte: string;
  /**
   * 'reciente' (default): coloca el retiro topado en el desempleo MÁS RECIENTE
   *   que no sobre-explique (empuja hacia atrás solo lo necesario). Estimación
   *   conservadora (menos rendimiento perdido).
   * 'antiguo': front-load — coloca los retiros topados desde el desempleo MÁS
   *   ANTIGUO (máximo rendimiento perdido). Cota inferior del saldo.
   */
  modo?: 'reciente' | 'antiguo';
}): RetiroModelado[] {
  const { meses, aportaciones, serieRef, semanasCotizadas, semanasDescontadas, mesCorte } = params;
  const modo = params.modo ?? 'reciente';
  if (!(semanasDescontadas > 0) || aportaciones.length === 0 || meses.length === 0) return [];

  const corteIdx = mesIdx(mesCorte);
  const rcvIniIdx = mesIdx(MES_INICIO_RCV97);

  // --- Estructuras acumuladas por índice de mes ---
  // Unidades RCV de referencia (AFORE mediana) acumuladas hasta cada mes.
  const aportAsc = [...aportaciones].sort((a, b) => mesIdx(a.mes) - mesIdx(b.mes));
  const uRefCum: Array<{ idx: number; u: number }> = [];
  let uAcc = 0;
  for (const a of aportAsc) {
    const p = precioEn(serieRef, a.mes, -1);
    if (p && p > 0) uAcc += a.monto / p;
    uRefCum.push({ idx: mesIdx(a.mes), u: uAcc });
  }
  const uRefEn = (idx: number): number => {
    let u = 0;
    for (const x of uRefCum) { if (x.idx <= idx) u = x.u; else break; }
    return u;
  };

  // Semanas brutas acumuladas (dias/7) hasta cada mes, escaladas a SISEC.
  const mesesAsc = [...meses].sort((a, b) => mesIdx(a.mes) - mesIdx(b.mes));
  const wCum: Array<{ idx: number; w: number }> = [];
  let wAcc = 0;
  for (const m of mesesAsc) { wAcc += m.dias / 7; wCum.push({ idx: mesIdx(m.mes), w: wAcc }); }
  const wBrutaEn = (idx: number): number => {
    let w = 0;
    for (const x of wCum) { if (x.idx <= idx) w = x.w; else break; }
    return w;
  };
  const wTotalMotor = wBrutaEn(corteIdx);
  const escala = semanasCotizadas > 0 && wTotalMotor > 0 ? semanasCotizadas / wTotalMotor : 1;
  const wObsEn = (idx: number): number => wBrutaEn(idx) * escala;

  // SBC diario de referencia = promedio ponderado por días de las últimas
  // ~250 semanas cotizadas antes del desempleo.
  const sbcPromAntes = (idx: number): number => {
    let sd = 0, dd = 0;
    for (const m of mesesAsc) {
      const mi = mesIdx(m.mes);
      if (mi >= idx) break;
      if (mi < idx - RETIRO_VENTANA_SBC_MESES) continue;
      sd += m.sbcDiario * m.dias; dd += m.dias;
    }
    if (dd > 0) return sd / dd;
    // fallback: último SBC conocido antes del hueco
    let last = 0;
    for (const m of mesesAsc) { if (mesIdx(m.mes) < idx) last = m.sbcDiario; else break; }
    return last;
  };
  // SBC más reciente conocido antes del desempleo (Modalidad A).
  const sbcUltimoAntes = (idx: number): number => {
    let last = 0;
    for (const m of mesesAsc) { if (mesIdx(m.mes) < idx) last = m.sbcDiario; else break; }
    return last;
  };

  // --- Desempleos (huecos) en la era RCV, ≥ RETIRO_MIN_GAP_MESES ---
  const cot = new Set(mesesAsc.map((m) => mesIdx(m.mes)));
  const primerCot = mesIdx(mesesAsc[0].mes);
  const gaps: number[] = []; // idx del primer mes SIN cotización de cada hueco
  let i = primerCot;
  while (i <= corteIdx) {
    if (!cot.has(i) && cot.has(i - 1)) {
      const inicio = i;
      let j = i;
      while (j <= corteIdx && !cot.has(j)) j++;
      const largo = j - inicio;
      if (largo >= RETIRO_MIN_GAP_MESES && inicio >= rcvIniIdx) gaps.push(inicio);
      i = j;
    } else i++;
  }
  if (gaps.length === 0) return [];

  // --- Colocación: más recientes primero, retiro TOPADO completo solo si no
  //     sobre-explica; cooldown de 5 años; el residuo se coloca como retiro
  //     parcial en el desempleo elegible más antiguo. ---
  const retiros: Array<{ idx: number; fraccion: number; semanas: number }> = [];
  let restante = semanasDescontadas;
  const EPS = 0.5;

  const fraccionEn = (idx: number): { f: number; w: number } => {
    const bal = uRefEn(idx) * (precioEn(serieRef, idxMes(idx), -1) ?? 0);
    if (!(bal > 0)) return { f: 0, w: 0 };
    const anio = anioDe(idxMes(idx));
    const sm = porAnio(SALARIO_MINIMO, anio);
    // Modalidad A: 30 días del SBC reciente, topado a 10 SM (puede rebasar 11.5%).
    const sbcRec = Math.min(sbcUltimoAntes(idx), RETIRO_TOPE_SM_A * sm);
    const montoA = RETIRO_DIAS_A * sbcRec;
    // Modalidad B: min(90 días del salario prom. 250 sem, 11.5% del saldo RCV).
    const montoB = Math.min(RETIRO_DIAS_B * sbcPromAntes(idx), RETIRO_TOPE_PCT * bal);
    // Toma la modalidad que da MÁS, acotada al saldo disponible.
    const monto = Math.min(bal, Math.max(montoA, montoB));
    const f = Math.max(0, Math.min(1, monto / bal));
    return { f, w: f * wObsEn(idx) };
  };

  if (modo === 'antiguo') {
    // Front-load: retiro topado desde el desempleo más antiguo, cooldown 5 años.
    let ultimoColocado = -Infinity;
    for (const g of [...gaps].sort((a, b) => a - b)) {
      if (restante <= EPS) break;
      if (g - ultimoColocado < RETIRO_COOLDOWN_MESES) continue;
      const { f, w } = fraccionEn(g);
      if (!(w > 0)) continue;
      if (w <= restante + EPS) {
        retiros.push({ idx: g, fraccion: f, semanas: w });
        restante -= w;
      } else {
        // parcial para no sobre-explicar el total observado
        const fp = Math.max(0, Math.min(1, restante / wObsEn(g)));
        retiros.push({ idx: g, fraccion: fp, semanas: fp * wObsEn(g) });
        restante -= fp * wObsEn(g);
      }
      ultimoColocado = g;
    }
  } else {
    // 'reciente': retiro topado en el desempleo más reciente que no sobre-explique.
    let ultimoColocado = Infinity;
    for (const g of [...gaps].sort((a, b) => b - a)) {
      if (restante <= EPS) break;
      if (ultimoColocado - g < RETIRO_COOLDOWN_MESES) continue; // cooldown
      const { f, w } = fraccionEn(g);
      if (!(w > 0)) continue;
      if (restante + EPS >= w) {
        retiros.push({ idx: g, fraccion: f, semanas: w });
        restante -= w;
        ultimoColocado = g;
      }
      // else: sobre-explicaría → se salta (empuja hacia atrás)
    }
  }

  // Residuo: retiro parcial en el desempleo elegible más antiguo disponible.
  if (restante > EPS) {
    const usados = new Set(retiros.map((r) => r.idx));
    const gapsAsc = [...gaps].sort((a, b) => a - b);
    for (const g of gapsAsc) {
      if (usados.has(g)) continue;
      // respeta cooldown contra retiros vecinos ya colocados
      if (retiros.some((r) => Math.abs(r.idx - g) < RETIRO_COOLDOWN_MESES)) continue;
      const w = wObsEn(g);
      if (!(w > 0)) continue;
      const f = Math.max(0, Math.min(1, restante / w));
      retiros.push({ idx: g, fraccion: f, semanas: f * w });
      restante -= f * w;
      break;
    }
  }

  return retiros
    .sort((a, b) => a.idx - b.idx)
    .map((r) => ({ mes: idxMes(r.idx), fraccion: round(r.fraccion, 6), semanas: round(r.semanas, 1) }));
}

export function calcularContrafactual(input: EntradaContrafactual): ResultadoContrafactual {
  const supuestos: string[] = [
    'Precios de bolsa CONSAR (netos de comisión), series encadenadas por generación.',
    'Buy-and-hold: cada AFORE simulada sostiene los recursos toda la historia.',
    'SAR-92: 2% del SBC may92-jun97 capitalizado con CETES 28d (promedios anuales), entra como monto inicial en jul-97.',
    'Retiros parciales y aportaciones voluntarias no modelados.',
    'Huecos de salario imputados con ratio salario/UMA histórico del cliente.',
    'Eventos sin cambios de salario: interpolación del salario de alta al de baja (o al actual) por empleo.',
    'AFOREs con serie corta: prefijo índice-industria (solo simulación, no ranking).',
    'La campaña compara SOLO números de este motor; el estimado de la metodología anterior es referencia informativa y el saldo real entra hasta el unlock con estado de cuenta.',
  ];

  // Mes de valuación: último mes común de las series
  const hoyMes =
    input.hoy_mes ??
    input.series
      .map((s) => s.precios[s.precios.length - 1]?.mes)
      .filter(Boolean)
      .sort()[0];
  if (!hoyMes) throw new Error('series de precios vacías');

  // 1) SBC mensual desde may-1992 hasta el corte
  // Desde 1980: los meses pre-1992 no generan SAR/RCV pero SÍ cuentan para la
  // cobertura (las semanas SISEC abarcan toda la carrera, no solo desde 1992).
  const meses = sbcMensual(input.historia, '1980-01', hoyMes, input.ratio_salario_uma);
  const mesesRcv = meses.filter((m) => mesIdx(m.mes) >= mesIdx(MES_INICIO_RCV97));

  // 2) Semilla SAR-92
  const b92 = semillaSar92(meses);

  // 3) Aportaciones RCV mensuales (nominal)
  const aportaciones: Array<{ mes: string; monto: number }> = mesesRcv.map((m) => {
    const anio = anioDe(m.mes);
    const rcv = tasaRcv(anio, m.sbcDiario) * m.sbcDiario * m.dias;
    const cs = cuotaSocialDiaria(anio, m.sbcDiario) * m.dias;
    return { mes: m.mes, monto: rcv + cs };
  });
  const aportadoNominal = aportaciones.reduce((s, a) => s + a.monto, 0);

  // 3.5) F2: reconstrucción de retiros por desempleo (v1.8).
  // Serie de referencia "AFORE mediana del sistema" (mediana de precios por
  // mes) para dimensionar el tope 11.5% y el salario relativo del retiro.
  const serieRef = new Map<string, number>();
  {
    const porMes = new Map<string, number[]>();
    for (const s of input.series)
      for (const p of s.precios) {
        const arr = porMes.get(p.mes);
        if (arr) arr.push(p.precio);
        else porMes.set(p.mes, [p.precio]);
      }
    for (const [mes, arr] of porMes) serieRef.set(mes, mediana(arr));
  }
  const mesCorteRetiro = input.fecha_corte_semanas ? input.fecha_corte_semanas.slice(0, 7) : hoyMes;
  const retiros = reconstruirRetirosDesempleo({
    meses,
    aportaciones,
    serieRef,
    semanasCotizadas: Number(input.semanas_cotizadas ?? 0),
    semanasDescontadas: Number(input.semanas_descontadas ?? 0),
    mesCorte: mesCorteRetiro,
    modo: input.retiro_modo ?? 'reciente',
  });
  const retirosAsc = retiros
    .map((r) => ({ idx: mesIdx(r.mes), fraccion: r.fraccion }))
    .sort((a, b) => a.idx - b.idx);

  // 4) Valuación por AFORE (método de unidades). Los retiros por desempleo
  // quitan fracción de las UNIDADES RCV en su fecha → el rendimiento perdido
  // queda capturado (a diferencia de un factor plano sobre el saldo de hoy).
  const rcvBrutoPorAfore = new Map<string, number>();
  const saldos: SaldoAfore[] = [];
  for (const s of input.series) {
    const mapa = new Map(s.precios.map((p) => [p.mes, p.precio]));
    const pHoy = precioEn(mapa, hoyMes, -1);
    if (!pHoy) continue;
    // Precio de entrada del SAR-92: jul-97 o, si la serie empieza después,
    // su primer precio (el batch entrega series completas desde 1997 vía
    // índice industria; este fallback es para series sintéticas/parciales).
    const p97 = precioEn(mapa, MES_INICIO_RCV97, 1) ?? s.precios[0]?.precio ?? null;
    if (b92 > 0 && !p97) continue;

    let unidadesRcv = 0; // con retiros aplicados en su fecha
    let unidadesRcvBruto = 0; // sin retiros (diagnóstico)
    let ri = 0;
    for (const a of aportaciones) {
      const ai = mesIdx(a.mes);
      while (ri < retirosAsc.length && retirosAsc[ri].idx <= ai) {
        unidadesRcv *= 1 - retirosAsc[ri].fraccion;
        ri++;
      }
      const p = precioEn(mapa, a.mes, -1);
      if (p) {
        const u = a.monto / p;
        unidadesRcv += u;
        unidadesRcvBruto += u;
      }
    }
    while (ri < retirosAsc.length) {
      unidadesRcv *= 1 - retirosAsc[ri].fraccion;
      ri++;
    }

    const unidades92 = b92 > 0 && p97 ? b92 / p97 : 0;
    rcvBrutoPorAfore.set(s.afore, unidadesRcvBruto * pHoy);
    saldos.push({
      afore: s.afore,
      saldo: round((unidadesRcv + unidades92) * pHoy, 0),
      rcv97: round(unidadesRcv * pHoy, 0),
      sar92: round(unidades92 * pHoy, 0),
    });
  }
  if (saldos.length === 0) throw new Error('ninguna serie valuable');
  saldos.sort((a, b) => b.saldo - a.saldo);

  // 5) Referencias
  const porAfore = new Map(saldos.map((s) => [s.afore, s]));
  const sup = input.canastas.superior.map((a) => porAfore.get(a)).filter(Boolean) as SaldoAfore[];
  const baja = input.canastas.baja.map((a) => porAfore.get(a)).filter(Boolean) as SaldoAfore[];
  if (sup.length === 0) throw new Error('canasta superior sin series valuables');

  const promSup = sup.reduce((x, s) => x + s.saldo, 0) / sup.length;
  const med = mediana(saldos.map((s) => s.saldo));
  const promBaja = baja.length ? baja.reduce((x, s) => x + s.saldo, 0) / baja.length : 0;

  // Factor efectivo del modelo de retiros sobre el RCV de la canasta superior.
  const rcvSupAdj = sup.reduce((x, s) => x + s.rcv97, 0);
  const rcvSupBruto = sup.reduce((x, s) => x + (rcvBrutoPorAfore.get(s.afore) ?? s.rcv97), 0);
  const factorRetiroEfectivo = rcvSupBruto > 0 ? round(rcvSupAdj / rcvSupBruto, 4) : 1;
  if (retiros.length > 0) {
    supuestos.push(
      `Retiros por desempleo modelados (F2): ${retiros.length} retiro(s), ` +
        `se retiran unidades RCV en su fecha (rendimiento perdido capturado).`,
    );
  }
  // Castigo plano TEMPORAL sobre todos los saldos (default 0). Se aplica al
  // final; uniforme, no altera el ranking ni factor_retiro_efectivo.
  const castigo = Math.max(0, Math.min(1, Number(input.castigo_plano ?? 0)));
  const k = 1 - castigo;
  if (castigo > 0) {
    supuestos.push(
      `Castigo plano temporal de ${(castigo * 100).toFixed(0)}% sobre todos los ` +
        `saldos (ajuste conservador; se removerá con mejor muestra de declarados).`,
    );
  }

  // Flag de publicación (decisión 19-jul): SOLO datos internos + semanas SISEC.
  // v1.7 (auditoría 19-jul PM):
  //   a) numerador ponderado por DÍAS cotizados (meses parciales ya no inflan
  //      la cobertura de carreras cortas/fragmentadas);
  //   b) segunda oportunidad por VENTANA DE SALDO: si la cobertura total falla
  //      pero la de may-92→corte (descontando del denominador la carrera
  //      pre-92 máxima según el año de alta del NSS) está en rango, se publica
  //      — las semanas pre-92 no generaron saldo y no deben vetar el cálculo.
  const semanas = input.semanas_cotizadas ?? null;
  const mesCorte = input.fecha_corte_semanas ? input.fecha_corte_semanas.slice(0, 7) : hoyMes;
  const mesesHasta = meses.filter((m) => mesIdx(m.mes) <= mesIdx(mesCorte));
  const mesesCobertura = mesesHasta.reduce((s, m) => s + m.dias, 0) / 30.4375;
  const mesesSisec = semanas != null && semanas > 0 ? semanas / 4.345 : null;
  const cobertura = mesesSisec ? round(mesesCobertura / mesesSisec, 2) : null;

  let coberturaVentana: number | null = null;
  if (mesesSisec && input.anio_alta_nss && input.anio_alta_nss < 1992) {
    // Carrera pre-92 máxima posible: alta (se asume enero) → abr-92 continuo.
    const mesesPre92Max = Math.max(0, (1992 - input.anio_alta_nss) * 12 - 8);
    const mesesVentana = mesesHasta
      .filter((m) => mesIdx(m.mes) >= mesIdx(MES_INICIO_SAR92))
      .reduce((s, m) => s + m.dias, 0) / 30.4375;
    const denom = Math.max(12, mesesSisec - mesesPre92Max);
    coberturaVentana = round(mesesVentana / denom, 2);
  }
  const enRango = (x: number | null) => x != null && x >= 0.7 && x <= 1.3;
  const flag = enRango(cobertura) || enRango(coberturaVentana);

  const estimadoPrevio = input.estimado_previo ?? null;

  return {
    version: 'contrafactual-1.8',
    precios_corte: hoyMes,
    saldos_por_afore: saldos.map((s) => ({
      afore: s.afore,
      saldo: round(s.saldo * k, 0),
      rcv97: round(s.rcv97 * k, 0),
      sar92: round(s.sar92 * k, 0),
    })),
    canasta_superior: {
      afores: input.canastas.superior,
      promedio: round(promSup * k, 0),
      min: round(Math.min(...sup.map((s) => s.saldo)) * k, 0),
      max: round(Math.max(...sup.map((s) => s.saldo)) * k, 0),
    },
    mediana_sistema: round(med * k, 0),
    canasta_baja: { afores: input.canastas.baja, promedio: round(promBaja * k, 0) },
    desglose_referencia: {
      rcv97: round((sup.reduce((x, s) => x + s.rcv97, 0) / sup.length) * k, 0),
      sar92: round((sup.reduce((x, s) => x + s.sar92, 0) / sup.length) * k, 0),
    },
    brecha_top_vs_mediana: round((promSup - med) * k, 0),
    brecha_top_vs_baja: round((promSup - promBaja) * k, 0),
    referencia_previa: {
      estimado: estimadoPrevio,
      delta_vs_mediana: estimadoPrevio != null ? round(med * k - estimadoPrevio, 0) : null,
    },
    cobertura_historia: cobertura,
    cobertura_ventana_saldo: coberturaVentana,
    flag_publicable: flag,
    meses_cotizados: mesesRcv.length,
    aportado_nominal: round(aportadoNominal, 0),
    sar92_semilla: round(b92, 0),
    supuestos,
    retiros_desempleo: retiros,
    factor_retiro_efectivo: factorRetiroEfectivo,
  };
}

// ----------------------------------------------------------------------------
// 5) Canastas por CAGR de precios (para el batch; usa solo datos PROPIOS)
// ----------------------------------------------------------------------------

export function rankingPorCagr(
  series: SerieAfore[],
  mesesMinimos: number,
): Array<{ afore: string; cagr: number; meses: number }> {
  const out: Array<{ afore: string; cagr: number; meses: number }> = [];
  for (const s of series) {
    const propios = s.precios.filter((p) => mesIdx(p.mes) >= mesIdx(s.primerMesPropio));
    if (propios.length < mesesMinimos) continue;
    const p0 = propios[0];
    const p1 = propios[propios.length - 1];
    const anios = (mesIdx(p1.mes) - mesIdx(p0.mes)) / 12;
    if (anios <= 0) continue;
    out.push({
      afore: s.afore,
      cagr: Math.pow(p1.precio / p0.precio, 1 / anios) - 1,
      meses: propios.length,
    });
  }
  return out.sort((a, b) => b.cagr - a.cagr);
}

/** Canastas top-3 / bottom-3 por CAGR de datos propios (metodología v1.4 §3 paso 4). */
export function definirCanastas(series: SerieAfore[], mesesMinimos: number): Canastas {
  const rk = rankingPorCagr(series, mesesMinimos);
  return {
    superior: rk.slice(0, 3).map((r) => r.afore),
    baja: rk.slice(-3).map((r) => r.afore),
  };
}

// ----------------------------------------------------------------------------
// 6) Completado con índice industria (metodología v1.4, decisión #5 ajustada)
// ----------------------------------------------------------------------------

/**
 * Completa las series cortas hacia atrás con el índice industria: para cada
 * mes anterior al primer precio propio de una AFORE, se aplica el retorno
 * MEDIANO mensual de las AFOREs vivas ese mes, encadenado por nivel desde su
 * primer precio propio (hacia atrás). El resultado marca `primerMesPropio`
 * para que el ranking de canastas ignore el prefijo.
 */
export function completarConIndiceIndustria(
  parciales: Array<{ afore: string; precios: PrecioMes[] }>,
): SerieAfore[] {
  // Universo de meses (ordenado) y mapas por AFORE
  const mesesSet = new Set<string>();
  const mapas = parciales.map((s) => {
    const mapa = new Map(s.precios.map((p) => [p.mes, p.precio]));
    s.precios.forEach((p) => mesesSet.add(p.mes));
    return { afore: s.afore, mapa, primer: s.precios[0]?.mes ?? null };
  });
  const meses = [...mesesSet].sort();

  // Retorno mediano de la industria por mes (entre AFOREs con precio en m-1 y m)
  const retIndustria = new Map<string, number>();
  for (let i = 1; i < meses.length; i++) {
    const rets: number[] = [];
    for (const s of mapas) {
      const p0 = s.mapa.get(meses[i - 1]);
      const p1 = s.mapa.get(meses[i]);
      if (p0 && p1) rets.push(p1 / p0 - 1);
    }
    if (rets.length) retIndustria.set(meses[i], mediana(rets));
  }

  // Prefijo hacia atrás para cada serie corta
  return mapas.map((s) => {
    if (!s.primer) return { afore: s.afore, precios: [], primerMesPropio: '' };
    const precios: PrecioMes[] = [];
    // hacia atrás desde el primer precio propio
    let nivel = s.mapa.get(s.primer)!;
    const prefijo: PrecioMes[] = [];
    const idx0 = meses.indexOf(s.primer);
    for (let i = idx0; i > 0; i--) {
      const r = retIndustria.get(meses[i]);
      if (r === undefined) break;
      nivel = nivel / (1 + r);
      prefijo.push({ mes: meses[i - 1], precio: nivel });
    }
    prefijo.reverse();
    // tramo propio
    for (let i = idx0; i < meses.length; i++) {
      const p = s.mapa.get(meses[i]);
      if (p !== undefined) precios.push({ mes: meses[i], precio: p });
    }
    return { afore: s.afore, precios: [...prefijo, ...precios], primerMesPropio: s.primer };
  });
}
