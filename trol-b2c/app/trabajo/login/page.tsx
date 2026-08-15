import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LoginEmailForm } from './form';

export const dynamic = 'force-dynamic';

export default async function TrabajoLogin() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect('/trabajo');
  return (
    <main className="mx-auto max-w-md px-5 py-12">
      <div className="mb-6 text-2xl font-extrabold tracking-tight">tr<span className="text-lime">o</span>l · equipo</div>
      <h1 className="mb-1 text-xl font-extrabold">Entrar al espacio de trabajo</h1>
      <p className="mb-6 text-sm text-muted">Te mandamos un enlace de acceso a tu correo @trol.mx.</p>
      <LoginEmailForm />
    </main>
  );
}
