// 228 · Qué inmueble le conviene: el motor corrido para TODOS los inmuebles disponibles,
// ordenados por ventaja al mismo horizonte, con un semáforo de riesgo que NO reordena
// (decisión Raúl 10-oct-2026). Lo que el motor no sabe del cliente (cuántos meses sin renta
// aguanta, cuánto puede destinar al pago) entra como "factores personales" editables por
// el asesor y se guarda con la asesoría; nunca sale en el material del cliente.
//
// Reglas de lectura:
//  · La aportación patronal NUNCA paga la mensualidad: cae a capital. Por eso "espacio para
//    aportaciones" = que el crédito no se liquide antes de que el cliente deje de cotizar;
//    si se liquida antes, las aportaciones que siguen regresan a la subcuenta a rendir poco.
//  · El riesgo de vacancia lo mide lo que falta cada mes entre renta neta y pago, contra lo
//    que el cliente dijo que puede destinar, y la reserva que necesita para N meses sin renta.
//  · Retención arriba del 30% del salario: Infonavit rara vez la autoriza (rojo).
import { calcularAsesoriaInfonavit, sobreprecioMinimo } from '@trol/pension-core';
import type { ClienteInfonavit, InmuebleInfonavit, PalancasInfonavit, ResultadoInfonavit, SupuestosInfonavit } from '@trol/pension-core';

export interface FactoresPersonales {
  /** Meses seguidos sin renta que el cliente podría absorber de su bolsa. */
  meses_sin_renta: number;
  /** Lo que puede destinar al mes al pago del crédito, además de la renta. */
  ingreso_disponible: number;
  /** En cuántos meses necesita el dinero (null = sin urgencia: manda el horizonte elegido). */
  urgencia_meses: number | null;
}

export const FACTORES_DEFAULT = (ingresoMensual: number): FactoresPersonales => ({
  meses_sin_renta: 3,
  ingreso_disponible: Math.round((ingresoMensual || 0) * 0.15 / 100) * 100,
  urgencia_meses: null,
});

export type Semaforo = 'verde' | 'ambar' | 'rojo';

export interface ProyectoRankeable {
  id: string; desarrollo: string; zona: string | null;
  avaluo: number; escrituracion: number; costo_aliado: number | null; renta: number; plusvalia: number;
  notariales_credito: number; notariales_adicionales: number; comision_desarrollador: number;
  aliado_cubre_notariales: boolean; pct_excedente_constructora?: number | null;
}

export interface FilaSugerencia {
  id: string; desarrollo: string; zona: string | null;
  viable: boolean;
  sobreprecio_requerido: number;
  credito: number; pmt: number; renta_neta: number; cobertura: number; faltante: number; pct_salario: number;
  reserva_sin_renta: number;
  /** Mes en que el crédito queda liquidado (null = no dentro del motor). */
  mes_liquida: number | null;
  meses_cotizando: number; aport_mensual: number;
  /** Meses de aportación que NO tendrían dónde caer porque el crédito ya se liquidó. */
  aportaciones_sin_cabida_meses: number;
  horizonte: number; ventaja: number; recibe_dia: number; flujo_neto_acum: number;
  semaforo: Semaforo; motivos: string[];
}

export interface Sugerencia {
  horizonte_ref: number;
  factores: FactoresPersonales;
  filas: FilaSugerencia[];
}

const fmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const money = (n: number) => fmt.format(n);

