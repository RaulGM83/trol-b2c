// ============================================================================
// Fechas: distinguir un INSTANTE de un DÍA.
//
// En trol3 conviven los dos en columnas `timestamptz`:
//
//   - Un instante. Cuándo se creó una consulta, cuándo se editó un documento.
//     Tiene hora real y se lee en la zona de quien mira: America/Mexico_City.
//
//   - Un día. La fecha de emisión de un SISEC, un alta, una baja, el
//     vencimiento de los derechos, un nacimiento. No tiene hora: se guarda
//     como medianoche UTC porque la columna exige una.
//
// Convertir el segundo caso a la zona de México lo corre al día anterior
// —medianoche UTC son las 18:00 del día previo— y así el SISEC emitido el 11
// de septiembre aparecía en pantalla como 10 de septiembre, mientras el PDF,
// que corre en UTC dentro de Vercel, decía 11. Dos números para el mismo dato.
//
// `fmtDia` imprime el día tal como viene y sólo aplica zona cuando de verdad
// hay una hora que convertir. Vive fuera de `trol3/server.ts` para que lo usen
// igual los componentes de cliente, que antes cada uno traía su propia copia.
// ============================================================================

export const TZ = 'America/Mexico_City';

/**
 * `true` si el texto representa un día sin hora: sólo la fecha, o medianoche
 * UTC en cualquiera de las formas en que sale de Postgres y de PostgREST
 * (`2026-09-11`, `2026-09-11T00:00:00Z`, `2026-09-11 00:00:00+00`).
 */
export const esDia = (s: string) =>
  /^\d{4}-\d{2}-\d{2}([T ]00:00:00(\.0+)?(Z|[+-]00(:?00)?)?)?$/.test(s.trim());

/**
 * Un día o un instante, en formato corto (11 sep 2026).
 *
 * El mediodía es deliberado: fija el día sin que ninguna zona del continente
 * lo empuje al anterior ni al siguiente.
 */
export function fmtDia(
  d: string | null | undefined,
  opciones: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
): string {
  if (!d) return '—';
  const txt = String(d).trim();
  const dia = esDia(txt) ? txt.slice(0, 10) : null;
  const fecha = new Date(dia ? `${dia}T12:00:00` : txt);
  if (Number.isNaN(fecha.getTime())) return txt;
  return fecha.toLocaleDateString('es-MX', { ...opciones, ...(dia ? {} : { timeZone: TZ }) });
}

/** El mismo día, con el mes escrito completo. Para documentos al cliente. */
export const fmtDiaLargo = (d: string | null | undefined) =>
  fmtDia(d, { day: '2-digit', month: 'long', year: 'numeric' });
