import Link from 'next/link';
import { getMiembro } from '@/lib/trol3/server';
import { createClient } from '@/lib/supabase/server';
import { Toaster } from '@/components/ui/sonner';
import { NavGestion } from '@/components/trol3/NavGestion';

export const dynamic = 'force-dynamic';
export const metadata = { title: { default: 'Trol · equipo', template: '%s' } };

export default async function TrabajoLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const miembro = user ? await getMiembro() : null;
  if (!miembro) return <>{children}</>;
  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 z-10 border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/trabajo" className="rounded-lg bg-ink px-2 py-0.5 text-lg font-extrabold tracking-tight text-white"><img src="/marca/logo-trol-blanco.svg" alt="Trol financiero" className="inline-block h-[1.35em] w-auto align-middle" /></Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/trabajo/hoy" className="rounded-lg px-2 py-1 font-semibold hover:bg-cream">Hoy</Link>
            <Link href="/trabajo" className="rounded-lg px-2 py-1 hover:bg-cream">Clientes</Link>
            <Link href="/trabajo/lista" className="rounded-lg px-2 py-1 hover:bg-cream">Lista de trabajo</Link>
            <Link href="/trabajo/embudo" className="rounded-lg px-2 py-1 hover:bg-cream">Embudo</Link>
            <Link href="/trabajo/eventos" className="rounded-lg px-2 py-1 hover:bg-cream">Actividad</Link>
            <Link href="/trabajo/aliados" className="rounded-lg px-2 py-1 hover:bg-cream">Aliados</Link>
            <NavGestion />
          </nav>
          <form action="/trabajo" className="ml-auto">
            <input name="q" placeholder="Buscar teléfono, CURP o nombre" className="w-64 rounded-lg border border-line px-3 py-1.5 text-sm" />
          </form>
          <span className="text-xs text-muted">{miembro.nombre ?? miembro.email} · {miembro.roles.join(', ')}</span>
          <form action="/trabajo/salir" method="post"><button className="text-xs text-muted underline">salir</button></form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      <Toaster richColors position="top-right" />
    </div>
  );
}
