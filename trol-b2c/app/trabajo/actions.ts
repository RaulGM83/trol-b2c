'use server';
// Server actions del espacio de trabajo (RLS: miembro autenticado).
import { revalidatePath } from 'next/cache';
import { t3, requireMiembro, type Any } from '@/lib/trol3/server';
import { subirDocumentoExpediente, notificarSisecPdf, asegurarCurp } from '@/lib/trol3/documentos';
import { parseSemillaV2 } from '@/lib/imss/semilla';
import { guardarEscenarioAutorizado, type SujetoEscenario } from '@/lib/viraal/escenario';
import type { SnapshotEscenario } from '@/lib/viraal/snapshot';
import { titularDesdeExpediente } from '@/lib/infonavit/prefill';

const ok = (extra: Record<string, unknown> = {}) => ({ ok: true, ...extra });
const fail = (e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String((e as Any)?.message ?? e) });

export async function tomarCabecera(personaId: string) {
  await requireMiembro();
  const { data, error } = await t3().rpc('tomar_cabecera', { p_persona: personaId });
  if (error) return fail(error);
  revalidatePath(`/trabajo/p/${personaId}`);
  return ok({ cabecera: data });
}

export type CambioOportunidad = { motivo?: string | null; proveedor?: string | null; contactar_despues?: string | null; nota?: string | null };
/** Cambia la etapa de una oportunidad (ciclo unificado, migración 084): historial, timestamps y nota en bitácora los pone la función SQL. */
export async function cambiarEstadoOportunidad(opId: string, personaId: string, estado: string, extra?: string | CambioOportunidad) {
  await requireMiembro();
  const x: CambioOportunidad = typeof extra === 'string' ? { nota: extra } : extra ?? {};
  if (estado === 'perdida' && !x.motivo) return fail('Indica el motivo de pérdida');
  const { error } = await t3().rpc('cambiar_estado_oportunidad', {
    p_op: opId, p_estado: estado, p_motivo: x.motivo ?? null, p_proveedor: x.proveedor ?? null, p_contactar_despues: x.contactar_despues || null, p_nota: x.nota?.trim() || null,
  });
  if (error) return fail(error);
  revalidatePath(`/trabajo/p/${personaId}`);
  revalidatePath('/trabajo');
  revalidatePath('/trabajo/lista');
  revalidatePath('/trabajo/embudo');
  return ok();
}

/** Credenciales del portal Infonavit (migración 089): cifradas; guardar y revelar dejan bitácora. */
export async function guardarCredencial(personaId: string, secreto: string, usuario?: string) {
  await requireMiembro();
  const { error } = await t3().rpc('guardar_credencial', { p_persona: personaId, p_secreto: secreto, p_servicio: 'infonavit', p_usuario: usuario ?? null });
  if (error) return fail(error);
  revalidatePath(`/trabajo/p/${personaId}`);
  return ok();
}

