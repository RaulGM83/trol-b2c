// ============================================================================
// Pensión Ley 73 a la FECHA DEL DERECHO (espejo del motor v5.7, claude/90).
//
// Quien ya no cotiza y ya cumplió los requisitos (60 años, >500 semanas, baja
// y conservación vigente) ganó su derecho en D = la más tardía entre la última
// cotización y los 60 años. El monto se calcula a esa fecha —edad a D (regla
// del .5), mínima garantizada del año de D— y desde ahí sube cada febrero con
// la inflación dic/dic del año anterior (art. 57 LSS). La fecha en que tramite
// sólo cambia los meses de retroactivo (tope 12), no el monto.
// ============================================================================

import { addMeses, diasEntre, inicioMes } from './util';

/** Inflación anual diciembre/diciembre (INEGI), %. 2025 = 3.69 (nómina IMSS sep-2026). */
export const INFLACION_ANUAL_DIC: Record<number, number> = {
  1995: 51.97, 1996: 27.7, 1997: 15.72, 1998: 18.61, 1999: 12.32,
  2000: 8.96, 2001: 4.4, 2002: 5.7, 2003: 3.98, 2004: 5.19,
  2005: 3.33, 2006: 4.05, 2007: 3.76, 2008: 6.53, 2009: 3.57,
  2010: 4.4, 2011: 3.82, 2012: 3.57, 2013: 3.97, 2014: 4.08,
  2015: 2.13, 2016: 3.36, 2017: 6.77, 2018: 4.83, 2019: 2.83,
  2020: 3.15, 2021: 7.36, 2022: 7.82, 2023: 4.66, 2024: 4.21,
  2025: 3.69,
};

/**
 * Producto de los incrementos de febrero entre `desde` (exclusiva) y `hasta`
 * (inclusiva). Los años sin inflación publicada no suman (pesos de hoy).
 */
export function factorIncrementosFebrero(desde: Date, hasta: Date): number {
  let f = 1;
  for (let y = desde.getUTCFullYear(); y <= hasta.getUTCFullYear(); y++) {
    const feb = new Date(Date.UTC(y, 1, 1));
    if (feb <= desde || feb > hasta) continue;
    const inf = INFLACION_ANUAL_DIC[y - 1];
    if (inf !== undefined) f *= 1 + inf / 100;
  }
  return f;
}

/** D = la más tardía entre la última cotización y el cumpleaños 60. */
export function fechaDelDerecho(fechaNacimiento: Date, ultimaCotizacion: Date): Date {
  const fecha60 = addMeses(fechaNacimiento, 60 * 12);
  return diasEntre(fecha60, ultimaCotizacion) > 0 ? ultimaCotizacion : fecha60;
}

/**
 * Monto a un mes dado: la fórmula a D actualizada, entre la mínima de D
 * actualizada y el tope. Es la misma regla para "hoy" y para cada mes del
 * retroactivo.
 */
export function montoActualizado(
  formulaD: number,
  pmgD: number,
  maxima: number,
  D: Date,
  al: Date,
): number {
  const f = factorIncrementosFebrero(D, al);
  return Math.max(pmgD * f, Math.min(formulaD * f, maxima));
}

/**
 * Retroactivo: las últimas `meses` mensualidades antes del trámite, cada una
 * con el incremento vigente en su mes (el IMSS paga como máximo 12).
 */
export function retroactivoDesdeDerecho(
  formulaD: number,
  pmgD: number,
  maxima: number,
  D: Date,
  fechaTramite: Date,
  meses: number,
): number {
  let total = 0;
  const base = inicioMes(fechaTramite);
  for (let k = 0; k < meses; k++) {
    total += montoActualizado(formulaD, pmgD, maxima, D, addMeses(base, -k));
  }
  return total;
}
