import { NextResponse } from 'next/server';
import { firmaWebhookOk } from '@/lib/granola/client';
import { procesarNota } from '@/lib/granola/procesar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Granola avisa `note.generated` / `note.edited` con sólo el id de la nota.
// Se verifica la firma, se pide la nota completa y se procesa. Granola corta a
// los 15 s y reintenta 4xx nunca / 5xx sí: contestamos 200 aunque el proceso
// falle por dentro (queda en extraccion_error y lo recoge la reconciliación).
export async function POST(req: Request) {
  const raw = await req.text();
  if (!firmaWebhookOk(raw, req.headers)) return NextResponse.json({ ok: false, error: 'firma' }, { status: 401 });
  let body: { event_type?: string; note_id?: string } = {};
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, error: 'json' }, { status: 400 }); }
  if (!body.note_id || !['note.generated', 'note.edited'].includes(body.event_type ?? '')) return NextResponse.json({ ok: true, ignorado: body.event_type ?? 'sin_evento' });
  const r = await procesarNota(body.note_id);
  return NextResponse.json({ ok: true, procesada: r.ok, mensaje: r.mensaje, reunion_id: r.reunion_id ?? null });
}
