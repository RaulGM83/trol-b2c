import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { inmueblesSitio, pesos, rendimientoBruto, fechaPrecios } from '@/lib/sitio/inmuebles';
import { metaSitio } from '@/lib/sitio/meta';
import { JsonLd, botonLima } from '@/components/sitio/Bloques';

// Una página por inmueble del catálogo. Si cambia el precio, la renta o la ficha
// en /trabajo/proyectos, esta página cambia sola (ISR 5 min).
export const revalidate = 300;

async function cargar(slug: string) {
  const todos = await inmueblesSitio();
  return todos.find((i) => i.slug === slug) ?? null;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const i = await cargar(params.slug);
  if (!i) return {};
  const lugar = i.ubicacion.split('·')[0].trim();
  return metaSitio({
    titulo: `${i.nombre} en ${lugar} con Infonavit · El Trol Financiero`,
    descripcion: `${i.nombre} en ${i.ubicacion}. Precio ${pesos(i.precio)}${i.renta ? `, renta estimada ${pesos(i.renta)} al mes` : ''}. Se compra con tu saldo y tu crédito Infonavit.`,
    ruta: `/infonavit/inmuebles/${i.slug}`,
  });
}

export default async function PaginaInmueble({ params }: { params: { slug: string } }) {
  const i = await cargar(params.slug);
  if (!i) notFound();
  const rend = rendimientoBruto(i);
  const alDia = fechaPrecios([i]);
  const wa = `/i/inm_${i.clave}`;
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          // Anuncio inmobiliario, no «Product»: con Product, Google lo evalúa como artículo
          // de tienda y pide envío, devoluciones, código de barras y reseñas (Search Console, 20-nov-2026).
          '@type': 'RealEstateListing',
          name: `${i.nombre} · ${i.ubicacion}`,
          url: `https://trol.mx/infonavit/inmuebles/${i.slug}`,
          description: `${i.nombre} en ${i.ubicacion}. Se compra con tu saldo y tu crédito Infonavit.`,
          ...(i.actualizado ? { dateModified: i.actualizado } : {}),
          about: {
            '@type': 'Accommodation',
            name: i.nombre,
            address: i.ubicacion,
            ...(i.m2 ? { floorSize: { '@type': 'QuantitativeValue', value: i.m2, unitCode: 'MTK' } } : {}),
          },
          offers: { '@type': 'Offer', price: i.precio, priceCurrency: 'MXN', availability: i.disponible ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut' },
        }}
      />
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-3xl px-5 py-12">
          <Link href="/infonavit#inmuebles" className="text-sm text-white/70 hover:text-lime">← Inmuebles</Link>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight">{i.nombre}</h1>
          <p className="mt-2 text-white/80">{i.ubicacion}{i.m2 ? ` · ${i.m2} m²` : ''}</p>
          {!i.disponible ? <p className="mt-3 inline-block rounded-full bg-white/10 px-3 py-1 text-sm">Agotado por ahora. Escríbenos y te avisamos cuando haya uno igual.</p> : null}
        </div>
      </section>
      <article className="mx-auto max-w-3xl px-5 py-10">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-line bg-white p-5"><dt className="text-xs text-muted">Precio</dt><dd className="mt-1 text-2xl font-extrabold">{pesos(i.precio)}</dd><p className="mt-1 text-xs text-muted">Trol paga los gastos notariales</p></div>
          <div className="rounded-2xl border border-line bg-white p-5"><dt className="text-xs text-muted">Renta estimada</dt><dd className="mt-1 text-2xl font-extrabold">{i.renta ? pesos(i.renta) : '—'}</dd><p className="mt-1 text-xs text-muted">Al mes, {i.renta_estimada ? 'estimada con base en la zona' : 'observada en la zona'}</p></div>
          <div className="rounded-2xl border border-line bg-white p-5"><dt className="text-xs text-muted">Rendimiento bruto estimado</dt><dd className="mt-1 text-2xl font-extrabold">{rend ?? '—'}</dd><p className="mt-1 text-xs text-muted">Antes de gastos, impuestos y meses sin renta</p></div>
        </dl>
        <p className="mt-4 text-sm text-muted">{alDia ? `Precio al ${alDia}. ` : ''}Las cifras son iniciales y estimadas: la renta y la plusvalía no están garantizadas. El rendimiento es la renta de un año entre el precio, antes de gastos, impuestos y meses sin renta.</p>

        <h2 className="mt-10 text-xl font-extrabold">Cómo se compra</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>Con tu saldo de vivienda y tu crédito Infonavit, sin enganche de tu bolsa.</li>
          <li>Queda escriturado a tu nombre ante notario.</li>
          <li>Trol no cobra porcentaje de tu saldo y paga los gastos notariales.</li>
          <li>Si tu crédito solo no alcanza, se puede sumar a otra persona que cotice.</li>
        </ul>

        {i.ficha_url ? (
          <p className="mt-8"><a href={i.ficha_url} target="_blank" rel="noopener" className="font-semibold underline">Descargar la ficha del inmueble (PDF)</a>, con fotos, comparables de renta de la zona y el detalle de gastos.</p>
        ) : null}

        <div className="mt-12 rounded-2xl bg-ink p-6 text-center text-white">
          <h2 className="text-xl font-extrabold">¿Te alcanza con tu Infonavit?</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/70">Te decimos cuánto te presta y te armamos tu cotización para este inmueble, por WhatsApp.</p>
          <a href={wa} className={`mt-4 inline-block ${botonLima}`}>Cotiza con tu saldo</a>
        </div>
        <p className="mt-6 text-sm"><Link href="/infonavit" className="underline">Cómo funciona invertir con tu Infonavit</Link></p>
      </article>
    </>
  );
}
