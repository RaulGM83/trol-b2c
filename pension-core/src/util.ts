// ============================================================================
// Utilidades compartidas del motor IMSS (fechas estilo Excel y lookups)
// ============================================================================

import { INPC, INPC_PROYECCION_MENSUAL } from './tablas';

export const DIAS_ANIO = 365.25;
export const DIAS_ANIO_RETIRO = 365.4375; // factor del Excel para fecha de retiro
export const DIAS_MES = 30.4375;
export const DIAS_MES_PENSION = 30.1; // factor del Excel para meses de pensión

export const MS_DIA = 86_400_000;

export function diasEntre(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / MS_DIA;
}

export function addDias(d: Date, dias: number): Date {
  return new Date(d.getTime() + dias * MS_DIA);
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Primer día del mes de `d` (UTC). */
export function inicioMes(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Resta `n` meses conservando día 1 (las series del Excel van de mes en mes). */
export function mesAnterior(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
}

export function addMeses(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
}

/** Días del mes de la fecha (EOMONTH + DAY del Excel). */
export function diasDelMes(d: Date): number {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

export function claveMes(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * VLOOKUP(..., TRUE) de Excel: mayor llave <= valor, sobre pares ordenados asc.
 */
export function lookupAprox<T>(valor: number, tabla: Array<[number, ...T[]]>): [number, ...T[]] {
  let res = tabla[0];
  for (const fila of tabla) {
    if (fila[0] <= valor) res = fila;
    else break;
  }
  return res;
}

/** Lookup exacto en Record<number, V> con clamp a los extremos (años fuera de tabla). */
export function porAnio(rec: Record<number, number>, anio: number): number {
  if (rec[anio] !== undefined) return rec[anio];
  const anios = Object.keys(rec).map(Number).sort((a, b) => a - b);
  if (anio < anios[0]) return rec[anios[0]];
  return rec[anios[anios.length - 1]];
}

/** INPC del mes; si falta, extiende la proyección a 3.5% anual desde el último dato. */
export function inpcMes(d: Date): number {
  const k = claveMes(d);
  if (INPC[k] !== undefined) return INPC[k];
  const claves = Object.keys(INPC).sort();
  const ultima = claves[claves.length - 1];
  const [uy, um] = ultima.split('-').map(Number);
  const dy = d.getUTCFullYear(), dm = d.getUTCMonth() + 1;
  const deltaMeses = (dy - uy) * 12 + (dm - um);
  if (deltaMeses > 0) return INPC[ultima] * Math.pow(INPC_PROYECCION_MENSUAL, deltaMeses);
  const primera = claves[0];
  return INPC[primera];
}

export function round(v: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(v * f) / f;
}
