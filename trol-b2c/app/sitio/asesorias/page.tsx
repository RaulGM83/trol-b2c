import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Asesoría de pensión IMSS · El Trol Financiero',
  description:
    'Toma el control de tu futuro: recibe gratis un reporte personalizado de tu pensión del IMSS y la mejor estrategia para asegurar tu retiro.',
  alternates: { canonical: 'https://trol.mx/asesorias' },
};

// Sustituye a la landing de HubSpot (lp.trol.mx/es-mx/asesorias). El formulario
// se reemplaza por el CTA a WhatsApp: el bot captura los datos y el clic queda
// medido por /i/asesorias (trol3.registrar_clic).
const PASOS = [
  {
    n: '1',
    titulo: 'Regístrate con tu CURP',
    texto: 'Por WhatsApp, en un par de minutos. Con ella consultamos tu información oficial del IMSS.',
  },
  {
    n: '2',
    titulo: 'Recibe tu reporte personalizado',
    texto: 'Tu situación actual, tu pensión proyectada y las alternativas reales para mejorarla.',
  },
  {
    n: '3',
    titulo: 'Acompañamiento experto',
    texto: 'Un asesor revisa contigo la estrategia y te acompaña hasta ejecutarla.',
  },
];

const RESUELVE = [
  '¿Cuánto me tocaría de pensión si me retiro hoy?',
  '¿Me conviene Modalidad 40 y cuánto tendría que aportar?',
  '¿Qué hago con mi Infonavit y mi AFORE?',
  '¿Me faltan semanas? ¿Cómo las recupero?',
];

export default function Asesorias() {
  return (
    <>
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-5xl px-5 pb-16 pt-12 sm:pb-20 sm:pt-16">
          <p className="font-semibold uppercase tracking-wide text-lime">Asesoría pensional</p>
          <h1 className="mt-2 max-w-2xl text-4xl font-extrabold leading-tight sm:text-5xl">
            Toma el control de tu futuro financiero
          </h1>
          <p className="mt-4 max-w-xl text-lg text-white/80">
            Recibe un reporte gratuito de tu situación actual y descubre, con un experto, las
            mejores alternativas para asegurar tu retiro.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="/i/asesorias"
              className="rounded-full bg-lime px-6 py-3 font-semibold text-ink hover:opacity-90"
            >
              Solicita tu reporte gratis
            </a>
            <a
              href="https://app.trol.mx/calcula"
              className="rounded-full border border-white/30 px-6 py-3 font-semibold text-white hover:border-lime hover:text-lime"
            >
              Primero quiero calcular
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-16">
        <h2 className="text-2xl font-extrabold sm:text-3xl">Cómo funciona</h2>
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

      <section className="border-y border-line bg-white">
        <div className="mx-auto max-w-5xl px-5 py-16">
          <h2 className="text-2xl font-extrabold sm:text-3xl">Tu reporte responde</h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {RESUELVE.map((q) => (
              <li key={q} className="rounded-xl bg-cream px-5 py-4 font-medium">
                {q}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-ink text-white">
        <div className="mx-auto max-w-5xl px-5 py-16 text-center">
          <h2 className="text-2xl font-extrabold sm:text-3xl">
            El primer paso toma dos minutos y no cuesta nada
          </h2>
          <a
            href="/i/asesorias"
            className="mt-6 inline-block rounded-full bg-lime px-8 py-3 font-semibold text-ink hover:opacity-90"
          >
            Empezar por WhatsApp
          </a>
        </div>
      </section>
    </>
  );
}
