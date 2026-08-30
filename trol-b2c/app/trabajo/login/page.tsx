import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LoginEmailForm } from './form';

export const dynamic = 'force-dynamic';

export default async function TrabajoLogin({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/trabajo');
  const error = searchParams?.error;
  return (
    <main className="mx-auto max-w-md px-5 py-12">
      <div className="mb-6"><span className="rounded-lg bg-ink px-2.5 py-1 text-xl font-extrabold tracking-tight text-white"><img src="/marca/logo-trol-blanco.svg" alt="Trol financiero" className="inline-block h-[1.35em] w-auto align-middle" /></span> <span className="ml-2 text-sm text-muted">equipo</span></div>
      <h1 className="mb-1 text-xl font-extrabold">Entrar al espacio de trabajo</h1>
      <p className="mb-6 text-sm text-muted">Te mandamos un enlace de acceso a tu correo @trol.mx. Ábrelo en este mismo navegador y una sola vez.</p>
      {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <LoginEmailForm />
    </main>
  );
}
