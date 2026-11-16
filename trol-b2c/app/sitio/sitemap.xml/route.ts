// Mapa del sitio de trol.mx: páginas fijas, artículos anteriores (POSTS), lo
// publicado en trol3.contenidos y los inmuebles del catálogo.
import { POSTS } from '@/lib/blog/posts';
import { todoPublicado, rutaDe } from '@/lib/blog/contenido';
import { inmueblesSitio } from '@/lib/sitio/inmuebles';

export const revalidate = 600;

const BASE = 'https://trol.mx';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export async function GET() {
  const [contenidos, inmuebles] = await Promise.all([todoPublicado(), inmueblesSitio()]);
  const urls: { loc: string; lastmod?: string | null }[] = [
    { loc: '/' }, { loc: '/pensiones' }, { loc: '/infonavit' }, { loc: '/asesorias' }, { loc: '/blog' }, { loc: '/calcula' },
    { loc: '/equipo/raul-gallego-muller' }, { loc: '/privacidad' },
  ];
  const enBase = new Set<string>();
  for (const c of contenidos) {
    const ruta = rutaDe(c);
    enBase.add(ruta);
    urls.push({ loc: ruta, lastmod: c.actualizado_en ?? c.publicado_en });
  }
  for (const p of POSTS) if (!enBase.has(`/blog/${p.slug}`)) urls.push({ loc: `/blog/${p.slug}` });
  for (const i of inmuebles) urls.push({ loc: `/infonavit/inmuebles/${i.slug}`, lastmod: i.actualizado });

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${esc(BASE + (u.loc === '/' ? '' : u.loc))}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`).join('\n') +
    '\n</urlset>\n';
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=600' } });
}
