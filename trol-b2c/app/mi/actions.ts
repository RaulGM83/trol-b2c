'use server';
// Server actions del espacio del cliente (/mi).
import { revalidatePath } from 'next/cache';
import { getPersonaMia } from '@/lib/trol3/server';
import { subirDocumentoExpediente, notificarSisecPdf } from '@/lib/trol3/documentos';

/** El cliente sube un documento a su bóveda (gana puntos vía trigger). Constancia de semanas → pipeline SISEC. */
export async function miSubirDocumento(formData: FormData) {
  const pid = await getPersonaMia();
  if (!pid) return { ok: false, error: 'Sesión no válida.' };
  const tipo = String(formData.get('tipo') ?? '');
  const file = formData.get('archivo');
  if (!tipo || !(file instanceof File)) return { ok: false, error: 'Elige el tipo y el archivo.' };
  try {
    const r = await subirDocumentoExpediente({ personaId: pid, tipo, file, actor: 'cliente', actorId: pid });
    let procesando = false;
    if (tipo === 'constancia_semanas') procesando = (await notificarSisecPdf(pid, r.documentoId, r.path)).enviado;
    revalidatePath('/mi');
    return { ok: true, procesando };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'No se pudo subir.' }; }
}
