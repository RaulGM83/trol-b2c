import type { Metadata } from 'next';
import Link from 'next/link';
import { POSTS } from '@/lib/blog/posts';
import { articulosPublicados } from '@/lib/blog/contenido';
import { JsonLd, botonLima } from '@/components/sitio/Bloques';

// Portada de trol.mx: dos pilares (pensiones e Infonavit) con la misma promesa:
// asesoría independiente con tus datos reales, por WhatsApp.
export const revalidate = 300;

export const metadata: Metadata = {
  title: 'El Trol Financiero · Tu pensión y tu Infonavit, trabajando para tu retiro',
  description:
    'Asesoría independiente para tu retiro: cuánto te toca de pensión del IMSS y cómo mejorarla, y cómo convertir tu Infonavit en un inmueble que se renta. Diagnóstico gratis por WhatsApp.',
  alternates: { canonical: 'https://trol.mx' },
};

const PUERTAS = [
  {
    kicker: 'Pensiones',
    titulo: 'Quiero saber cuánto me toca de pensión',
    texto: 'Con tu CURP consultamos tu historial en el IMSS y te decimos cuánto recibirías y qué puedes hacer para mejorarlo.',
    puntos: ['Tu ley, tus semanas y tu pensión estimada', 'Modalidad 40 con la regla nueva', 'Tu AFORE en el mismo expediente'],
    boton: 'Recibe tu diagnóstico gratis',
    wa: '/i/sitio',
    pilar: '/pensiones',
    pilarTexto: 'Todo sobre pensiones',
  },
  {
    kicker: 'Infonavit',
    titulo: 'Quiero usar mi Infonavit para invertir',
    texto: 'Con tu saldo y tu crédito puedes comprar un inmueble que se renta y complementa tu pensión, sin poner enganche de tu bolsa.',
    puntos: ['Cotización con tu saldo, sin costo', 'Inmuebles nuevos en CDMX, Edomex y Playa del Carmen', 'No cobramos porcentaje de tu saldo'],
    boton: 'Cotiza con tu saldo',
    wa: '/i/sitio_inf',
    pilar: '/infonavit',
    pilarTexto: 'Cómo funciona y qué inmuebles hay',
  },
];

const PASOS = [
  ['Nos escribes por WhatsApp', 'Sin formularios. Nos das tu CURP o tu NSS y empezamos.'],
  ['Consultamos tus datos', 'Tu historial del IMSS, tu AFORE y tu Infonavit: trabajamos con tus números, no con promedios.'],
  ['Recibes un diagnóstico con cifras', 'Y un experto te explica tus opciones y te acompaña en lo que decidas.'],
];

const EQUIPO = [
  { nombre: 'Raúl Gallego Müller, CFA', rol: 'Director general', href: '/equipo/raul-gallego-muller' },
  { nombre: 'Mónica García', rol: 'Head Coach' },
  { nombre: 'Verónica Cervantes', rol: 'Éxito del cliente' },
];

