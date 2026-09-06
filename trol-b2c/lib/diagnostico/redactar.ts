// ============================================================================
// El redactor: OpenAI escribe el borrador sobre los hechos.
//
// Corre en el servidor de la app, no en n8n. La razón es el ritmo de trabajo:
// el asesor aprieta "generar" con el cliente enfrente y quiere ver el borrador
// ahora, no encolar un webhook y esperar a que algo escriba de vuelta. De paso
// el prompt vive en el repo, con historial y revisión, en vez de dentro de un
// nodo.
//
// Usa la MISMA cuenta de OpenAI que ya usaba n8n (credencial "OpenAi account")
// y el mismo modelo. La llave se lee de OPENAI_API_KEY.
// ============================================================================

import {
  MODELO_REDACTOR,
  PROMPT_VERSION,
  SECCIONES_NARRATIVA,
  SYSTEM_PROMPT,
  USER_PROMPT,
  conAjustes,
  type Narrativa,
} from './prompt';

export type ResultadoRedaccion =
  | { ok: true; narrativa: Narrativa; modelo: string; promptVersion: string }
  | { ok: false; error: string };

/**
 * Los ajustes que se le pegan al prompt base (117).
 *
 * `vigentes` es el bloque publicado para todo el equipo; `ensayo` aplica sólo a
 * este documento. Van juntos aquí para que el redactor no tenga que saber de
 * dónde salió cada uno — eso lo decide quien lo llama.
 */
export type Ajustes = { vigentes?: string | null; ensayo?: string | null };

/**
 * El modelo devuelve JSON, pero a veces lo envuelve en ```json o deja una coma
 * colgando. Se limpia igual que lo hacía el nodo de n8n, que ya se había topado
 * con las dos cosas.
 */
function parsearRespuesta(texto: string): Narrativa {
  const limpio = texto
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .replace(/,\s*}/g, '}')
    .trim();
  const cruda = JSON.parse(limpio) as Record<string, unknown>;

  // Sólo las secciones que conocemos, y sólo si traen texto: una clave
  // inventada por el modelo no debe llegar al documento.
  const narrativa: Narrativa = {};
  for (const s of SECCIONES_NARRATIVA) {
    const v = cruda[s];
    if (typeof v === 'string' && v.trim()) narrativa[s] = v.trim();
  }
  return narrativa;
}

export async function redactarDiagnostico(
  hechos: unknown,
  { signal, ajustes }: { signal?: AbortSignal; ajustes?: Ajustes } = {},
): Promise<ResultadoRedaccion> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return {
      ok: false,
      error:
        'Falta OPENAI_API_KEY en el entorno. Es la misma llave de la credencial "OpenAi account" de n8n.',
    };
  }

  let resp: Response;
  try {
    resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODELO_REDACTOR,
        // El modelo tiene prohibido inventar cifras y todas las que necesita
        // van en los hechos, así que se le pide JSON estricto.
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: conAjustes(SYSTEM_PROMPT, ajustes ?? {}) },
          {
            role: 'user',
            content: `${USER_PROMPT}\n\nDATOS DEL CLIENTE (JSON):\n${JSON.stringify(hechos, null, 2)}`,
          },
        ],
      }),
    });
  } catch (e) {
    return { ok: false, error: `No se pudo hablar con OpenAI: ${(e as Error).message}` };
  }

  if (!resp.ok) {
    const detalle = await resp.text().catch(() => '');
    return { ok: false, error: `OpenAI respondió ${resp.status}: ${detalle.slice(0, 300)}` };
  }

  const data = (await resp.json()) as any;
  const contenido: string = data?.choices?.[0]?.message?.content ?? '';
  if (!contenido) return { ok: false, error: 'OpenAI devolvió una respuesta vacía.' };

  try {
    const narrativa = parsearRespuesta(contenido);
    if (Object.keys(narrativa).length === 0) {
      return { ok: false, error: 'La respuesta no traía ninguna sección reconocible.' };
    }
    return { ok: true, narrativa, modelo: MODELO_REDACTOR, promptVersion: PROMPT_VERSION };
  } catch (e) {
    // Se dice qué pasó en vez de dejar el borrador vacío: un fallo tiene que
    // verse como fallo, no como un documento en blanco.
    return {
      ok: false,
      error: `No se pudo leer la respuesta del modelo (${(e as Error).message}).`,
    };
  }
}
