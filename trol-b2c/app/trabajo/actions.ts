'use server';
// Server actions del espacio de trabajo (RLS: miembro autenticado).
import { revalidatePath } from 'next/cache';
import { t3, requireMiembro, type Any } from '@/lib/trol3/server';
import { subirDocumentoExpediente, notificarSisecPdf, asegurarCurp } from '@/lib/trol3/documentos';

const ok = (extra: Record<string, unknown> = {}) => ({ ok: true, ...extra });
const fail = (e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String((e as Any)?.message ?? e) });

export async function tomarCabecera(personaId: string) {
  await requireMiembro();
  const { data, error } = await t3().rpc('tomar_cabecera', { p_persona: personaId });
  if (error) return fail(error);
  revalidatePath(`/trabajo/p/${personaId}`);
  return ok({ cabecera: data });
}

export async function cambiarEstadoOportunidad(opId: string, personaId: string, estado: string, nota?: string) {
  const m = await requireMiembro();
  const db = t3();
  if (estado === 'presentada') {
    const { error } = await db.rpc('presentar_oportunidad', { p_op: opId, p_nota: nota ?? null });
    if (error) return fail(error);
  } else {
    const patch: Record<string, unknown> = { estado };
    if (['ganada', 'perdida', 'no_aplica'].includes(estado)) patch.cerrada_en = new Date().toISOString();
    if (nota) patch.resultado = nota;
    const { error } = await db.from('oportunidades').update(patch).eq('id', opId);
    if (error) return fail(error);
    if (nota) await db.rpc('registrar_interaccion', { p_persona: personaId, p_canal: 'nota', p_actor: 'asesor', p_actor_id: m.id, p_direccion: 'interna', p_contenido: `[${estado}] ${nota}`, p_visible_cliente: false, p_meta: { oportunidad_id: opId } });
  }
  revalidatePath(`/trabajo/p/${personaId}`);
  revalidatePath('/trabajo');
  return ok();
}

export async function asignarEspecialista(opId: string, personaId: string, miembroId: string | null) {
  await requireMiembro();
  const { error } = await t3().from('oportunidades').update({ especialista_id: miembroId }).eq('id', opId);
  if (error) return fail(error);
  revalidatePath(`/trabajo/p/${personaId}`);
  return ok();
}

export async function pedirConsulta(personaId: string, tipo: string, notificar: boolean, motivo: string, forzar: boolean, proveedor?: string) {
  const m = await requireMiembro();
  const { data, error } = await t3().rpc('pedir_consulta', {
    p_persona: personaId, p_tipo: tipo, p_actor: 'asesor', p_actor_id: m.id, p_pagador: 'trol', p_notificar: notificar, p_motivo: motivo || null, p_forzar: forzar, p_proveedor: proveedor || null,
  });
  if (error) return fail(error);
  const res = data as { ok?: boolean; consulta_id?: string; motivo?: string; proveedor?: string; costo?: number };
  if (res?.consulta_id) {
    const { data: c } = await t3().from('consultas').select('estado,error').eq('id', res.consulta_id).maybeSingle();
    if (c) Object.assign(res, { estado: c.estado, error: c.error });
  }
  revalidatePath(`/trabajo/p/${personaId}`);
  return ok({ resultado: res });
}

export async function agregarNota(personaId: string, contenido: string, canal: string, visibleCliente: boolean) {
  const m = await requireMiembro();
  const { error } = await t3().rpc('registrar_interaccion', {
    p_persona: personaId, p_canal: canal, p_actor: 'asesor', p_actor_id: m.id, p_direccion: canal === 'nota' ? 'interna' : 'saliente', p_contenido: contenido, p_visible_cliente: visibleCliente, p_meta: {},
  });
  if (error) return fail(error);
  revalidatePath(`/trabajo/p/${personaId}`);
  return ok();
}

export async function declararAsesor(personaId: string, campo: string, valor: unknown, capa: 'declarado' | 'validado' = 'declarado') {
  const m = await requireMiembro();
  const { error } = await t3().rpc('declarar', { p_persona: personaId, p_campo: campo, p_valor: valor, p_actor: 'asesor', p_actor_id: m.id, p_capa: capa });
  if (error) return fail(error);
  revalidatePath(`/trabajo/p/${personaId}`);
  return ok();
}

export async function marcarEtapa(personaId: string, etapa: string) {
  await requireMiembro();
  const { error } = await t3().from('personas').update({ etapa }).eq('id', personaId);
  if (error) return fail(error);
  await t3().rpc('evaluar_persona_seguro', { p_id: personaId });
  revalidatePath(`/trabajo/p/${personaId}`);
  return ok();
}

export async function crearCita(personaId: string, inicioISO: string, notas: string) {
  const m = await requireMiembro();
  const { error } = await t3().from('citas').insert({ persona_id: personaId, miembro_id: m.id, inicio: inicioISO, origen: 'asesor', notas });
  if (error) return fail(error);
  revalidatePath(`/trabajo/p/${personaId}`);
  return ok();
}

