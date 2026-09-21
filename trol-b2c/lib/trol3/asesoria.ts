// 168 · La asesoría en cinco pasos. Tipos y lecturas PURAS que comparten la vista del asesor
// (components/trol3/AsesoriaSesion) y "Presentar" (app/presentar/[id]), para que lo que se
// comparte en la videollamada y lo que ve el asesor salgan del mismo sitio.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Ficha } from '@/lib/trol3/fichas';

export const PASOS: { n: number; titulo: string; corto: string }[] = [
  { n: 1, titulo: 'Su situación', corto: 'Situación' },
  { n: 2, titulo: 'Lo que encontramos', corto: 'Hallazgos' },
  { n: 3, titulo: 'Escenarios', corto: 'Escenarios' },
  { n: 4, titulo: 'Nuestra recomendación', corto: 'Recomendación' },
  { n: 5, titulo: 'Acuerdos', corto: 'Acuerdos' },
];

/** Cómo se llama cada paso cuando se le habla al cliente. */
export const PASO_CLIENTE: Record<number, string> = {
  1: 'Tu situación hoy', 2: 'Lo que encontramos en tu caso', 3: 'Tus caminos', 4: 'Lo que te recomendamos', 5: 'Lo que acordamos',
};

export type Sesion = {
  id: string; estado: 'abierta' | 'cerrada'; paso: number; pasos_vistos: number[]; mostrar_costos: boolean;
  escenario_recomendado: string | null; notas: Record<string, string>; diagnostico_id: string | null; iniciada_en: string; cerrada_en: string | null;
};

export type Propuesta = { texto?: string; pension_con_plan?: number; costo?: number; enviada_en?: string };

export type VistaAsesoria = {
  cliente: Record<string, any>; numeros: Record<string, any>; experto: string | null; parada: number | null;
  hallazgos: { item: string; severidad: string; titulo: string; detalle: string }[]; en_orden: number | null;
  oportunidades: { id: string; codigo: string; estado: string; nivel: number; nombre: string; frase: string | null; motivo: string | null; urgencia: string | null; valor: number | null; nombre_interno: string; propuesta: Propuesta | null; ficha: string | null }[];
  historial: { empleador?: string; fecha_inicio?: string; fecha_fin?: string; salario_base?: number }[];
  escenarios: { id: string; tipo: string; creado_en: string; inputs: any; resultado: any }[];
  sesion: Sesion | null;
  /** 169 · El diagnóstico de esta sesión (o el último del cliente si aún no se liga). */
  diagnostico: { id: string; estado: 'borrador' | 'revisado' | 'entregado'; entregado_en: string | null; estrategia: string | null; acuerdos: string | null; ligado: boolean | null; pagado: boolean } | null;
  /** 170 · Todas las fichas activas, para el panel contextual. */
  fichas: Ficha[];
  pendientes: { id: string; titulo: string; vence_el: string | null; responsable: string }[];
};

export const mxn = (n: unknown) => (n == null || Number.isNaN(Number(n)) ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(n)));

export type Periodo = { empleador: string; alta: string; baja: string | null; dias: number; salario: number | null; hueco: number };

/** La historia laboral tal cual: un periodo por movimiento, con alta y baja al día (baja null = vigente).
 *  `hueco` = días sin cotizar entre la última baja conocida y esta alta. De la más antigua a la más reciente. */
export function periodos(h: VistaAsesoria['historial']): Periodo[] {
  const DIA = 86400e3; const hoy = Date.now();
  const ok = (h ?? []).filter((p) => /^\d{4}-\d{2}-\d{2}/.test(p.fecha_inicio ?? '')).map((p) => ({
    empleador: (p.empleador ?? 'Patrón sin nombre').trim(), alta: String(p.fecha_inicio).slice(0, 10),
    baja: /^\d{4}-\d{2}-\d{2}/.test(p.fecha_fin ?? '') ? String(p.fecha_fin).slice(0, 10) : null,
    salario: p.salario_base == null || Number.isNaN(Number(p.salario_base)) ? null : Number(p.salario_base),
  })).sort((x, y) => x.alta.localeCompare(y.alta) || (x.baja ?? '9').localeCompare(y.baja ?? '9'));
  let tope = 0; // la baja más tardía vista hasta ahora (hay patrones simultáneos)
  return ok.map((p) => {
    const ini = new Date(p.alta).getTime(); const fin = p.baja ? new Date(p.baja).getTime() : hoy;
    const hueco = tope ? Math.max(0, Math.round((ini - tope) / DIA) - 1) : 0;
    tope = Math.max(tope, fin);
    return { ...p, dias: Math.max(1, Math.round((fin - ini) / DIA) + 1), hueco };
  });
}

