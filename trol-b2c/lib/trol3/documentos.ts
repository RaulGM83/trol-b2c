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
export const CURP_RE = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/;

/** Intenta leer la CURP del texto de un PDF (constancia de semanas IMSS). Best-effort. */
export async function extraerCurpDePdf(buf: Buffer): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (b: Buffer, o?: unknown) => Promise<{ text: string }>;
    const { text } = await pdfParse(buf, { max: 2 });
    const m = (text || '').toUpperCase().match(/[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/);
    return m ? m[0] : null;
  } catch { return null; }
}

/**
 * Asegura que la persona tenga CURP antes de procesar una constancia: usa la que venga del formulario,
 * si no, la que se lea del PDF. Devuelve la CURP final o null si no hay forma de obtenerla.
 */
export async function asegurarCurp(personaId: string, curpForm: string | null | undefined, pdf: Buffer | null, actor: ActorDoc, actorId?: string | null): Promise<{ curp: string | null; origen: 'persona' | 'formulario' | 'pdf' | null; error?: string }> {
  const admin = createAdminClient();
  const t3 = admin.schema('trol3');
  const { data: p } = await t3.from('personas').select('curp').eq('id', personaId).maybeSingle();
  if (p?.curp) return { curp: p.curp as string, origen: 'persona' };
  let curp = (curpForm ?? '').trim().toUpperCase() || null;
  let origen: 'formulario' | 'pdf' | null = curp ? 'formulario' : null;
  if (curp && !CURP_RE.test(curp)) return { curp: null, origen: null, error: 'La CURP no es válida (18 caracteres).' };
  if (!curp && pdf) { curp = await extraerCurpDePdf(pdf); origen = curp ? 'pdf' : null; }
  if (!curp) return { curp: null, origen: null };
  const { data: dup } = await t3.from('personas').select('id').eq('curp', curp).neq('id', personaId).is('merged_into', null).maybeSingle();
  if (dup) return { curp: null, origen: null, error: 'Esa CURP ya pertenece a otra persona del expediente.' };
  const { error } = await t3.rpc('declarar', { p_persona: personaId, p_campo: 'curp', p_valor: curp, p_actor: actor === 'cliente' ? 'cliente' : 'asesor', p_actor_id: actorId ?? null, p_capa: 'declarado' });
  if (error) return { curp: null, origen: null, error: error.message };
  return { curp, origen };
}

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
  return { documentoId: docId as string, path, parseable: !!cat.parseable, buffer: buf };
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

/**
 * Guarda en el expediente un PDF que generamos nosotros (no que alguien subió).
 *
 * Existe aparte de `subirDocumentoExpediente` porque aquella exige que el tipo
 * tenga `sube_asesor`, y los documentos generados —el diagnóstico avanzado, el
 * escenario— tienen esa bandera en `false` A PROPÓSITO: nadie debe poder subir
 * a mano un PDF cualquiera y que quede registrado como "Diagnóstico avanzado".
 * Aquí el archivo lo produjo el sistema a partir de lo guardado, así que el
 * actor es `sistema` y la validación que se conserva es la del formato.
 */
export async function guardarPdfGenerado(args: {
  personaId: string;
  tipo: string;
  buffer: Buffer;
  nombreArchivo: string;
  actorId?: string | null;
}) {
  const { personaId, tipo, buffer, nombreArchivo, actorId } = args;
  if (!buffer?.length) throw new Error('El PDF salió vacío.');
  if (buffer.length > MAX_BYTES) throw new Error('El PDF pesa más de 15 MB.');

  const admin = createAdminClient();
  const { data: cat } = await admin.schema('trol3').from('catalogo_documentos')
    .select('tipo,nombre,formatos').eq('tipo', tipo).maybeSingle();
  if (!cat) throw new Error('Tipo de documento desconocido.');
  if (!(cat.formatos as string[]).includes('pdf')) throw new Error(`${cat.nombre} no acepta PDF.`);

  const path = `${personaId}/${tipo}/${Date.now()}-${limpiarNombre(nombreArchivo)}`;
  const up = await admin.storage.from(BUCKET_EXPEDIENTE)
    .upload(path, buffer, { contentType: 'application/pdf', upsert: false });
  if (up.error) throw new Error(`No se pudo guardar el archivo: ${up.error.message}`);

  const { data: docId, error } = await admin.schema('trol3').rpc('registrar_documento', {
    p_persona: personaId, p_tipo: tipo, p_storage_path: path,
    p_nombre: cat.nombre, p_actor: 'sistema', p_actor_id: actorId ?? null,
  });
  if (error) {
    // Si no quedó registrado, el archivo no debe quedar huérfano en la bóveda.
    await admin.storage.from(BUCKET_EXPEDIENTE).remove([path]);
    throw new Error(error.message);
  }
  return { documentoId: docId as string, path };
}
