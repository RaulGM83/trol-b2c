// ============================================================================
// Atribución por código (migraciones 076–077).
//
// Dos cosas que la vista `v_embudo_codigo` NO resuelve y hay que resolver aquí:
//
// 1. La vista es un FULL JOIN entre altas y clics, así que un código aparece
//    solo si ya tuvo ≥1 alta o ≥1 clic. Los links recién creados del equipo
//    (lore, vero, moni, andrea, raul, elasegurador) no salen. Se fusionan con
//    `codigos_invitacion` para que se vean en ceros desde el primer día.
//    Desde 092 el catálogo incluye también los códigos del sitio trol.mx
//    (sitio, asesorias, blog, calcula), que son el grueso del tráfico medido.
//
// 2. Los códigos históricos de campaña (hs_lp_infonavit_v1, sinladalp02-…) son
//    anteriores al tracking: tienen altas y CERO clics. Su conversión clic→alta
//    no es infinita, es DESCONOCIDA. `conversion()` devuelve null cuando no hay
//    denominador y la tabla lo pinta como "sin datos de clic".
// ============================================================================

export type FilaEmbudo = {
  codigo: string;
  tipo: string;
  etiqueta: string | null;
  miembro: string | null;
  clics: number;
  altas: number;
  con_curp: number;
  con_consulta: number;
  asesorados: number;
  ultima_actividad: string | null;
  /** El código está dado de alta en `codigos_invitacion` (no es un histórico suelto). */
  registrado: boolean;
};

export type FilaVista = {
  codigo: string; tipo: string | null; etiqueta: string | null; miembro: string | null;
  clics: number | string | null; altas: number | string | null; con_curp: number | string | null;
  con_consulta: number | string | null; asesorados: number | string | null; ultima_actividad: string | null;
};
export type CodigoRegistrado = { codigo: string; tipo: string | null; etiqueta: string | null; miembro_id: string | null; activo: boolean | null };

export const TIPOS = ['asesor', 'cliente', 'sitio', 'prensa', 'campania'] as const;
export const TIPO_LABEL: Record<string, string> = {
  asesor: 'Asesor', cliente: 'Cliente', sitio: 'Sitio', prensa: 'Prensa', campania: 'Campaña',
};

/** `count(*)` de Postgres llega como bigint → string por PostgREST. */
const num = (v: number | string | null | undefined): number => (v == null ? 0 : Number(v)) || 0;

/**
 * Conversión entre dos pasos del embudo. Devuelve null —no 0, no Infinity—
 * cuando el paso anterior no tiene datos: es "no sabemos", no "no convirtió".
 */
export function conversion(numerador: number, denominador: number): number | null {
  if (!denominador || denominador <= 0) return null;
  return numerador / denominador;
}

export const pct = (v: number | null): string => (v == null ? '—' : `${Math.round(v * 100)}%`);

/**
 * Une la vista con el catálogo de códigos. Los que solo están en el catálogo
 * entran en ceros; los que solo están en la vista (históricos) quedan como
 * campaña sin registrar.
 */
export function fusionarCodigos(
  vista: FilaVista[],
  registrados: CodigoRegistrado[],
  nombrePorMiembro: Map<string, string>,
): FilaEmbudo[] {
  const porCodigo = new Map<string, FilaEmbudo>();

  for (const v of vista) {
    if (!v?.codigo) continue;
    porCodigo.set(v.codigo, {
      codigo: v.codigo,
      tipo: v.tipo ?? 'campania',
      etiqueta: v.etiqueta,
      miembro: v.miembro,
      clics: num(v.clics),
      altas: num(v.altas),
      con_curp: num(v.con_curp),
      con_consulta: num(v.con_consulta),
      asesorados: num(v.asesorados),
      ultima_actividad: v.ultima_actividad,
      registrado: v.tipo != null,
    });
  }

  for (const r of registrados) {
    if (!r?.codigo || r.activo === false) continue;
    const previo = porCodigo.get(r.codigo);
    const miembro = r.miembro_id ? nombrePorMiembro.get(r.miembro_id) ?? null : null;
    if (previo) {
      // El catálogo manda sobre la vista para tipo/etiqueta/miembro.
      previo.tipo = r.tipo ?? previo.tipo;
      previo.etiqueta = r.etiqueta ?? previo.etiqueta;
      previo.miembro = previo.miembro ?? miembro;
      previo.registrado = true;
    } else {
      porCodigo.set(r.codigo, {
        codigo: r.codigo, tipo: r.tipo ?? 'campania', etiqueta: r.etiqueta, miembro,
        clics: 0, altas: 0, con_curp: 0, con_consulta: 0, asesorados: 0,
        ultima_actividad: null, registrado: true,
      });
    }
  }

  return [...porCodigo.values()];
}

export type ColumnaEmbudo = 'codigo' | 'tipo' | 'clics' | 'altas' | 'con_curp' | 'con_consulta' | 'asesorados' | 'ultima_actividad';
export const DIR_DEFAULT: Record<ColumnaEmbudo, 'asc' | 'desc'> = {
  codigo: 'asc', tipo: 'asc', clics: 'desc', altas: 'desc', con_curp: 'desc',
  con_consulta: 'desc', asesorados: 'desc', ultima_actividad: 'desc',
};

/** Orden estable: los nulos de fecha siempre al final, sin importar la dirección. */
export function ordenar(filas: FilaEmbudo[], col: ColumnaEmbudo, dir: 'asc' | 'desc'): FilaEmbudo[] {
  const signo = dir === 'asc' ? 1 : -1;
  return [...filas].sort((a, b) => {
    if (col === 'ultima_actividad') {
      if (!a.ultima_actividad && !b.ultima_actividad) return a.codigo.localeCompare(b.codigo);
      if (!a.ultima_actividad) return 1;
      if (!b.ultima_actividad) return -1;
      return signo * a.ultima_actividad.localeCompare(b.ultima_actividad);
    }
    if (col === 'codigo' || col === 'tipo') {
      const x = String(a[col] ?? ''); const y = String(b[col] ?? '');
      return signo * x.localeCompare(y, 'es') || a.codigo.localeCompare(b.codigo);
    }
    return signo * ((a[col] as number) - (b[col] as number)) || a.codigo.localeCompare(b.codigo);
  });
}

export function totales(filas: FilaEmbudo[]) {
  return filas.reduce(
    (t, f) => ({
      clics: t.clics + f.clics, altas: t.altas + f.altas, con_curp: t.con_curp + f.con_curp,
      con_consulta: t.con_consulta + f.con_consulta, asesorados: t.asesorados + f.asesorados,
    }),
    { clics: 0, altas: 0, con_curp: 0, con_consulta: 0, asesorados: 0 },
  );
}
