import { NextResponse } from 'next/server';
import { canjearMagicLink } from '@/lib/magic';

// Magic link largo (legacy). Sigue vivo por los links de 48 hex ya repartidos y
// porque es el único que puede aterrizar en /diagnostico. Los nuevos se generan
// cortos y entran por /c/ (149).
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const url = new URL(req.url);
  const campania = (url.searchParams.get('c') ?? 'magic').slice(0, 40);
  // Destino: d=mi → su cuenta Trol (/mi); default el portal de diagnóstico.
  const destino = url.searchParams.get('d') === 'mi' ? '/mi' : '/diagnostico';

  const token = params.token ?? '';
  if (!/^[0-9a-f]{48}$/.test(token)) return NextResponse.redirect(new URL('/login', url.origin));
  return canjearMagicLink(token, url.origin, { destino, campania });
}
