'use server';

// ---------------------------------------------------------------------------
// Lo que puede hacer un aliado referidor (128). Archivo aparte de las acciones
// del equipo a propósito: si vivieran juntas sería cuestión de tiempo que
// alguien importe una de miembro desde una pantalla de aliado.
//
// La regla de este archivo: TODA acción empieza con `requireAliado()`, y lo
// que el aliado NO tiene permitido hacer por sí mismo se ejecuta con la llave
// de servicio, es decir como Trol, nunca "de parte de él".
// ---------------------------------------------------------------------------

import { revalidatePath } from 'next/cache';
import { requireAliado, t3, t3admin, type Any } from '@/lib/trol3/server';
import { subirDocumentoExpediente } from '@/lib/trol3/documentos';
import { DOCS_INFONAVIT } from '@/lib/aliado/infonavit';

const ok = (extra: Record<string, unknown> = {}) => ({ ok: true, ...extra });
const fail = (e: unknown) => ({
  ok: false,
  error: e instanceof Error ? e.message : String((e as Any)?.message ?? e),
});

const CURP_RE = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]{2}$/;

// Los errores de la base dichos como se los diría uno de frente. Un
// `curp_de_otra_persona` en pantalla no le sirve de nada a Humberto.
const EXPLICACION: Record<string, string> = {
  telefono_invalido: 'El teléfono debe traer 10 dígitos.',
  curp_invalida: 'Esa CURP no tiene la forma correcta (18 caracteres).',
  curp_de_otra_persona: 'Esa CURP ya está registrada con otra persona. Verifícala con tu cliente.',
  telefono_de_otra_persona: 'Ese teléfono ya es de otra persona en nuestro sistema. Confirma el número.',
  falta_consentimiento: 'Falta confirmar que la persona te autorizó.',
  no_autorizado: 'Tu sesión no está activa. Vuelve a entrar.',
  nss_invalido: 'El NSS debe traer 11 dígitos.',
  nss_de_otra_persona: 'Ese NSS ya está registrado con otra persona. Verifícalo con tu cliente.',
  falta_curp_o_nss: 'Necesitamos la CURP o el NSS para precalificar.',
  sin_programa_infonavit: 'Tu cuenta todavía no tiene activa la precalificación Infonavit. Escríbenos.',
};
const explicar = (e: Any) => {
  const raw = String(e?.message ?? e ?? '');
  const clave = Object.keys(EXPLICACION).find((k) => raw.includes(k));
  return clave ? EXPLICACION[clave] : raw;
};

/**
 * El aliado da de alta a alguien para que nosotros lo busquemos.
 *
 * Es lo contrario de su liga: ahí el cliente escribe y su teléfono queda
 * verificado en ese acto; aquí todavía no ha dicho nada. Por eso el
 * consentimiento se guarda con la frase completa —quién autorizó qué— y no
 * como una palomita: es el único respaldo que existe el día que alguien
 * pregunte por qué tenemos sus datos.
 *
 * La CURP y la consulta al IMSS las ejecuta Trol con su propia llave. El
 * aliado no puede consultar a nadie; nos está pidiendo que nosotros lo
 * hagamos, que no es lo mismo.
 */
export async function altaClientePorAliado(x: {
  telefono: string;
  nombre: string;
  curp?: string | null;
  autoriza: boolean;
}) {
  const a = await requireAliado();

  const tel = (x.telefono ?? '').replace(/\D/g, '').slice(-10);
  const nombre = (x.nombre ?? '').trim();
  const curp = (x.curp ?? '').trim().toUpperCase();

  if (tel.length !== 10) return fail(new Error('El teléfono debe traer 10 dígitos.'));
  if (nombre.length < 3) return fail(new Error('Escribe el nombre de la persona.'));
  if (curp && !CURP_RE.test(curp)) return fail(new Error('Esa CURP no tiene la forma correcta (18 caracteres).'));
  if (!x.autoriza) return fail(new Error('Necesitamos que confirmes que la persona te autorizó.'));

  // La frase se arma con los datos de este alta, no es una plantilla vacía:
  // dice quién autorizó, a quién, y exactamente para qué.
  const consentimiento =
    `${a.nombre} declara que ${nombre} lo autorizó a compartir su nombre y teléfono ` +
    `con El Trol Financiero para que lo contacten y revisen su situación de pensión` +
    (curp
      ? `, incluida la consulta de su historial ante el IMSS con la CURP que proporcionó.`
      : `.`);

  const { data, error } = await t3().rpc('alta_por_aliado', {
    p_tel: tel,
    p_nombre: nombre,
    p_curp: curp || null,
    p_consentimiento: consentimiento,
  });
  if (error) return fail(new Error(explicar(error)));

  const r = data as Any;
  const personaId = r?.persona_id as string;
  let aviso: string | null = null;

  // De aquí en adelante actúa Trol, no el aliado.
  if (r?.curp) {
    const admin = t3admin();
    const d = await admin.rpc('declarar', {
      p_persona: personaId,
      p_campo: 'curp',
      p_valor: r.curp,
      p_actor: 'aliado',
      p_actor_id: null,
      p_capa: 'declarado',
    });
    if (d.error) {
      aviso = 'Lo dimos de alta, pero no pudimos guardar la CURP. Lo revisamos nosotros.';
    } else {
      // Con CURP ya se puede pedir su información pensional. Si falla, el alta
      // sigue siendo buena: la consulta se puede reintentar, el alta no se
      // deshace.
      const c = await admin.rpc('pedir_consulta', {
        p_persona: personaId,
        p_tipo: 'imss_historial',
        p_actor: 'aliado',
        p_actor_id: null,
        p_pagador: 'trol',
        p_notificar: false,
        p_motivo: 'alta_aliado',
        p_forzar: false,
        p_proveedor: 'jordan',
      });
      if (c.error) aviso = 'Lo dimos de alta. Su información pensional la pedimos nosotros en un momento.';
    }
  }

  revalidatePath('/aliado');
  revalidatePath('/trabajo/aliados/referidores');
  revalidatePath('/trabajo');

  return ok({
    persona_id: personaId,
    nueva: !!r?.nueva,
    // `por_revisar` = ya era cliente nuestro. Se le dice, sin prometerle nada.
    por_revisar: r?.estado === 'por_revisar',
    aviso,
  });
}

