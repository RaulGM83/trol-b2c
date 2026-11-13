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
import { subirDocumentoExpediente, extraerCurpDePdf, notificarSisecPdf, CURP_RE as CURP_DOC_RE } from '@/lib/trol3/documentos';
import { DOCS_INFONAVIT } from '@/lib/aliado/infonavit';
import { hechosDeDiagnostico } from '@/lib/diagnostico/hechos-persona';

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
  sin_wallet: 'Tu cuenta todavía no tiene créditos. Escríbenos y te los cargamos.',
  saldo_insuficiente: 'No te alcanzan los créditos. Escríbenos para recargar.',
  referido_ajeno: 'No encontramos a esa persona en tus referidos.',
  producto_invalido: 'Ese producto no se compra desde aquí.',
  nss_invalido_11: 'El NSS debe traer 11 dígitos.',
  // 301
  falta_nombre: 'Escribe el nombre de la persona.',
  sin_creditos: 'No te quedan créditos disponibles para dar de alta a alguien más. Cada persona usa 1 crédito cuando llega su primer resultado. Escríbenos para recargar.',
  todavia_no: 'Espera 2 minutos desde que lo registraste: Infonavit suele responder en ese tiempo.',
  ya_hay_resultado: 'Infonavit ya respondió con su saldo; no hace falta capturarlo.',
  sin_solicitud_infonavit: 'A esta persona no se le pidió precalificación Infonavit.',
  saldo_invalido: 'Revisa el saldo de vivienda.',
  salario_invalido: 'Revisa el salario mensual.',
  // 302
  sin_escenarios: 'Cierra al menos un escenario en la calculadora antes de generar el diagnóstico.',
  escenario_ajeno: 'Sólo puedes usar tus escenarios cerrados de esta persona.',
  diagnostico_no_encontrado: 'No encontramos ese diagnóstico entre los tuyos.',
  diagnostico_sin_entregar: 'Primero genera el diagnóstico.',
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

/**
 * 291 · El aliado compra una asesoría para un referido suyo con los créditos de su wallet
 * (claude/116). Todo lo decide la base: que la persona sea suya, que le alcance, que no se cobre
 * dos veces. Aquí sólo se traduce el resultado. No se comisiona: la compra es suya, no una venta.
 */
export async function comprarAsesoriaPorAliado(personaId: string, producto: 'diagnostico_avanzado' | 'diagnostico_avanzado_sesion') {
  await requireAliado();
  const { data, error } = await t3().rpc('comprar_asesoria_por_aliado', { p_persona: personaId, p_producto: producto });
  if (error) return fail(new Error(explicar(error)));
  revalidatePath('/aliado');
  revalidatePath('/trabajo/aliados/referidores');
  revalidatePath('/trabajo/tareas');
  const r = data as Any;
  return ok({ orden: r?.orden, repetida: !!r?.repetida, creditos_restantes: r?.creditos_restantes ?? null });
}

/**
 * 294 · El aliado agrega el NSS después del alta (claude/116, opción D): cuando la consulta por CURP falló
 * o Infonavit sigue buscando el NSS. La base valida que la persona sea suya y el candado de NSS; si ya
 * había otro NSS distinto no se pisa (queda nota al equipo). Con el programa Infonavit, aquí mismo se
 * pide Precalix con la llave de servicio, como en el alta.
 */
export async function agregarNssPorAliado(personaId: string, nss: string) {
  await requireAliado();
  const limpio = (nss ?? '').replace(/\D/g, '');
  if (limpio.length !== 11) return fail(new Error(EXPLICACION.nss_invalido));
  const { data, error } = await t3().rpc('agregar_nss_por_aliado', { p_persona: personaId, p_nss: limpio });
  if (error) return fail(new Error(explicar(error)));
  const r = data as Any;
  if (r?.estado !== 'nss_distinto' && r?.infonavit) {
    await t3admin().rpc('pedir_consulta', { p_persona: personaId, p_tipo: 'infonavit', p_actor: 'sistema', p_actor_id: null, p_pagador: 'trol', p_notificar: false, p_motivo: 'aliado_infonavit', p_forzar: false, p_proveedor: null });
  }
  revalidatePath('/aliado');
  revalidatePath('/trabajo/aliados/referidores');
  return ok({ estado: r?.estado ?? 'guardado' });
}

// ---------------------------------------------------------------------------
// 301 · Modelo Resag (claude/118): alta con teléfono opcional, 1 crédito por persona, camino mínimo y SISEC.
// ---------------------------------------------------------------------------

