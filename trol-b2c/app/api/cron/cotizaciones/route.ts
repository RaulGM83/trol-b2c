import { NextResponse } from 'next/server';
import { generarCotizacionesPendientes } from '@/lib/infonavit/cotizacion-guardada';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// 299 · Cada hora (vercel.json): a quien Precalix ve con empleo y saldo se le deja la propuesta Infonavit guardada
// y lista para el asesor. Vercel Cron manda `Authorization: Bearer CRON_SECRET`.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ ok: false }, { status: 401 });
  const r = await generarCotizacionesPendientes(120);
  return NextResponse.json({ ok: true, pendientes: r.pendientes, generadas: r.hechas.filter((h) => h.estado === 'lista').length, sin_cotizacion: r.hechas.filter((h) => h.estado === 'sin_cotizacion').length, detalle: r.hechas });
}
