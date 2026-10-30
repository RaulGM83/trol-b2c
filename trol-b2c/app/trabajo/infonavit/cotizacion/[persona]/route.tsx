/**
 * 276 · Cotización inicial Infonavit en PNG para el equipo (el dibujo vive en lib/infonavit/cotizacion-png).
 */
import { requireMiembro } from '@/lib/trol3/server';
import { cargarCotizacionInicial } from '@/lib/infonavit/cotizacion-inicial-server';
import { imagenCotizacion } from '@/lib/infonavit/cotizacion-png';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { persona: string } }) {
  await requireMiembro();
  const c = await cargarCotizacionInicial(params.persona);
  if (!c.ok) return new Response(c.motivo, { status: 422 });
  return imagenCotizacion(c);
}
