// PDF de una página para que el aliado lo comparta o imprima. Siempre se
// genera al vuelo con su liga vigente; no se guarda nada.
import { renderToStream } from '@react-pdf/renderer';
import { materialAliadoDoc } from '@/components/trol3/material-aliado-pdf';
import { materialDelAliado, archivoBase } from '@/lib/aliado/material';
import type { Any } from '@/lib/trol3/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const m = await materialDelAliado();
  if (!m) return new Response('Todavía no tienes liga', { status: 404 });
  const stream = (await renderToStream(materialAliadoDoc(m))) as AsyncIterable<Uint8Array>;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const buf = Buffer.concat(chunks);
  return new Response(buf as Any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${archivoBase(m.codigo)}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
