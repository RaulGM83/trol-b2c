// ============================================================================
// `fusionar_personas` (073) devuelve `movidas`: un objeto tabla → qué pasó, con
// valores MEZCLADOS — número de filas movidas, o el string 'conflicto_conservado'
// cuando el update chocó con un índice único y la fila se quedó donde estaba.
// Ejemplo real:
//   {"consultas":1,"contactos":"conflicto_conservado","documentos":1,
//    "oportunidades":1,"checklist_items":"conflicto_conservado"}
// Ese objeto NO se puede mandar a JSX tal cual (React truena con "Objects are not
// valid as a React child"), así que aquí se aplana a filas de texto.
// ============================================================================

export type FilaMovida = { tabla: string; texto: string; conflicto: boolean };

const TABLA_NOMBRE: Record<string, string> = {
  checklist_items: 'checklist',
  contactos: 'contactos',
  consultas: 'consultas',
  datos: 'datos del expediente',
  documentos: 'documentos',
  eventos: 'eventos',
  interacciones: 'interacciones',
  oportunidades: 'oportunidades',
  puntos: 'puntos',
  citas: 'citas',
  beneficios: 'beneficios',
  relaciones_persona: 'relaciones',
};

/**
 * Aplana y AGREGA una o varias `movidas` a filas legibles. Se agrega porque una fusión
 * de 3 expedientes llama al RPC dos veces y las mismas tablas volverían a aparecer.
 * Tolera null, arreglos, tipos raros y claves desconocidas: nunca devuelve un objeto.
 */
export function combinarMovidas(lista: unknown[]): FilaMovida[] {
  const acc = new Map<string, { n: number; conflictos: number; otros: string[] }>();
  for (const m of lista) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) continue;
    for (const [tabla, v] of Object.entries(m as Record<string, unknown>)) {
      const cur = acc.get(tabla) ?? { n: 0, conflictos: 0, otros: [] };
      if (typeof v === 'number') cur.n += v;
      else if (v === 'conflicto_conservado') cur.conflictos += 1;
      else cur.otros.push(typeof v === 'string' ? v : JSON.stringify(v));
      acc.set(tabla, cur);
    }
  }
  return [...acc.entries()]
    .map(([tabla, { n, conflictos, otros }]) => {
      const partes: string[] = [];
      if (n > 0) partes.push(`${n} ${n === 1 ? 'registro' : 'registros'}`);
      if (conflictos === 1) partes.push('ya existía en el principal, se conservó ese');
      else if (conflictos > 1) partes.push(`${conflictos} ya existían en el principal`);
      partes.push(...otros);
      return {
        tabla: TABLA_NOMBRE[tabla] ?? tabla.replace(/_/g, ' '),
        texto: partes.join(' · ') || 'sin cambios',
        conflicto: conflictos > 0 || otros.length > 0,
      };
    })
    .sort((a, b) => a.tabla.localeCompare(b.tabla, 'es'));
}

/** Un solo `movidas`. */
export function resumenMovidas(movidas: unknown): FilaMovida[] {
  return combinarMovidas([movidas]);
}

/** Cuántos registros se movieron de verdad (los conflictos no cuentan). */
export function totalMovido(movidas: unknown): number {
  if (!movidas || typeof movidas !== 'object' || Array.isArray(movidas)) return 0;
  return Object.values(movidas as Record<string, unknown>).reduce<number>((s, v) => s + (typeof v === 'number' ? v : 0), 0);
}

// ---------------------------------------------------------------------------
// Clasificación de un grupo de la vista `v_personas_duplicadas`.
// ---------------------------------------------------------------------------

export type PersonaDupBase = { id: string; nombre: string | null; apellidos: string | null; curp: string | null; created_at: string | null };
export type GrupoClasificado<P extends PersonaDupBase> = { miembros: P[]; curps: string[]; familiares: boolean; sugerido: string };

/**
 * Dos CURPs distintas = dos personas: familiares compartiendo teléfono, no se fusiona
 * (`fusionar_personas` también lo rechaza con `curps_distintas`). Se sugiere conservar
 * —o dejar como dueño del número— al que ya tiene CURP; a igualdad, el más antiguo.
 */
export function clasificarGrupo<P extends PersonaDupBase>(ids: string[], porId: Map<string, P>): GrupoClasificado<P> {
  const miembros = ids.map((id) => porId.get(id)).filter(Boolean) as P[];
  const curps = [...new Set(miembros.map((p) => p.curp).filter(Boolean) as string[])];
  const orden = [...miembros].sort((a, b) =>
    (a.curp ? 0 : 1) - (b.curp ? 0 : 1) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
  return { miembros, curps, familiares: curps.length >= 2, sugerido: orden[0]?.id ?? '' };
}