export async function reevaluar(personaId: string) {
  await requireMiembro();
  const { error } = await t3().rpc('evaluar_persona_seguro', { p_id: personaId });
  if (error) return fail(error);
  revalidatePath(`/trabajo/p/${personaId}`);
  return ok();
}

const CURP_RE = /^[A-Z]{4}\d{6}[A-Z]{6}[A-Z0-9]\d$/;

export async function altaPersona(telefono: string, nombre: string, canal: string, curp?: string) {
  const m = await requireMiembro();
  const db = t3();
  const c = (curp ?? '').trim().toUpperCase();
  if (c && !CURP_RE.test(c)) return fail('CURP inválida (18 caracteres).');
  if (c) {
    // Si la CURP ya está en otra persona, no duplicamos: avisamos y damos el link.
    const dup = await db.from('personas').select('id').eq('curp', c).is('merged_into', null).maybeSingle();
    if (dup.data?.id) {
      // Si es la misma persona (mismo teléfono), simplemente la abrimos.
      const t10 = telefono.replace(/\D/g, '').slice(-10);
      const mismo = await db.from('contactos').select('persona_id').eq('persona_id', dup.data.id).eq('tipo', 'telefono').eq('normalizado', t10).limit(1).maybeSingle();
      if (mismo.data) {
        await db.from('personas').update({ cabecera_id: m.id }).eq('id', dup.data.id).is('cabecera_id', null);
        return ok({ persona_id: dup.data.id });
      }
      return { ok: false, error: 'Esa CURP ya está registrada en otra persona.', persona_id: dup.data.id };
    }
  }
  const { data, error } = await db.rpc('alta_por_telefono', { p_tel: telefono, p_canal: canal || 'organico', p_actor: 'recepcionista', p_nombre: nombre || null, p_campania: null, p_verificacion: 'manual' });
  if (error) return fail(error);
  const pid = (data as { persona_id: string }).persona_id;
  await db.from('personas').update({ cabecera_id: m.id }).eq('id', pid).is('cabecera_id', null);
  if (c) {
    // declarar() espeja la CURP en personas y dispara el checklist de identidad.
    const r = await db.rpc('declarar', { p_persona: pid, p_campo: 'curp', p_valor: c, p_actor: 'asesor', p_actor_id: m.id, p_capa: 'declarado' });
    if (r.error) return { ok: true, persona_id: pid, aviso: `Persona creada, pero no se guardó la CURP: ${r.error.message}` };
  }
  return ok({ persona_id: pid });
}

export async function solicitarDiagnosticoAvanzado(personaId: string) {
  await requireMiembro();
  const { data, error } = await t3().rpc('solicitar_diagnostico_avanzado', { p_persona: personaId });
  if (error) return fail(error);
  revalidatePath(`/trabajo/p/${personaId}`);
  return ok({ resultado: data });
}

export async function otorgarBeneficio(personaId: string, codigo: string, motivo: string, origen: string) {
  await requireMiembro();
  const { error } = await t3().rpc('otorgar_beneficio', { p_persona: personaId, p_codigo: codigo, p_origen: origen || 'asesor', p_motivo: motivo || null, p_referencia: null, p_expira: null });
  if (error) return fail(error);
  revalidatePath(`/trabajo/p/${personaId}`);
  return ok();
}
export async function revocarBeneficio(personaId: string, id: string) {
  await requireMiembro();
  const { error } = await t3().rpc('revocar_beneficio', { p_id: id });
  if (error) return fail(error);
  revalidatePath(`/trabajo/p/${personaId}`);
  return ok();
}

export async function autorizarViraal(personaId: string, payload: Any) {
  await requireMiembro();
  const p = payload ?? {};
  const { data, error } = await t3().rpc('guardar_autorizacion_viraal', {
    p_persona: personaId,
    p_nivel: p.nivel ?? null,
    p_escenario: p.escenario ?? null,
    p_banda: p.banda ?? null,
    p_margen: p.margen ?? null,
    p_margen_costo: p.margen_costo ?? null,
    p_margen_credito: p.margen_credito ?? null,
    p_precio: p.precio ?? null,
    p_costo: p.costo ?? null,
    p_ingreso: p.ingreso ?? null,
    p_inputs: p.inputs ?? {},
    p_resultado: p.resultado ?? {},
    p_nota: p.nota ?? null,
  });
  if (error) return fail(error);
  revalidatePath(`/trabajo/p/${personaId}`);
  return ok({ id: data });
}

// ── Consultas de aliados (B2B) ──────────────────────────────────────────────
export async function gestionarConsultaAliado(
  id: string,
  patch: { estatus?: string | null; vobo?: boolean | null; reasignar?: boolean; asignado?: string | null; comentario?: string | null },
) {
  await requireMiembro();
  const { data, error } = await t3().rpc('gestionar_consulta_aliado', {
    p_id: id,
    p_estatus: patch.estatus ?? null,
    p_vobo: patch.vobo ?? null,
    p_reasignar: patch.reasignar ?? false,
    p_asignado: patch.asignado ?? null,
    p_comentario: patch.comentario ?? null,
  });
  if (error) return fail(error);
  revalidatePath('/trabajo/aliados');
  return ok({ consulta: data });
}

