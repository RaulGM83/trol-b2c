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
  let cliente: { nombre: string | null; apellidos: string | null; curp: string | null; nss: string | null };
  if (a.consulta_aliado_id) {
    const { data: c } = await db.from('consultas_aliados').select('nombre,apellidos,curp,calculo_pensional').eq('id', a.consulta_aliado_id).maybeSingle();
    const diag = (c?.calculo_pensional as Any)?.diagnostico ?? {};
    const nss = diag?.nss ? String(diag.nss) : null;
    cliente = { nombre: c?.nombre ?? null, apellidos: c?.apellidos ?? null, curp: c?.curp ?? null, nss };
  } else {
    const { data: p } = await db.from('v_expediente').select('nombre,apellidos,curp').eq('persona_id', a.persona_id).maybeSingle();
    const { data: nssD } = await db.from('v_mejor_dato').select('valor').eq('persona_id', a.persona_id).eq('campo', 'nss').maybeSingle();
    const nss = nssD?.valor != null ? String((nssD as Any).valor).replace(/^"|"$/g, '') : null;
    cliente = { nombre: p?.nombre ?? null, apellidos: p?.apellidos ?? null, curp: p?.curp ?? null, nss };
  }
  const stream = (await renderToStream(viraalDoc({ ...a, miembro, cliente } as Any))) as AsyncIterable<Uint8Array>;
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
