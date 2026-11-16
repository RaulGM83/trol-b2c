// Página de una guía de pilar (trol3.contenidos, tipo guia). La usan
// /pensiones/[slug] y /infonavit/[slug].
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { publicadoPorSlug, datosEstructurados } from '@/lib/blog/contenido';
import { CuerpoContenido } from '@/components/sitio/CuerpoContenido';
import { JsonLd } from '@/components/sitio/Bloques';

type Pilar = 'pensiones' | 'infonavit';
const NOMBRE: Record<Pilar, string> = { pensiones: 'Pensiones', infonavit: 'Infonavit' };

export async function metadataGuia(pilar: Pilar, slug: string): Promise<Metadata> {
  const c = await publicadoPorSlug(slug, 'guia');
  if (!c || c.pilar !== pilar) return {};
  const url = `https://trol.mx/${pilar}/${c.slug}`;
  return {
    title: `${c.titulo} · El Trol Financiero`,
    description: c.resumen,
    alternates: { canonical: url },
    openGraph: { type: 'article', title: c.titulo, description: c.resumen, url, publishedTime: c.publicado_en ?? undefined, modifiedTime: c.actualizado_en ?? c.publicado_en ?? undefined },
  };
}

export async function PaginaGuia({ pilar, slug }: { pilar: Pilar; slug: string }) {
  const c = await publicadoPorSlug(slug, 'guia');
  if (!c || c.pilar !== pilar) notFound();
  const url = `https://trol.mx/${pilar}/${c.slug}`;
  return (
    <>
      {datosEstructurados(c, url).map((d, i) => <JsonLd key={i} data={d} />)}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: NOMBRE[pilar], item: `https://trol.mx/${pilar}` },
            { '@type': 'ListItem', position: 2, name: c.titulo, item: url },
          ],
        }}
      />
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-3xl px-5 py-12">
          <Link href={`/${pilar}`} className="text-sm text-white/70 hover:text-lime">← {NOMBRE[pilar]}</Link>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight">{c.titulo}</h1>
        </div>
      </section>
      <CuerpoContenido c={c} />
    </>
  );
}
