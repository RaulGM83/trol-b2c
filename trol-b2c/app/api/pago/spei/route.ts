import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// SPEI nativo (Plan Maestro §13: SPEI-first). Crea una orden pendiente y un
// pago tipo transferencia en Mercado Pago (payment_method_id="clabe"); devuelve
// la CLABE / comprobante para que el cliente transfiera. El webhook concilia.
export async function POST(req: Request) {
  const token = process.env.MP_ACCESS_TOKEN;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  if (!token) return NextResponse.json({ error: 'mp_no_configurado' }, { status: 503 });

  let product_code = 'CALCULADORA_ADDON';
  try {
    const body = await req.json();
    if (body?.product_code) product_code = String(body.product_code);
  } catch {
    /* default */
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'no_auth' }, { status: 401 });

  const admin = createAdminClient();
  const { data: cliente } = await admin
    .from('clientes')
    .select('id, nombre')
    .eq('auth_user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!cliente) return NextResponse.json({ error: 'sin_cliente' }, { status: 400 });

  const { data: prod } = await admin
    .from('products')
    .select('precio_mxn')
    .eq('code', product_code)
    .maybeSingle();
  const precio = Number(prod?.precio_mxn ?? 0);
  if (!precio) return NextResponse.json({ error: 'producto_invalido' }, { status: 400 });

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
  if (!orden) return NextResponse.json({ error: 'orden_error' }, { status: 500 });

  // Email requerido por MP; los clientes B2C no tienen email real → sintético.
  const payerEmail = `cliente_${cliente.id.slice(0, 8)}@trol.mx`;

  // MP rechaza notification_url en localhost; solo se envía si el sitio es público (https).
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
      description: product_code,
      payment_method_id: 'clabe',
      external_reference: orden.id,
      ...(esPublica ? { notification_url: `${site}/api/pago/webhook` } : {}),
      payer: { email: payerEmail, first_name: cliente.nombre ?? 'Cliente' },
    }),
  }).then((r) => r.json());

  if (!pago?.id) {
    return NextResponse.json({ error: 'mp_error', detail: pago }, { status: 502 });
  }

  // La CLABE/comprobante vive en external_resource_url; intentamos exponer la CLABE si viene.
  const voucher =
    pago?.transaction_details?.external_resource_url ?? pago?.point_of_interaction?.transaction_data?.ticket_url ?? null;
  const clabe =
    pago?.transaction_details?.financial_institution ??
    pago?.point_of_interaction?.transaction_data?.bank_transfer_id ??
    null;

  await admin.from('ordenes_b2c').update({ payment_ref: String(pago.id) }).eq('id', orden.id);

  return NextResponse.json({
    ok: true,
    payment_id: pago.id,
    estado: pago.status, // pending hasta que llegue la transferencia
    monto: precio,
    referencia: orden.id,
    voucher_url: voucher,
    clabe,
  });
}