export function rankearInmuebles(args: {
  proyectos: ProyectoRankeable[];
  cliente: ClienteInfonavit;
  supuestos: Partial<SupuestosInfonavit>;
  palancas: PalancasInfonavit;
  factores: FactoresPersonales;
  creditoMin: number;
  /** Horizonte en el que se comparan todos (el elegido por el asesor, si hay). */
  horizonteElegido: number | null;
  /** Mejor horizonte del inmueble actual, para no comparar en el vacío. */
  horizonteFallback: number | null;
}): Sugerencia {
  const { proyectos, cliente, supuestos, palancas, factores, creditoMin, horizonteElegido, horizonteFallback } = args;
  const ssv = cliente.titulares.reduce((a, t) => a + (t.ssv || 0), 0);
  const mesesCot = Math.max(0, ...cliente.titulares.map((t) => t.meses_cotizando || 0));
  const horizontes = supuestos.horizontes ?? [];
  // Urgencia: el horizonte más largo que cabe antes de que necesite el dinero.
  const porUrgencia = factores.urgencia_meses
    ? [...horizontes].filter((h) => h <= (factores.urgencia_meses as number)).sort((a, b) => b - a)[0] ?? horizontes[0] ?? null
    : null;
  const hRef = horizonteElegido ?? porUrgencia ?? horizonteFallback ?? horizontes[0] ?? 24;

  const filas: FilaSugerencia[] = [];
  for (const p of proyectos) {
    const min = sobreprecioMinimo(p, ssv, creditoMin);
    if (!min.viable) continue;
    const inm: InmuebleInfonavit = {
      avaluo: p.avaluo, escrituracion: p.escrituracion, costo_aliado: p.costo_aliado ?? p.escrituracion,
      renta: p.renta, plusvalia: p.plusvalia, notariales_credito: p.notariales_credito,
      notariales_adicionales: p.notariales_adicionales, comision_desarrollador: p.comision_desarrollador,
      aliado_cubre_notariales: p.aliado_cubre_notariales, sobreprecio: min.requerido,
      pct_sobreprecio_constructora: p.pct_excedente_constructora ?? 0,
    };
    let r: ResultadoInfonavit;
    try { r = calcularAsesoriaInfonavit(cliente, inm, supuestos, { ...palancas, plusvalia: p.plusvalia }); }
    catch { continue; }
    const op = r.operacion;
    const fila = r.tabla.find((f) => f.horizonte === hRef)
      ?? [...r.tabla].sort((a, b) => Math.abs(a.horizonte - hRef) - Math.abs(b.horizonte - hRef))[0];
    if (!fila) continue;
    const faltante = Math.max(0, op.pmt - op.renta_neta);
    const cobertura = op.pmt > 0 ? op.renta_neta / op.pmt : Infinity;
    const aport = r.cliente_derivado.aport_mensual;
    const sinCabida = r.mes_liquida_credito != null && mesesCot > r.mes_liquida_credito ? mesesCot - r.mes_liquida_credito : 0;

    const motivos: string[] = [];
    let sem: Semaforo = 'verde';
    // La retención de nómina sólo existe mientras cotiza; quien no cotiza paga directo a Infonavit.
    if (mesesCot > 0 && op.pct_salario > 0.30) { sem = 'rojo'; motivos.push(`Retención ${(op.pct_salario * 100).toFixed(0)}% del salario: Infonavit rara vez la autoriza`); }
    if (mesesCot === 0) motivos.push('No cotiza: paga directo a Infonavit, sin retención de nómina');
    if (faltante > factores.ingreso_disponible) {
      sem = 'rojo'; motivos.push(`Aun con renta faltan ${money(faltante)} al mes y dijo poder poner ${money(factores.ingreso_disponible)}`);
    } else if (faltante > 0) {
      if (sem !== 'rojo') sem = 'ambar';
      motivos.push(`La renta cubre ${(cobertura * 100).toFixed(0)}% del pago; pone ${money(faltante)} al mes`);
    } else {
      motivos.push(`La renta cubre el pago (${(cobertura * 100).toFixed(0)}%)`);
    }
    if (op.pmt > factores.ingreso_disponible) {
      if (sem === 'verde') sem = 'ambar';
      motivos.push(`Sin renta el pago (${money(op.pmt)}) supera lo que destina al mes; ${factores.meses_sin_renta} meses vacíos = ${money(op.pmt * factores.meses_sin_renta)} de su bolsa`);
    } else {
      motivos.push(`Sin renta sostiene el pago solo: ${factores.meses_sin_renta} meses vacíos = ${money(op.pmt * factores.meses_sin_renta)}`);
    }
    if (aport > 0 && mesesCot > 0) {
      if (sinCabida > 0) {
        if (sem === 'verde') sem = 'ambar';
        motivos.push(`El crédito se liquida en el mes ${r.mes_liquida_credito}; ${sinCabida} meses de aportación (≈${money(aport * sinCabida)}) regresarían a la subcuenta`);
      } else {
        motivos.push(`Absorbe las aportaciones de los ${mesesCot} meses que seguirá cotizando (${money(aport)}/mes a capital)`);
      }
    }
    if (factores.urgencia_meses && fila.horizonte > factores.urgencia_meses) {
      if (sem === 'verde') sem = 'ambar';
      motivos.push(`Necesita el dinero en ${factores.urgencia_meses} meses y el horizonte más corto del motor es ${fila.horizonte}`);
    }
    filas.push({
      id: p.id, desarrollo: p.desarrollo, zona: p.zona, viable: true, sobreprecio_requerido: min.requerido,
      credito: op.credito, pmt: op.pmt, renta_neta: op.renta_neta, cobertura, faltante, pct_salario: op.pct_salario,
      reserva_sin_renta: op.pmt * factores.meses_sin_renta,
      mes_liquida: r.mes_liquida_credito, meses_cotizando: mesesCot, aport_mensual: aport, aportaciones_sin_cabida_meses: sinCabida,
      horizonte: fila.horizonte, ventaja: fila.ventaja_corte, recibe_dia: fila.recibe_dia, flujo_neto_acum: fila.flujo_neto_acum,
      semaforo: sem, motivos,
    });
  }
  // Orden: ventaja del motor al horizonte de referencia. El semáforo informa, no reordena.
  filas.sort((a, b) => b.ventaja - a.ventaja);
  return { horizonte_ref: hRef, factores, filas };
}
