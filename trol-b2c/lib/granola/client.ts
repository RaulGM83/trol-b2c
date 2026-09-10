// ============================================================================
// Cliente de Granola (API pública, plan Business). Sólo servidor.
// Llave de WORKSPACE en GRANOLA_API_KEY; secreto del webhook en
// GRANOLA_WEBHOOK_SECRET (lo devuelve Granola una sola vez al crear el endpoint).
// Docs: docs.granola.ai/api-reference
// ============================================================================
import crypto from 'crypto';

const BASE = 'https://public-api.granola.ai/v1';

export type GranolaUser = { name: string | null; email: string };
export type GranolaTranscriptLine = { speaker?: { source?: string; attribution?: string; name?: string | null; diarization_label?: string | null } | null; text: string; start_time?: string; end_time?: string };
export type GranolaNote = {
  id: string; object: 'note'; title: string | null; owner: GranolaUser; created_at: string; updated_at: string; web_url?: string;
  folder_membership?: { id: string; name?: string }[];
  attendees?: GranolaUser[];
  calendar_event?: { event_title?: string | null; calendar_event_id?: string | null; organiser?: string | null; scheduled_start_time?: string | null; scheduled_end_time?: string | null; invitees?: { email?: string; name?: string | null }[] } | null;
  summary_text?: string; summary_markdown?: string | null;
  private_notes_text?: string | null; private_notes_markdown?: string | null;
  transcript?: GranolaTranscriptLine[] | null;
};

export class GranolaError extends Error { constructor(public status: number, message: string) { super(message); } }

function apiKey() {
  const k = process.env.GRANOLA_API_KEY;
  if (!k) throw new GranolaError(0, 'Falta GRANOLA_API_KEY en el servidor.');
  return k;
}

async function llamar<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { authorization: `Bearer ${apiKey()}`, accept: 'application/json', ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers as Record<string, string> | undefined) }, cache: 'no-store', signal: AbortSignal.timeout(30000) });
  const texto = await res.text();
  let json: unknown = {};
  try { json = texto ? JSON.parse(texto) : {}; } catch { json = { raw: texto.slice(0, 300) }; }
  if (!res.ok) throw new GranolaError(res.status, (json as { message?: string; error?: string }).message ?? (json as { error?: string }).error ?? `Granola respondió ${res.status}`);
  return json as T;
}

/** La nota con transcripción. Si la transcripción es muy grande (413) se pide aparte, paginada. */
export async function obtenerNota(noteId: string): Promise<GranolaNote> {
  try {
    return await llamar<GranolaNote>(`/notes/${encodeURIComponent(noteId)}?include=transcript`);
  } catch (e) {
    if (!(e instanceof GranolaError) || e.status !== 413) throw e;
    const nota = await llamar<GranolaNote>(`/notes/${encodeURIComponent(noteId)}`);
    const lineas: GranolaTranscriptLine[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 50; i++) {
      type Pagina = { transcript?: GranolaTranscriptLine[]; data?: GranolaTranscriptLine[]; cursor?: string | null; hasMore?: boolean };
      const page: Pagina = await llamar<Pagina>(`/notes/${encodeURIComponent(noteId)}/transcript${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
      lineas.push(...(page.transcript ?? page.data ?? []));
      if (!page.hasMore || !page.cursor) break;
      cursor = page.cursor;
    }
    return { ...nota, transcript: lineas };
  }
}

export async function listarNotas(args: { updated_after?: string; created_after?: string; folder_id?: string; cursor?: string | null; page_size?: number }) {
  const q = new URLSearchParams();
  if (args.updated_after) q.set('updated_after', args.updated_after);
  if (args.created_after) q.set('created_after', args.created_after);
  if (args.folder_id) q.set('folder_id', args.folder_id);
  if (args.cursor) q.set('cursor', args.cursor);
  q.set('page_size', String(args.page_size ?? 30));
  return llamar<{ notes: GranolaNote[]; hasMore?: boolean; cursor?: string | null }>(`/notes?${q.toString()}`);
}

export const listarCarpetas = () => llamar<{ folders?: { id: string; name: string; parent_folder_id?: string | null }[]; data?: unknown[] }>('/folders');

/** Registra el endpoint del webhook. Devuelve `signing_secret` UNA sola vez: guardarlo en GRANOLA_WEBHOOK_SECRET. */
export function crearWebhook(args: { url: string; scopes?: ('personal' | 'public')[]; events?: string[]; folder_ids?: string[] }) {
  return llamar<{ id: string; url: string; signing_secret?: string; events?: string[] }>('/webhook-endpoints', {
    method: 'POST',
    body: JSON.stringify({ url: args.url, scopes: args.scopes ?? ['personal', 'public'], events: args.events ?? ['note.generated', 'note.edited'], ...(args.folder_ids?.length ? { folder_ids: args.folder_ids } : {}) }),
  });
}
export const listarWebhooks = () => llamar<unknown>('/webhook-endpoints');

/**
 * Firma estilo Standard Webhooks: HMAC-SHA256 de `${webhook-id}.${webhook-timestamp}.${body}`
 * con el secreto en base64 (sin el prefijo `whsec_`); header `webhook-signature: v1,<base64>`.
 * Sin secreto configurado se rechaza: un webhook sin firma puede crear reuniones falsas.
 */
export function firmaWebhookOk(raw: string, headers: Headers): boolean {
  const secret = process.env.GRANOLA_WEBHOOK_SECRET;
  if (!secret) return false;
  const id = headers.get('webhook-id') ?? '';
  const ts = headers.get('webhook-timestamp') ?? '';
  const sigs = (headers.get('webhook-signature') ?? '').split(/\s+/).map((s) => s.trim()).filter(Boolean);
  if (!id || !ts || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 5 * 60) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const esperado = crypto.createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest('base64');
  return sigs.some((s) => {
    const val = s.includes(',') ? s.split(',')[1] : s;
    try { return crypto.timingSafeEqual(Buffer.from(val), Buffer.from(esperado)); } catch { return false; }
  });
}

/** Transcripción plana "Nombre: texto" para la IA y para buscar. */
export function transcripcionPlana(t: GranolaTranscriptLine[] | null | undefined, maxChars = 60000) {
  if (!t?.length) return '';
  const out: string[] = [];
  let n = 0;
  for (const l of t) {
    const quien = l.speaker?.name || (l.speaker?.source === 'microphone' ? 'Asesor' : l.speaker?.source === 'system' ? 'Cliente' : l.speaker?.diarization_label || '—');
    const linea = `${quien}: ${(l.text ?? '').trim()}`;
    n += linea.length + 1;
    if (n > maxChars) { out.push('[… transcripción recortada …]'); break; }
    out.push(linea);
  }
  return out.join('\n');
}