export type Camino = { id: string; etiqueta: string; tipo: string; edad: number | null; pension: number | null; costo: number | null; viable: boolean; creado_en: string };
const TIPO: Record<string, string> = { calc_ley73: 'Ley 73', calc_ley97: 'Ley 97', calc_mod40: 'Modalidad 40' };

/** Los escenarios que el asesor cerró en la calculadora, como caminos comparables. */
export function caminos(v: VistaAsesoria): Camino[] {
  return (v.escenarios ?? []).map((s) => {
    const r = s.inputs?.resumen ?? {};
    return {
      id: s.id, etiqueta: String(r.etiqueta ?? TIPO[s.tipo] ?? 'Escenario'), tipo: TIPO[s.tipo] ?? s.tipo,
      edad: r.edad_retiro ?? s.inputs?.palancas?.edadRetiro ?? null,
      pension: r.pension_mensual ?? s.resultado?.pensionMensual ?? null,
      costo: s.resultado?.costoTotal ?? null,
      viable: (s.resultado?.status ?? 'viable') === 'viable', creado_en: s.creado_en,
    };
  });
}

/** Qué decir en cada paso. Parte del caso, no de un libreto genérico. */
export function guion(paso: number, v: VistaAsesoria): string {
  const n = (v.cliente?.nombre ?? '').split(' ')[0] || 'Hola';
  const base = v.numeros?.pension_base; const max = v.numeros?.pension_maxima;
  const top = v.oportunidades?.[0];
  if (paso === 1) return v.cliente?.dolor_principal
    ? `Empieza por lo que le preocupa, con sus palabras: “${v.cliente.dolor_principal}”. Luego sus dos números${base ? `: hoy ${mxn(base)}` : ''}${max ? ` y hasta ${mxn(max)}` : ''}. No expliques todavía cómo se llega de uno a otro.`
    : `“${n}, antes de enseñarte números: ¿qué es lo que más te preocupa de tu pensión?” Anótalo abajo. Después, sus dos números${base ? `: hoy ${mxn(base)}` : ''}${max ? ` y hasta ${mxn(max)}` : ''}.`;
  if (paso === 2) return top
    ? `Una cosa a la vez, empezando por lo que pone en orden su situación. La primera: ${top.nombre}. Di la frase, pregunta si le hace sentido y sigue. No cotices aquí: los números van en el paso 3.`
    : 'No hay hallazgos urgentes: dilo como buena noticia, y pasa a ver si sus números se pueden subir.';
  if (paso === 3) return `Tres caminos como máximo: cómo está hoy${base ? ` (${mxn(base)})` : ''}, el que recomiendas y, si acaso, uno más ambicioso. Cierra cada uno en la calculadora para que aparezca aquí.`;
  if (paso === 4) return v.sesion?.escenario_recomendado ? 'Una sola recomendación, con su porqué, lo que cambia en su pensión y lo que cuesta. Escríbela abajo como se la dirías: es lo que va a su diagnóstico y, si la envías, lo que ve como “Tu plan”.' : 'Falta marcar el camino que recomiendas en el paso 3. Una sola recomendación, con su porqué, lo que cambia en su pensión y lo que cuesta. Si duda entre dos caminos, recomienda el que pone en orden primero.';
  return 'Repite en voz alta lo que quedó: qué hace él, qué hacemos nosotros y para cuándo. Cada pendiente con dueño y fecha.';
}
