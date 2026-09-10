// ============================================================================
// Una nota de Granola → una reunión en trol3 → propuestas para el expediente.
//
// Lo usan el webhook, la reconciliación diaria y el botón "Volver a leer". La
// IA NO escribe en el expediente: produce PROPUESTAS. Lo blando (lo que le
// preocupa, qué espera lograr, sus prioridades) se aplica solo, marcado como
// venido de la reunión; lo duro (montos, edades, fechas, dependientes, saldos)
// espera a que el asesor lo confirme. Regla de Raul, 10-sep-2026.
// ============================================================================
import { createAdminClient } from '@/lib/supabase/admin';
import { MODELO_REDACTOR } from '@/lib/diagnostico/secciones';
import { obtenerNota, transcripcionPlana, type GranolaNote } from './client';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Propuesta = {
  i: number;
  tipo: 'dato' | 'tarea' | 'nota';
  campo?: string; valor?: unknown; nombre_campo?: string;
  texto?: string; detalle?: string; quien?: 'trol' | 'cliente'; vence_el?: string | null;
  evidencia?: string;
  auto: boolean;
  estado: 'pendiente' | 'aplicada' | 'descartada';
};

/** Campos que se aplican solos: son la voz del cliente, no una cifra. */
const CAMPOS_AUTO = new Set(['dolor_principal', 'expectativa']);
/** Campos que la IA puede proponer (los de contexto y ahorro privado; nunca los oficiales del IMSS). */
const GRUPOS_PROPONIBLES = new Set(['contexto', 'ahorro_privado', 'afore', 'infonavit']);
const CAMPOS_VETADOS = new Set(['semilla', 'saldo_rcv97', 'saldo_sar92', 'cuenta_registrada', 'puede_recibir_ahorro', 'estatus_cda', 'disponible_afore']);

export type Registro = { ok: boolean; reunion_id?: string; persona_id?: string | null; sin_expediente?: boolean; mensaje: string };

/** Paso 1: la nota queda en trol3.reuniones (casada con cita/persona/asesor). */
export async function registrarNota(nota: GranolaNote): Promise<Registro> {
  const t3 = createAdminClient().schema('trol3');
  const ce = nota.calendar_event ?? null;
  const asistentes = [
    ...(nota.attendees ?? []).map((a) => ({ name: a.name ?? null, email: a.email })),
    ...((ce?.invitees ?? []).filter((i) => i.email).map((i) => ({ name: i.name ?? null, email: i.email as string }))),
  ].filter((a, idx, arr) => a.email && arr.findIndex((b) => b.email.toLowerCase() === a.email.toLowerCase()) === idx);
  const plana = transcripcionPlana(nota.transcript);
  const { data, error } = await t3.rpc('registrar_reunion', {
    p_nota_id: nota.id,
    p_titulo: nota.title ?? ce?.event_title ?? null,
    p_inicio: ce?.scheduled_start_time ?? nota.created_at,
    p_fin: ce?.scheduled_end_time ?? null,
    p_calendar_event_id: ce?.calendar_event_id ?? null,
    p_organizador_email: ce?.organiser ?? nota.owner?.email ?? null,
    p_asistentes: asistentes,
    p_resumen_md: nota.summary_markdown ?? nota.summary_text ?? null,
    p_transcripcion: nota.transcript ? nota.transcript.map((l) => ({ speaker: l.speaker?.name ?? l.speaker?.source ?? null, text: l.text, start: l.start_time ?? null })) : null,
    p_transcripcion_texto: plana || null,
    p_web_url: nota.web_url ?? null,
  });
  if (error) return { ok: false, mensaje: error.message };
  const r = data as { reunion_id: string; persona_id: string | null; sin_expediente: boolean };
  return { ok: true, reunion_id: r.reunion_id, persona_id: r.persona_id, sin_expediente: r.sin_expediente, mensaje: r.sin_expediente ? 'Reunión guardada sin expediente.' : 'Reunión guardada.' };
}

