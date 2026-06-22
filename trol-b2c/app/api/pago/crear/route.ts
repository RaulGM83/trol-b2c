import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Crea una orden pendiente y una preferencia de Mercado Pago; devuelve el init_point.
export async function POST(req: Request) {
  const token = process.env.MP_ACCESS_TOKEN;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  if (!token) {
    return NextResponse.json({ error: 'mp_no_configurado' }, { status: 503 });
  }

  let product_code = 'CALCULADORA_ADDON';
  try {
    const body = await req.json();
    if (body?.product_code) product_code = String(body.product_code);
  } catch {
    /* usa default */
  }

  // Cliente autenticado (sesión del navegador).
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'no_auth' }, { status: 401 });

  const admin = createAdminClient();
  const { data: cliente } = await admin
    .from('clientes')
    .select('id')
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

  // Orden pendiente (se marca cumplida en el webhook al confirmar el pago).
  const { data: orden, error: ordenErr } = await admin
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
  if (ordenErr || !orden) return NextResponse.json({ error: 'orden_error' }, { status: 500 });

  // Preferencia de Checkout Pro (SPEI/tarjeta) vía API REST de Mercado Pago.
  const pref = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items: [{ title: product_code, quantity: 1, unit_price: precio, currency_id: 'MXN' }],
      external_reference: orden.id,
      back_urls: {
        success: `${site}/calculadora`,
        pending: `${site}/checkout?p=${product_code}&via=pago`,
        failure: `${site}/checkout?p=${product_code}&via=pago`,
      },
      auto_return: 'approved',
      ...(/^https:\/\//i.test(site) ? { notification_url: `${site}/api/pago/webhook` } : {}),
    }),
  }).then((r) => r.json());

  if (!pref?.init_point) {
    return NextResponse.json({ error: 'mp_error', detail: pref }, { status: 502 });
  }
  return NextResponse.json({ init_point: pref.init_point, orden: orden.id });
}
