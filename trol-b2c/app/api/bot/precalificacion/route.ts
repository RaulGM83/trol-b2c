/**
 * 289 · Línea Infonavit (Frans en Tako) / campaña Meta.
 * Lo llama la base (trol3._avisar_precalificacion, vía pg_net) cuando termina la precalificación
 * que pidió el bot. Arma la cotización inicial y se la inyecta al bot en el mismo chat como el
 * evento `precalificacion_lista`, con una liga pública temporal a la imagen.
 * Auth: x-trol-key = trol3.config.api_key (la misma llave de api-trol).
 */
import { t3admin, type Any } from '@/lib/trol3/server';
import { cargarCotizacionInicial } from '@/lib/infonavit/cotizacion-inicial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Resultado = 'con_monto' | 'sin_relacion' | 'credito_vigente' | 'saldo_bajo' | 'sin_inmueble' | 'no_encontrado';

export async function POST(req: Request) {
  const db = t3admin();
  const { data: cfg } = await db.from('config').select('clave,valor').in('clave', ['api_key', 'api_trol_url', 'app_url']);
  const c = new Map(((cfg ?? []) as Any[]).map((r) => [r.clave, r.valor as string]));
  const llave = c.get('api_key');
  if (!llave || req.headers.get('x-trol-key') !== llave) return Response.json({ error: 'no autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { persona_id?: string; consulta_id?: string | null };
  const pid = body.persona_id;
  if (!pid) return Response.json({ error: 'falta persona_id' }, { status: 400 });

  let consultaEstado: string | null = null;
  if (body.consulta_id) {
    const { data } = await db.from('consultas').select('estado').eq('id', body.consulta_id).maybeSingle();
    consultaEstado = (data as Any)?.estado ?? null;
  }

  const cot = await cargarCotizacionInicial(pid, { db, voz: 'trol' });
  let resultado: Resultado;
  const payload: Record<string, unknown> = {};
  if (cot.ok) {
    resultado = 'con_monto';
    const { data: link } = await db.from('links_cotizacion').insert({ persona_id: pid }).select('token').single();
    const base = c.get('app_url') || 'https://app.trol.mx';
    payload.texto = cot.texto;
    if ((link as Any)?.token) payload.imagen_url = `${base}/c/${(link as Any).token}.png`;
  } else if (consultaEstado === 'sin_resultado') {
    resultado = 'no_encontrado';
  } else if (/crédito Infonavit vigente/i.test(cot.motivo)) {
    resultado = 'credito_vigente';
  } else if (/relación laboral/i.test(cot.motivo)) {
    resultado = 'sin_relacion';
  } else if (/Saldo menor/i.test(cot.motivo)) {
    resultado = 'saldo_bajo';
  } else if (/Ningún inmueble/i.test(cot.motivo)) {
    resultado = 'sin_inmueble';
  } else {
    resultado = 'no_encontrado';
  }
  payload.resultado = resultado;

  const RESUMEN: Record<Resultado, string> = {
    con_monto: 'Te enviamos tu cotización personalizada para invertir con tu saldo Infonavit.',
    sin_relacion: 'Revisamos tu Infonavit: hoy no aparece una relación laboral vigente.',
    credito_vigente: 'Revisamos tu Infonavit: ya tienes un crédito vigente.',
    saldo_bajo: 'Revisamos tu Infonavit: tu saldo todavía es bajo para esta opción.',
    sin_inmueble: 'Revisamos tu Infonavit: tu asesora te propondrá la mejor opción.',
    no_encontrado: 'No pudimos consultar tu Infonavit con esos datos.',
  };

  const api = c.get('api_trol_url') || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/api-trol`;
  const r = await fetch(`${api}/avisar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-trol-key': llave },
    body: JSON.stringify({ persona_id: pid, evento: 'precalificacion_lista', payload, resumen: RESUMEN[resultado] }),
  });
  const out = await r.json().catch(() => ({}));
  return Response.json({ resultado, aviso: out });
}
