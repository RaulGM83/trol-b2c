// Entrada por link de campaña (Tako / envíos automatizados).
// token = uuid del cliente (opaco; nunca exponemos el teléfono en la URL).
// Prellena el celular del lado servidor, registra la apertura y manda al OTP.
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { LoginForm } from '@/app/login/login-form';

export const dynamic = 'force-dynamic';

const soloDigitos = (s: string) => s.replace(/\D/g, '');

export default async function EntradaCampania({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { c?: string };
}) {
  const campania = (searchParams.c ?? 'reactivacion').slice(0, 40);

  // Si ya hay sesión en este dispositivo, directo a su diagnóstico.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/diagnostico');

  // Resolver al cliente por id (service role) para prellenar y registrar la apertura.
  let telPrefill = '';
  let nombre = '';
  try {
    const admin = createAdminClient();
    const { data: cli } = await admin
      .from('clientes')
      .select('id, nombre, telefono')
      .eq('id', params.token)
      .maybeSingle();
    if (cli) {
      telPrefill = soloDigitos(cli.telefono ?? '').slice(-10);
      nombre = (cli.nombre ?? '').trim().split(/\s+/)[0] ?? '';
      await admin.from('links_campania').insert({ cliente_id: cli.id, campania, evento: 'apertura' });
    }
  } catch {
    // Atribución/prefill best-effort: si falla, igual mostramos el login.
  }

  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <header className="mb-6 flex items-center gap-2">
        <span className="text-2xl font-extrabold tracking-tight">
          tr<span className="text-lime">o</span>l
        </span>
      </header>

      {/* Aviso de la nueva herramienta */}
      <div className="mb-5 rounded-2xl bg-lime p-5">
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink/70">Nuevo en El Trol</div>
        <h1 className="mt-1 text-xl font-extrabold leading-tight text-ink">
          {nombre ? `${nombre}, ya puedes ver tu pensión en vivo` : 'Ya puedes ver tu pensión en vivo'}
        </h1>
        <p className="mt-1 text-sm text-ink/80">
          Estrenamos una calculadora interactiva: mueve las palancas (edad, semanas, Modalidad 40, ahorro) y mira
          cómo cambia tu pensión. Entra con tu celular para ver tu caso actualizado.
        </p>
      </div>

      <LoginForm initialTel={telPrefill} />

      <p className="mt-6 text-center text-[11px] leading-relaxed text-muted">
        El trámite ante el IMSS es gratis; nunca pedimos anticipos. Entras con un código que te enviamos por SMS.
      </p>
    </main>
  );
}
