// Piezas compartidas de las páginas pilar de trol.mx.
import Link from 'next/link';
import { mdToHtml } from '@/lib/blog/md';
import { pesos, rendimientoBruto, type Inmueble } from '@/lib/sitio/inmuebles';

export type Faq = { pregunta: string; respuesta: string };

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}

export function Hero({ kicker, titulo, texto, children }: { kicker?: string; titulo: React.ReactNode; texto: string; children?: React.ReactNode }) {
  return (
    <section className="bg-ink text-white">
      <div className="mx-auto max-w-5xl px-5 pb-14 pt-12 sm:pb-16 sm:pt-16">
        {kicker ? <p className="font-semibold uppercase tracking-wide text-lime">{kicker}</p> : null}
        <h1 className="mt-2 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">{titulo}</h1>
        <p className="mt-4 max-w-2xl text-lg text-white/80">{texto}</p>
        {children ? <div className="mt-8 flex flex-wrap gap-3">{children}</div> : null}
      </div>
    </section>
  );
}

export const botonLima = 'rounded-full bg-lime px-6 py-3 font-semibold text-ink hover:opacity-90';
export const botonClaro = 'rounded-full border border-white/30 px-6 py-3 font-semibold text-white hover:border-lime hover:text-lime';

export function Seccion({ titulo, intro, children, blanco = false }: { titulo: string; intro?: string; children: React.ReactNode; blanco?: boolean }) {
  return (
    <section className={blanco ? 'border-y border-line bg-white' : ''}>
      <div className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="text-2xl font-extrabold sm:text-3xl">{titulo}</h2>
        {intro ? <p className="mt-3 max-w-2xl text-muted">{intro}</p> : null}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

const PROSA_FAQ = '[&_p]:mt-2 [&_p]:leading-relaxed [&_a]:underline [&_strong]:font-semibold [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5';

export function Preguntas({ items }: { items: Faq[] }) {
  if (!items.length) return null;
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: items.map((q) => ({ '@type': 'Question', name: q.pregunta, acceptedAnswer: { '@type': 'Answer', text: q.respuesta } })),
        }}
      />
      <div className="divide-y divide-line rounded-2xl border border-line bg-white">
        {items.map((q) => (
          <div key={q.pregunta} className="p-5">
            <h3 className="font-bold">{q.pregunta}</h3>
            <div className={`text-sm ${PROSA_FAQ}`} dangerouslySetInnerHTML={{ __html: mdToHtml(q.respuesta) }} />
          </div>
        ))}
      </div>
    </>
  );
}

export function TarjetaGuia({ href, titulo, texto, pronto = false }: { href?: string; titulo: string; texto: string; pronto?: boolean }) {
  const cuerpo = (
    <>
      <h3 className="font-bold leading-snug">{titulo}</h3>
      <p className="mt-2 text-sm text-muted">{texto}</p>
      <span className="mt-4 inline-block text-sm font-semibold">{pronto || !href ? <span className="text-muted">Guía en preparación</span> : <span className="underline">Leer la guía</span>}</span>
    </>
  );
  return href && !pronto ? (
    <Link href={href} className="block rounded-2xl border border-line bg-white p-6 transition hover:border-ink">{cuerpo}</Link>
  ) : (
    <div className="rounded-2xl border border-line bg-white p-6">{cuerpo}</div>
  );
}

export function TarjetaInmueble({ i }: { i: Inmueble }) {
  const rend = rendimientoBruto(i);
  return (
    <Link href={`/infonavit/inmuebles/${i.slug}`} className="block rounded-2xl border border-line bg-white p-6 transition hover:border-ink">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-bold leading-snug">{i.nombre}</h3>
        {!i.disponible ? <span className="shrink-0 rounded-full bg-cream px-2 py-0.5 text-xs font-semibold">Agotado</span> : null}
      </div>
      <p className="mt-1 text-sm text-muted">{i.ubicacion}{i.m2 ? ` · ${i.m2} m²` : ''}</p>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <div><dt className="text-xs text-muted">Precio</dt><dd className="font-bold">{pesos(i.precio)}</dd></div>
        <div><dt className="text-xs text-muted">Renta estimada</dt><dd className="font-bold">{i.renta ? `${pesos(i.renta)}/mes` : '—'}</dd></div>
        <div><dt className="text-xs text-muted">Rendimiento bruto</dt><dd className="font-bold">{rend ?? '—'}</dd></div>
      </dl>
    </Link>
  );
}

export function CierreWhatsApp({ titulo, texto, boton, href }: { titulo: string; texto?: string; boton: string; href: string }) {
  return (
    <section className="bg-ink text-white">
      <div className="mx-auto max-w-5xl px-5 py-16 text-center">
        <h2 className="text-2xl font-extrabold sm:text-3xl">{titulo}</h2>
        {texto ? <p className="mx-auto mt-3 max-w-xl text-white/70">{texto}</p> : null}
        <a href={href} className={`mt-6 inline-block ${botonLima}`}>{boton}</a>
      </div>
    </section>
  );
}
