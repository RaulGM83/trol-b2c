// ============================================================================
// Diferencia por palabras entre dos textos.
//
// Existe porque leer dos párrafos completos lado a lado no contesta la pregunta
// que se le hace al comparar corridas: ¿qué cambió? Un texto de 120 palabras
// donde se movieron tres es indistinguible a simple vista del que no cambió, y
// ésa es justo la diferencia que importa cuando se ajusta un prompt.
//
// Sin librería: son treinta líneas y una dependencia más en el bundle por esto
// no se paga sola.
// ============================================================================

export type Trozo = { texto: string; tipo: 'igual' | 'fuera' | 'dentro' }

/** Se parte conservando los espacios para poder recomponer el texto tal cual. */
const palabras = (s: string): string[] => s.split(/(\s+)/).filter((x) => x !== '')

/**
 * Subsecuencia común más larga, en la matriz clásica.
 *
 * Los párrafos que se comparan andan en 60–200 palabras, así que la matriz
 * cuadrada no es problema. Por si acaso hay una salida arriba: pasado cierto
 * tamaño no se intenta y se reporta el cambio en bloque, que sigue siendo
 * verdad aunque sea menos útil.
 */
const LIMITE = 1200

export function diffPalabras(antes: string, despues: string): Trozo[] {
  const a = palabras(antes ?? '')
  const b = palabras(despues ?? '')

  if (a.length === 0 && b.length === 0) return []
  if (a.length === 0) return [{ texto: despues, tipo: 'dentro' }]
  if (b.length === 0) return [{ texto: antes, tipo: 'fuera' }]
  if (a.length > LIMITE || b.length > LIMITE) {
    return antes === despues
      ? [{ texto: despues, tipo: 'igual' }]
      : [
          { texto: antes, tipo: 'fuera' },
          { texto: despues, tipo: 'dentro' },
        ]
  }

  const m = a.length
  const n = b.length
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const trozos: Trozo[] = []
  // Se van pegando los tramos del mismo tipo para no pintar una etiqueta por
  // palabra: lo que se lee es el tramo, no el token.
  const empujar = (texto: string, tipo: Trozo['tipo']) => {
    const ultimo = trozos[trozos.length - 1]
    if (ultimo && ultimo.tipo === tipo) ultimo.texto += texto
    else trozos.push({ texto, tipo })
  }

  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      empujar(a[i], 'igual')
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      empujar(a[i], 'fuera')
      i++
    } else {
      empujar(b[j], 'dentro')
      j++
    }
  }
  while (i < m) empujar(a[i++], 'fuera')
  while (j < n) empujar(b[j++], 'dentro')

  return trozos
}

/** Cuánto se movió, para poder ordenar por "esto sí cambió". */
export function cuantoCambio(trozos: Trozo[]): { fuera: number; dentro: number } {
  let fuera = 0
  let dentro = 0
  for (const t of trozos) {
    const n = t.texto.trim() ? t.texto.trim().split(/\s+/).length : 0
    if (t.tipo === 'fuera') fuera += n
    if (t.tipo === 'dentro') dentro += n
  }
  return { fuera, dentro }
}
