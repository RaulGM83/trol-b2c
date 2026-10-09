import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ============================================================================
// Canje del magic link: token nuestro → sesión, sin OTP, en un clic.
//
// Vive aquí y no en cada ruta porque hay dos puertas con la misma cerradura:
//   /m/<48 hex>   — los links largos ya repartidos (legacy, ?d= elige destino)
//   /c/<12 base32> — los cortos (149), que es lo que mandamos hoy
// Duplicar este flujo para la segunda habría sido duplicar el código que da
// acceso a la cuenta de una persona. Se comparte.
//
// MULTI-USO: los clientes re-abren el link varias veces los primeros días.
// Válido durante su vigencia (7 días) hasta MAX_USOS canjes; si ya hay sesión
// en el navegador, entra directo sin gastar un uso.
// Fallback SIEMPRE: /login con el teléfono prellenado (flujo OTP de hoy).
// Seguridad: quien tiene el link entra a su cuenta; el CHECKOUT exige verificar
// el teléfono por SMS una vez (step-up) antes de pagar.
//
// PREVIEWS (oct-2026): WhatsApp/Meta abren el link 4–6 s después del envío para
// armar la vista previa del mensaje. Eso consumía el token, sellaba
// app_visto_en y regalaba los puntos de bienvenida sin que el cliente hubiera
// hecho nada ("reaccionó hace media hora"). Regla: una apertura HEAD, con
// user-agent de bot, o dentro de los primeros PREVIEW_SEG tras crear el token
// NO canjea: ve una antesala ligera con un botón que sí canjea (?ir=1). Los
// bots no dan clic; la persona sí. Toda apertura se registra con user_agent.
// ============================================================================

const MAX_USOS = 25;
const PREVIEW_SEG = 30;
export const BOT_UA = /whatsapp|facebookexternalhit|facebookcatalog|meta-externalagent|twitterbot|telegrambot|slackbot|discordbot|linkedinbot|skypeuripreview|googlebot|bingbot|applebot|headlesschrome|preview|crawler|spider|bot\//i;
const soloDigitos = (s: string) => s.replace(/\D/g, '');

export type ContextoCanje = {
  /** Método HTTP de la petición (HEAD = casi seguro un bot armando preview). */
  metodo?: string;
  userAgent?: string | null;
  /** true cuando viene de la antesala (?ir=1): la persona dio clic, no es preview. */
  confirmado?: boolean;
};

export function contextoDesdeRequest(req: Request): ContextoCanje {
  const url = new URL(req.url);
  return {
    metodo: req.method,
    userAgent: req.headers.get('user-agent'),
    confirmado: url.searchParams.get('ir') === '1',
  };
}

