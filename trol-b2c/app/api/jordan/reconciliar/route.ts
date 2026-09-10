import { NextResponse } from 'next/server';
import { consultasJordanAbiertas, sincronizarConsultaJordan } from '@/lib/jordan/procesar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Red de seguridad: si el webhook no llegó (Jordan reintenta sólo 3 veces), la
// solicitud sigue viva de su lado. Cada hora (vercel.json) se pregunta por las
// consultas Jordan abiertas. Vercel Cron manda `Authorization: Bearer CRON_SECRET`.
// Vercel Pro (10-sep-2026): cron horario y hasta 300 s. En Hobby sería `0 14 * * *` y 60 s.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ ok: false }, { status: 401 });
  const abiertas = await consultasJordanAbiertas();
  const salida: { id: string; tipo: string; estado: string; cambio: boolean; mensaje: string }[] = [];
  for (const c of abiertas) {
    const r = await sincronizarConsultaJordan(c.id);
    salida.push({ id: c.id, tipo: c.tipo, estado: r.estado, cambio: r.cambio, mensaje: r.mensaje });
  }
  return NextResponse.json({ ok: true, revisadas: salida.length, cerradas: salida.filter((s) => s.cambio).length, detalle: salida });
}
