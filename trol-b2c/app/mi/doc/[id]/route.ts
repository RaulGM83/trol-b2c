import { NextResponse, type NextRequest } from 'next/server';
import { getPersonaMia, t3admin } from '@/lib/trol3/server';
import { urlFirmadaDocumento } from '@/lib/trol3/documentos';

// Abre un documento propio del cliente (visible para el cliente y sin gating pendiente).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const pid = await getPersonaMia();
  if (!pid) return NextResponse.redirect(new URL('/login?next=/mi', _req.url));
  const { data: d } = await t3admin().from('documentos').select('persona_id,storage_path,url_externa,gating,visibilidad').eq('id', params.id).maybeSingle();
  if (!d || d.persona_id !== pid || !(d.visibilidad as string[]).includes('cliente') || d.gating !== 'gratis') return new NextResponse('No disponible', { status: 404 });
  if (d.url_externa && !d.storage_path) return NextResponse.redirect(d.url_externa as string);
  try { return NextResponse.redirect(await urlFirmadaDocumento(d.storage_path as string)); }
  catch { return new NextResponse('No disponible', { status: 404 }); }
}
