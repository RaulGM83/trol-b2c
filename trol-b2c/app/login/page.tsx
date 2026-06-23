import { redirect } from 'next/navigation';
import { LoginForm } from './login-form';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: { tel?: string } }) {
  // Si ya hay sesión en este dispositivo, no se pide el código de nuevo.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/diagnostico');

  const telPrefill = (searchParams.tel ?? '').replace(/\D/g, '').slice(-10);
  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <header className="mb-6 flex items-center gap-2">
        <span className="text-2xl font-extrabold tracking-tight">
          tr<span className="text-lime">o</span>l
        </span>
      </header>
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Tu pensión, en claro</h1>
      <p className="mb-6 text-sm text-muted">
        Entra con tu celular y revisa tu diagnóstico. El trámite ante el IMSS es gratis; nunca pedimos anticipos.
      </p>
      <LoginForm initialTel={telPrefill} />
    </main>
  );
}
