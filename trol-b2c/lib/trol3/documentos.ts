// ============================================================================
// Bóveda de documentos (Storage privado `expediente`) — solo servidor.
// Subir archivo + registrar en trol3.documentos; URLs firmadas con gating;
// y disparo del pipeline SISEC (N8N "Waterfall pdf sisec") cuando el documento es
// una constancia de semanas del IMSS.
// ============================================================================
import { createAdminClient } from '@/lib/supabase/admin';

export const BUCKET_EXPEDIENTE = 'expediente';
const MAX_BYTES = 15 * 1024 * 1024;
const MIME_OK: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

export type ActorDoc = 'cliente' | 'asesor' | 'recepcionista';

function limpiarNombre(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80);
}

/**
 * Sube el archivo al bucket privado y lo registra en trol3.documentos.
 * Valida tipo contra el catálogo (formatos permitidos y quién puede subir).
 */
export async function subirDocumentoExpediente(args: { personaId: string; tipo: string; file: File; actor: ActorDoc; actorId?: string | null }) {
  const { personaId, tipo, file, actor, actorId } = args;
  if (!file || file.size === 0) throw new Error('Archivo vacío.');
  if (file.size > MAX_BYTES) throw new Error('El archivo pesa más de 15 MB.');
  const ext = MIME_OK[file.type];
  if (!ext) throw new Error('Formato no permitido (usa PDF, JPG o PNG).');
  const admin = createAdminClient();
  const { data: cat } = await admin.schema('trol3').from('catalogo_documentos').select('tipo,nombre,formatos,sube_cliente,sube_asesor,parseable').eq('tipo', tipo).maybeSingle();
  if (!cat) throw new Error('Tipo de documento desconocido.');
  if (actor === 'cliente' && !cat.sube_cliente) throw new Error('Este documento no se sube desde aquí.');
  if (actor !== 'cliente' && !cat.sube_asesor) throw new Error('Este documento no se sube desde aquí.');
  if (!(cat.formatos as string[]).includes(ext)) throw new Error(`Formato no permitido para ${cat.nombre} (${(cat.formatos as string[]).join(', ')}).`);

  const path = `${personaId}/${tipo}/${Date.now()}-${limpiarNombre(file.name || `documento.${ext}`)}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const up = await admin.storage.from(BUCKET_EXPEDIENTE).upload(path, buf, { contentType: file.type, upsert: false });
  if (up.error) throw new Error(`No se pudo guardar el archivo: ${up.error.message}`);

  const { data: docId, error } = await admin.schema('trol3').rpc('registrar_documento', {
    p_persona: personaId, p_tipo: tipo, p_storage_path: path, p_nombre: cat.nombre, p_actor: actor, p_actor_id: actorId ?? null,
  });
  if (error) {
    await admin.storage.from(BUCKET_EXPEDIENTE).remove([path]);
    throw new Error(error.message);
  }
  return { documentoId: docId as string, path, parseable: !!cat.parseable };
}

/** URL firmada de corta duración para abrir un documento de la bóveda. */
export async function urlFirmadaDocumento(storagePath: string, segundos = 120) {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET_EXPEDIENTE).createSignedUrl(storagePath, segundos);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'No se pudo firmar la URL');
  return data.signedUrl;
}

/**
 * Manda la constancia de semanas al pipeline N8N (webhook `webhook_sisec_pdf` en trol3.config)
 * con una URL firmada de 7 días. N8N descarga el PDF, extrae, calcula y actualiza el expediente
 * por el puente actual (procesos → trol3). Best-effort: no rompe la subida si falla.
 */
export async function notificarSisecPdf(personaId: string, documentoId: string, storagePath: string) {
  const admin = createAdminClient();
  const t3 = admin.schema('trol3');
  const [{ data: cfg }, { data: p }] = await Promise.all([
    t3.from('config').select('valor').eq('clave', 'webhook_sisec_pdf').maybeSingle(),
    t3.from('personas').select('id,nombre,apellidos,curp,legacy_cliente_id').eq('id', personaId).maybeSingle(),
  ]);
  const url = cfg?.valor as string | undefined;
  if (!url || !p?.curp) return { enviado: false, motivo: !url ? 'sin_webhook' : 'sin_curp' };
  let correo: string | null = null;
  if (p.legacy_cliente_id) {
    const { data: cl } = await admin.from('clientes').select('email').eq('id', p.legacy_cliente_id).maybeSingle();
    correo = (cl?.email as string | null) ?? null;
  }
  if (!correo) {
    const { data: em } = await t3.from('contactos').select('valor').eq('persona_id', personaId).eq('tipo', 'email').order('principal', { ascending: false }).limit(1).maybeSingle();
    correo = (em?.valor as string | null) ?? `${String(p.curp).toLowerCase()}@trol.mx`;
  }
  const { data: signed } = await admin.storage.from(BUCKET_EXPEDIENTE).createSignedUrl(storagePath, 60 * 60 * 24 * 7);
  if (!signed?.signedUrl) return { enviado: false, motivo: 'sin_url' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        curp: p.curp, correo, nombre: [p.nombre, p.apellidos].filter(Boolean).join(' '),
        pdf_url: signed.signedUrl, persona_id: personaId, documento_id: documentoId, origen: 'trol3_boveda',
      }),
      signal: AbortSignal.timeout(15000),
    });
    return { enviado: res.ok, motivo: res.ok ? null : `http_${res.status}` };
  } catch (e) {
    return { enviado: false, motivo: e instanceof Error ? e.message : 'error' };
  }
}
