import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'El Trol Financiero · Tu experto en pensiones',
  description:
    'Diagnóstico gratuito de tu pensión del IMSS con tus datos oficiales. Modalidad 40, Infonavit, AFORE y asesoría experta por WhatsApp.',
  alternates: { canonical: 'https://trol.mx' },
};

const PASOS = [
  {
    n: '1',
    titulo: 'Escríbenos por WhatsApp',
    texto: 'Con tu CURP consultamos tu información oficial del IMSS en minutos, sin trámites.',
  },
  {
    n: '2',
    titulo: 'Recibe tu diagnóstico gratis',
    texto: 'Cuánto te tocaría de pensión hoy, cuánto podría ser, y qué oportunidades tienes abiertas.',
  },
  {
    n: '3',
    titulo: 'Un experto te acompaña',
    texto: 'Te explicamos tu mejor jugada y te acompañamos en cada trámite hasta lograrla.',
  },
];

const SERVICIOS = [
  {
    titulo: 'Diagnóstico personalizado',
    texto: 'Evaluación gratuita de tu pensión actual contra tu pensión potencial, con datos oficiales.',
  },
  {
    titulo: 'Modalidad 40',
    texto: 'Calculamos si te conviene, cuánto aportar y cuándo, para multiplicar tu pensión Ley 73.',
  },
  {
    titulo: 'Infonavit y créditos',
    texto: 'Tu saldo de vivienda también es retiro: Mejoravit, Solución Hogar y devolución de subcuenta.',
  },
  {
    titulo: 'AFORE e inversiones',
    texto: 'Compara tu AFORE, ordena tu ahorro y protege lo que ya construiste.',
  },
];

const EQUIPO = [
  { nombre: 'Raúl Gallego Müller, CFA', rol: 'Director general' },
  { nombre: 'Mónica García', rol: 'Head Coach' },
  { nombre: 'Verónica Cervantes', rol: 'Éxito del cliente' },
];

export default function SitioHome() {
  return (
    <>
      {/* Hero sobre ink, continuación visual del header */}
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-5xl px-5 pb-16 pt-12 sm:pb-20 sm:pt-16">
          <h1 className="max-w-2xl text-4xl font-extrabold leading-tight sm:text-5xl">
            Tu experto en <span className="text-lime">pensiones</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-white/80">
            Usamos tu información oficial del IMSS para decirte cuánto te tocaría de pensión y cómo
            mejorarla. El diagnóstico es gratis y llega a tu WhatsApp.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="/i/sitio"
              className="rounded-full bg-lime px-6 py-3 font-semibold text-ink hover:opacity-90"
            >
              Recibe tu diagnóstico gratis
            </a>
            <a
              href="https://app.trol.mx/calcula"
              className="rounded-full border border-white/30 px-6 py-3 font-semibold text-white hover:border-lime hover:text-lime"
            >
              Calcula tu pensión
            </a>
          </div>
          <div className="mt-12 grid max-w-xl grid-cols-2 gap-6 border-t border-white/15 pt-8">
            <div>
              <p className="text-3xl font-extrabold text-lime">15,000+</p>
              <p className="text-sm text-white/70">personas con diagnóstico Trol</p>
            </div>
            <div>
              <p className="text-3xl font-extrabold text-lime">hasta 8x</p>
              <p className="text-sm text-white/70">de mejora en la pensión proyectada</p>
            </div>
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="mx-auto max-w-5xl px-5 py-16">
        <h2 className="text-2xl font-extrabold sm:text-3xl">Así de simple</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {PASOS.map((p) => (
            <div key={p.n} className="rounded-2xl border border-line bg-white p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lime font-extrabold text-ink">
                {p.n}
              </span>
              <h3 className="mt-4 font-bold">{p.titulo}</h3>
              <p className="mt-2 text-sm text-muted">{p.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Servicios */}
      <section className="border-y border-line bg-white">
        <div className="mx-auto max-w-5xl px-5 py-16">
          <h2 className="text-2xl font-extrabold sm:text-3xl">En qué te ayudamos</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            {SERVICIOS.map((s) => (
              <div key={s.titulo} className="rounded-2xl bg-cream p-6">
                <h3 className="font-bold">{s.titulo}</h3>
                <p className="mt-2 text-sm text-muted">{s.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Equipo */}
      <section className="mx-auto max-w-5xl px-5 py-16">
        <h2 className="text-2xl font-extrabold sm:text-3xl">Especialistas en IMSS, ISSSTE e Infonavit</h2>
        <p className="mt-3 max-w-xl text-muted">
          Más de 20 años de experiencia acompañando a personas a entender y mejorar su retiro,
          por WhatsApp y videollamada en todo México.
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {EQUIPO.map((m) => (
            <div key={m.nombre} className="rounded-2xl border border-line bg-white p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-lg font-extrabold text-lime">
                {m.nombre[0]}
              </span>
              <h3 className="mt-4 font-bold">{m.nombre}</h3>
              <p className="text-sm text-muted">{m.rol}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-5xl px-5 py-16 text-center">
          <h2 className="text-2xl font-extrabold sm:text-3xl">
            Un día te vas a pensionar. Hablemos hoy.
          </h2>
          <a
            href="/i/sitio"
            className="mt-6 inline-block rounded-full bg-lime px-8 py-3 font-semibold text-ink hover:opacity-90"
          >
            Empezar por WhatsApp
          </a>
        </div>
      </section>
    </>
  );
}
