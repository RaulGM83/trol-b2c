/**
 * 281 · Cotización inicial Infonavit para el broker, co-branded ("en alianza con …").
 * Primero se verifica con la sesión del aliado que la persona es suya y salió con monto
 * (v_infonavit_aliado); sólo entonces se calcula con la llave de servicio.
 */
import { requireAliado, t3, t3admin } from '@/lib/trol3/server';
import { cargarCotizacionInicial } from '@/lib/infonavit/cotizacion-inicial-server';
import { imagenCotizacion } from '@/lib/infonavit/cotizacion-png';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 296 · ?plazo=18|60 → formato de un solo inmueble. */
const plazoDe = (req: Request) => { const v = Number(new URL(req.url).searchParams.get('plazo')); return v === 18 || v === 60 ? v : null; };

export async function GET(req: Request, { params }: { params: { persona: string } }) {
  const a = await requireAliado();
  const { data: fila } = await t3().from('v_infonavit_aliado').select('persona_id,resultado').eq('persona_id', params.persona).maybeSingle();
  if (!fila || (fila as { resultado: string }).resultado !== 'con_monto') return new Response('No disponible', { status: 404 });
  const c = await cargarCotizacionInicial(params.persona, { db: t3admin(), voz: 'aliado' });
  if (!c.ok) return new Response(c.motivo, { status: 422 });
  return imagenCotizacion(c, { alianza: a.empresa || a.nombre, plazo: plazoDe(req) });
}
