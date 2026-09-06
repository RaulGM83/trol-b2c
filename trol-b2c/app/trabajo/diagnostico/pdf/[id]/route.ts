// La liga para ver el PDF del diagnóstico. Se rinde en el servidor, como el de
// Infonavit: el documento tiene que salir igual desde cualquier navegador.
//
// Todo el armado vive en `lib/diagnostico/pdf.ts`, compartido con el guardado
// automático al entregar: dos caminos, un solo archivo posible.
import { construirPdfDiagnostico } from '@/lib/diagnostico/pdf';
import { requireMiembro, type Any } from '@/lib/trol3/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Rendir un documento de varias páginas no cabe en el default.
export const maxDuration = 60;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireMiembro();
  const r = await construirPdfDiagnostico(params.id);
  if (!r) return new Response('No encontrado', { status: 404 });

  return new Response(r.buf as Any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="diagnostico-${r.slug}.pdf"`,
    },
  });
}
