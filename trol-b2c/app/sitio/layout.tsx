import Link from 'next/link';
import { LOGO_TROL_BLANCO } from '@/lib/marca/logo';

// Layout del sitio público (trol.mx). Sustituye al CMS de HubSpot.
// El logo blanco va sobre bandas ink (#26282B), como manda el brandbook.
export default function SitioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="bg-ink">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link href="/" aria-label="El Trol Financiero — inicio">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_TROL_BLANCO} alt="El Trol Financiero" className="h-9 w-auto" />
          </Link>
          <nav className="flex items-center gap-5 text-sm text-white/90">
            <Link href="/asesorias" className="hidden hover:text-lime sm:block">
              Asesorías
            </Link>
            <a href="https://app.trol.mx/calcula" className="hidden hover:text-lime sm:block">
              Calculadora
            </a>
            <a
              href="/i/sitio"
              className="rounded-full bg-lime px-4 py-2 font-semibold text-ink hover:opacity-90"
            >
              Escríbenos
            </a>
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="bg-ink text-white/80">
        <div className="mx-auto max-w-5xl px-5 py-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_TROL_BLANCO} alt="El Trol Financiero" className="h-8 w-auto" />
          <div className="mt-6 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Link href="/asesorias" className="hover:text-lime">
                Asesorías
              </Link>
              <a href="https://app.trol.mx/calcula" className="hover:text-lime">
                Calcula tu pensión
              </a>
              <a href="https://landing.trol.mx/privacidad/" className="hover:text-lime">
                Aviso de privacidad
              </a>
            </div>
            <p className="text-white/60">© 2026 El Trol Financiero</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
