'use server';
// Server actions del espacio del cliente (/mi).
import { revalidatePath } from 'next/cache';
import { getPersonaMia, t3 } from '@/lib/trol3/server';
import { subirDocumentoExpediente, notificarSisecPdf, asegurarCurp } from '@/lib/trol3/documentos';

/** 235 · Modo declarado: las respuestas de «mientras encontramos tu información» en una sola llamada. */
export async function miDeclararEstimacion(p: {
  anio_nacimiento: number | null; cotiza: boolean; sueldo_mensual: number; anios_cotizados: number;
  antes_97: boolean | null; afore: string | null; saldo_afore: number | null; saldo_infonavit: number | null;
}): Promise<{ ok: boolean; error?: string }> {
  const pid = await getPersonaMia();
  if (!pid) return { ok: false, error: 'Sesión no válida.' };
  const db = t3();
  if (p.anio_nacimiento && p.anio_nacimiento > 1920 && p.anio_nacimiento < 2010) {
    const { error } = await db.rpc('declarar_mio', { p_campo: 'fecha_nacimiento', p_valor: `${p.anio_nacimiento}-06-15` });
    if (error) return { ok: false, error: error.message };
  }
  const payload: Record<string, unknown> = {
    cotiza: p.cotiza, sueldo_mensual: p.sueldo_mensual, anios_cotizados: p.anios_cotizados,
    afore: p.afore, saldo_afore: p.saldo_afore, saldo_infonavit: p.saldo_infonavit,
  };
  if (p.antes_97 != null) payload.antes_97 = p.antes_97;
  const { data, error } = await db.rpc('mi_estimacion_declarar', { p: payload });
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as { ok?: boolean; motivo?: string };
  if (r.ok === false) return { ok: false, error: r.motivo === 'ya_hay_historial' ? 'Ya llegó tu información del IMSS: recarga la página.' : (r.motivo ?? 'No se pudo guardar.') };
  revalidatePath('/mi');
  return { ok: true };
}

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
    if (tipo === 'constancia_semanas') {
      const c = await asegurarCurp(pid, String(formData.get('curp') ?? ''), r.buffer, 'cliente', pid);
      if (c.error) { revalidatePath('/mi'); return { ok: true, procesando: false, aviso: `Guardado (+50 pts), pero ${c.error}` }; }
      if (!c.curp) { revalidatePath('/mi'); return { ok: true, procesando: false, falta_curp: true, aviso: 'Guardado (+50 pts). Para actualizar tu expediente necesitamos tu CURP: escríbela abajo y vuelve a subir.' }; }
      procesando = (await notificarSisecPdf(pid, r.documentoId, r.path)).enviado;
    }
    revalidatePath('/mi');
    return { ok: true, procesando };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'No se pudo subir.' }; }
}
