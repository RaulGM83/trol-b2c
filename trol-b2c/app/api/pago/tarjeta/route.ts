import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Pago con tarjeta in-page: recibe el token del Card Brick y crea el pago en MP.
// Aprueba al instante → fulfillment inmediato (procesar_pago_orden). El refresh
// con Jordan lo dispara el webhook (que también llega para tarjeta).
export async function POST(req: Request) {
  const token = process.env.MP_ACCESS_TOKEN;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  if (!token) return NextResponse.json({ ok: false, error: 'mp_no_configurado' }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const product_code = typeof body.product_code === 'string' ? body.product_code : 'CALCULADORA_ADDON';

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'no_auth' }, { status: 401 });

  const admin = createAdminClient();
  const { data: cliente } = await admin
    .from('clientes')
    .select('id')
    .eq('auth_user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!cliente) return NextResponse.json({ ok: false, error: 'sin_cliente' }, { status: 400 });

  const { data: prod } = await admin
    .from('products')
    .select('precio_mxn')
    .eq('code', product_code)
    .maybeSingle();
  const precio = Number(prod?.precio_mxn ?? 0);
  if (!precio) return NextResponse.json({ ok: false, error: 'producto_invalido' }, { status: 400 });

  const { data: orden } = await admin
    .from('ordenes_b2c')
    .insert({
      cliente_id: cliente.id,
      product_code,
      monto: precio,
      unlock_method: 'pago',
      estado: 'pendiente',
      payment_provider: 'mercadopago',
    })
    .select('id')
    .single();
  if (!orden) return NextResponse.json({ ok: false, error: 'orden_error' }, { status: 500 });

  const payer = (body.payer ?? {}) as { email?: string; identification?: unknown };
  const esPublica = /^https:\/\//i.test(site);
  const pago = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': orden.id,
    },
    body: JSON.stringify({
      transaction_amount: precio,
      token: body.token,
      payment_method_id: body.payment_method_id,
      issuer_id: body.issuer_id,
      installments: Number(body.installments) || 1,
      description: product_code,
      external_reference: orden.id,
      ...(esPublica ? { notification_url: `${site}/api/pago/webhook` } : {}),
      payer: {
        email: payer.email || `cliente_${cliente.id.slice(0, 8)}@trol.mx`,
        identification: payer.identification,
      },
    }),
  }).then((r) => r.json());

  if (pago?.status === 'approved') {
    await admin.rpc('procesar_pago_orden', { p_orden_id: orden.id, p_payment_ref: String(pago.id) });
    return NextResponse.json({ ok: true, estado: 'approved', orden: orden.id });
  }

  return NextResponse.json({
    ok: false,
    estado: pago?.status ?? 'error',
    error: pago?.status_detail || pago?.message || 'El pago no se aprobó',
  });
}