export async function revelarCredencial(personaId: string) {
  await requireMiembro();
  const { data, error } = await t3().rpc('revelar_credencial', { p_persona: personaId, p_servicio: 'infonavit' });
  if (error) return fail(error);
  const row = (Array.isArray(data) ? data[0] : data) as { usuario: string | null; secreto: string } | undefined;
  return ok({ credencial: row ?? null });
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

/**
 * Reproceso manual de una consulta colgada (migración 066). Cierra lo que siga abierto
 * del mismo tipo y vuelve a pedirla con `p_forzar`: cuesta dinero y sale de verdad,
 * por eso la UI pide confirmación antes de llamar aquí.
 */
export async function reprocesarConsulta(personaId: string, tipo: string, proveedor: string | null, motivo: string) {
  await requireMiembro();
  const { data, error } = await t3().rpc('reprocesar_consulta', {
    p_persona: personaId, p_tipo: tipo, p_proveedor: proveedor || null, p_motivo: motivo || null,
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
  let aviso: string | undefined;
  if (c) {
    // declarar() espeja la CURP en personas y dispara el checklist de identidad.
    const r = await db.rpc('declarar', { p_persona: pid, p_campo: 'curp', p_valor: c, p_actor: 'asesor', p_actor_id: m.id, p_capa: 'declarado' });
    if (r.error) aviso = `Persona creada, pero no se guardó la CURP: ${r.error.message}`;
  }
  // Alta desde plataforma = cliente cálido: se pide la información pensional de una vez (Jordan).
  // Sin CURP la consulta queda pendiente y se dispara sola en cuanto alguien la capture.
  if (!aviso) {
    await db.rpc('pedir_consulta', {
      p_persona: pid, p_tipo: 'imss_historial', p_actor: 'asesor', p_actor_id: m.id, p_pagador: 'trol',
      p_notificar: false, p_motivo: 'alta_plataforma', p_forzar: false, p_proveedor: 'jordan',
    });
  }
  return { ok: true as const, persona_id: pid, aviso };
}

// ── Duplicados (migración 073) ──────────────────────────────────────────────

/**
 * Fusiona uno o varios expedientes sobre el que se conserva. `fusionar_personas` se
 * planta sola con `curps_distintas` si no son la misma persona, así que la UI y la base
 * dicen lo mismo. Se corta en el primer fallo y se reporta lo que sí alcanzó a fusionar.
 */
export async function fusionarPersonas(conservar: string, absorber: string[], motivo: string) {
  await requireMiembro();
  if (!motivo.trim()) return fail(new Error('Escribe por qué son la misma persona.'));
  if (!absorber.length) return fail(new Error('No hay expedientes que absorber.'));
  const db = t3();
  // `movidas` viene como objeto tabla → número | 'conflicto_conservado'. Se pasa crudo
  // al cliente y allá se aplana con resumenMovidas(); nunca se manda a JSX tal cual.
  const hechas: { id: string; movidas: unknown }[] = [];
  for (const id of absorber) {
    const { data, error } = await db.rpc('fusionar_personas', { p_conservar: conservar, p_absorber: id, p_motivo: motivo });
    if (error) return { ...fail(error), fusionadas: hechas };
    hechas.push({ id, movidas: (data as { movidas?: unknown } | null)?.movidas ?? null });
  }
  revalidatePath('/trabajo/duplicados');
  revalidatePath(`/trabajo/p/${conservar}`);
  return ok({ fusionadas: hechas });
}

/**
 * Un teléfono, una CURP: cuando el número lo comparten familiares no se fusiona nada.
 * Se ligan entre sí por `relaciones_persona` y el dueño se queda el número como principal;
 * los demás lo conservan como contacto pero dejan de reclamarlo.
 */
export async function ligarFamiliares(telefono: string, dueno: string, ids: string[], nota: string) {
  await requireMiembro();
  if (!ids.includes(dueno)) return fail(new Error('El dueño del teléfono tiene que ser uno del grupo.'));
  const db = t3();
  const texto = nota.trim() || `Comparten el teléfono ${telefono}`;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const { error } = await db.rpc('relacionar_personas', { p_a: ids[i], p_b: ids[j], p_tipo: 'familiar', p_nota: texto });
      if (error) return fail(error);
    }
  }
  const base = db.from('contactos').update({ principal: true }).eq('tipo', 'telefono').eq('normalizado', telefono);
  const { error: e1 } = await base.eq('persona_id', dueno);
  if (e1) return fail(e1);
  const { error: e2 } = await db.from('contactos').update({ principal: false }).eq('tipo', 'telefono').eq('normalizado', telefono).neq('persona_id', dueno);
  if (e2) return fail(e2);
  revalidatePath('/trabajo/duplicados');
  return ok();
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

/**
 * Escribe el snapshot inmutable y devuelve su id, o un mensaje de error.
 *
 * Va ANTES de registrar la autorización a propósito: la fila de
 * `trol3.escenarios` es la evidencia de lo que se autorizó, y una autorización
 * sin snapshot es justo el agujero que esto viene a tapar. Si falla, no se
 * registra nada.
 */
async function guardarSnapshot(
  sujeto: SujetoEscenario,
  snapshot: SnapshotEscenario | null | undefined,
): Promise<{ id: string | null; error: string | null }> {
  if (!snapshot) {
    // Sin semilla no hay proyecto que congelar (la mesa cae a los valores del
    // expediente). Se deja pasar, pero el PDF dirá que no hay escenario.
    return { id: null, error: null };
  }
  const r = await guardarEscenarioAutorizado(t3(), sujeto, snapshot);
  return r.ok ? { id: r.id, error: null } : { id: null, error: r.error };
}

export async function autorizarViraal(personaId: string, payload: Any, snapshot?: SnapshotEscenario | null) {
  await requireMiembro();
  const p = payload ?? {};
  const snap = await guardarSnapshot({ personaId }, snapshot);
  if (snap.error) return fail(`no se pudo guardar el escenario: ${snap.error}`);
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
    // El id del escenario viaja en los inputs para que el PDF lo imprima: es el
    // folio con el que después se busca la fila inmutable.
    p_inputs: { ...(p.inputs ?? {}), escenario_id: snap.id },
    p_resultado: p.resultado ?? {},
    p_nota: p.nota ?? null,
  });
  if (error) return fail(error);
  revalidatePath(`/trabajo/p/${personaId}`);
  return ok({ id: data, escenarioId: snap.id });
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

export async function autorizarViraalAliado(consultaId: string, payload: Any, snapshot?: SnapshotEscenario | null) {
  await requireMiembro();
  const p = payload ?? {};
  const snap = await guardarSnapshot({ consultaAliadoId: consultaId }, snapshot);
  if (snap.error) return fail(`no se pudo guardar el escenario: ${snap.error}`);
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
    p_inputs: { ...(p.inputs ?? {}), escenario_id: snap.id },
    p_resultado: p.resultado ?? {},
    p_nota: p.nota ?? null,
  });
  if (error) return fail(error);
  revalidatePath(`/trabajo/aliados/${consultaId}`);
  return ok({ id: data, escenarioId: snap.id });
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
      // El waterfall de n8n busca al cliente en public.clientes por CURP: sin registro legacy el cálculo se pierde (caso Sergio, 25-ago).
      await t3().rpc('enlazar_legacy', { p_persona: personaId });
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

