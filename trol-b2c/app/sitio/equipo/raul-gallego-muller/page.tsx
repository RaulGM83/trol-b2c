import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/sitio/Bloques';

// Página de autor: da respaldo a los artículos y guías que firma.
export const metadata: Metadata = {
  title: 'Raúl Gallego Müller, CFA · El Trol Financiero',
  description: 'Director general de El Trol Financiero. Especialista en pensiones del IMSS, Modalidad 40, AFORE e Infonavit. Autor del Informe Trol.',
  alternates: { canonical: 'https://trol.mx/equipo/raul-gallego-muller' },
};

export default function Autor() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: 'Raúl Gallego Müller',
          honorificSuffix: 'CFA',
          jobTitle: 'Director general',
          worksFor: { '@type': 'Organization', name: 'El Trol Financiero', url: 'https://trol.mx' },
          url: 'https://trol.mx/equipo/raul-gallego-muller',
          knowsAbout: ['Pensiones del IMSS', 'Ley 73', 'Ley 97', 'Modalidad 40', 'AFORE', 'Infonavit'],
        }}
      />
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-3xl px-5 py-12">
          <p className="font-semibold uppercase tracking-wide text-lime">Equipo Trol</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight">Raúl Gallego Müller, CFA</h1>
          <p className="mt-2 text-white/80">Director general de El Trol Financiero</p>
        </div>
      </section>
      <article className="mx-auto max-w-3xl px-5 py-10 [&_p]:mt-3 [&_p]:leading-relaxed">
        <p>Raúl dirige El Trol Financiero, una asesoría independiente que ayuda a las personas a entender y mejorar su retiro con sus datos reales del IMSS, su AFORE y su Infonavit.</p>
        <p>Se especializa en pensiones de Ley 73 y Ley 97, Modalidad 40, AFORE e inversión inmobiliaria con crédito Infonavit. Es autor del <Link href="/blog" className="underline">Informe Trol</Link>, el análisis con miles de historiales reales sobre cómo afectó a los trabajadores el cambio a la Modalidad 40 de octubre de 2026.</p>
        <h2 className="mt-8 text-xl font-extrabold">Lo que escribe</h2>
        <p>Firma las guías de <Link href="/pensiones" className="underline">pensiones</Link> y de <Link href="/infonavit" className="underline">Infonavit</Link> de este sitio, y revisa el fondo de todo lo que se publica.</p>
      </article>
    </>
  );
}
