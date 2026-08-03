import { NextResponse } from 'next/server';

// Link de referido: app.trol.mx/r/<cliente_id del referidor>.
// El referido es, por definición, alguien que NUNCA hemos visto: aterriza en
// /alta (registro), no en la calculadora de leads fríos ni en una pantalla de
// "no encontramos tu historial".
// El código viaja por DOS canales: la URL (?rc=) y la cookie. La URL sobrevive
// a que WhatsApp abra el link en su navegador in-app y el cliente termine el
// flujo ahí; la cookie sobrevive a que navegue dentro de la app.
// La recompensa se otorga cuando el referido llega a etapa 1 (diagnóstico
// real), no al registrarse — ver <ReferralClaim/> y el RPC registrar_referido.
export function GET(req: Request, { params }: { params: { codigo: string } }) {
  const codigo = (params.codigo ?? '').slice(0, 64);
  const res = NextResponse.redirect(new URL(`/alta?rc=${encodeURIComponent(codigo)}`, req.url));
  res.cookies.set('trol_ref', codigo, {
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 días
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
  return res;
}
