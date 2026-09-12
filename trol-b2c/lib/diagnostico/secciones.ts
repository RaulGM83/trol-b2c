// ============================================================================
// Lo que la UI necesita saber del redactor, sin el prompt.
//
// Vive aparte de `prompt.ts` a propósito: los componentes de pantalla usan los
// nombres de las secciones, y si los importaran de allá el bundler se llevaría
// al navegador los 19 KB del prompt completo. No es sólo peso — el prompt es
// trabajo de meses y no tiene por qué viajar al cliente para pintar un título.
// ============================================================================

/** Las secciones que el modelo devuelve. El orden es el del documento. */
export const SECCIONES_NARRATIVA = [
  'resumen_perfil',
  'estrategia_oportunidades',
  'historia_laboral',
  'oportunidades_gestorias',
  'oportunidades_issste',
  'oportunidades_infonavit',
  'oportunidades_ahorro',
] as const

export type SeccionNarrativa = (typeof SECCIONES_NARRATIVA)[number]

export type Narrativa = Partial<Record<SeccionNarrativa, string>>

/** Cómo se llama cada sección en pantalla. */
export const TITULO_SECCION: Record<SeccionNarrativa, string> = {
  resumen_perfil: 'Resumen de su situación',
  estrategia_oportunidades: 'Estrategia y oportunidades',
  historia_laboral: 'Lectura de su historia laboral',
  oportunidades_gestorias: 'Gestorías',
  oportunidades_issste: 'ISSSTE',
  oportunidades_infonavit: 'Infonavit',
  oportunidades_ahorro: 'Ahorro e inversión',
}

/**
 * Los bloques que imprime el PDF, EN EL ORDEN DEL DOCUMENTO.
 *
 * Es la única lista: el PDF la recorre para armar el cuerpo y el panel la
 * recorre para pintar los switches. Reordenar aquí reordena el documento; si
 * fueran dos listas, el día que se toque una el panel prometería un orden que
 * el PDF no cumple.
 *
 * `id` es lo que se guarda en `contenido.secciones_off`, así que no se renombra
 * a la ligera: un id que cambia resucita en el PDF una sección que el asesor ya
 * había apagado.
 *
 * `siempre: true` marca lo que no se puede quitar — sin la procedencia de las
 * cifras y sin el cierre legal el documento no se puede entregar.
 */
export const BLOQUES_PDF = [
  { id: 'datos', titulo: 'Con qué datos se hizo', siempre: true },
  { id: 'resumen_perfil', titulo: 'Tu situación hoy' },
  { id: 'historia_laboral', titulo: 'Lectura de su historia laboral' },
  { id: 'historia_laboral_tabla', titulo: 'Tu historia laboral (tabla de patrones)' },
  { id: 'oportunidades_gestorias', titulo: 'Gestorías' },
  { id: 'oportunidades_issste', titulo: 'ISSSTE' },
  { id: 'escenario', titulo: 'El escenario que revisamos' },
  { id: 'estrategia_oportunidades', titulo: 'Estrategia y oportunidades' },
  { id: 'oportunidades_infonavit', titulo: 'Infonavit' },
  { id: 'plan_vivienda', titulo: 'El plan de vivienda' },
  { id: 'oportunidades_ahorro', titulo: 'Ahorro e inversión' },
  { id: 'acuerdos', titulo: 'Lo que acordamos y lo que sigue' },
  { id: 'ayuda', titulo: 'Estamos para ayudarte', siempre: true },
  { id: 'educacion', titulo: 'Cómo funciona tu pensión (anexo)' },
] as const

export type BloquePdf = (typeof BLOQUES_PDF)[number]['id']

/** Los que el asesor puede apagar. */
export const BLOQUES_APAGABLES = BLOQUES_PDF.filter((b) => !('siempre' in b && b.siempre))

/** `true` si ese bloque debe imprimirse. */
export const bloqueEncendido = (off: string[] | null | undefined, id: BloquePdf) =>
  !(off ?? []).includes(id)

/** El modelo que ya se usaba en n8n, con la misma cuenta de OpenAI. */
export const MODELO_REDACTOR = 'gpt-5.5'

/**
 * Versión del prompt BASE. Cada diagnóstico guarda cuál lo escribió, así que
 * cuando la calidad cambie se puede saber qué cambió.
 *
 * SÚBELA AL TOCAR EL PROMPT. Es la misma disciplina que ENGINE_VERSION, que ya
 * mintió cuatro días seguidos: una versión que no se mueve cuando el contenido
 * sí, es peor que no tenerla.
 *
 * 2026.09.06.1 — portado de n8n con las cuatro correcciones (Rescate
 *                Infonavit, PMG desde los datos, Ley 97 con el modelo de
 *                fuentes, prohibido inventar cifras).
 * 2026.09.06.2 — la sección de Infonavit narra el plan de vivienda concreto
 *                cuando lo hay, encadenado con la pensión, y tiene prohibido
 *                proponer otro plazo o hablar de costos.
 * 2026.09.06.3 — sólo se habla de lo que aplica (nada de explicar una regla
 *                para descartarla); en Ley 97 se prohíbe conservación de
 *                derechos y Modalidad 40; gestorías sin hallazgos se cierra en
 *                dos líneas; el rescate se argumenta por liquidez —el 4%
 *                nominal del instituto es ~0% real— y no por pensión extra;
 *                y con cotitular los montos no deben cuadrar con el escenario.
 * 2026.09.06.4 — la pensión nunca se da sin la edad de retiro acordada, y la
 *                tabla por edad se lee, no se transcribe.
 */
export const PROMPT_VERSION = '2026.09.10.1'

/**
 * Cómo se le pegan los ajustes al prompt base.
 *
 * Van AL FINAL y mandan sobre lo anterior, porque son correcciones a lo que ya
 * dijo el base. Y se dice de dónde viene cada bloque: el vigente aplica a todos
 * los asesores, el ensayo sólo a este documento.
 */
export function conAjustes(
  base: string,
  { vigentes, ensayo }: { vigentes?: string | null; ensayo?: string | null } = {},
): string {
  const partes = [base]
  if (vigentes?.trim()) {
    partes.push(
      `\n# AJUSTES VIGENTES\nLo que sigue corrige lo anterior. Si algo se contradice, manda esto.\n\n${vigentes.trim()}`,
    )
  }
  if (ensayo?.trim()) {
    partes.push(
      `\n# AJUSTE EN PRUEBA PARA ESTE CASO\nAplica sólo a este documento y manda sobre todo lo anterior.\n\n${ensayo.trim()}`,
    )
  }
  return partes.join('\n')
}
