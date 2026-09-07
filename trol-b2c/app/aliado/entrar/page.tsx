import { redirect } from 'next/navigation';
import { getAliado } from '@/lib/trol3/server';
import { createClient } from '@/lib/supabase/server';
import { AliadoLoginForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Entrar · Aliados Trol' };

const MENSAJE: Record<string, string> = {
  'sin-acceso':
    'Ese correo no está dado de alta como aliado. Escríbenos y lo damos de alta; la liga funciona con el correo exacto que registramos.',
};

export default async function AliadoEntrar({ searchParams }: { searchParams: { error?: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Si ya trae sesión buena, no tiene nada que hacer aquí.
  if (user && (await getAliado())) redirect('/aliado');

  const err = searchParams?.error;
  return (
    <main className="mx-auto max-w-md px-5 py-12">
      <div className="mb-6">
        <span className="rounded-lg bg-ink px-2.5 py-1 text-xl font-extrabold tracking-tight text-white">
          <img src="/marca/logo-trol-blanco.svg" alt="Trol financiero" className="inline-block h-[1.35em] w-auto align-middle" />
        </span>
        <span className="ml-2 text-sm text-muted">aliados</span>
      </div>
      <h1 className="mb-1 text-xl font-extrabold">Entra a ver a tus referidos</h1>
      <p className="mb-6 text-sm text-muted">
        Te mandamos una liga de acceso a tu correo. Sin contraseñas que recordar.
      </p>
      {err && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {MENSAJE[err] ?? err}
        </p>
      )}
      <AliadoLoginForm />
    </main>
  );
}
