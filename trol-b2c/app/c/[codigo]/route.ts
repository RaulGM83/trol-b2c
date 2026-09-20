import { NextResponse } from 'next/server';
import { canjearMagicLink } from '@/lib/magic';

// 149: la puerta corta y amistosa a su cuenta Trol.
//   https://app.trol.mx/c/AB7K9QX2PMRT
// Sin ?d= ni ?c= a la vista: el destino lo dice la ruta y la campaña vive en la
// fila del token. Es el link que el cliente lee dentro del mensaje de WhatsApp,
// así que tiene que parecer nuestro — de eso depende que lo abra.
export const dynamic = 'force-dynamic';

// Mismo alfabeto que trol3.codigo_amistoso: sin 0 O 1 I L.
const FORMA = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10,16}$/;

export async function GET(req: Request, { params }: { params: { codigo: string } }) {
  const url = new URL(req.url);
  // Se acepta en minúsculas: hay clientes que lo teclean a mano desde otro teléfono.
  const codigo = (params.codigo ?? '').trim().toUpperCase();
  if (!FORMA.test(codigo)) return NextResponse.redirect(new URL('/login', url.origin));
  return canjearMagicLink(codigo, url.origin, { destino: '/mi', campania: null });
}
