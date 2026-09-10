// ============================================================================
// Cierre de una consulta Jordan (ventanilla o acta). Lo usan tres caminos que
// tienen que hacer EXACTAMENTE lo mismo: el webhook de Jordan, el cron de
// reconciliación y el botón "Revisar" del asesor. Por eso vive aquí y no en
// la ruta: si cada uno cerrara a su manera, un día uno de los tres mentiría.
//
// Regla: NUNCA se confía en el payload del webhook (hoy no trae firma). Se
// pregunta a Jordan con la llave y se actúa sobre lo que Jordan responde.
// Idempotente: una consulta ya cerrada no se vuelve a tocar.
// ============================================================================
import { createAdminClient } from '@/lib/supabase/admin';
import { guardarPdfGenerado, notificarSisecPdf } from '@/lib/trol3/documentos';
import { JordanError, MXN_POR_CREDITO, pdfActa, pdfVentanilla, verActa, verVentanilla, type TipoActa } from './client';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Sincronizacion = { ok: boolean; estado: string; cambio: boolean; mensaje: string };

const fechaCdmx = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Mexico_City' });

export async function sincronizarConsultaJordan(consultaId: string): Promise<Sincronizacion> {
  const admin = createAdminClient();
  const t3 = admin.schema('trol3');
  const { data: c } = await t3.from('consultas').select('id,persona_id,tipo,estado,payload_in,proveedor').eq('id', consultaId).maybeSingle();
  if (!c) return { ok: false, estado: 'desconocida', cambio: false, mensaje: 'La consulta no existe.' };
  if (!['solicitada', 'en_proceso'].includes(c.estado)) return { ok: true, estado: c.estado, cambio: false, mensaje: 'Ya estaba cerrada.' };
  const pin = (c.payload_in ?? {}) as Record<string, any>;
  const { data: p } = await t3.from('personas').select('curp').eq('id', c.persona_id).maybeSingle();
  const curp = (p?.curp as string | null) ?? 'SIN_CURP';

  const cerrar = async (estado: 'completada' | 'error', resultado: Record<string, unknown>, error: string | null, costoMxn: number | null) => {
    const { error: e } = await t3.rpc('resultado_consulta', { p_consulta: c.id, p_estado: estado, p_datos: {}, p_documentos: [], p_resultado: resultado, p_error: error, p_fecha_dato: null });
    if (e) throw new Error(e.message);
    if (costoMxn != null) await t3.from('consultas').update({ costo: costoMxn }).eq('id', c.id);
  };
  const anotar = async (extra: Record<string, unknown>) => {
    await t3.from('consultas').update({ payload_in: { ...pin, ...extra, visto_en: new Date().toISOString() } }).eq('id', c.id);
  };

  try {
    if (c.tipo === 'imss_ventanilla') {
      const sid = pin.sid as string | undefined;
      if (!sid) return { ok: false, estado: c.estado, cambio: false, mensaje: 'La consulta no tiene sid de Jordan; no se llegó a enviar.' };
      const v = await verVentanilla(sid);
      if (v.estado === 'recibida' || v.estado === 'en_ventanilla') {
        await anotar({ estado_jordan: v.estado, espera_habil_min: v.espera_habil_min ?? null });
        return { ok: true, estado: 'en_proceso', cambio: false, mensaje: v.estado === 'recibida' ? 'En la cola de Jordan, todavía no entra a ventanilla.' : `En ventanilla (${v.espera_habil_min ?? 0} min hábiles).` };
      }
      if (v.estado === 'lista') {
        const buf = await pdfVentanilla(sid);
        const doc = await guardarPdfGenerado({ personaId: c.persona_id, tipo: 'constancia_semanas', buffer: buf, nombreArchivo: `${curp}_semanas_ventanilla_${fechaCdmx()}.pdf` });
        await t3.from('documentos').update({ consulta_id: c.id }).eq('id', doc.documentoId);
        await cerrar('completada', { sid, espera_habil_min: v.espera_habil_min ?? null, creditos: v.creditos_apartados ?? null, documento_id: doc.documentoId }, null, v.creditos_apartados != null ? v.creditos_apartados * MXN_POR_CREDITO : null);
        // El PDF de ventanilla es la misma constancia de semanas: entra al pipeline que ya lee las que sube el asesor.
        const n = await notificarSisecPdf(c.persona_id, doc.documentoId, doc.path);
        return { ok: true, estado: 'completada', cambio: true, mensaje: n.enviado ? 'PDF guardado y mandado a leer; el expediente se actualiza en unos minutos.' : `PDF guardado; no se pudo mandar a leer (${n.motivo}).` };
      }
      // error | cancelada
      await cerrar('error', { sid, creditos_devueltos: v.creditos_devueltos ?? null }, v.error_message ?? `Jordan: ${v.estado}`, 0);
      return { ok: true, estado: 'error', cambio: true, mensaje: v.error_message ?? `Jordan la marcó ${v.estado}; créditos devueltos.` };
    }

    if (c.tipo === 'acta') {
      const id = pin.jordan_id as string | undefined;
      const tipoActa = pin.tipo_acta as TipoActa | undefined;
      if (!id || !tipoActa) return { ok: false, estado: c.estado, cambio: false, mensaje: 'La consulta no tiene id de Jordan; no se llegó a enviar.' };
      const a = await verActa(id);
      if (a.status === 'QUEUED' || a.status === 'PROCESSING') {
        await anotar({ estado_jordan: a.status });
        return { ok: true, estado: 'en_proceso', cambio: false, mensaje: a.status === 'QUEUED' ? 'En cola en Jordan.' : 'En trámite con el Registro Civil.' };
      }
      if (a.status === 'DONE') {
        const buf = await pdfActa(id);
        const doc = await guardarPdfGenerado({ personaId: c.persona_id, tipo: `acta_${tipoActa}`, buffer: buf, nombreArchivo: `${curp}_acta_${tipoActa}_${fechaCdmx()}.pdf` });
        await t3.from('documentos').update({ consulta_id: c.id }).eq('id', doc.documentoId);
        await cerrar('completada', { jordan_id: id, act_type: a.act_type, charged_amount: a.charged_amount ?? null, documento_id: doc.documentoId }, null, a.charged_amount != null ? a.charged_amount * MXN_POR_CREDITO : null);
        return { ok: true, estado: 'completada', cambio: true, mensaje: 'Acta guardada en Documentos.' };
      }
      await cerrar('error', { jordan_id: id, error_code: a.error_code ?? null }, a.error_message ?? `Jordan: ${a.status}`, 0);
      return { ok: true, estado: 'error', cambio: true, mensaje: a.error_message ?? `Jordan la marcó ${a.status}; sin cobro.` };
    }

    return { ok: false, estado: c.estado, cambio: false, mensaje: `Tipo ${c.tipo} no es de Jordan.` };
  } catch (e) {
    // Un fallo aquí NO cierra la consulta: el cron o el asesor vuelven a intentar.
    const msg = e instanceof JordanError ? `${e.message}${e.code ? ` (${e.code})` : ''}` : e instanceof Error ? e.message : String(e);
    await anotar({ ultimo_error_sync: msg });
    return { ok: false, estado: c.estado, cambio: false, mensaje: msg };
  }
}

/** Consultas Jordan abiertas, para el cron. */
export async function consultasJordanAbiertas(limite = 50) {
  const t3 = createAdminClient().schema('trol3');
  const { data } = await t3.from('consultas').select('id,tipo,created_at').in('tipo', ['imss_ventanilla', 'acta']).in('estado', ['solicitada', 'en_proceso']).order('created_at', { ascending: true }).limit(limite);
  return (data ?? []) as { id: string; tipo: string; created_at: string }[];
}
