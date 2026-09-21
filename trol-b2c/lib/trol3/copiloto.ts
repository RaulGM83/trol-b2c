// ============================================================================
// 172 · El copiloto del asesor. Dos usos, los dos SÓLO para el equipo:
//   · prepararAsesoria  — antes de la llamada: resumen del caso, orden sugerido,
//                         objeciones probables y qué cuidar.
//   · preguntaPreparada — durante la llamada: botones por paso, nunca texto libre.
// Reglas de casa: contesta ÚNICAMENTE con las fichas y el expediente que se le
// pasan; cita la ficha entre corchetes ([O5]); las cifras salen del expediente,
// nunca de su memoria; si algo no está, lo dice. Nada de esto se le enseña al
// cliente (no existe en modo Compartiendo ni en Presentar).
// Usa la misma cuenta y el mismo modelo que el redactor del diagnóstico.
// ============================================================================
import { MODELO_REDACTOR } from '@/lib/diagnostico/secciones';
import { caminos, periodos, type VistaAsesoria } from '@/lib/trol3/asesoria';
import type { Ficha } from '@/lib/trol3/fichas';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Preparacion = {
  resumen: string; orden: string[]; objeciones: { pregunta: string; respuesta: string; ficha: string | null }[]; cuidado: string[];
  generado_en: string; modelo: string;
};

/** Las preguntas preparadas de cada paso. La clave es estable: con ella se guarda la respuesta en la sesión. */
export const PREGUNTAS_COPILOTO: Record<number, { clave: string; texto: string; instruccion: string }[]> = {
  1: [
    { clave: 'abrir', texto: '¿Cómo abro con este cliente?', instruccion: 'Propón cómo abrir la conversación con este cliente: una frase de entrada que parta de lo que le preocupa (o, si no lo ha dicho, la pregunta para averiguarlo) y los dos o tres datos de su caso que conviene poner primero sobre la mesa.' },
    { clave: 'resumen', texto: 'Resúmeme su caso en 3 líneas', instruccion: 'Resume el caso en exactamente tres líneas: dónde está hoy, qué es lo más importante que encontramos y cuál parece el camino natural.' },
    { clave: 'historia', texto: '¿Qué veo en su historia laboral?', instruccion: 'Lee su historia laboral y señala lo que vale la pena comentar con él: huecos largos sin cotizar, su última baja, si sigue vigente, cambios fuertes de salario. Sólo lo que esté en los datos.' },
  ],
  2: [
    { clave: 'orden', texto: '¿En qué orden presento lo que encontramos?', instruccion: 'Ordena los hallazgos y oportunidades de este cliente para presentarlos: primero lo que pone en orden su situación, después lo que mejora su pensión. Una línea por cada uno con el porqué del lugar que ocupa.' },
    { clave: 'objeciones', texto: '¿Qué objeciones espero?', instruccion: 'Lista las tres objeciones o preguntas más probables de ESTE cliente ante lo que encontramos, cada una con la respuesta que dan las fichas.' },
  ],
  3: [
    { clave: 'caminos', texto: '¿Qué caminos le armo?', instruccion: 'Sugiere hasta tres escenarios para armar en la calculadora con este cliente (cómo está hoy, el recomendable y, si aplica, uno más ambicioso), diciendo qué palanca mover en cada uno y por qué. No calcules montos: eso lo hace la calculadora.' },
    { clave: 'esperar', texto: '¿Le conviene esperar o tramitar ya?', instruccion: 'Con su edad, su ley, sus derechos y si sigue cotizando, explica qué factores pesan en este caso para decidir entre esperar o tramitar ya. No des un veredicto numérico: señala qué revisar en la calculadora.' },
  ],
  4: [
    { clave: 'porque', texto: 'Ayúdame a decir el porqué', instruccion: 'Redacta en 4 o 5 frases, hablándole de tú al cliente y sin tecnicismos, por qué el camino recomendado es el que le conviene. Usa sólo cifras que estén en los datos del caso.' },
    { clave: 'dinero', texto: '¿Y si dice que no tiene el dinero?', instruccion: 'Explica cómo contestar si el cliente dice que no tiene el dinero para el camino recomendado, con las opciones de financiamiento que mencionan las fichas de sus oportunidades.' },
  ],
  5: [
    { clave: 'cierre', texto: '¿Qué acuerdos no se me deben olvidar?', instruccion: 'Lista los acuerdos y pendientes que no deben faltar al cerrar esta asesoría: documentos que trae el cliente, lo que hace Trol y las fechas límite que aparezcan en su caso. Usa "Documentos y proceso" de sus fichas.' },
  ],
};

