// ============================================================================
// Traducción de las excepciones de `trol3` a algo que una persona pueda leer.
// Las funciones de identidad (068–070) levantan `raise exception '<codigo>'
// using hint = '<texto>'`; PostgREST manda ese hint en `error.hint`, así que
// casi siempre basta con mostrarlo tal cual. El código queda de respaldo.
// ============================================================================

export type ErrorPg = { message?: string | null; hint?: string | null; details?: string | null; code?: string | null };

const POR_CODIGO: Record<string, string> = {
  curp_confirmada: 'Tu CURP ya fue validada con la fuente oficial. Si necesitas corregirla, pídeselo a tu asesor.',
  curp_duplicada: 'Esa CURP ya está registrada en otro expediente. Tu asesor tiene que revisarlo antes de que se pueda cambiar.',
  curps_distintas: 'Esos expedientes tienen CURPs distintas: no son la misma persona.',
  dato_validado_existente: 'Ya tenemos ese dato de la fuente oficial.',
  misma_persona: 'Es el mismo expediente.',
  persona_no_existe: 'Ese expediente ya no existe.',
  no_autorizado: 'No tienes permiso para hacer ese cambio.',
  sin_persona: 'No pudimos identificar tu expediente. Vuelve a entrar o escríbenos por WhatsApp.',
};

/** Texto para enseñar en pantalla: el hint le gana al código, y el código al mensaje crudo. */
export function mensajeError(e: ErrorPg | null | undefined, respaldo = 'No se pudo completar la acción.'): string {
  if (!e) return respaldo;
  if (e.hint) return e.hint;
  const msg = (e.message ?? '').trim();
  for (const [codigo, texto] of Object.entries(POR_CODIGO)) if (msg.includes(codigo)) return texto;
  return msg || respaldo;
}

/**
 * Los errores de los proveedores llegan como JSON escapado varias veces: el caso
 * RENAPO ("Los datos de entrada no coinciden…") viene con tres capas encima.
 * Desenrollamos hasta el fondo para que el crudo del colapsable se pueda leer.
 */
export function desenrollarError(raw: string | null | undefined): string {
  if (!raw) return '';
  let v: unknown = raw;
  for (let i = 0; i < 6; i++) {
    if (typeof v !== 'string') break;
    const s = v.trim();
    if (!/^[[{"]/.test(s)) break;
    try {
      const siguiente = JSON.parse(s);
      if (siguiente === v) break;
      v = siguiente;
    } catch {
      break;
    }
  }
  return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
}
