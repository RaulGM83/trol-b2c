import { NextResponse } from 'next/server';

// Link de referido: app.trol.mx/r/<cliente_id del referidor>.
// Guarda el código en cookie y manda al lead nuevo a calcular/registrarse.
// La recompensa se otorga cuando el referido llega a diagnóstico (ver RPC
// registrar_referido, disparado por <ReferralClaim/> al entrar autenticado).
export function GET(req: Request, { params }: { params: { codigo: string } }) {
  const res = NextResponse.redirect(new URL('/calcula?ref=referido', req.url));
  res.cookies.set('trol_ref', params.codigo, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 días
    sameSite: 'lax',
  });
  return res;
}
