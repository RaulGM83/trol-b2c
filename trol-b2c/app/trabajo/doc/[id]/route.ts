import { NextResponse, type NextRequest } from 'next/server';
import { requireMiembro, t3 } from '@/lib/trol3/server';
import { urlFirmadaDocumento } from '@/lib/trol3/documentos';

// Abre un documento de la bóveda (miembros): URL firmada de corta duración.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireMiembro();
  const { data: d } = await t3().from('documentos').select('storage_path,url_externa').eq('id', params.id).maybeSingle();
  if (!d) return new NextResponse('No encontrado', { status: 404 });
  if (d.url_externa && !d.storage_path) return NextResponse.redirect(d.url_externa as string);
  try { return NextResponse.redirect(await urlFirmadaDocumento(d.storage_path as string)); }
  catch { return new NextResponse('No disponible', { status: 404 }); }
}
