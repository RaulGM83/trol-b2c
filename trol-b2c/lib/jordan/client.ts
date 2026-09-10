// ============================================================================
// Cliente de Jordan Digital para los dos servicios on demand: Semanas
// Ventanilla (trámite presencial en el IMSS) y Actas del Registro Civil.
//
// La app habla directo con Jordan —no pasa por n8n— para que la llave viva en
// Vercel y el PDF caiga en la bóveda `expediente` sin tocar Drive. Sólo
// servidor: la llave es dinero (cada trámite se cobra en créditos).
//
// Precio y horario NO se fijan aquí: se leen de los endpoints públicos de
// estado, que es lo que Jordan pide para que la integración no mienta el día
// que cambien. Docs: api.jordan-digital.com/api/v1/docs/{ventanilla,actas}.
// ============================================================================

const BASE = 'https://api.jordan-digital.com/api/v1';

/** Peso de un crédito Jordan (dato de Raul, 10-sep-2026). Sólo para mostrar el costo. */
export const MXN_POR_CREDITO = 13;

export const TIPOS_ACTA = ['nacimiento', 'matrimonio', 'defuncion', 'divorcio'] as const;
export type TipoActa = (typeof TIPOS_ACTA)[number];

export type EstadoVentanilla = 'recibida' | 'en_ventanilla' | 'lista' | 'error' | 'cancelada';
export type EstadoActa = 'QUEUED' | 'PROCESSING' | 'DONE' | 'ERROR' | 'CANCELLED';

export type Ventanilla = {
  sid: string; curp: string; nss: string; estado: EstadoVentanilla;
  creditos_apartados?: number; creditos_devueltos?: number; eta_min?: number; espera_habil_min?: number;
  creado_en?: string; pdf_url?: string; error_message?: string;
};
export type Acta = {
  id: string; external_id?: string; term: string; act_type: string; status: EstadoActa;
  charged?: boolean; charged_amount?: number; pdf_url?: string; error_code?: string; error_message?: string; duplicated?: boolean;
};
export type EstadoServicio = {
  abierto: boolean; dias?: string; hora_inicio: string; hora_fin: string; zona?: string; motivo?: string;
  proxima_apertura?: string | null; costo_creditos?: number; eta_min?: number;
};

export class JordanError extends Error {
  constructor(public status: number, public code: string | null, message: string) { super(message); }
}

function apiKey() {
  const k = process.env.JORDAN_API_KEY;
  if (!k) throw new JordanError(0, 'sin_llave', 'Falta JORDAN_API_KEY en el servidor.');
  return k;
}

/** Dónde recibe la app los avisos de Jordan. En producción app.trol.mx. */
export function webhookUrl(servicio: 'ventanilla' | 'actas') {
  const base = process.env.JORDAN_WEBHOOK_BASE || process.env.NEXT_PUBLIC_SITE_URL || 'https://app.trol.mx';
  return `${base.replace(/\/$/, '')}/api/jordan/${servicio}`;
}

