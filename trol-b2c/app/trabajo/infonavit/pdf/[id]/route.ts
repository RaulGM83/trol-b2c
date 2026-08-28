import { renderToStream } from '@react-pdf/renderer';
import { infonavitDoc } from '@/components/trol3/infonavit-pdf';
import { t3, requireMiembro, type Any } from '@/lib/trol3/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const modo = new URL(req.url).searchParams.get('doc') === 'extendido' ? 'extendido' as const : 'resumen' as const;
  await requireMiembro();
  const db = t3();
  const { data: a } = await db.from('infonavit_asesorias').select('*').eq('id', params.id).maybeSingle();
  if (!a) return new Response('No encontrado', { status: 404 });

  const ids = [a.persona_id, a.cotitular_persona_id].filter(Boolean) as string[];
  const [{ data: pers }, { data: m }] = await Promise.all([
    db.from('personas').select('id,nombre,apellidos').in('id', ids),
    a.miembro_id ? db.from('miembros').select('nombre,email,firma').eq('id', a.miembro_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const nombre = (id: string | null) => {
    const p = ((pers ?? []) as Any[]).find((x) => x.id === id);
    return p ? [p.nombre, p.apellidos].filter(Boolean).join(' ') : null;
  };
  // El titular declara su saldo o no: si la propuesta se armó sobre un estimado,
  // el documento lo dice en los supuestos en vez de presentarlo como dato firme.
  const titular = ((a.entrada as Any)?.titulares ?? [])[0];
  const saldoSinConfirmar = Boolean((a.entrada as Any)?.saldo_sin_confirmar) || titular == null;

  const stream = (await renderToStream(infonavitDoc({
    ...a,
    clienteNombre: nombre(a.persona_id),
    cotitularNombre: nombre(a.cotitular_persona_id),
    miembro: (m as Any)?.firma ?? (m as Any)?.nombre ?? (m as Any)?.email ?? null,
    saldoSinConfirmar,
  } as Any, modo))) as AsyncIterable<Uint8Array>;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const buf = Buffer.concat(chunks);
  return new Response(buf as Any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="propuesta-infonavit${modo === 'extendido' ? '-extendida' : ''}-${a.id}.pdf"`,
    },
  });
}