const SISTEMA = `Eres el copiloto interno de los asesores pensionales de El Trol Financiero (México). Le hablas AL ASESOR, nunca al cliente, en español de México, directo y breve.

REGLAS (no negociables):
1. Contesta ÚNICAMENTE con lo que viene en "FICHAS" y en "EXPEDIENTE". Las fichas son la versión oficial de Trol; no las contradigas ni las completes con conocimiento propio.
2. Cada afirmación que salga de una ficha lleva su código entre corchetes al final de la frase, p. ej. [O5] o [T2].
3. CIFRAS: sólo las que aparezcan en EXPEDIENTE o, tal cual, en una ficha. Nunca calcules, estimes ni redondees montos, fechas, semanas o porcentajes nuevos.
4. Si lo que se pide no está en las fichas ni en el expediente, dilo con estas palabras: "No está en las fichas." y sugiere qué ficha habría que escribir. No rellenes.
5. No prometas resultados ante el IMSS ni rendimientos. No des consejo legal o fiscal.
6. Respeta lo que las fichas marcan como "SÓLO ASESOR": úsalo para orientar al asesor, jamás lo redactes como algo para decirle al cliente.
7. Sin markdown de encabezados. Frases cortas; listas con guion cuando ayuden.`;

const txt = (v: unknown) => (v == null || v === '' ? '—' : String(v));

function fichasDelCaso(v: VistaAsesoria): Ficha[] {
  const cods = new Set(v.oportunidades.map((o) => o.ficha).filter(Boolean) as string[]);
  const ley97 = v.cliente?.ley === 'Ley97';
  return (v.fichas ?? []).filter((f) => cods.has(f.codigo) || (f.tipo === 'tema' && !(ley97 && (f.codigo === 'T2' || f.codigo === 'T3'))) || f.codigo === 'O7');
}