/** Pide a Trol (llave de servicio) las dos consultas que apliquen: IMSS con CURP, Infonavit con NSS. */
async function dispararConsultas(personaId: string, curp: string | null, nss: string | null, yaCliente: boolean, conInfonavit = true) {
  const admin = t3admin();
  if (curp) {
    const d = await admin.rpc('declarar', { p_persona: personaId, p_campo: 'curp', p_valor: curp, p_actor: 'aliado', p_actor_id: null, p_capa: 'declarado' });
    if (!d.error) {
      await admin.rpc('pedir_consulta', { p_persona: personaId, p_tipo: 'imss_historial', p_actor: 'aliado', p_actor_id: null, p_pagador: 'trol', p_notificar: false, p_motivo: 'alta_aliado', p_forzar: false, p_proveedor: 'jordan' });
    }
  }
  if (conInfonavit && !yaCliente && nss) {
    await admin.rpc('pedir_consulta', { p_persona: personaId, p_tipo: 'infonavit', p_actor: 'sistema', p_actor_id: null, p_pagador: 'trol', p_notificar: false, p_motivo: 'aliado_infonavit', p_forzar: false, p_proveedor: null });
  }
}

/**
 * 301 · Alta v2: nombre + CURP y/o NSS + autorización; el teléfono es opcional. Sin teléfono la persona
 * entra como precliente (Trol no la contacta hasta que el aliado agregue el número). Las dos consultas salen
 * solas y se cobra 1 crédito por persona cuando llega el primer resultado (la base lo descuenta).
 */
export async function altaV2PorAliado(x: { nombre: string; curp?: string | null; nss?: string | null; telefono?: string | null; autoriza: boolean }) {
  const a = await requireAliado();
  // 305 · solo pensión (Resolut): mismo alta v2 sin Infonavit; si Trol no contacta, el teléfono ni se captura.
  const soloPension = !!a.solo_pension;
  const contacta = a.trol_contacta !== false;
  if (!a.programa_infonavit && !soloPension) return fail(new Error(EXPLICACION.sin_programa_infonavit));
  const nombre = (x.nombre ?? '').trim();
  const curp = (x.curp ?? '').trim().toUpperCase();
  const nss = soloPension ? '' : (x.nss ?? '').replace(/\D/g, '');
  const tel = contacta ? (x.telefono ?? '').replace(/\D/g, '').slice(-10) : '';
  if (nombre.length < 3) return fail(new Error(EXPLICACION.falta_nombre));
  if (soloPension && !curp) return fail(new Error(EXPLICACION.curp_invalida));
  if (!curp && !nss) return fail(new Error(EXPLICACION.falta_curp_o_nss));
  if (curp && !CURP_RE.test(curp)) return fail(new Error(EXPLICACION.curp_invalida));
  if (nss && nss.length !== 11) return fail(new Error(EXPLICACION.nss_invalido));
  if (tel && tel.length !== 10) return fail(new Error(EXPLICACION.telefono_invalido));
  if (!x.autoriza) return fail(new Error('Necesitamos que confirmes que la persona te autorizó.'));

  const consentimiento = soloPension
    ? `${a.nombre} declara que ${nombre} lo autorizó a compartir su nombre y CURP con El Trol Financiero para consultar ` +
      `su historial ante el IMSS y calcular su situación de pensión${contacta ? ', y para que lo contacten con una propuesta' : ''}.`
    : `${a.nombre} declara que ${nombre} lo autorizó a compartir su nombre${tel ? ', teléfono' : ''}` +
      `${curp ? ', CURP' : ''}${nss ? ', NSS' : ''} con El Trol Financiero para consultar su precalificación ` +
      `de crédito Infonavit${curp ? ' y su historial ante el IMSS' : ''}, y para que lo contacten con una propuesta.`;

  const { data, error } = await t3().rpc('alta_por_aliado_v2', {
    p_nombre: nombre, p_curp: curp || null, p_nss: nss || null, p_tel: tel || null, p_consentimiento: consentimiento,
  });
  if (error) return fail(new Error(explicar(error)));
  const r = data as Any;
  const personaId = r?.persona_id as string;
  const yaCliente = r?.estado === 'por_revisar';
  await dispararConsultas(personaId, (r?.curp as string | null) ?? null, (r?.nss as string | null) ?? null, yaCliente, !soloPension);

  let aviso: string | null = null;
  if (yaCliente) aviso = 'Registrado. Esa persona ya estaba con nosotros; lo revisamos y te confirmamos.';
  else if (soloPension) aviso = 'Listo. Estamos consultando su historial en el IMSS; el resultado suele tardar unos minutos.';
  else if (r?.precliente) aviso = 'Listo. Estamos consultando IMSS e Infonavit. Como no tiene teléfono, Trol no lo contacta hasta que lo agregues.';
  else if (nss) aviso = 'Listo. Infonavit suele responder en un par de minutos; el IMSS tarda un poco más.';
  else aviso = 'Listo. Con la CURP primero sacamos su NSS del IMSS; la precalificación Infonavit sale después.';

  revalidatePath('/aliado');
  revalidatePath('/trabajo/aliados/referidores');
  revalidatePath('/trabajo');
  return ok({ persona_id: personaId, por_revisar: yaCliente, precliente: !!r?.precliente, creditos_disponibles: r?.creditos_disponibles ?? null, aviso });
}

