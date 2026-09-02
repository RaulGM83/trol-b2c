// ============================================================================
// Lectura de la serie INPC viva (`trol3.inpc_mensual`).
//
// La tabla es la fuente de verdad: INEGI observado hasta donde haya publicado y
// proyección de ahí en adelante, y se actualiza por upsert cada mes. El motor
// trae un fallback embebido en pension-core, pero ese se congela en la fecha en
// que se generó; para que la línea de captura sea la del DÍA hay que leer aquí.
//
// Nunca revienta: si la consulta falla o la tabla viene vacía devuelve
// `undefined` y el motor usa su fallback. Una línea calculada con INPC de hace
// un mes es mejor que una pantalla en blanco — y el motor ya avisa cuando el
// tramo depende de proyecciones.
// ============================================================================

import { serieINPCDesdeFilas, type SerieINPC } from '@trol/pension-core/inpc';

interface ClienteINPC {
  from(tabla: string): {
    select(cols: string): {
      order(col: string, opts: { ascending: boolean }): PromiseLike<{
        data: unknown[] | null;
        error: unknown;
      }>;
    };
  };
}

/**
 * Baja la serie completa. Son ~250 filas de tres columnas: no vale la pena
 * acotarla por tramo, y así la misma serie sirve para cualquier fecha de
 * trámite que el asesor elija sin volver al servidor.
 */
export async function leerSerieINPC(db: ClienteINPC): Promise<SerieINPC | undefined> {
  try {
    const { data, error } = await db
      .from('inpc_mensual')
      .select('mes,indice,proyectado')
      .order('mes', { ascending: true });
    if (error || !Array.isArray(data) || data.length === 0) return undefined;
    const serie = serieINPCDesdeFilas(
      data as Array<{ mes: string; indice: number | string; proyectado?: boolean | null }>,
    );
    return Object.keys(serie).length ? serie : undefined;
  } catch {
    return undefined;
  }
}
