import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Dispara el refresh con Jordan tras un desbloqueo por PUNTOS (el pago lo hace
// el webhook). Necesario para activar a los leads sin semilla (Segmento B):
// si tienen CURP y su dato del IMSS es viejo o inexistente, pedimos a Jordan
// traer datos al día → el chain Jordan→Waterfall→Calculos crea/actualiza la
// semilla en silencio (mass_refresh) y se activa la calculadora.
//
// Decisión de "viejo" por `última_fecha_sisec` (dato real), no por la fecha de
// la semilla (que se recalcula y siempre se ve fresca). Sin fecha SISEC = nunca
// tuvimos dato oficial → refrescar.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'no_auth' }, { status: 401 });

  const admin = createAdminClient();
  // Cast a `any`: el nombre de columna con acento (última_fecha_sisec) no lo
  // soporta el parser de tipos de supabase-js en el string de select.
  const { data: cli } = await (admin as any)
    .from('clientes')
    .select('id, curp, última_fecha_sisec')
    .eq('auth_user_id', user.id)
    .limit(1)
    .maybeSingle();
  if (!cli) return NextResponse.json({ ok: false, error: 'sin_cliente' }, { status: 400 });

  const fechaSisec = cli['última_fecha_sisec'] as string | null | undefined;
  const vieja = !fechaSisec || Date.now() - new Date(fechaSisec).getTime() > 30 * 86_400_000;

  if (!cli.curp || !vieja) {
    // Nada que refrescar (sin CURP no podemos consultar, o el dato ya está al día).
    return NextResponse.json({ ok: true, refrescado: false });
  }

  const n8nUrl = process.env.N8N_FULFILLMENT_URL;
  if (!n8nUrl) return NextResponse.json({ ok: true, refrescado: false, error: 'n8n_no_configurado' });

  // Marca el refresh silencioso (mismo flag que lee el chain de fulfillment).
  await admin
    .from('clientes')
    .update({ sisec_refresh_solicitado_at: new Date().toISOString() })
    .eq('id', cli.id);

  // Fire-and-forget: no bloqueamos la respuesta al usuario.
  fetch(n8nUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ curp: cli.curp, cliente_id: cli.id, origen: 'b2c_puntos' }),
  }).catch(() => {});

  return NextResponse.json({ ok: true, refrescado: true });
}