/** 301 · El aliado agrega el teléfono a un precliente: pasa a cartera y Trol lo contacta. */
export async function agregarTelefonoPorAliado(personaId: string, telefono: string) {
  await requireAliado();
  const tel = (telefono ?? '').replace(/\D/g, '').slice(-10);
  if (tel.length !== 10) return fail(new Error(EXPLICACION.telefono_invalido));
  const { error } = await t3().rpc('agregar_telefono_por_aliado', { p_persona: personaId, p_tel: tel });
  if (error) return fail(new Error(explicar(error)));
  revalidatePath('/aliado');
  revalidatePath('/trabajo');
  return ok();
}

/** 301 · Camino mínimo: Precalix no respondió en 2 minutos y el aliado captura saldo, salario y si cotiza. */
export async function capturarInfonavitPorAliado(x: { personaId: string; saldo: number; salarioMensual: number; cotiza: boolean }) {
  await requireAliado();
  const saldo = Number(x.saldo), salario = Number(x.salarioMensual);
  if (!Number.isFinite(saldo) || saldo < 0) return fail(new Error(EXPLICACION.saldo_invalido));
  if (!Number.isFinite(salario) || salario < 0) return fail(new Error(EXPLICACION.salario_invalido));
  const { error } = await t3().rpc('capturar_infonavit_por_aliado', { p_persona: x.personaId, p_saldo: Math.round(saldo), p_salario_mensual: Math.round(salario), p_cotiza: !!x.cotiza });
  if (error) return fail(new Error(explicar(error)));
  revalidatePath('/aliado');
  return ok();
}

/**
 * 301 · El aliado sube la constancia de semanas (SISEC) del cliente, de cualquier origen, siempre que sea el PDF
 * original con texto (no foto ni escaneo), se lea como constancia del IMSS y la CURP coincida con la persona.
 * Entra al mismo pipeline que cuando la sube el asesor; el resultado cobra el mismo crédito de la persona.
 */
export async function subirSisecPorAliado(form: FormData) {
  await requireAliado();
  const personaId = String(form.get('persona_id') ?? '');
  const file = form.get('archivo');
  if (!(file instanceof File)) return fail(new Error('Elige el PDF.'));
  if (file.type !== 'application/pdf') return fail(new Error('Debe ser el PDF original de la constancia (no foto ni captura de pantalla).'));
  const { data: fila } = await t3().from('v_resultado_aliado').select('persona_id,estado_ref,tiene_curp').eq('persona_id', personaId).maybeSingle();
  if (!fila || (fila as Any).estado_ref !== 'atribuido') return fail(new Error(EXPLICACION.referido_ajeno));

  const buf = Buffer.from(await file.arrayBuffer());
  let texto = '';
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (b: Buffer, o?: unknown) => Promise<{ text: string }>;
    texto = ((await pdfParse(buf, { max: 3 })).text || '').toUpperCase();
  } catch { texto = ''; }
  if (texto.replace(/\s+/g, '').length < 200) return fail(new Error('Ese PDF no trae texto: parece escaneo o foto. Necesitamos el archivo original que descarga el IMSS.'));
  const pareceImss = /SEMANAS\s+COTIZADAS|INSTITUTO MEXICANO DEL SEGURO SOCIAL|\bIMSS\b|CONSTANCIA/.test(texto);
  if (!pareceImss) return fail(new Error('Ese PDF no se lee como la constancia de semanas cotizadas del IMSS.'));
  const curpPdf = await extraerCurpDePdf(buf);
  if (!curpPdf || !CURP_DOC_RE.test(curpPdf)) return fail(new Error('No encontramos la CURP dentro del PDF; revisa que sea la constancia completa.'));
  const admin = t3admin();
  const { data: per } = await admin.from('personas').select('curp,nss').eq('id', personaId).maybeSingle();
  const curpPersona = ((per as Any)?.curp as string | null) ?? null;
  if (curpPersona && curpPersona !== curpPdf) return fail(new Error(`La CURP del PDF (${curpPdf}) no es la de esta persona (${curpPersona}). Revisa que sea su constancia.`));

  try {
    const r = await subirDocumentoExpediente({ personaId, tipo: 'constancia_semanas', file, actor: 'aliado', actorId: null });
    if (!curpPersona) {
      // La persona entró sólo con NSS: la CURP sale del PDF y se declara (como la declararía Trol).
      const d = await admin.rpc('declarar', { p_persona: personaId, p_campo: 'curp', p_valor: curpPdf, p_actor: 'aliado', p_actor_id: null, p_capa: 'declarado' });
      if (d.error) return fail(new Error(explicar(d.error)));
    }
    await admin.rpc('enlazar_legacy', { p_persona: personaId });
    const n = await notificarSisecPdf(personaId, r.documentoId, r.path);
    revalidatePath('/aliado');
    revalidatePath('/trabajo');
    if (!n.enviado) return ok({ aviso: 'Recibimos el PDF, pero el cálculo no arrancó solo; lo revisa Trol.' });
    return ok({ aviso: 'Recibimos su constancia. Los cálculos salen en unos minutos.' });
  } catch (e) { return fail(e); }
}

