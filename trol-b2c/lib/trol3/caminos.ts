// 209 · Caminos cerrados: ver y partir de aquí (claude/94).
//
// Un camino es un escenario cerrado de la calculadora (`trol3.escenarios`, tipo
// calc_ley73 / calc_ley97). Es inmutable: lo que se guardó al cerrar es lo que se
// le presentó al cliente ese día. Este módulo lo convierte en algo que las dos
// calculadoras pueden cargar, ramificando por ley como `escenarioNarrable`.
//
//   · "Ver": pinta lo guardado (resultado + barrido), con la semilla del snapshot.
//     No recalcula. Sin barrido (cerrados antes de claude/50) no hay tabla.
//   · "Partir de aquí": carga las palancas (y en Ley 97 incluir y destino) en la
//     calculadora editable, con la semilla de HOY. Al cerrar nace un escenario
//     nuevo con `inputs.partio_de`; el original no se toca.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SemillaV2 } from '@trol/pension-core/semilla';
import type { Palancas } from '@trol/pension-core/types';
import type { DatosAUtilizar, DestinoInfonavit, Incluir } from '@/components/portal/datos-a-utilizar';

export type CaminoTipo = 'calc_ley73' | 'calc_ley97';

/** La fila cruda de `trol3.escenarios` (o de `asesoria_vista.escenarios`). */
export type CaminoRow = { id: string; tipo: string; creado_en: string; inputs: any; resultado: any };

export type CaminoModo = 'ver' | 'partir';

export type CaminoHidratado = {
  id: string;
  tipo: CaminoTipo;
  ley: 'Ley73' | 'Ley97';
  etiqueta: string;
  cerrado_en: string;
  motor_version: string | null;
  partio_de: string | null;
  /** Lo que la lista enseña sin abrir el snapshot. */
  resumen: { etiqueta?: string; pension_mensual?: number | null; edad_retiro?: number | null; destino_infonavit?: string; en_pmg?: boolean };
  /** Palancas tal cual se cerraron (en Ley 97 traen los montos inyectados; se limpian al partir). */
  palancas: Palancas;
  /** Ley 73: la fecha de inicio del plan con la que se cerró (ISO yyyy-mm-dd), si se guardó. */
  fechaTramiteIso: string | null;
  /** Sólo Ley 97. */
  incluir: Incluir;
  destinoInfonavit: DestinoInfonavit;
  datos: DatosAUtilizar;
  /** La tabla por edad guardada al cerrar; null en los cerrados antes de que se guardara. */
  barrido: any[] | null;
  /** La semilla con la que se calculó; null si el snapshot no la trae. */
  semilla: SemillaV2 | null;
  /** `meta.generado_en` de esa semilla: sirve para saber si los datos del cliente cambiaron después. */
  semillaGeneradaEn: string | null;
  /** El resultado del motor tal cual se guardó, con las fechas revividas. */
  resultado: any;
};

const ISO_T = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** JSON no tiene fechas: lo que el motor devolvió como Date se guardó como texto ISO. De regreso, las fechas vuelven a ser Date. */
export function revivirFechas<T>(v: T): T {
  if (v == null) return v;
  if (typeof v === 'string') return (ISO_T.test(v) && !Number.isNaN(Date.parse(v)) ? new Date(v) : v) as unknown as T;
  if (Array.isArray(v)) return v.map(revivirFechas) as unknown as T;
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = revivirFechas(x);
    return out as T;
  }
  return v;
}

export function esCamino(tipo: string): tipo is CaminoTipo { return tipo === 'calc_ley73' || tipo === 'calc_ley97'; }

/** Una sola hidratación para las dos calculadoras. Devuelve null si no es un camino (p. ej. calc_mod40). */
export function hidratarCamino(row: CaminoRow): CaminoHidratado | null {
  if (!esCamino(row.tipo)) return null;
  const inp = row.inputs ?? {};
  const resumen = inp.resumen ?? {};
  const pal: Palancas = { ...(inp.palancas ?? {}) };
  const ley = row.tipo === 'calc_ley97' ? 'Ley97' : 'Ley73';
  const semilla = (inp.semilla ?? null) as SemillaV2 | null;
  const resultado = revivirFechas(row.resultado ?? {});
  const fechaTramite = ley === 'Ley73' ? (resultado?.detalle?.fechaTramite as Date | undefined) : undefined;
  const base = {
    id: row.id, tipo: row.tipo, ley, etiqueta: String(resumen.etiqueta ?? (ley === 'Ley97' ? 'Ley 97' : 'Ley 73')),
    cerrado_en: String(inp.cerrado_en ?? row.creado_en), motor_version: inp.motor_version ?? null,
    partio_de: inp.partio_de ? String(inp.partio_de) : null, resumen,
    barrido: Array.isArray(inp.barrido) && inp.barrido.length ? inp.barrido : null,
    semilla, semillaGeneradaEn: semilla?.meta?.generado_en ?? null, resultado,
    fechaTramiteIso: fechaTramite instanceof Date && !Number.isNaN(fechaTramite.getTime()) ? fechaTramite.toISOString().slice(0, 10) : null,
  } as const;
  if (ley === 'Ley73') {
    return { ...base, palancas: pal, incluir: {}, destinoInfonavit: 'pension', datos: {} };
  }
  // Ley 97: las palancas guardadas son `palancasConDatos` (con montos, incluir y destino
  // ya inyectados). Para partir se quitan los montos —vienen de los datos de hoy— y se
  // conservan las decisiones de escenario: edad, cotización, incluir, destino.
  const { overrides: _o, incluir: _i, rescate: _r, ahorroVoluntarioMensual: _a, planCorporativoMensual: _p, otrosPlanesMensual: _q, usaCreditoInfonavit: _u, rescatarInfonavit: _s, ...limpias } = pal as any;
  void _o; void _i; void _r; void _a; void _p; void _q; void _u; void _s;
  const destino: DestinoInfonavit = inp.destino_infonavit === 'rescate' || inp.destino_infonavit === 'vivienda' ? inp.destino_infonavit : 'pension';
  return {
    ...base,
    palancas: { ...limpias, usaCreditoInfonavit: destino === 'vivienda' } as Palancas,
    incluir: (inp.incluir ?? pal.incluir ?? {}) as Incluir,
    destinoInfonavit: destino,
    datos: (inp.datos ?? {}) as DatosAUtilizar,
  };
}

/** Pensión presentada en el camino (la cifra que el cliente recuerda). */
export function pensionPresentada(c: CaminoHidratado): number | null {
  const r = c.resumen?.pension_mensual;
  if (typeof r === 'number') return r;
  const x = c.ley === 'Ley73' ? c.resultado?.pensionMensual : c.resultado?.pensionTotal;
  return typeof x === 'number' ? x : null;
}

/** "ajuste de <etiqueta>": el nombre del camino del que partió, si está en la misma lista. */
export function etiquetaOrigen(partioDe: string | null | undefined, lista: { id: string; etiqueta: string }[]): string | null {
  if (!partioDe) return null;
  return lista.find((k) => k.id === partioDe)?.etiqueta ?? 'otro camino';
}
