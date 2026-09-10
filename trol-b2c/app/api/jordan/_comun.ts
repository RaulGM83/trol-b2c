import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { sincronizarConsultaJordan } from '@/lib/jordan/procesar';

// Webhooks de Jordan. El payload se usa SÓLO para saber qué consulta mirar; el
// cierre real lo hace `sincronizarConsultaJordan` preguntándole a Jordan con la
// llave. Así un POST inventado no puede cerrar nada.
//
// Firma: Jordan manda X-Jordan-Signature (HMAC-SHA256 del cuerpo) en ventanilla
// cuando hay secreto compartido; actas no firma. Si JORDAN_WEBHOOK_SECRET está
// configurado se exige la firma; si no, se acepta y se confía en la
// verificación por GET. Contestar rápido: Jordan corta a los 10 s.
export function firmaOk(raw: string, req: Request) {
  const secret = process.env.JORDAN_WEBHOOK_SECRET;
  if (!secret) return true;
  const sig = (req.headers.get('x-jordan-signature') ?? '').trim().toLowerCase();
  if (!sig) return false;
  const esperado = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado)); } catch { return false; }
}

/** Ubica la consulta trol3 por la referencia que Jordan devuelve y la sincroniza. */
export async function atenderWebhook(req: Request, tipo: 'imss_ventanilla' | 'acta') {
  const raw = await req.text();
  if (!firmaOk(raw, req)) return NextResponse.json({ ok: false, error: 'firma' }, { status: 401 });
  let body: Record<string, unknown> = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { return NextResponse.json({ ok: false, error: 'json' }, { status: 400 }); }

  const t3 = createAdminClient().schema('trol3');
  let consultaId: string | null = null;
  if (tipo === 'acta' && typeof body.external_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.external_id)) consultaId = body.external_id;
  if (!consultaId) {
    const ref = tipo === 'imss_ventanilla' ? body.sid : body.id;
    if (typeof ref === 'string' && ref) {
      const clave = tipo === 'imss_ventanilla' ? 'sid' : 'jordan_id';
      const { data } = await t3.from('consultas').select('id').eq('tipo', tipo).contains('payload_in', { [clave]: ref }).limit(1).maybeSingle();
      consultaId = (data?.id as string | undefined) ?? null;
    }
  }
  // 200 aunque no la encontremos: reintentar sólo repetiría el mismo aviso.
  if (!consultaId) return NextResponse.json({ ok: true, ignorado: 'consulta_no_encontrada' });
  const r = await sincronizarConsultaJordan(consultaId);
  return NextResponse.json({ ok: r.ok, estado: r.estado, cambio: r.cambio });
}
