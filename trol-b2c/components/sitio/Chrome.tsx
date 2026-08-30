import Link from 'next/link';

// Header y footer del sitio público (trol.mx). Se comparten entre las páginas
// de marketing (app/sitio) y la calculadora pública (/calcula) para que toda
// la experiencia se sienta un mismo sitio.
export function SitioHeader() {
  return (
    <header className="bg-ink">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <Link href="/" aria-label="El Trol Financiero — inicio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marca/logo-trol-blanco.svg" alt="El Trol Financiero" className="h-9 w-auto" />
        </Link>
        <nav className="flex items-center gap-5 text-sm text-white/90">
          <Link href="/asesorias" className="hidden hover:text-lime sm:block">
            Asesorías
          </Link>
          <Link href="/blog" className="hidden hover:text-lime sm:block">
            Blog
          </Link>
          <Link href="/calcula" className="hidden hover:text-lime sm:block">
            Calculadora
          </Link>
          <a href="https://app.trol.mx/login?next=/mi" className="hidden hover:text-lime sm:block">
            Mi expediente
          </a>
          <a
            href="/i/sitio"
            className="rounded-full bg-lime px-4 py-2 font-semibold text-ink hover:opacity-90"
          >
            Escríbenos
          </a>
        </nav>
      </div>
      {/* En móvil los links de arriba van ocultos: segunda fila propia. */}
      <nav className="mx-auto flex max-w-5xl items-center gap-5 overflow-x-auto px-5 pb-3 text-sm text-white/90 sm:hidden">
        <Link href="/asesorias" className="shrink-0 hover:text-lime">Asesorías</Link>
        <Link href="/blog" className="shrink-0 hover:text-lime">Blog</Link>
        <Link href="/calcula" className="shrink-0 hover:text-lime">Calculadora</Link>
        <a href="https://app.trol.mx/login?next=/mi" className="shrink-0 font-semibold text-lime">Mi expediente</a>
      </nav>
    </header>
  );
}

export function SitioFooter() {
  return (
    <footer className="bg-ink text-white/80">
      <div className="mx-auto max-w-5xl px-5 py-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/logo-trol-blanco.svg" alt="El Trol Financiero" className="h-8 w-auto" />
        <div className="mt-6 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/asesorias" className="hover:text-lime">
              Asesorías
            </Link>
            <Link href="/blog" className="hover:text-lime">
              Blog
            </Link>
            <Link href="/calcula" className="hover:text-lime">
              Calcula tu pensión
            </Link>
            <a href="https://app.trol.mx/login?next=/mi" className="hover:text-lime">
              Mi expediente
            </a>
            <a href="https://landing.trol.mx/privacidad/" className="hover:text-lime">
              Aviso de privacidad
            </a>
          </div>
          <p className="text-white/60">© 2026 El Trol Financiero</p>
        </div>
      </div>
    </footer>
  );
}
