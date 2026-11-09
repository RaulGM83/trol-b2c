// 299 · Propuesta Infonavit guardada (Raúl, 4-nov-2026): "si Precalix dice que tiene empleo, siempre hay que
// generarle propuesta y calculadora, también a nuestra base". Opción 1: lista para el asesor.
//
// `trol3.v_cotizaciones_pendientes` dice a quién le toca (Precalix con relación vigente, saldo validado ≥ mínimo,
// sin crédito, < 62 años) y con qué `huella`; aquí se corre el motor y se guarda la foto en
// `trol3.cotizaciones_infonavit` (números, texto, token de la imagen pública). Si no hay cotización (solo con
// cotitular, ningún inmueble…), se guarda `sin_cotizacion` con el motivo para no recalcular cada hora.
// Corre desde el cron horario (/api/cron/cotizaciones) y desde el botón "Generar pendientes" de /trabajo/infonavit.
import { t3admin, type Any } from '@/lib/trol3/server';
import { cargarCotizacionInicial } from './cotizacion-inicial-server';

export interface ResultadoGuardado { persona_id: string; estado: 'lista' | 'sin_cotizacion'; motivo?: string }

/** Token vigente de la imagen pública (/cotizacion/<token>.png); se reusa si le quedan más de 7 días. */
async function tokenVigente(db: Any, personaId: string): Promise<string | null> {
  const { data: l } = await db.from('links_cotizacion').select('token,expira_en').eq('persona_id', personaId)
    .gt('expira_en', new Date(Date.now() + 7 * 86_400_000).toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (l?.token) return l.token as string;
  const { data: n } = await db.from('links_cotizacion').insert({ persona_id: personaId }).select('token').single();
  return (n as Any)?.token ?? null;
}

/** Genera y guarda la propuesta de una persona. `huella` es la de v_cotizaciones_pendientes (o se calcula). */
export async function guardarCotizacionInfonavit(personaId: string, huella?: string | null): Promise<ResultadoGuardado> {
  const db = t3admin();
  if (!huella) {
    const { data } = await db.rpc('huella_cotizacion_infonavit', { p_persona: personaId });
    huella = (data as string | null) ?? null;
  }
  const { MOTOR_VERSION } = await import('@trol/pension-core/version');
  const { data: previa } = await db.from('cotizaciones_infonavit').select('estado,enviada_en,enviada_por,enviada_huella,medio').eq('persona_id', personaId).maybeSingle();
  const c = await cargarCotizacionInicial(personaId, { db, voz: 'trol' });
  const base = { persona_id: personaId, generada_en: new Date().toISOString(), motor_version: MOTOR_VERSION, huella,
    enviada_en: (previa as Any)?.enviada_en ?? null, enviada_por: (previa as Any)?.enviada_por ?? null, enviada_huella: (previa as Any)?.enviada_huella ?? null, medio: (previa as Any)?.medio ?? null };
  if (!c.ok) {
    await db.from('cotizaciones_infonavit').upsert({ ...base, estado: 'sin_cotizacion', motivo: c.motivo, opciones: null, texto: null, saldo: null, credito_max: null, salario_mensual: null, preliminar: false, edad_por_nss: false }, { onConflict: 'persona_id' });
    return { persona_id: personaId, estado: 'sin_cotizacion', motivo: c.motivo };
  }
  const token = await tokenVigente(db, personaId);
  // Si ya se envió con esta misma huella sigue 'enviada'; si cambiaron las cifras vuelve a 'lista' (el asesor ve "cifras cambiaron").
  const estado = (previa as Any)?.estado === 'enviada' && (previa as Any)?.enviada_huella === huella ? 'enviada' : 'lista';
  await db.from('cotizaciones_infonavit').upsert({
    ...base, estado, motivo: null, token,
    saldo: c.cot.saldo, credito_max: c.cot.credito_max, salario_mensual: null,
    preliminar: !!c.cot.preliminar, edad_por_nss: !!c.cot.edad_por_nss,
    opciones: c.cot.opciones, texto: c.texto,
  }, { onConflict: 'persona_id' });
  return { persona_id: personaId, estado: 'lista' };
}

/** Corre las pendientes (hasta `max`). Devuelve el resumen. */
export async function generarCotizacionesPendientes(max = 60): Promise<{ pendientes: number; hechas: ResultadoGuardado[] }> {
  const db = t3admin();
  const { data: pend, count } = await db.from('v_cotizaciones_pendientes').select('persona_id,huella', { count: 'exact' }).order('saldo', { ascending: false }).limit(max);
  const hechas: ResultadoGuardado[] = [];
  for (const p of (pend ?? []) as Any[]) {
    try { hechas.push(await guardarCotizacionInfonavit(p.persona_id, p.huella)); }
    catch (e) { hechas.push({ persona_id: p.persona_id, estado: 'sin_cotizacion', motivo: `error: ${(e as Error).message}` }); }
  }
  return { pendientes: count ?? (pend ?? []).length, hechas };
}