/** Paso 2: propuestas con IA. Idempotente por reunión (se puede repetir; pisa las pendientes, respeta las aplicadas). */
export async function extraerPropuestas(reunionId: string): Promise<{ ok: boolean; n?: number; auto?: number; mensaje: string }> {
  const admin = createAdminClient();
  const t3 = admin.schema('trol3');
  const [{ data: r }, { data: campos }] = await Promise.all([
    t3.from('reuniones').select('*').eq('id', reunionId).maybeSingle(),
    t3.from('catalogo_campos').select('campo,nombre,grupo,tipo,opciones').order('orden'),
  ]);
  if (!r) return { ok: false, mensaje: 'La reunión no existe.' };
  if (!r.persona_id) return { ok: false, mensaje: 'La reunión no tiene expediente; liga la persona primero.' };
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, mensaje: 'Falta OPENAI_API_KEY.' };

  const proponibles = ((campos ?? []) as any[]).filter((c) => GRUPOS_PROPONIBLES.has(c.grupo) && !CAMPOS_VETADOS.has(c.campo));
  const listaCampos = proponibles.map((c) => `- ${c.campo} (${c.nombre}; tipo ${c.tipo}${c.opciones?.length ? `; opciones: ${c.opciones.join(' | ')}` : ''})`).join('\n');
  const { data: actuales } = await t3.from('v_mejor_dato').select('campo,valor').eq('persona_id', r.persona_id).in('campo', proponibles.map((c) => c.campo));
  const yaSabemos = ((actuales ?? []) as any[]).map((d) => `- ${d.campo} = ${JSON.stringify(d.valor)}`).join('\n') || '(nada)';

  const system = `Eres el asistente de un asesor pensional en México (El Trol Financiero). Lees el resumen y la transcripción de una reunión con un cliente y devuelves PROPUESTAS para su expediente, en JSON estricto. Nunca inventes: sólo propones lo que el cliente dijo o el asesor acordó, y citas la frase textual como evidencia. Si no hay evidencia, no propones.

Devuelve exactamente este JSON:
{
  "datos": [ { "campo": "<uno de la lista>", "valor": <número | texto | true/false>, "evidencia": "frase textual" } ],
  "tareas": [ { "texto": "qué hay que hacer", "quien": "trol" | "cliente", "vence_el": "YYYY-MM-DD" | null, "detalle": "contexto breve" } ],
  "prioridades": [ "qué le importa más al cliente, en sus palabras" ],
  "notas": [ "hecho relevante para la asesoría que no cabe en ningún campo" ]
}

Reglas:
- "datos" sólo con campos de esta lista (usa el código exacto):
${listaCampos}
- dolor_principal = lo que más le preocupa (texto corto en primera persona del cliente). expectativa = qué quiere lograr.
- Montos en pesos como número sin símbolos. Rangos: usa las opciones si el campo las tiene.
- No propongas un dato si ya lo sabemos con el mismo valor. Lo que ya sabemos:
${yaSabemos}
- Tareas: una por compromiso concreto (documentos que traerá el cliente, llamadas, trámites). "quien" es quién la ejecuta.
- Máximo 12 datos, 10 tareas, 5 prioridades, 6 notas. Español de México.`;

  const user = `TÍTULO: ${r.titulo ?? ''}\nFECHA: ${r.inicio ?? ''}\n\nRESUMEN DE GRANOLA:\n${r.resumen_md ?? ''}\n\nTRANSCRIPCIÓN:\n${(r.transcripcion_texto ?? '').slice(0, 60000)}`;

  let contenido = '';
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(120000),
      body: JSON.stringify({ model: MODELO_REDACTOR, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    if (!resp.ok) throw new Error(`OpenAI respondió ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
    contenido = ((await resp.json()) as any)?.choices?.[0]?.message?.content ?? '';
  } catch (e) {
    await t3.from('reuniones').update({ extraccion_estado: 'error', extraccion_error: (e as Error).message, updated_at: new Date().toISOString() }).eq('id', reunionId);
    return { ok: false, mensaje: (e as Error).message };
  }

  let out: any = {};
  try { out = JSON.parse(contenido.replace(/^```json\s*|```\s*$/g, '')); } catch { out = {}; }
  const validos = new Map(proponibles.map((c) => [c.campo, c]));
  const props: Propuesta[] = [];
  let i = 0;
  for (const d of Array.isArray(out.datos) ? out.datos : []) {
    const c = validos.get(d?.campo);
    if (!c || d.valor === null || d.valor === undefined || d.valor === '') continue;
    let valor: unknown = d.valor;
    if (c.tipo === 'number') { const n = Number(String(valor).replace(/[^0-9.\-]/g, '')); if (!Number.isFinite(n)) continue; valor = n; }
    if (c.tipo === 'bool') valor = typeof valor === 'boolean' ? valor : /^(s|si|sí|true|1|y)/i.test(String(valor));
    if (c.tipo === 'text') valor = String(valor).slice(0, 500);
    props.push({ i: i++, tipo: 'dato', campo: c.campo, nombre_campo: c.nombre, valor, evidencia: String(d.evidencia ?? '').slice(0, 300), auto: CAMPOS_AUTO.has(c.campo), estado: 'pendiente' });
  }
  for (const t of Array.isArray(out.tareas) ? out.tareas : []) {
    if (!t?.texto) continue;
    props.push({ i: i++, tipo: 'tarea', texto: String(t.texto).slice(0, 200), detalle: t.detalle ? String(t.detalle).slice(0, 500) : undefined, quien: t.quien === 'cliente' ? 'cliente' : 'trol', vence_el: /^\d{4}-\d{2}-\d{2}$/.test(String(t.vence_el ?? '')) ? t.vence_el : null, auto: false, estado: 'pendiente' });
  }
  const prioridades = (Array.isArray(out.prioridades) ? out.prioridades : []).filter((p: unknown) => typeof p === 'string' && p.trim()).slice(0, 5);
  if (prioridades.length) props.push({ i: i++, tipo: 'nota', texto: `Prioridades del cliente: ${prioridades.join(' · ')}`.slice(0, 900), auto: true, estado: 'pendiente' });
  for (const n of Array.isArray(out.notas) ? out.notas : []) {
    if (typeof n !== 'string' || !n.trim()) continue;
    props.push({ i: i++, tipo: 'nota', texto: n.slice(0, 600), auto: false, estado: 'pendiente' });
  }

  // Respetar lo que ya se aplicó o descartó en una corrida anterior (misma clave).
  const previas: Propuesta[] = Array.isArray(r.propuestas) ? r.propuestas : [];
  const clave = (p: Propuesta) => `${p.tipo}|${p.campo ?? ''}|${(p.texto ?? '').slice(0, 60)}`;
  const decididas = new Map(previas.filter((p) => p.estado !== 'pendiente').map((p) => [clave(p), p]));
  const finales = props.map((p) => { const d = decididas.get(clave(p)); return d ? { ...p, estado: d.estado, ...('aplicado_en' in d ? { aplicado_en: (d as any).aplicado_en, aplicado_por: (d as any).aplicado_por, ref_id: (d as any).ref_id } : {}) } : p; });

  await t3.from('reuniones').update({ propuestas: finales, extraccion_estado: 'lista', extraccion_error: null, modelo: MODELO_REDACTOR, updated_at: new Date().toISOString() }).eq('id', reunionId);

  // Lo blando se aplica solo, como 'sistema'.
  let auto = 0;
  for (const p of finales) {
    if (!p.auto || p.estado !== 'pendiente') continue;
    const { error } = await t3.rpc('aplicar_propuesta_reunion', { p_reunion: reunionId, p_i: p.i, p_decision: 'aplicar', p_actor_id: null });
    if (!error) auto++;
  }
  return { ok: true, n: finales.length, auto, mensaje: `${finales.length} propuestas (${auto} aplicadas solas).` };
}

/** Webhook / reconciliación: una nota completa de punta a punta. */
export async function procesarNota(noteId: string): Promise<{ ok: boolean; mensaje: string; reunion_id?: string; sin_expediente?: boolean }> {
  let nota: GranolaNote;
  try { nota = await obtenerNota(noteId); } catch (e) { return { ok: false, mensaje: `Granola: ${(e as Error).message}` }; }
  const reg = await registrarNota(nota);
  if (!reg.ok || !reg.reunion_id) return { ok: false, mensaje: reg.mensaje };
  if (reg.sin_expediente) return { ok: true, mensaje: 'Reunión guardada sin expediente; se extrae al ligarla.', reunion_id: reg.reunion_id, sin_expediente: true };
  const ex = await extraerPropuestas(reg.reunion_id);
  return { ok: ex.ok, mensaje: ex.mensaje, reunion_id: reg.reunion_id, sin_expediente: false };
}
