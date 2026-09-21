// 168 · La asesoría en cinco pasos. Tipos y lecturas PURAS que comparten la vista del asesor
// (components/trol3/AsesoriaSesion) y "Presentar" (app/presentar/[id]), para que lo que se
// comparte en la videollamada y lo que ve el asesor salgan del mismo sitio.
/* eslint-disable @typescript-eslint/no-explicit-any */

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
  oportunidades: { id: string; codigo: string; estado: string; nivel: number; nombre: string; frase: string | null; motivo: string | null; urgencia: string | null; valor: number | null; nombre_interno: string; propuesta: Propuesta | null }[];
  historial: { empleador?: string; fecha_inicio?: string; fecha_fin?: string; salario_base?: number }[];
  escenarios: { id: string; tipo: string; creado_en: string; inputs: any; resultado: any }[];
  sesion: Sesion | null;
  /** 169 · El diagnóstico de esta sesión (o el último del cliente si aún no se liga). */
  diagnostico: { id: string; estado: 'borrador' | 'revisado' | 'entregado'; entregado_en: string | null; estrategia: string | null; acuerdos: string | null; ligado: boolean | null; pagado: boolean } | null;
  pendientes: { id: string; titulo: string; vence_el: string | null; responsable: string }[];
};

export const mxn = (n: unknown) => (n == null || Number.isNaN(Number(n)) ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(n)));

/** La historia laboral en tramos por patrón, de la más antigua a la más reciente. */
export function tramos(h: VistaAsesoria['historial']): { empleador: string; desde: number; hasta: number; anios: number }[] {
  const ok = (h ?? []).filter((p) => /^\d{4}/.test(p.fecha_inicio ?? '')).map((p) => ({
    empleador: (p.empleador ?? 'Patrón sin nombre').trim(), ini: String(p.fecha_inicio), fin: /^\d{4}/.test(p.fecha_fin ?? '') ? String(p.fecha_fin) : String(p.fecha_inicio),
  })).sort((a, b) => a.ini.localeCompare(b.ini));
  const out: { empleador: string; ini: string; fin: string }[] = [];
  for (const p of ok) {
    const u = out[out.length - 1];
    if (u && u.empleador === p.empleador) { if (p.fin > u.fin) u.fin = p.fin; } else out.push({ ...p });
  }
  return out.map((t) => {
    const desde = Number(t.ini.slice(0, 4)); const hasta = Number(t.fin.slice(0, 4));
    const anios = Math.max(0, (new Date(t.fin).getTime() - new Date(t.ini).getTime()) / (365.25 * 86400e3));
    return { empleador: t.empleador, desde, hasta, anios: Math.round(anios * 10) / 10 };
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
