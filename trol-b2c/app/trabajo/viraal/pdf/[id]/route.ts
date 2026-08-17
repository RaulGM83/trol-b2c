import { renderToStream } from '@react-pdf/renderer';
import { viraalDoc } from '@/components/trol3/viraal-pdf';
import { t3, requireMiembro, type Any } from '@/lib/trol3/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireMiembro();
  const db = t3();
  const { data: a } = await db.from('viraal_autorizaciones').select('*').eq('id', Number(params.id)).maybeSingle();
  if (!a) return new Response('No encontrado', { status: 404 });
  let miembro: string | null = null;
  if (a.miembro_id) {
    const { data: m } = await db.from('miembros').select('nombre,email').eq('id', a.miembro_id).maybeSingle();
    miembro = (m?.nombre ?? m?.email ?? null) as string | null;
  }
  const stream = (await renderToStream(viraalDoc({ ...a, miembro } as Any))) as AsyncIterable<Uint8Array>;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const buf = Buffer.concat(chunks);
  return new Response(buf as Any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="viraal-autorizacion-${a.id}.pdf"`,
    },
  });
}
