import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { POSTS, porSlug } from '@/lib/blog/posts';

export function generateStaticParams() {
  return POSTS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const post = porSlug(params.slug);
  if (!post) return {};
  return {
    title: `${post.titulo} · El Trol Financiero`,
    description: post.descripcion,
    alternates: { canonical: `https://trol.mx/blog/${post.slug}` },
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

export default function BlogPost({ params }: { params: { slug: string } }) {
  const post = porSlug(params.slug);
  if (!post) notFound();
  return (
    <>
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-3xl px-5 py-12">
          <Link href="/blog" className="text-sm text-white/70 hover:text-lime">
            ← Todas las guías
          </Link>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight">{post.titulo}</h1>
        </div>
      </section>
      <article className="mx-auto max-w-3xl overflow-x-hidden px-5 py-10">
        <div className={PROSA} dangerouslySetInnerHTML={{ __html: post.html }} />
        <div className="mt-12 rounded-2xl bg-ink p-6 text-center text-white">
          <h2 className="text-xl font-extrabold">¿Quieres saber cómo aplica en tu caso?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/70">
            Tu diagnóstico con datos oficiales del IMSS es gratis y llega a tu WhatsApp.
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
