import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'El Trol Financiero · Tu experto en pensiones',
  description:
    'Pon tu cuenta del IMSS en orden, aprovecha tus oportunidades (Modalidad 40, Infonavit, AFORE) y planea cómo incrementar tu retiro. Diagnóstico gratis por WhatsApp.',
  alternates: { canonical: 'https://trol.mx' },
};

// La home cuenta el viaje del cliente en 3 actos, que son el producto mismo:
// 1) poner la cuenta en orden → 2) aprovechar oportunidades → 3) planear el retiro.
const ACTOS = [
  {
    n: '1',
    kicker: 'Primero',
    titulo: 'Pon tu cuenta en orden',
    intro:
      'Todo empieza con tu diagnóstico gratuito: con tu CURP traemos tu información oficial del IMSS y revisamos que tu historia esté completa y sin errores.',
    puntos: [
      'Tus semanas cotizadas reales y tu ley (73 o 97)',
      'Errores de CURP o NSS que traban cualquier trámite',
      'Derechos suspendidos y cómo reactivarlos',
      'Tu AFORE y tu Infonavit en el mismo expediente',
    ],
    cta: { texto: 'Ordena tu cuenta gratis', href: '/i/sitio' },
  },
  {
    n: '2',
    kicker: 'Después',
    titulo: 'Aprovecha tus oportunidades',
    intro:
      'Con la cuenta en orden, tu expediente detecta qué te aplica hoy — y un asesor te lo explica sin tecnicismos.',
    puntos: [
      'Modalidad 40: si te conviene, cuánto aportar y cuándo',
      'Aprovecha tu Infonavit: liquidez, pagar deudas, comprar un inmueble o mejorar tu pensión',
      'Compara tu AFORE y protege lo que ya construiste',
      'Pensión hoy, si ya cumples los requisitos',
    ],
    cta: { texto: 'Descubre tus oportunidades', href: '/asesorias' },
  },
  {
    n: '3',
    kicker: 'Y siempre',
    titulo: 'Planea e incrementa tu retiro',
    intro:
      'Elige tu mejor jugada: escenarios por edad de retiro, cuánto podrías recibir y el plan para llegar ahí, acompañado en cada trámite.',
    puntos: [
      'Escenarios por edad: retirarte a los 60, 63 o 65 cambia todo',
      'Un plan de aportaciones que sí puedas sostener',
      'Tu asesor te acompaña hasta ver el depósito de tu pensión',
    ],
    cta: { texto: 'Calcula tus escenarios', href: '/calcula' },
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
              href="/calcula"
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

      {/* El viaje en 3 actos */}
      <section className="mx-auto max-w-5xl px-5 pt-16">
        <h2 className="text-2xl font-extrabold sm:text-3xl">Tu retiro, paso a paso</h2>
        <p className="mt-3 max-w-xl text-muted">
          No es un trámite: es un camino. Así te acompañamos de principio a fin.
        </p>
      </section>
      {ACTOS.map((a, i) => (
        <section key={a.n} className={i === 1 ? 'border-y border-line bg-white' : ''}>
          <div className="mx-auto grid max-w-5xl gap-8 px-5 py-14 sm:grid-cols-2 sm:items-center">
            <div className={i === 1 ? 'sm:order-2' : ''}>
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-lg font-extrabold text-lime">
                  {a.n}
                </span>
                <span className="text-xs font-bold uppercase tracking-wide text-muted">{a.kicker}</span>
              </div>
              <h3 className="mt-4 text-2xl font-extrabold">{a.titulo}</h3>
              <p className="mt-3 text-muted">{a.intro}</p>
              <a
                href={a.cta.href}
                className="mt-6 inline-block rounded-full bg-lime px-6 py-3 font-semibold text-ink hover:opacity-90"
              >
                {a.cta.texto}
              </a>
            </div>
            <ul className={`space-y-3 ${i === 1 ? 'sm:order-1' : ''}`}>
              {a.puntos.map((p) => (
                <li key={p} className={`flex items-start gap-3 rounded-xl p-4 ${i === 1 ? 'bg-cream' : 'border border-line bg-white'}`}>
                  <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-lime" />
                  <span className="text-sm font-medium">{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

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
