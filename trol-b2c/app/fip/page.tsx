import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { waInvitacionBot } from '@/lib/whatsapp';
import { FipForm, LogoFip } from './fip-form';

export const dynamic = 'force-dynamic';

// 190 · Landing del Foro Internacional de Pensiones (claude/88). El organizador manda este
// link (y su QR) a cada registrado días antes del evento. La persona se da de alta sola:
// celular por OTP, CURP y consentimiento; la consulta al IMSS arranca en ese momento
// (Belvo primero, Jordan si no sale) y su cuenta queda con el experto del evento y la
// sesión de 20 min de cortesía. Quien prefiera WhatsApp tiene el mismo alta por chat
// con la ref del evento (wa.me con ref:fip2026). El QR de las tarjetas (/i/fip2026) cae aquí.
const CODIGO = 'fip2026';
const TITULO = 'Tu asesoría básica de pensión, cortesía del Foro Internacional de Pensiones';
const DESC = 'Tu información real del IMSS, una sesión de 20 minutos con un experto de Trol y cashback a tu AFORE con Millas para el Retiro.';

export const metadata: Metadata = {
  title: 'Foro Internacional de Pensiones × Trol · Tu asesoría básica',
  description: DESC,
  openGraph: { title: TITULO, description: DESC, images: [{ url: '/og.png', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', title: TITULO, description: DESC },
};

type Marca = { codigo: string; etiqueta: string | null; patrocinio?: string; aliado?: string };

/** El clic vale como denominador del embudo (igual que /i/<codigo>); nunca rompe la página. */
async function registrarVisita(db: ReturnType<typeof createClient>) {
  try {
    const h = headers();
    const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip')?.trim() || null;
    const llamada = Promise.resolve(db.schema('trol3').rpc('registrar_clic', {
      p_codigo: CODIGO, p_user_agent: h.get('user-agent')?.slice(0, 500) ?? null, p_referer: h.get('referer')?.slice(0, 500) ?? null, p_ip: ip,
    })).then(() => undefined, () => undefined);
    await Promise.race([llamada, new Promise<void>((r) => setTimeout(r, 500))]);
  } catch {}
}

const QUE_TE_LLEVAS = [
  { t: 'Tu información real del IMSS', d: 'Semanas cotizadas, salario registrado, tu ley (73 o 97) y cuánto te tocaría hoy de pensión. Sin trámites: con tu CURP lo consultamos nosotros.' },
  { t: 'Una sesión de 20 minutos con un experto', d: 'Cortesía del Foro. Revisamos tu caso contigo: qué te conviene, qué no, y cuál es tu mejor jugada.' },
  { t: 'Cashback a tu AFORE con Millas para el Retiro', d: 'Lo que después decidas invertir en Trol regresa a tu ahorro para el retiro: 10% en asesorías y 5% en gestorías.' },
];

const PASOS = [
  ['Regístrate aquí', 'Tu celular, tu CURP y listo. Dos minutos.'],
  ['Consultamos tu historial', 'Directo con el IMSS. Suele tardar minutos; si tarda más, te avisamos por WhatsApp.'],
  ['Entra a tu cuenta', 'Ves tus números, contestas cinco preguntas y agendas tu sesión con tu experto.'],
];

export default async function Fip() {
  const db = createClient();
  const [{ data: marca }, { data: { user } }] = await Promise.all([
    db.schema('trol3').rpc('marca_evento', { p_codigo: CODIGO }),
    db.auth.getUser(),
  ]);
  await registrarVisita(db);
  const m = (marca ?? {}) as Marca;
  const waUrl = waInvitacionBot(CODIGO);
  const telVerificado = (user?.phone ?? '').replace(/\D/g, '').slice(-10);

  return (
    <main className="min-h-screen bg-cream text-ink">
      {/* Franja co-brandeada */}
      <header className="bg-ink text-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/logo-trol-blanco.svg" alt="El Trol Financiero" className="h-9 w-auto" />
          <div className="flex items-center gap-5">
            <LogoFip variante="blanco" className="h-9" />
            <span className="hidden h-6 w-px bg-white/20 sm:block" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca/millas-blanco.png" alt="Millas para el Retiro" className="h-8 w-auto" />
          </div>
        </div>
      </header>

      {/* Hero + formulario */}
      <section className="bg-ink text-white">
        <div className="mx-auto grid max-w-5xl gap-10 px-5 pb-14 pt-10 sm:pt-14 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-lime">{m.etiqueta ?? 'Foro Internacional de Pensiones'}</p>
            <h1 className="mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">Tu asesoría básica de pensión, cortesía del Foro</h1>
            <p className="mt-4 max-w-xl text-lg text-white/80">
              El {m.patrocinio ?? 'Foro Internacional de Pensiones y Millas para el Retiro'} te regalan lo que normalmente cuesta: tu información real del IMSS y 20 minutos con un experto de Trol para saber qué hacer con ellos.
            </p>
            <ul className="mt-8 space-y-5">
              {QUE_TE_LLEVAS.map((x) => (
                <li key={x.t} className="flex gap-3">
                  <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lime text-xs font-black text-ink">✓</span>
                  <div>
                    <div className="font-bold">{x.t}</div>
                    <div className="text-sm text-white/70">{x.d}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div id="registro" className="lg:pt-2">
            <FipForm codigo={CODIGO} telVerificado={telVerificado} waUrl={waUrl} />
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="mx-auto max-w-5xl px-5 py-14">
        <h2 className="text-2xl font-extrabold">Así de simple</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {PASOS.map(([t, d], i) => (
            <li key={t} className="rounded-2xl border border-line bg-white p-5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-lime text-sm font-black">{i + 1}</span>
              <div className="mt-3 font-bold">{t}</div>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 rounded-2xl border border-line bg-white p-5 sm:flex sm:items-center sm:justify-between sm:gap-6">
          <div>
            <div className="font-bold">¿Prefieres empezar por WhatsApp?</div>
            <p className="mt-1 text-sm text-muted">Lukas, nuestro asistente, te da de alta por chat con el mismo beneficio del Foro. Te toma el mismo par de minutos.</p>
          </div>
          <a href={waUrl} className="mt-4 inline-block shrink-0 rounded-full border-2 border-ink px-5 py-2.5 text-sm font-bold hover:bg-ink hover:text-white sm:mt-0">
            Abrir el chat con Lukas
          </a>
        </div>
      </section>

      {/* Millas */}
      <section className="border-t border-line bg-white">
        <div className="mx-auto max-w-5xl px-5 py-14 lg:grid lg:grid-cols-[auto_1fr] lg:items-center lg:gap-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/millas-color.png" alt="Millas para el Retiro" className="h-14 w-auto" />
          <div className="mt-6 lg:mt-0">
            <h2 className="text-2xl font-extrabold">Cada peso que inviertes en tu pensión, regresa a tu retiro</h2>
            <p className="mt-2 max-w-2xl text-muted">
              Con Millas para el Retiro, lo que pagues en Trol se convierte en ahorro para tu AFORE: <b className="text-ink">10% de cashback en asesorías</b> y <b className="text-ink">5% en gestorías</b>. Desde tu cuenta verás cuánto llevas y cómo depositarlo.
            </p>
          </div>
        </div>
      </section>

      <footer className="bg-ink px-5 py-8 text-center text-xs text-white/60">
        El Trol Financiero · Asesoría pensional independiente. La consulta al IMSS se hace con tu autorización y sólo para tu asesoría.{' '}
        <a href="https://landing.trol.mx/privacidad/" className="underline hover:text-lime" target="_blank" rel="noopener noreferrer">Aviso de privacidad</a>
      </footer>
    </main>
  );
}