// ---------------------------------------------------------------------------
// Asesoría Infonavit: cotitular, guardado e historial.
// ---------------------------------------------------------------------------

/** Busca al cónyuge entre los expedientes de Trol para no teclear sus datos a mano. */
export async function buscarCotitular(q: string) {
  await requireMiembro();
  if (!q || q.trim().length < 3) return ok({ personas: [] });
  const { data, error } = await t3().rpc('buscar_personas', { p_q: q.trim(), p_limit: 8 });
  if (error) return fail(error);
  return ok({ personas: (data ?? []) as Any[] });
}

/**
 * Trae al cotitular ya derivado: su saldo entra con su propia capa y su propia
 * fecha, igual que el titular principal. Un cotitular tecleado a mano no tiene
 * procedencia; éste sí, y por eso es el camino preferido.
 */
export async function cargarCotitular(personaId: string) {
  await requireMiembro();
  const db = t3();
  const [{ data: e }, { data: datos }, { data: sup }] = await Promise.all([
    db.from('v_expediente').select('*').eq('persona_id', personaId).maybeSingle(),
    db.from('v_mejor_dato').select('*').eq('persona_id', personaId),
    db.from('infonavit_supuestos').select('meses_cotizando_default').eq('id', 'default').maybeSingle(),
  ]);
  if (!e) return fail(new Error('No encontramos ese expediente.'));
  const map = new Map(((datos ?? []) as Any[]).map((d) => [d.campo, d]));
  const semilla = parseSemillaV2(map.get('semilla')?.valor);
  const base = titularDesdeExpediente({
    semilla,
    ley: e.ley ?? null,
    fechaNacimiento: e.fecha_nacimiento ?? null,
    statusEmpleo: e.status_empleo ?? null,
    salarioDiario: map.get('salario_diario')?.valor == null ? null : Number(map.get('salario_diario')?.valor),
    saldoInfonavit: e.saldo_infonavit == null ? null : Number(e.saldo_infonavit),
    saldoEsReportado: e.saldo_infonavit_capa === 'declarado' || e.saldo_infonavit_capa === 'validado',
    creditoVigente: e.credito_infonavit ?? null,
    mesesCotizandoDefault: Number((sup as Any)?.meses_cotizando_default ?? 60),
    ingresoRealMensual: map.get('ingreso_mensual')?.valor == null ? null : Number(map.get('ingreso_mensual')?.valor),
    deduccionesUsadas: map.get('deducciones_personales_anuales')?.valor == null ? null : Number(map.get('deducciones_personales_anuales')?.valor),
  });
  return ok({
    personaId,
    nombre: [e.nombre, e.apellidos].filter(Boolean).join(' ') || '(sin nombre)',
    titular: base.titular,
    origen: base.origen,
    faltantes: base.faltantes,
    saldoCapa: e.saldo_infonavit_capa ?? null,
    creditoVigente: e.credito_infonavit ?? null,
  });
}

export async function guardarAsesoriaInfonavit(payload: {
  personaId: string; entrada: unknown; resultado: unknown; proyectoId: string | null;
  cotitularPersonaId: string | null; cotitularDatos: unknown | null; nota: string | null;
  nombre?: string | null; horizonte?: number | null;
}) {
  await requireMiembro();
  const { data, error } = await t3().rpc('guardar_asesoria_infonavit', {
    p_persona: payload.personaId,
    p_entrada: payload.entrada,
    p_resultado: payload.resultado,
    p_proyecto: payload.proyectoId,
    p_cotitular: payload.cotitularPersonaId,
    p_cotitular_datos: payload.cotitularDatos,
    p_nota: payload.nota,
    p_nombre: payload.nombre ?? null,
    p_horizonte: payload.horizonte ?? null,
  });
  if (error) return fail(error);
  revalidatePath(`/trabajo/p/${payload.personaId}`);
  if (payload.cotitularPersonaId) revalidatePath(`/trabajo/p/${payload.cotitularPersonaId}`);
  return ok({ id: data as string });
}

/**
 * Archivar en vez de borrar: si el escenario ya se le entregó al cliente, hay que poder
 * rastrear qué se le presentó aunque el asesor lo saque del historial.
 */
export async function archivarAsesoria(id: string, personaId: string, archivar = true) {
  await requireMiembro();
  const { error } = await t3().rpc('archivar_asesoria_infonavit', { p_id: id, p_archivar: archivar });
  if (error) return fail(error);
  revalidatePath(`/trabajo/p/${personaId}`);
  return ok();
}
