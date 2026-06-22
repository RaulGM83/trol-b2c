import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
  if (!paymentId) {
    const u = new URL(req.url);
    paymentId = u.searchParams.get('data.id') ?? u.searchParams.get('id');
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

    // Disparo a n8n para refresh con Jordan (si semilla +1 mes) + generación de
    // documento. Fire-and-forget; n8n hace el trabajo pesado. Opcional por env.
    const n8nUrl = process.env.N8N_FULFILLMENT_URL;
    if (n8nUrl) {
      fetch(n8nUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orden_id: pago.external_reference, payment_ref: String(pago.id) }),
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true });
}