async function llamar<T>(path: string, init: RequestInit & { publico?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json', ...(init.headers as Record<string, string> | undefined) };
  if (!init.publico) headers.authorization = `Bearer ${apiKey()}`;
  if (init.body) headers['content-type'] = 'application/json';
  const { publico, ...opts } = init;
  // Los endpoints públicos de estado se cachean 60 s: el expediente los lee en cada carga.
  const res = await fetch(`${BASE}${path}`, { ...opts, headers, ...(publico ? { next: { revalidate: 60 } } : { cache: 'no-store' as const }), signal: init.signal ?? AbortSignal.timeout(publico ? 5000 : 20000) });
  const texto = await res.text();
  let json: Record<string, unknown> = {};
  try { json = texto ? JSON.parse(texto) : {}; } catch { json = { error_message: texto.slice(0, 300) }; }
  if (!res.ok) {
    // Jordan redacta error_message para mostrarse tal cual; error_code es estable para la lógica.
    throw new JordanError(res.status, (json.error_code as string) ?? null, (json.error_message as string) ?? (json.error as string) ?? `Jordan respondió ${res.status}`);
  }
  return json as T;
}

// ── Estado (públicos, sin llave, sin rate limit) ─────────────────────────────
export const ventanillaEstado = () => llamar<EstadoServicio>('/docs/ventanilla/estado', { publico: true });
export const actasEstado = () => llamar<EstadoServicio>('/docs/actas/estado', { publico: true });

// ── Ventanilla ───────────────────────────────────────────────────────────────
/** Crea el trámite. `idempotencyKey` = id de la consulta trol3: un reintento nunca duplica ni recobra. */
export function crearVentanilla(args: { curp: string; nss: string; idempotencyKey: string }) {
  return llamar<Ventanilla>('/ventanilla', {
    method: 'POST',
    headers: { 'Idempotency-Key': args.idempotencyKey },
    body: JSON.stringify({ curp: args.curp, nss: args.nss, webhook_url: webhookUrl('ventanilla') }),
  });
}
export const verVentanilla = (sid: string) => llamar<Ventanilla>(`/ventanilla/${encodeURIComponent(sid)}`);
export const cancelarVentanilla = (sid: string) => llamar<Ventanilla>(`/ventanilla/${encodeURIComponent(sid)}/cancelar`, { method: 'POST' });

// ── Actas ────────────────────────────────────────────────────────────────────
/** Por CURP del titular o, si ya se tiene, por la cadena/folio electrónico del acta (modo `cadena`: va en `curp`). */
export function crearActa(args: { tipo: TipoActa; curp: string; conFolio: boolean; externalId: string; cadena?: string | null }) {
  const cadena = args.cadena?.trim();
  return llamar<Acta>('/actas', {
    method: 'POST',
    body: JSON.stringify(cadena
      ? { tipo: 'cadena', curp: cadena, external_id: args.externalId, webhook_url: webhookUrl('actas') }
      : { tipo: args.tipo, curp: args.curp, con_folio: args.conFolio, external_id: args.externalId, webhook_url: webhookUrl('actas') }),
  });
}
export const verActa = (id: string) => llamar<Acta>(`/actas/${encodeURIComponent(id)}`);

// ── PDF ──────────────────────────────────────────────────────────────────────
/** Descarga con la llave (no con el enlace firmado del payload: ese es una llave en sí y no lo guardamos). */
export async function descargarPdf(path: string): Promise<Buffer> {
  const res = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${apiKey()}` }, cache: 'no-store', signal: AbortSignal.timeout(60000) });
  if (!res.ok) {
    let code: string | null = null; let msg = `Jordan respondió ${res.status} al descargar el PDF`;
    try { const j = await res.json(); code = j.error_code ?? null; msg = j.error_message ?? msg; } catch { /* binario o vacío */ }
    throw new JordanError(res.status, code, msg);
  }
  return Buffer.from(await res.arrayBuffer());
}
export const pdfVentanilla = (sid: string) => descargarPdf(`/ventanilla/${encodeURIComponent(sid)}/pdf`);
export const pdfActa = (id: string) => descargarPdf(`/actas/${encodeURIComponent(id)}/pdf`);

/** Hora de apertura legible para el asesor ("lunes 08:00"). */
export function horarioLegible(e: EstadoServicio | null) {
  if (!e) return '';
  if (e.abierto) return `abierto hasta las ${e.hora_fin}`;
  if (e.proxima_apertura) {
    const d = new Date(e.proxima_apertura.endsWith('Z') || /[+-]\d\d:\d\d$/.test(e.proxima_apertura) ? e.proxima_apertura : `${e.proxima_apertura}-06:00`);
    return `cerrado · abre ${d.toLocaleString('es-MX', { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: e.zona || 'America/Mexico_City' })}`;
  }
  return `cerrado${e.motivo ? ` · ${e.motivo}` : ''} (${e.dias ?? ''} ${e.hora_inicio}–${e.hora_fin})`;
}
