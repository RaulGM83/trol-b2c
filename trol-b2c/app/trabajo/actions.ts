'use server';
// Server actions del espacio de trabajo (RLS: miembro autenticado).
import { revalidatePath } from 'next/cache';
import { t3, requireMiembro, type Any } from '@/lib/trol3/server';

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

export async function altaPersona(telefono: string, nombre: string, canal: string) {
  const m = await requireMiembro();
  const { data, error } = await t3().rpc('alta_por_telefono', { p_tel: telefono, p_canal: canal || 'organico', p_actor: 'recepcionista', p_nombre: nombre || null, p_campania: null, p_verificacion: 'manual' });
  if (error) return fail(error);
  const pid = (data as { persona_id: string }).persona_id;
  await t3().from('personas').update({ cabecera_id: m.id }).eq('id', pid).is('cabecera_id', null);
  return ok({ persona_id: pid });
}
