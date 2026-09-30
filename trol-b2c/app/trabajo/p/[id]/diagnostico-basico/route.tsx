/** Diagnóstico básico en PNG vertical (1080x1350) para WhatsApp (claude/91). */
import { requireMiembro } from '@/lib/trol3/server';
import { armarDiagnosticoBasico } from '@/lib/trol3/diagnostico-basico';
import { imagenDiagnosticoBasico } from '@/lib/trol3/diagnostico-basico-img';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const m = await requireMiembro();
  const d = await armarDiagnosticoBasico(params.id, m.nombre);
  if (!d) return new Response('No encontrado', { status: 404 });
  return imagenDiagnosticoBasico(d);
}