/**
 * 281 · Broker Infonavit (claude/114): precalifica con CURP o NSS.
 *
 * Con NSS se pide a Precalix de inmediato; sólo con CURP primero sale el historial IMSS (trae el NSS)
 * y un barrido pide la precalificación en cuanto llega. Todo lo ejecuta Trol con su llave; el broker
 * sólo ve el resultado Infonavit de las personas que él mandó (v_infonavit_aliado). Lo de pensión
 * se calcula igual por dentro, pero no se le muestra.
 */
export async function precalificarInfonavitPorAliado(x: {
  telefono: string; nombre: string; curp?: string | null; nss?: string | null; autoriza: boolean;
}) {
  const a = await requireAliado();
  if (!a.programa_infonavit) return fail(new Error(EXPLICACION.sin_programa_infonavit));
  const tel = (x.telefono ?? '').replace(/\D/g, '').slice(-10);
  const nombre = (x.nombre ?? '').trim();
  const curp = (x.curp ?? '').trim().toUpperCase();
  const nss = (x.nss ?? '').replace(/\D/g, '');
  if (tel.length !== 10) return fail(new Error('El teléfono debe traer 10 dígitos.'));
  if (nombre.length < 3) return fail(new Error('Escribe el nombre de la persona.'));
  if (!curp && !nss) return fail(new Error(EXPLICACION.falta_curp_o_nss));
  if (curp && !CURP_RE.test(curp)) return fail(new Error('Esa CURP no tiene la forma correcta (18 caracteres).'));
  if (nss && nss.length !== 11) return fail(new Error(EXPLICACION.nss_invalido));
  if (!x.autoriza) return fail(new Error('Necesitamos que confirmes que la persona te autorizó.'));

  const consentimiento =
    `${a.nombre} declara que ${nombre} lo autorizó a compartir su nombre, teléfono` +
    `${curp ? ', CURP' : ''}${nss ? ', NSS' : ''} con El Trol Financiero para consultar su precalificación ` +
    `de crédito Infonavit${curp ? ' y su historial ante el IMSS' : ''}, y para que lo contacten con una propuesta.`;

  const { data, error } = await t3().rpc('alta_infonavit_por_aliado', {
    p_tel: tel, p_nombre: nombre, p_curp: curp || null, p_nss: nss || null, p_consentimiento: consentimiento,
  });
  if (error) return fail(new Error(explicar(error)));
  const r = data as Any;
  const personaId = r?.persona_id as string;
  const admin = t3admin();
  let aviso: string | null = null;

  if (r?.curp) {
    const d = await admin.rpc('declarar', { p_persona: personaId, p_campo: 'curp', p_valor: r.curp, p_actor: 'aliado', p_actor_id: null, p_capa: 'declarado' });
    if (!d.error) {
      await admin.rpc('pedir_consulta', { p_persona: personaId, p_tipo: 'imss_historial', p_actor: 'aliado', p_actor_id: null, p_pagador: 'trol', p_notificar: false, p_motivo: 'alta_aliado', p_forzar: false, p_proveedor: 'jordan' });
    }
  }
  if (r?.estado !== 'por_revisar' && r?.tiene_nss) {
    const c = await admin.rpc('pedir_consulta', { p_persona: personaId, p_tipo: 'infonavit', p_actor: 'sistema', p_actor_id: null, p_pagador: 'trol', p_notificar: false, p_motivo: 'aliado_infonavit', p_forzar: false, p_proveedor: null });
    const m = (c.data as Any)?.motivo;
    if (c.error) aviso = 'Lo registramos; la precalificación la pedimos en unos minutos.';
    else if (m === 'validado_vigente') aviso = 'Ya teníamos su precalificación reciente: aquí está.';
  } else if (r?.estado !== 'por_revisar') {
    aviso = 'Con la CURP primero sacamos su NSS del IMSS; la precalificación sale en unos minutos.';
  }

  revalidatePath('/aliado');
  revalidatePath('/trabajo/aliados/referidores');
  return ok({ persona_id: personaId, por_revisar: r?.estado === 'por_revisar', aviso });
}

export async function subirDocumentoInfonavitPorAliado(form: FormData) {
  await requireAliado();
  const personaId = String(form.get('persona_id') ?? '');
  const tipo = String(form.get('tipo') ?? '');
  const file = form.get('archivo');
  if (!DOCS_INFONAVIT.some((d) => d.tipo === tipo)) return fail(new Error('Ese documento no se sube desde aquí.'));
  if (!(file instanceof File)) return fail(new Error('Elige un archivo.'));
  // La sesión del aliado decide si la persona es suya: si la vista no la devuelve, no se sube nada.
  const { data: fila } = await t3().from('v_infonavit_aliado').select('persona_id,estado_ref').eq('persona_id', personaId).maybeSingle();
  if (!fila || (fila as Any).estado_ref === 'por_revisar') return fail(new Error('No encontramos a esa persona en tus referidos.'));
  try {
    await subirDocumentoExpediente({ personaId, tipo, file, actor: 'aliado', actorId: null });
  } catch (e) { return fail(e); }
  revalidatePath('/aliado');
  return ok();
}