function contexto(v: VistaAsesoria): string {
  const c = v.cliente ?? {}; const n = v.numeros ?? {};
  const ps = periodos(v.historial);
  const ult = ps.slice(-8).map((p) => `  · ${p.alta} → ${p.baja ?? 'vigente'} · ${p.empleador} · salario diario ${txt(p.salario)}${p.hueco > 31 ? ` · antes: ${p.hueco} días sin cotizar` : ''}`).join('\n');
  const cams = caminos(v).map((k) => `  · ${k.etiqueta} (${k.tipo}) · retiro ${txt(k.edad)} · pensión mensual ${txt(k.pension)} · inversión total ${txt(k.costo)}${k.id === v.sesion?.escenario_recomendado ? ' · ES EL RECOMENDADO' : ''}`).join('\n');
  const notas = Object.entries(v.sesion?.notas ?? {}).filter(([, t]) => String(t).trim()).map(([p, t]) => `  · paso ${p}: ${String(t).slice(0, 400)}`).join('\n');
  const exp = [
    `Nombre: ${txt(c.nombre)} · edad ${txt(c.edad)} · ${txt(c.ley)} · semanas ${txt(c.semanas)} (${txt(c.semanas_capa)}) · empleo: ${txt(c.status_empleo)}`,
    `Conserva derechos: ${txt(c.conserva_derechos)} · fin de conservación: ${txt(c.fin_conservacion)} · datos del IMSS al ${txt(c.datos_al)}`,
    `AFORE: ${txt(c.afore_actual)} · saldo RCV 97: ${txt(c.saldo_rcv97)} · saldo Infonavit: ${txt(c.saldo_infonavit)} (${txt(c.saldo_infonavit_capa)})`,
    `Pensión hoy: ${txt(n.pension_base)} · pensión máxima estimada: ${txt(n.pension_maxima)} · con Mod 40 retroactiva: ${txt(n.pension_mod40_retro)} (costo ${txt(n.costo_retro)}) · límite inscripción Mod 40: ${txt(n.limite_mod40)}`,
    `Lo que le preocupa (sus palabras): ${txt(c.dolor_principal)} · espera recibir: ${txt(c.expectativa_pension)}`,
    `Hallazgos:\n${v.hallazgos.map((h) => `  · [${h.severidad}] ${h.titulo}: ${h.detalle}`).join('\n') || '  (ninguno)'}`,
    `Oportunidades abiertas:\n${v.oportunidades.map((o) => `  · ${o.nombre} (${o.codigo}, ${o.estado}) · ficha ${o.ficha ?? 'SIN FICHA'}${o.motivo ? ` · detectada por: ${o.motivo}` : ''}${o.urgencia ? ` · fecha límite ${o.urgencia}` : ''}`).join('\n') || '  (ninguna)'}`,
    `Historia laboral (${ps.length} movimientos; últimos 8):\n${ult || '  (sin historia)'}`,
    `Escenarios cerrados:\n${cams || '  (ninguno todavía)'}`,
    notas ? `Notas del asesor en esta sesión:\n${notas}` : '',
  ].filter(Boolean).join('\n');
  const fichas = fichasDelCaso(v).map((f) => [
    `### [${f.codigo}] ${f.titulo}`, `En una frase: ${f.frase}`,
    f.cuando_aplica ? `Cuándo aplica: ${f.cuando_aplica}` : '', f.como_explicarlo ? `Cómo explicarlo:\n${f.como_explicarlo}` : '',
    f.preguntas ? `Qué te van a preguntar:\n${f.preguntas}` : '', f.documentos ? `Documentos y proceso: ${f.documentos}` : '',
    f.solo_asesor ? `SÓLO ASESOR: ${f.solo_asesor}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
  return `# EXPEDIENTE\n${exp}\n\n# FICHAS\n${fichas || '(este cliente no tiene fichas aplicables)'}`;
}

async function llamar(system: string, user: string, json: boolean): Promise<{ ok: true; texto: string } | { ok: false; error: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return { ok: false, error: 'Falta OPENAI_API_KEY en el entorno.' };
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(60000),
      body: JSON.stringify({ model: MODELO_REDACTOR, ...(json ? { response_format: { type: 'json_object' } } : {}), messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    });
    if (!resp.ok) return { ok: false, error: `OpenAI respondió ${resp.status}: ${(await resp.text()).slice(0, 200)}` };
    const texto = ((await resp.json()) as any)?.choices?.[0]?.message?.content ?? '';
    return texto.trim() ? { ok: true, texto: texto.trim() } : { ok: false, error: 'El modelo no devolvió texto.' };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function prepararAsesoria(v: VistaAsesoria): Promise<{ ok: true; preparacion: Preparacion } | { ok: false; error: string }> {
  const user = `${contexto(v)}\n\n# TAREA\nPrepara al asesor para la asesoría con este cliente. Devuelve EXACTAMENTE este JSON:\n{\n  "resumen": "el caso en 3 o 4 frases: dónde está hoy, qué es lo más importante y qué camino parece natural",\n  "orden": ["qué tocar primero y por qué", "después…", "…"],\n  "objeciones": [ { "pregunta": "lo que probablemente pregunte u objete", "respuesta": "cómo contestarlo según las fichas", "ficha": "código de la ficha o null" } ],\n  "cuidado": ["qué NO prometer o qué dato confirmar antes de hablar, según el expediente y lo marcado SÓLO ASESOR"]\n}\nMáximo 5 elementos en "orden", 4 en "objeciones" y 4 en "cuidado". Dentro de los textos sí cita las fichas entre corchetes.`;
  const r = await llamar(SISTEMA, user, true);
  if (!r.ok) return r;
  let o: any = {};
  try { o = JSON.parse(r.texto.replace(/^```json\s*|```\s*$/g, '')); } catch { return { ok: false, error: 'El copiloto devolvió algo que no se pudo leer. Intenta de nuevo.' }; }
  const lista = (x: unknown, n: number) => (Array.isArray(x) ? x : []).filter((s) => typeof s === 'string' && s.trim()).slice(0, n).map((s) => String(s).slice(0, 500));
  const cods = new Set((v.fichas ?? []).map((f) => f.codigo));
  return { ok: true, preparacion: {
    resumen: String(o.resumen ?? '').slice(0, 1200),
    orden: lista(o.orden, 5),
    objeciones: (Array.isArray(o.objeciones) ? o.objeciones : []).filter((x: any) => x?.pregunta && x?.respuesta).slice(0, 4).map((x: any) => ({ pregunta: String(x.pregunta).slice(0, 300), respuesta: String(x.respuesta).slice(0, 700), ficha: cods.has(String(x.ficha)) ? String(x.ficha) : null })),
    cuidado: lista(o.cuidado, 4),
    generado_en: new Date().toISOString(), modelo: MODELO_REDACTOR,
  } };
}

export async function preguntaPreparada(v: VistaAsesoria, paso: number, clave: string): Promise<{ ok: true; texto: string } | { ok: false; error: string }> {
  const q = (PREGUNTAS_COPILOTO[paso] ?? []).find((x) => x.clave === clave);
  if (!q) return { ok: false, error: 'Esa pregunta no existe.' };
  return llamar(SISTEMA, `${contexto(v)}\n\n# TAREA\n${q.instruccion}\nMáximo 130 palabras.`, false);
}
