/**
 * 276 · Cotización inicial Infonavit en PNG para el equipo (el dibujo vive en lib/infonavit/cotizacion-png).
 */
import { requireMiembro } from '@/lib/trol3/server';
import { cargarCotizacionInicial } from '@/lib/infonavit/cotizacion-inicial-server';
import { imagenCotizacion } from '@/lib/infonavit/cotizacion-png';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 296 · ?plazo=18|60 → formato de un solo inmueble. */
const plazoDe = (req: Request) => { const v = Number(new URL(req.url).searchParams.get('plazo')); return v === 18 || v === 60 ? v : null; };

export async function GET(req: Request, { params }: { params: { persona: string } }) {
  await requireMiembro();
  const c = await cargarCotizacionInicial(params.persona);
  if (!c.ok) return new Response(c.motivo, { status: 422 });
  return imagenCotizacion(c, { plazo: plazoDe(req) });
}
