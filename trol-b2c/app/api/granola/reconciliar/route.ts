import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { listarNotas } from '@/lib/granola/client';
import { procesarNota, extraerPropuestas } from '@/lib/granola/procesar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Red de seguridad diaria (vercel.json): notas de Granola de las últimas 48 h
// que no tengamos, y reuniones con extracción pendiente/error que ya tienen expediente.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ ok: false }, { status: 401 });
  const t3 = createAdminClient().schema('trol3');
  const salida: { nota: string; mensaje: string }[] = [];
  try {
    const desde = new Date(Date.now() - 48 * 3600e3).toISOString();
    let cursor: string | null = null;
    for (let i = 0; i < 5; i++) {
      const page = await listarNotas({ updated_after: desde, cursor, page_size: 30 });
      const ids = (page.notes ?? []).map((n) => n.id);
      if (!ids.length) break;
      const { data: tenemos } = await t3.from('reuniones').select('nota_id,updated_at').in('nota_id', ids);
      const vistas = new Map(((tenemos ?? []) as { nota_id: string; updated_at: string }[]).map((x) => [x.nota_id, x.updated_at]));
      for (const n of page.notes ?? []) {
        const visto = vistas.get(n.id);
        if (visto && new Date(visto) >= new Date(n.updated_at)) continue;
        const r = await procesarNota(n.id);
        salida.push({ nota: n.id, mensaje: r.mensaje });
      }
      if (!page.hasMore || !page.cursor) break;
      cursor = page.cursor;
    }
  } catch (e) {
    salida.push({ nota: '-', mensaje: `listar: ${(e as Error).message}` });
  }
  const { data: pendientes } = await t3.from('reuniones').select('id').not('persona_id', 'is', null).in('extraccion_estado', ['pendiente', 'error']).limit(20);
  for (const p of (pendientes ?? []) as { id: string }[]) {
    const r = await extraerPropuestas(p.id);
    salida.push({ nota: p.id, mensaje: r.mensaje });
  }
  return NextResponse.json({ ok: true, n: salida.length, detalle: salida });
}