// ---------------------------------------------------------------------------
// 302 · Calculadora del aliado (claude/120): su diagnóstico "Elaborado por" y la revisión de Trol.
// ---------------------------------------------------------------------------

/**
 * Genera el diagnóstico del aliado sobre SUS escenarios cerrados: hechos del expediente (llave de servicio;
 * las RPC con la sesión del aliado verifican que la persona es suya y pagó), narrativa del mismo redactor que
 * usa el equipo, entrega y PDF firmado "Elaborado por {nombre}". Trol no lo revisa salvo que lo pida (10 cr).
 */
export async function generarDiagnosticoAliado(x: { personaId: string; escenarioIds: string[]; elaboradoPor: string }) {
  const a = await requireAliado();
  const escenarioIds = (x.escenarioIds ?? []).filter(Boolean);
  if (!escenarioIds.length) return fail(new Error(EXPLICACION.sin_escenarios));
  const elaboradoPor = (x.elaboradoPor ?? '').trim() || a.nombre;
  try {
    const admin = t3admin();
    const { MOTOR_VERSION } = await import('@trol/pension-core/version');
    const { redactarDiagnostico } = await import('@/lib/diagnostico/redactar');
    const hechos = await hechosDeDiagnostico(x.personaId, escenarioIds, [], admin);
    const { data: id, error } = await t3().rpc('abrir_diagnostico_aliado', {
      p_persona: x.personaId, p_escenarios: escenarioIds, p_hechos: hechos, p_motor_version: MOTOR_VERSION, p_elaborado_por: elaboradoPor,
    });
    if (error) return fail(new Error(explicar(error)));

    const { data: vig } = await admin.from('redactor_instrucciones').select('version,texto').eq('activa', true).maybeSingle();
    const { data: fichas } = await admin.rpc('fichas_para_redactor', { p_persona: x.personaId });
    const r = await redactarDiagnostico(hechos, { ajustes: { vigentes: (vig as Any)?.texto, fichas: (fichas as string | null) ?? null } });
    if (!r.ok) return fail(new Error(`No se pudo escribir el diagnóstico (${r.error}). Vuelve a intentar en un momento.`));

    const { error: e2 } = await t3().rpc('entregar_diagnostico_aliado', {
      p_diagnostico: id, p_narrativa: r.narrativa, p_redactor: r.modelo, p_prompt_version: r.promptVersion, p_instrucciones_version: (vig as Any)?.version ?? null,
    });
    if (e2) return fail(new Error(explicar(e2)));

    let aviso: string | null = null;
    try {
      const { construirPdfDiagnostico } = await import('@/lib/diagnostico/pdf');
      const { guardarPdfGenerado } = await import('@/lib/trol3/documentos');
      const pdf = await construirPdfDiagnostico(String(id), admin);
      if (!pdf) throw new Error('No se encontró el diagnóstico.');
      await guardarPdfGenerado({ personaId: x.personaId, tipo: 'diagnostico_avanzado', buffer: pdf.buf, nombreArchivo: `diagnostico-${pdf.slug}-aliado.pdf`, actorId: null });
    } catch (e) {
      aviso = `El diagnóstico quedó generado, pero el PDF no se pudo guardar: ${e instanceof Error ? e.message : String(e)}`;
    }
    revalidatePath('/aliado');
    revalidatePath(`/aliado/asesoria/${x.personaId}`);
    revalidatePath(`/trabajo/p/${x.personaId}`);
    return ok({ id, aviso });
  } catch (e) { return fail(e); }
}

/** 302 · El aliado paga 10 créditos para que Trol revise su diagnóstico y lo re-firme. */
export async function pedirRevisionTrol(diagnosticoId: string, nota?: string | null) {
  await requireAliado();
  const { data, error } = await t3().rpc('pedir_revision_trol', { p_diagnostico: diagnosticoId, p_nota: nota ?? null });
  if (error) return fail(new Error(explicar(error)));
  revalidatePath('/aliado');
  revalidatePath('/trabajo/tareas');
  const r = data as Any;
  return ok({ repetida: !!r?.repetida, creditos_restantes: r?.creditos_restantes ?? null });
}
