import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Avisarle algo al cliente por el único camino bueno: api-trol /avisar.
 *
 * No duplicamos aquí la cascada (system-event dentro de su hilo → plantilla si
 * la ventana de 24 h cerró): vive en la Edge Function y es el único lugar donde
 * debe vivir, porque también la usan n8n y el bot. Desde la app sólo se llama.
 *
 * La llave sale de trol3.config, no de una variable de entorno nueva: así no hay
 * que cargarla en Vercel ni mantenerla sincronizada en dos sitios cuando rote.
 */
let llaveEnMemoria: string | null = null;

async function llave(): Promise<string> {
  if (llaveEnMemoria) return llaveEnMemoria;
  const db = createAdminClient();
  const { data } = await db.schema('trol3').from('config').select('valor').eq('clave', 'api_key').maybeSingle();
  const v = (data as { valor?: string } | null)?.valor ?? '';
  if (!v) throw new Error('No hay api_key en trol3.config');
  llaveEnMemoria = v;
  return v;
}

export type ResultadoAviso = {
  ok: boolean;
  /** 'system_event' = le llegó dentro de su conversación; 'plantilla' = hubo que reabrir; 'ninguna' = no salió nada. */
  via?: string;
  motivo?: string;
  error?: string;
};

export async function avisar(
  personaId: string,
  evento: string,
  opciones: { payload?: Record<string, unknown>; resumen?: string; plantilla?: string } = {},
): Promise<ResultadoAviso> {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/api-trol/avisar`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'x-trol-key': await llave(), 'content-type': 'application/json' },
    body: JSON.stringify({ persona_id: personaId, evento, ...opciones }),
    cache: 'no-store',
  });
  const txt = await r.text();
  try { return JSON.parse(txt) as ResultadoAviso; } catch { return { ok: false, error: txt.slice(0, 200) }; }
}