export default async function SitioHome() {
  const nuevos = await articulosPublicados();
  const enBase = new Set(nuevos.map((c) => c.slug));
  const recientes = [
    ...nuevos.map((c) => ({ slug: c.slug, titulo: c.titulo, descripcion: c.resumen })),
    ...POSTS.filter((p) => !enBase.has(p.slug)),
  ].slice(0, 3);

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'El Trol Financiero',
          url: 'https://trol.mx',
          logo: 'https://trol.mx/marca/logo-trol.svg',
          description: 'Asesoría independiente en pensiones del IMSS, AFORE e inversión inmobiliaria con crédito Infonavit.',
          areaServed: 'MX',
        }}
      />
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-5xl px-5 pb-14 pt-12 sm:pt-16">
          <h1 className="max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
            Tu retiro tiene dos motores: <span className="text-lime">tu pensión y tu Infonavit</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/80">
            Asesoría independiente con tus datos reales, por WhatsApp. Te decimos dónde estás y qué puedes hacer hoy.
          </p>
        </div>
      </section>

      {/* Las dos puertas */}
      <section className="mx-auto -mt-6 max-w-5xl px-5 pb-6">
        <div className="grid gap-5 sm:grid-cols-2">
          {PUERTAS.map((p) => (
            <div key={p.kicker} className="flex flex-col rounded-2xl border border-line bg-white p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">{p.kicker}</p>
              <h2 className="mt-2 text-2xl font-extrabold leading-snug">{p.titulo}</h2>
              <p className="mt-3 text-muted">{p.texto}</p>
              <ul className="mt-4 space-y-2 text-sm">
                {p.puntos.map((x) => (
                  <li key={x} className="flex items-start gap-2">
                    <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-lime" />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap items-center gap-4 pt-2">
                <a href={p.wa} className={botonLima}>{p.boton}</a>
                <Link href={p.pilar} className="text-sm font-semibold underline">{p.pilarTexto}</Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Cómo trabajamos */}
      <section className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="text-2xl font-extrabold sm:text-3xl">Cómo trabajamos</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {PASOS.map(([t, d], i) => (
            <li key={t} className="rounded-2xl border border-line bg-white p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink font-extrabold text-lime">{i + 1}</span>
              <p className="mt-3 font-bold">{t}</p>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Prueba: el Informe Trol */}
      <section className="border-y border-line bg-white">
        <div className="mx-auto grid max-w-5xl gap-8 px-5 py-14 sm:grid-cols-2 sm:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Informe Trol</p>
            <h2 className="mt-2 text-2xl font-extrabold sm:text-3xl">Hablamos con datos</h2>
            <p className="mt-3 text-muted">
              Cuando el IMSS cambió la Modalidad 40 en octubre de 2026, pasamos más de 8,800 historiales reales por la regla de antes y la de ahora para saber quién pierde y cuánto.
            </p>
            <div className="mt-5 flex flex-col gap-2 text-sm font-semibold">
              <Link href="/blog/informe-trol-1-cierre-modalidad-40" className="underline">Informe Trol #1: el día que el IMSS cerró la Modalidad 40</Link>
              <Link href="/blog/informe-trol-2-cuanto-perdio-cada-quien" className="underline">Informe Trol #2: cuánto perdió cada quien</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div><p className="text-3xl font-extrabold">15,000+</p><p className="text-sm text-muted">personas con diagnóstico Trol</p></div>
            <div><p className="text-3xl font-extrabold">8,800+</p><p className="text-sm text-muted">historiales analizados en el Informe Trol</p></div>
          </div>
        </div>
      </section>

      {/* Lo último */}
      <section className="mx-auto max-w-5xl px-5 py-14">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-extrabold sm:text-3xl">Lo último</h2>
          <Link href="/blog" className="text-sm font-semibold underline">Ver todo el blog</Link>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {recientes.map((p) => (
            <Link key={p.slug} href={`/blog/${p.slug}`} className="rounded-2xl border border-line bg-white p-6 transition hover:border-ink">
              <h3 className="font-bold leading-snug">{p.titulo}</h3>
              <p className="mt-2 text-sm text-muted">{p.descripcion}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Quiénes somos */}
      <section className="border-t border-line bg-white">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="text-2xl font-extrabold sm:text-3xl">Especialistas en IMSS, AFORE e Infonavit</h2>
          <p className="mt-3 max-w-xl text-muted">
            Más de 20 años de experiencia acompañando a personas a entender y mejorar su retiro, por WhatsApp y videollamada en todo México.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {EQUIPO.map((m) => (
              <div key={m.nombre} className="rounded-2xl border border-line p-6">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-lg font-extrabold text-lime">{m.nombre[0]}</span>
                <h3 className="mt-4 font-bold">{m.href ? <Link href={m.href} className="underline">{m.nombre}</Link> : m.nombre}</h3>
                <p className="text-sm text-muted">{m.rol}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-ink text-white">
        <div className="mx-auto max-w-5xl px-5 py-16 text-center">
          <h2 className="text-2xl font-extrabold sm:text-3xl">Un día te vas a pensionar. Hablemos hoy.</h2>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a href="/i/sitio" className={botonLima}>Mi pensión</a>
            <a href="/i/sitio_inf" className="rounded-full border border-white/30 px-6 py-3 font-semibold text-white hover:border-lime hover:text-lime">Mi Infonavit</a>
          </div>
        </div>
      </section>
    </>
  );
}