export async function autorizarViraalAliado(consultaId: string, payload: Any) {
  await requireMiembro();
  const p = payload ?? {};
  const { data, error } = await t3().rpc('guardar_autorizacion_viraal_aliado', {
    p_consulta: consultaId,
    p_nivel: p.nivel ?? null,
    p_escenario: p.escenario ?? null,
    p_banda: p.banda ?? null,
    p_margen: p.margen ?? null,
    p_margen_costo: p.margen_costo ?? null,
    p_margen_credito: p.margen_credito ?? null,
    p_precio: p.precio ?? null,
    p_costo: p.costo ?? null,
    p_ingreso: p.ingreso ?? null,
    p_inputs: p.inputs ?? {},
    p_resultado: p.resultado ?? {},
    p_nota: p.nota ?? null,
  });
  if (error) return fail(error);
  revalidatePath(`/trabajo/aliados/${consultaId}`);
  return ok({ id: data });
}

// ── Bóveda de documentos ────────────────────────────────────────────────────
/** Sube un documento al expediente (asesor). Si es constancia de semanas IMSS, dispara el pipeline SISEC en N8N. */
export async function subirDocumento(formData: FormData) {
  const m = await requireMiembro();
  const personaId = String(formData.get('personaId') ?? '');
  const tipo = String(formData.get('tipo') ?? '');
  const file = formData.get('archivo');
  if (!personaId || !tipo || !(file instanceof File)) return fail('Faltan datos.');
  try {
    const r = await subirDocumentoExpediente({ personaId, tipo, file, actor: 'asesor', actorId: m.id });
    let procesando = false;
    if (tipo === 'constancia_semanas') {
      // Sin CURP no hay pipeline: la tomamos del formulario o la leemos del PDF y la declaramos.
      const c = await asegurarCurp(personaId, String(formData.get('curp') ?? ''), r.buffer, 'asesor', m.id);
      if (c.error) { revalidatePath(`/trabajo/p/${personaId}`); return ok({ documento_id: r.documentoId, aviso: `Guardado, pero ${c.error}` }); }
      if (!c.curp) { revalidatePath(`/trabajo/p/${personaId}`); return { ok: true, documento_id: r.documentoId, falta_curp: true, aviso: 'Guardado. No pude leer la CURP del PDF: escríbela y vuelve a subir para iniciar el cálculo.' }; }
      const n = await notificarSisecPdf(personaId, r.documentoId, r.path);
      procesando = n.enviado;
      if (!n.enviado) { revalidatePath(`/trabajo/p/${personaId}`); return ok({ documento_id: r.documentoId, aviso: `Guardado, pero no se pudo iniciar el cálculo (${n.motivo}).` }); }
    }
    revalidatePath(`/trabajo/p/${personaId}`);
    return ok({ documento_id: r.documentoId, procesando });
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------
// Inventario de inmuebles para la asesoría Infonavit.
// costo_aliado y comision_desarrollador son INTERNOS: no salen al cliente ni al PDF.
// ---------------------------------------------------------------------------
export async function guardarProyecto(patch: {
  id?: string | null; clave: number | null; desarrollo: string; zona: string | null; m2: number | null;
  avaluo: number; escrituracion: number; costo_aliado: number | null; renta: number; renta_estimada: boolean;
  plusvalia: number; plusvalia_validada: boolean; notariales_credito: number; notariales_adicionales: number;
  comision_desarrollador: number; aliado_cubre_notariales: boolean; disponible: boolean; notas: string | null;
}) {
  await requireMiembro();
  if (!patch.desarrollo?.trim()) return fail(new Error('Ponle nombre al desarrollo.'));
  if (!(patch.escrituracion > 0)) return fail(new Error('La escrituración tiene que ser mayor que cero.'));
  const { id, ...campos } = patch;
  const fila = { ...campos, updated_at: new Date().toISOString() };
  const db = t3();
  const { error } = id
    ? await db.from('proyectos_inmobiliarios').update(fila).eq('id', id)
    : await db.from('proyectos_inmobiliarios').insert(fila);
  if (error) return fail(error);
  revalidatePath('/trabajo/proyectos');
  return ok();
}

export async function alternarProyecto(id: string, disponible: boolean) {
  await requireMiembro();
  const { error } = await t3().from('proyectos_inmobiliarios').update({ disponible, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return fail(error);
  revalidatePath('/trabajo/proyectos');
  return ok();
}

/** Supuestos globales de la asesoría Infonavit (hoja `Supuestos` del Excel). */
export async function guardarSupuestosInfonavit(patch: Record<string, unknown>) {
  await requireMiembro();
  const { error } = await t3().from('infonavit_supuestos')
    .update({ ...patch, actualizado_at: new Date().toISOString() }).eq('id', 'default');
  if (error) return fail(error);
  revalidatePath('/trabajo/proyectos');
  return ok();
}
