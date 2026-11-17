import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { POSTS, porSlug } from '@/lib/blog/posts';
import { publicadoPorSlug, datosEstructurados, fechaLarga } from '@/lib/blog/contenido';
import { CuerpoContenido } from '@/components/sitio/CuerpoContenido';

// Un slug puede venir de trol3.contenidos (publicado desde /trabajo/contenido, manda
// si existe) o de los artículos anteriores en POSTS. Los de la base se generan a
// demanda y se refrescan cada 5 minutos.
export const revalidate = 300;

// Artículos que una guía sustituye: en cuanto la guía está publicada, el artículo
// redirige a ella (301). Mientras no lo esté, el artículo sigue visible.
const SUSTITUIDO_POR_GUIA: Record<string, { pilar: 'pensiones' | 'infonavit'; slug: string }> = {
  'modalidad-40-imss-2026-todo-lo-que-necesitas-saber': { pilar: 'pensiones', slug: 'modalidad-40-regla-nueva' },
  'pension-minima-garantizada-del-imss-alcanzara-10-636-54': { pilar: 'pensiones', slug: 'pension-minima-garantizada' },
};

// Los artículos anteriores no guardan autor: los firma Raúl, que revisa el fondo.
const AUTOR = 'Raúl Gallego Müller, CFA';
const AUTOR_URL = '/equipo/raul-gallego-muller';
// Artículos que no hablan del IMSS: su llamado a la acción no lo menciona.
const SIN_IMSS = new Set(['simulador-de-pensiones-sinavid-estima-tu-monto-mensual']);
const dia = (iso: string) => fechaLarga(`${iso}T12:00:00-06:00`);

async function guiaQueSustituye(slug: string): Promise<string | null> {
  const g = SUSTITUIDO_POR_GUIA[slug];
  if (!g) return null;
  const c = await publicadoPorSlug(g.slug, 'guia');
  return c && c.pilar === g.pilar ? `/${g.pilar}/${g.slug}` : null;
}

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const c = await publicadoPorSlug(params.slug);
  if (c) {
    return {
      title: `${c.titulo} · El Trol Financiero`,
      description: c.resumen,
      alternates: { canonical: `https://trol.mx/blog/${c.slug}` },
      openGraph: { type: 'article', title: c.titulo, description: c.resumen, url: `https://trol.mx/blog/${c.slug}`, publishedTime: c.publicado_en ?? undefined, modifiedTime: c.actualizado_en ?? c.publicado_en ?? undefined },
    };
  }
  const post = porSlug(params.slug);
  if (!post) return {};
  // Cada artículo lleva su propio título y resumen para redes; sin esto hereda
  // los de la calculadora de pensiones.
  const titulo = `${post.titulo} · El Trol Financiero`;
  const url = `https://trol.mx/blog/${post.slug}`;
  return {
    title: titulo,
    description: post.descripcion,
    alternates: { canonical: url },
    authors: [{ name: AUTOR, url: `https://trol.mx${AUTOR_URL}` }],
    openGraph: {
      type: 'article', siteName: 'El Trol Financiero', locale: 'es_MX', url, title: titulo, description: post.descripcion,
      publishedTime: post.fecha, modifiedTime: post.actualizado ?? post.fecha, authors: [AUTOR],
    },
    twitter: { card: 'summary', title: titulo, description: post.descripcion },
  };
}

// Estilos del cuerpo: el HTML viene tal cual del blog anterior, así que el
// formato se aplica con variantes arbitrarias sobre el contenedor.
const PROSA =
  '[&_h1]:mt-8 [&_h1]:text-2xl [&_h1]:font-extrabold ' +
  '[&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-extrabold ' +
  '[&_h3]:mt-6 [&_h3]:font-bold ' +
  '[&_p]:mt-3 [&_p]:leading-relaxed ' +
  '[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1 ' +
  '[&_a]:font-medium [&_a]:underline ' +
  '[&_blockquote]:my-5 [&_blockquote]:rounded-2xl [&_blockquote]:bg-cream [&_blockquote]:p-5 [&_blockquote]:text-sm ' +
  '[&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm ' +
  '[&_th]:border [&_th]:border-line [&_th]:bg-cream [&_th]:px-3 [&_th]:py-2 [&_th]:text-left ' +
  '[&_td]:border [&_td]:border-line [&_td]:px-3 [&_td]:py-2';

export default async function BlogPost({ params }: { params: { slug: string } }) {
  const destino = await guiaQueSustituye(params.slug);
  if (destino) permanentRedirect(destino);
  const c = await publicadoPorSlug(params.slug);
  if (c) {
    return (
      <>
        {datosEstructurados(c, `https://trol.mx/blog/${c.slug}`).map((d, i) => (
          <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(d).replace(/</g, '\\u003c') }} />
        ))}
        <section className="bg-ink text-white">
          <div className="mx-auto max-w-3xl px-5 py-12">
            <Link href="/blog" className="text-sm text-white/70 hover:text-lime">
              ← Todas las guías
            </Link>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight">{c.titulo}</h1>
          </div>
        </section>
        <CuerpoContenido c={c} />
      </>
    );
  }
  const post = porSlug(params.slug);
  if (!post) notFound();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: post.titulo,
            description: post.descripcion,
            mainEntityOfPage: `https://trol.mx/blog/${post.slug}`,
            ...(post.fecha ? { datePublished: post.fecha } : {}),
            ...(post.actualizado || post.fecha ? { dateModified: post.actualizado ?? post.fecha } : {}),
            author: { '@type': 'Person', name: 'Raúl Gallego Müller', honorificSuffix: 'CFA', url: `https://trol.mx${AUTOR_URL}` },
            publisher: { '@type': 'Organization', name: 'El Trol Financiero', url: 'https://trol.mx' },
            inLanguage: 'es-MX',
          }).replace(/</g, '\\u003c'),
        }}
      />
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-3xl px-5 py-12">
          <Link href="/blog" className="text-sm text-white/70 hover:text-lime">
            ← Todas las guías
          </Link>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight">{post.titulo}</h1>
          <p className="mt-3 text-sm text-white/70">
            Por <Link href={AUTOR_URL} className="font-semibold text-white underline">{AUTOR}</Link>
            {post.fecha ? ` · Publicado el ${dia(post.fecha)}` : post.anio ? ` · Publicado en ${post.anio}` : ''}
            {post.actualizado ? ` · Actualizado el ${dia(post.actualizado)}` : ''}
          </p>
        </div>
      </section>
      <article className="mx-auto max-w-3xl overflow-x-hidden px-5 py-10">
        <div className={PROSA} dangerouslySetInnerHTML={{ __html: post.html }} />
        <div className="mt-12 rounded-2xl bg-ink p-6 text-center text-white">
          <h2 className="text-xl font-extrabold">¿Quieres saber cómo aplica en tu caso?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/70">
            {SIN_IMSS.has(post.slug) ? 'Tu diagnóstico es gratis y llega a tu WhatsApp.' : 'Tu diagnóstico con tus datos del IMSS es gratis y llega a tu WhatsApp.'}
          </p>
          <a
            href="/i/blog"
            className="mt-4 inline-block rounded-full bg-lime px-6 py-3 font-semibold text-ink hover:opacity-90"
          >
            Recibe tu diagnóstico gratis
          </a>
        </div>
      </article>
    </>
  );
}
