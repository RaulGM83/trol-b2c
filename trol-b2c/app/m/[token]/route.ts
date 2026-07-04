import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ============================================================================
// Magic link: entrada sin OTP desde WhatsApp/email (un clic → sesión).
// Canje server-side: token nuestro (hash en b2c_magic_tokens) → auth user con
// email sintético → generateLink(magiclink) → verifyOtp con el cliente SSR
// (escribe cookies) → /diagnostico.
// MULTI-USO: los clientes re-abren el link varias veces los primeros días.
// Válido durante su vigencia (7 días) hasta MAX_USOS canjes; si ya hay sesión
// en el navegador, entra directo sin gastar un uso.
// Fallback SIEMPRE: /login con el teléfono prellenado (flujo OTP de hoy).
// Seguridad: quien tiene el link entra al diagnóstico; el CHECKOUT exige
// verificar el teléfono por SMS una vez (step-up) antes de pagar.
// ============================================================================

export const dynamic = 'force-dynamic';

const MAX_USOS = 25;

const soloDigitos = (s: string) => s.replace(/\D/g, '');

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const url = new URL(req.url);
  const campania = (url.searchParams.get('c') ?? 'magic').slice(0, 40);
  const fallback = (tel?: string) =>
    NextResponse.redirect(new URL(`/login${tel ? `?tel=${tel}` : ''}`, url.origin));

  // Token con forma inválida → login normal.
  const token = params.token ?? '';
  if (!/^[0-9a-f]{48}$/.test(token)) return fallback();

  try {
    // Sesión existente en este navegador → directo al diagnóstico, sin gastar uso.
    const sesionPrevia = createClient();
    const {
      data: { user: yaDentro },
    } = await sesionPrevia.auth.getUser();
    if (yaDentro) return NextResponse.redirect(new URL('/diagnostico', url.origin));

    const admin = createAdminClient();
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    const { data: mt } = await admin
      .from('b2c_magic_tokens')
      .select('id, cliente_id, campania, expira_at, usado_at, usos')
      .eq('token_hash', hash)
      .maybeSingle();
    if (!mt) return fallback();

    const { data: cli } = await admin
      .from('clientes')
      .select('id, nombre, telefono, auth_user_id')
      .eq('id', mt.cliente_id)
      .maybeSingle();
    if (!cli) return fallback();
    const tel10 = soloDigitos(cli.telefono ?? '').slice(-10);

    // Vencido o con demasiados usos → cae con gracia al OTP con el teléfono prellenado.
    if (new Date(mt.expira_at) < new Date() || (mt.usos ?? 0) >= MAX_USOS) return fallback(tel10);

    // 1) Asegurar el auth user del cliente con email sintético (nunca se envía
    //    correo real: el link se canjea server-side al instante).
    const email = `c-${cli.id}@auth.trol.mx`;
    let userId = cli.auth_user_id as string | null;
    if (userId) {
      const { data: u } = await admin.auth.admin.getUserById(userId);
      if (u?.user && u.user.email !== email && !u.user.email) {
        await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
      } else if (u?.user?.email && u.user.email !== email) {
        // Ya tiene otro email (raro en B2C): usamos ese para el magiclink.
      } else if (!u?.user) {
        userId = null; // vínculo roto: crear de nuevo abajo
      }
    }
    if (!userId) {
      const { data: creado, error: cErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { cliente_id: cli.id, origen: 'magic_link' },
      });
      if (cErr || !creado?.user) return fallback(tel10);
      userId = creado.user.id;
      await admin.from('clientes').update({ auth_user_id: userId }).eq('id', cli.id);
    }

    // Email efectivo del user (por si ya tenía uno propio).
    const { data: uFinal } = await admin.auth.admin.getUserById(userId);
    const emailFinal = uFinal?.user?.email ?? email;

    // 2) Generar el magiclink de Supabase y canjearlo aquí mismo.
    const { data: linkData, error: lErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: emailFinal,
    });
    const tokenHash = linkData?.properties?.hashed_token;
    if (lErr || !tokenHash) return fallback(tel10);

    const supabase = createClient(); // SSR: escribe las cookies de sesión
    const { error: vErr } = await supabase.auth.verifyOtp({ type: 'email', token_hash: tokenHash });
    if (vErr) return fallback(tel10);

    // 3) Contabilizar el uso + atribución (evento propio para medir magic vs OTP).
    await admin
      .from('b2c_magic_tokens')
      .update({ usado_at: new Date().toISOString(), usos: (mt.usos ?? 0) + 1 })
      .eq('id', mt.id);
    await admin.from('links_campania').insert({ cliente_id: cli.id, campania, evento: 'magic' });

    return NextResponse.redirect(new URL('/diagnostico', url.origin));
  } catch {
    return fallback();
  }
}