function antesala(origin: string, hrefEntrar: string, nombre: string): NextResponse {
  const saludo = nombre ? `${nombre}, tu cuenta Trol está lista` : 'Tu cuenta Trol está lista';
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Tu cuenta Trol</title>
<meta property="og:title" content="Tu cuenta Trol"><meta property="og:description" content="Tu pensión, en claro. Entra con un toque.">
<style>body{margin:0;font-family:Inter,-apple-system,Helvetica,Arial,sans-serif;background:#fff;color:#26282B}main{max-width:28rem;margin:0 auto;padding:2.5rem 1.25rem}
.logo{display:inline-block;background:#26282B;color:#fff;font-weight:800;border-radius:.5rem;padding:.25rem .6rem;font-size:1.1rem;letter-spacing:-.01em}
.card{background:#D1F069;border-radius:1rem;padding:1.25rem;margin:1.5rem 0}.k{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;opacity:.7}
h1{margin:.25rem 0 .5rem;font-size:1.35rem;line-height:1.2}p{margin:0;font-size:.95rem;line-height:1.45}
a.btn{display:block;text-align:center;background:#26282B;color:#fff;text-decoration:none;font-weight:700;padding:.95rem 1rem;border-radius:.75rem;font-size:1rem}
.f{margin-top:1.5rem;font-size:11px;color:#6B6E73;text-align:center;line-height:1.5}</style></head>
<body><main><span class="logo">trol</span>
<div class="card"><div class="k">Tu expediente en El Trol</div><h1>${saludo}</h1><p>Aquí ves lo que te tocaría hoy, lo máximo que podrías lograr y los pasos para llegar, con tu experto a un mensaje de distancia.</p></div>
<a class="btn" href="${hrefEntrar}">Entrar a mi cuenta</a>
<p class="f">El trámite ante el IMSS es gratis; nunca pedimos anticipos.<br>Si el botón no abre, escríbenos por WhatsApp y te ayudamos.</p></main></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  });
}

export async function canjearMagicLink(
  token: string,
  origin: string,
  opciones: { destino: string; campania?: string | null },
  ctx: ContextoCanje = {},
): Promise<NextResponse> {
  const fallback = (tel?: string) =>
    NextResponse.redirect(new URL(`/login${tel ? `?tel=${tel}` : ''}`, origin));
  const ua = (ctx.userAgent ?? '').slice(0, 300) || null;

  try {
    // Sesión existente en este navegador → directo, sin gastar uso.
    const sesionPrevia = createClient();
    const { data: { user: yaDentro } } = await sesionPrevia.auth.getUser();
    if (yaDentro) return NextResponse.redirect(new URL(opciones.destino, origin));

    const admin = createAdminClient();
    const hash = crypto.createHash('sha256').update(token).digest('hex');

    const { data: mt } = await admin
      .from('b2c_magic_tokens')
      .select('id, cliente_id, campania, creado_at, expira_at, usado_at, usos')
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
    const campania = opciones.campania ?? mt.campania ?? 'magic';

    // ¿Es un bot armando la vista previa, o una apertura demasiado temprana?
    // HEAD y user-agent de bot nunca canjean (ni con ?ir=1). Las aperturas en
    // los primeros PREVIEW_SEG sólo canjean si la persona confirmó en la antesala.
    const esHead = (ctx.metodo ?? 'GET').toUpperCase() === 'HEAD';
    const esBot = !!ua && BOT_UA.test(ua);
    const segDesdeCreacion = mt.creado_at ? (Date.now() - new Date(mt.creado_at).getTime()) / 1000 : Infinity;
    const muyTemprano = segDesdeCreacion < PREVIEW_SEG && !ctx.confirmado;
    if (esHead || esBot || muyTemprano) {
      // Se registra la apertura (con user_agent) pero no cuenta como "visto",
      // no gasta uso y no otorga puntos: nadie ha entrado todavía.
      try {
        await admin.from('links_campania').insert({ cliente_id: cli.id, campania, evento: 'preview', user_agent: ua });
      } catch {}
      if (esHead) return new NextResponse(null, { status: 200, headers: { 'cache-control': 'no-store' } });
      const entrar = new URL(`/c/${encodeURIComponent(token)}`, origin);
      // Los links largos (/m/) conservan su ruta y parámetros.
      if (/^[0-9a-f]{48}$/.test(token)) {
        entrar.pathname = `/m/${token}`;
        if (opciones.destino === '/mi') entrar.searchParams.set('d', 'mi');
        if (opciones.campania) entrar.searchParams.set('c', opciones.campania);
      }
      entrar.searchParams.set('ir', '1');
      const nombre = (cli.nombre ?? '').trim().split(/\s+/)[0] ?? '';
      return antesala(origin, entrar.toString(), nombre);
    }

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
    // La campaña sale de la fila del token si la ruta no trae una: en los links
    // cortos ya no viaja en la URL, se guardó al generarlos.
    await admin
      .from('b2c_magic_tokens')
      .update({ usado_at: new Date().toISOString(), usos: (mt.usos ?? 0) + 1 })
      .eq('id', mt.id);
    await admin.from('links_campania').insert({
      cliente_id: cli.id,
      campania,
      evento: 'magic',
      user_agent: ua,
    });

    return NextResponse.redirect(new URL(opciones.destino, origin));
  } catch {
    return fallback();
  }
}
