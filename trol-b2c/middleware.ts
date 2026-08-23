import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieToSet = { name: string; value: string; options: CookieOptions };

// ── Sitio público (decomisión de HubSpot, ago-2026) ─────────────────────────
// trol.mx, www y lp apuntan a este mismo proyecto de Vercel. Por host servimos
// el sitio de marketing (app/sitio) y conservamos con 301 las URLs viejas del
// CMS de HubSpot (landings /es-mx/* y el blog). El resto de rutas (/calcula,
// /i/<codigo>, /e/<slug>…) funcionan igual en cualquier dominio.
const HOSTS_SITIO = new Set(['trol.mx', 'www.trol.mx', 'lp.trol.mx']);
const APEX = 'https://trol.mx';

// Slugs del blog de HubSpot que se migraron a /blog (mismos slugs).
const SLUGS_BLOG_MIGRADOS = new Set([
  'modalidad-40-imss-2026-todo-lo-que-necesitas-saber',
  'requisitos-para-la-pension-imss-en-2026',
  'pension-minima-garantizada-del-imss-alcanzara-10-636-54',
  'asignaciones-familiares-en-pension-imss-2026',
  'infonavit-y-el-cobro-en-casos-de-incapacidad-laboral',
  'simulador-de-pensiones-sinavid-estima-tu-monto-mensual',
  'embargo-de-afore-para-pension-alimenticia-en-2026',
  'pensionados-deben-presentar-certificado-de-supervivencia',
  'auditorias-del-imss-en-modalidad-40-lo-que-debes-saber',
  'tope-doble-pension-imss-2026-decision-de-la-scjn',
]);

function sitioPublico(request: NextRequest, host: string): NextResponse | null {
  const { pathname } = request.nextUrl;

  // Las landings viejas de HubSpot (asesorias, infonavit, creditos, astuto)
  // convergen en la landing nueva de asesorías.
  const esLpVieja = pathname === '/es-mx' || pathname.startsWith('/es-mx/');

  // www y lp → canónico en el apex (mismo path, o su equivalente nuevo).
  if (host !== 'trol.mx') {
    const destino = esLpVieja ? '/asesorias' : pathname;
    return NextResponse.redirect(new URL(destino, APEX), 301);
  }
  if (esLpVieja) return NextResponse.redirect(new URL('/asesorias', APEX), 301);

  // Blog: los 10 evergreen migrados conservan su slug en /blog; el resto va al índice.
  if (pathname === '/trol-financiero-blog' || pathname.startsWith('/trol-financiero-blog/')) {
    const slug = decodeURIComponent(pathname.split('/')[2] ?? '');
    const destino = SLUGS_BLOG_MIGRADOS.has(slug) ? `/blog/${slug}` : '/blog';
    return NextResponse.redirect(new URL(destino, APEX), 301);
  }

  // El aviso de privacidad vive en el WordPress propio.
  if (pathname === '/privacidad') {
    return NextResponse.redirect('https://landing.trol.mx/privacidad/', 301);
  }

  if (pathname === '/') return NextResponse.rewrite(new URL('/sitio', request.url));
  if (pathname === '/asesorias') return NextResponse.rewrite(new URL('/sitio/asesorias', request.url));
  if (pathname === '/blog' || pathname.startsWith('/blog/')) {
    return NextResponse.rewrite(new URL('/sitio' + pathname, request.url));
  }

  return null; // resto de rutas: comportamiento normal de la app
}

// Refresca la sesión de Supabase en cada request (patrón @supabase/ssr para App Router).
// Defensivo: si algo falla (env ausente, runtime Edge), NO tumba el sitio —
// el refresh de sesión es best-effort; los Server Components usan su propio cliente.
export async function middleware(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').toLowerCase().split(':')[0];
  if (HOSTS_SITIO.has(host)) {
    const res = sitioPublico(request, host);
    if (res) return res;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next({ request });

  try {
    let response = NextResponse.next({ request });
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(list: CookieToSet[]) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    await supabase.auth.getUser();
    return response;
  } catch {
    return NextResponse.next({ request });
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
