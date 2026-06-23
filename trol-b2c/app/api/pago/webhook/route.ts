import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

// Valida la firma x-signature de Mercado Pago (HMAC-SHA256 del manifest con el
// secreto del webhook). Si MP_WEBHOOK_SECRET no está, no se valida (best-effort).
function firmaValida(req: Request, dataId: string | null): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true;
  if (!dataId) return false;
  const sig = req.headers.get('x-signature') ?? '';
  const reqId = req.headers.get('x-request-id') ?? '';
  const parts: Record<string, string> = {};
  sig.split(',').forEach((p) => {
    const [k, v] = p.split('=');
    if (k && v) parts[k.trim()] = v.trim();
  });
  const ts = parts['ts'];
  const v1 = parts['v1'];
  if (!ts || !v1) return false;
  // MP: el request-id se omite del manifest si no viene en la notificación.
  const segs = [`id:${dataId.toLowerCase()}`];
  if (reqId) segs.push(`request-id:${reqId}`);
  segs.push(`ts:${ts}`);
  const manifest = segs.join(';') + ';';
  const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(v1));
  } catch {
    return false;
  }
}

// Webhook de conciliación de Mercado Pago. MP notifica un pago; consultamos su
// estado con nuestro token y, si está aprobado, marcamos la orden cumplida y
// disparamos el fulfillment.
// TODO(seguridad): validar la firma `x-signature` con el secreto del webhook.
// TODO(fulfillment): si la semilla del cliente tiene +1 mes → refresh con Jordan;
//   generar documento; acreditar cashback (10%); avanzar etapa_actual. Vía n8n.
export async function POST(req: Request) {
  const token = process.env.MP_ACCESS_TOKEN;
  let paymentId: string | null = null;
  try {
    const body = await req.json();
    paymentId = body?.data?.id ?? body?.resource ?? null;
  } catch {
    /* MP también puede mandar query params */
  }
  const dataIdQuery = new URL(req.url).searchParams.get('data.id') ?? new URL(req.url).searchParams.get('id');
  if (!paymentId) paymentId = dataIdQuery;

  // Firma del webhook: se registra si no cuadra, pero NO se bloquea — la
  // seguridad autoritativa es consultar el pago en MP con nuestro token abajo
  // (un atacante no puede falsificar un pago aprobado con external_reference real).
  if (!firmaValida(req, dataIdQuery ?? paymentId)) {
    console.warn('[pago/webhook] firma x-signature no coincide', { paymentId });
  }

  if (!token || !paymentId) return NextResponse.json({ ok: true }); // ack para no reintentar

  const pago = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  if (pago?.status === 'approved' && pago?.external_reference) {
    const admin = createAdminClient();
    // Fulfillment atómico: marca cumplida + cashback 10% + avanza etapa.
    await admin.rpc('procesar_pago_orden', {
      p_orden_id: pago.external_reference,
      p_payment_ref: String(pago.id),
    });

    // Refresh con Jordan (workflow "Refrescar SISEC") si la semilla tiene +1 mes.
    // Su webhook espera { curp, cliente_id }; mandamos también un flag para que el
    // flujo NO mande mensajes de "usuario nuevo" al cliente.
    const n8nUrl = process.env.N8N_FULFILLMENT_URL;
    if (n8nUrl) {
      const { data: orden } = await admin
        .from('ordenes_b2c')
        .select('cliente_id')
        .eq('id', pago.external_reference)
        .maybeSingle();
      if (orden?.cliente_id) {
        const { data: cli } = await admin
          .from('clientes')
          .select('curp, calculo_pensional_at')
          .eq('id', orden.cliente_id)
          .maybeSingle();
        const vieja =
          !cli?.calculo_pensional_at ||
          Date.now() - new Date(cli.calculo_pensional_at).getTime() > 30 * 86_400_000;
        if (cli?.curp && vieja) {
          // Marca el refresh silencioso: el chain Jordan→Waterfall→Calculos lee
          // esta columna y corre en mass_refresh=true (sin notificar al usuario).
          await admin
            .from('clientes')
            .update({ sisec_refresh_solicitado_at: new Date().toISOString() })
            .eq('id', orden.cliente_id);

          fetch(n8nUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              curp: cli.curp,
              cliente_id: orden.cliente_id,
              orden_id: pago.external_reference,
              origen: 'b2c_pago',
            }),
          }).catch(() => {});
        }
      }
    }
  }

  return NextResponse.json({ ok: true });
}
