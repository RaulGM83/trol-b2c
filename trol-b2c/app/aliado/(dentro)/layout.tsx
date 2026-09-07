// Marco del espacio del aliado. Deliberadamente distinto al del equipo: aquí
// no hay buscador, ni lista de trabajo, ni nada que sugiera que puede entrar a
// un expediente. Lo que ve es lo que le toca.
import { requireAliado } from '@/lib/trol3/server';
import { Toaster } from '@/components/ui/sonner';

export const dynamic = 'force-dynamic';
export const metadata = { title: { default: 'Aliados · Trol', template: '%s' } };

export default async function AliadoLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAliado();
  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-10 border-b border-line bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-4 py-3">
          <span className="rounded-lg bg-ink px-2 py-0.5 text-lg font-extrabold tracking-tight text-white">
            <img src="/marca/logo-trol-blanco.svg" alt="Trol financiero" className="inline-block h-[1.35em] w-auto align-middle" />
          </span>
          <span className="text-sm font-semibold">Aliados</span>
          <span className="ml-auto text-xs text-muted">
            {a.nombre}
            {a.empresa ? ` · ${a.empresa}` : ''}
          </span>
          <form action="/aliado/salir" method="post">
            <button className="text-xs text-muted underline">salir</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
