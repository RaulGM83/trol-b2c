import type { Metadata } from 'next';
import Link from 'next/link';
import { POSTS } from '@/lib/blog/posts';
import { articulosPublicados } from '@/lib/blog/contenido';

// Los artículos nuevos viven en trol3.contenidos y se publican desde
// /trabajo/contenido; aparecen aquí solos (ISR 5 min). Los anteriores siguen en POSTS.
export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Blog · El Trol Financiero',
  description:
    'Guías prácticas sobre pensiones IMSS: Modalidad 40, requisitos, Infonavit, AFORE y cómo mejorar tu retiro.',
  alternates: { canonical: 'https://trol.mx/blog' },
};

export default async function BlogIndex() {
  const nuevos = await articulosPublicados();
  const enBase = new Set(nuevos.map((c) => c.slug));
  const tarjetas = [
    ...nuevos.map((c) => ({ slug: c.slug, titulo: c.titulo, descripcion: c.resumen })),
    ...POSTS.filter((p) => !enBase.has(p.slug)),
  ];
  return (
    <>
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-5xl px-5 py-12">
          <h1 className="text-3xl font-extrabold sm:text-4xl">
            Guías de <span className="text-lime">pensiones</span>
          </h1>
          <p className="mt-3 max-w-xl text-white/80">
            Lo esencial para entender y mejorar tu retiro, contado claro y al grano por el equipo Trol.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-5 py-12">
        <div className="grid gap-6 sm:grid-cols-2">
          {tarjetas.map((p) => (
            <Link
              key={p.slug}
              href={`/blog/${p.slug}`}
              className="rounded-2xl border border-line bg-white p-6 transition hover:border-ink"
            >
              <h2 className="font-bold leading-snug">{p.titulo}</h2>
              <p className="mt-2 text-sm text-muted">{p.descripcion}</p>
              <span className="mt-4 inline-block text-sm font-semibold text-ink underline">
                Leer guía
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
