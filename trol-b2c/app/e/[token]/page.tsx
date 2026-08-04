// Entrada por link de campaña (Tako / envíos automatizados).
// token = uuid del cliente (opaco; nunca exponemos el teléfono en la URL).
// Prellena el celular del lado servidor, registra la apertura y manda al OTP.
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PersistRef } from '@/components/PersistRef';
import { createAdminClient } from '@/lib/supabase/admin';
import { LoginForm } from '@/app/login/login-form';

export const dynamic = 'force-dynamic';

const soloDigitos = (s: string) => s.replace(/\D/g, '');

export default async function EntradaCampania({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { c?: string; ref?: string };
}) {
  const campania = (searchParams.c ?? 'reactivacion').slice(0, 40);
  // Un link de campaña puede traer también quién lo refirió (?ref=<cliente_id>).
  // Se re-siembra la cookie para que la atribución sobreviva al salto por el
  // OTP (ver web/ATRIBUCION_DISENO.md). La escritura la hace <PersistRef/> en
  // cliente: desde un Server Component, cookies().set() lanza en Next 14.
  const rc = (searchParams.ref ?? '').slice(0, 64);
  // Campaña Compara Afore → la experiencia aterriza en /comparativo.
  const esComparaAfore = campania.startsWith('comparaafore');
  const destino = esComparaAfore ? '/comparativo' : '/diagnostico';

  // Si ya hay sesión en este dispositivo, directo a su destino.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect(destino);

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
      {rc && <PersistRef codigo={rc} />}
      <header className="mb-6 flex items-center gap-2">
        <span className="text-2xl font-extrabold tracking-tight">
          tr<span className="text-lime">o</span>l
        </span>
      </header>

      {/* Aviso según campaña */}
      {esComparaAfore ? (
        <div className="mb-5 rounded-2xl bg-lime p-5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink/70">Tu comparativo está listo</div>
          <h1 className="mt-1 text-xl font-extrabold leading-tight text-ink">
            {nombre ? `${nombre}, hicimos números con tu historia laboral` : 'Hicimos números con tu historia laboral'}
          </h1>
          <p className="mt-1 text-sm text-ink/80">
            Simulamos tu ahorro para el retiro en cada AFORE, con tus aportaciones reales y los precios históricos de
            CONSAR. Entra con tu celular para ver tu comparativo personalizado.
          </p>
        </div>
      ) : (
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
      )}

      <LoginForm initialTel={telPrefill} next={destino} />

      <p className="mt-6 text-center text-[11px] leading-relaxed text-muted">
        El trámite ante el IMSS es gratis; nunca pedimos anticipos. Entras con un código que te enviamos por SMS.
      </p>
    </main>
  );
}
