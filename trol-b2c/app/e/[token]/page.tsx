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
  // Campaña Compara Afore → la experiencia aterriza en /comparativo.
  const esComparaAfore = campania.startsWith('comparaafore');
  // Trol 3.0: el destino por defecto es el expediente del cliente (/mi).
  const destino = esComparaAfore ? '/comparativo' : '/mi';

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
    let { data: cli } = await admin
      .from('clientes')
      .select('id, nombre, telefono')
      .eq('id', params.token)
      .maybeSingle();
    if (!cli) {
      // token = persona trol3 (clientes nuevos que nacieron en el bot)
      const esUuid = /^[0-9a-f-]{36}$/i.test(params.token);
      const telToken = soloDigitos(params.token);
      let per: { id: string; nombre: string | null; legacy_cliente_id: string | null } | null = null;
      if (esUuid) {
        const r = await admin.schema('trol3').from('personas').select('id, nombre, legacy_cliente_id').eq('id', params.token).maybeSingle();
        per = r.data;
      } else if (/^[a-z0-9]+-[a-z0-9]+$/i.test(params.token)) {
        // Slug legible del expediente: <nombre>-<últimos 4 del teléfono>
        const r = await admin.schema('trol3').from('personas').select('id, nombre, legacy_cliente_id').eq('slug_expediente', params.token.toLowerCase()).maybeSingle();
        per = r.data;
      } else if (telToken.length >= 10) {
        // Tolerancia: el bot armó el link con el teléfono en vez del persona_id → resolver por contacto
        const { data: c } = await admin.schema('trol3').from('contactos').select('persona_id').eq('tipo', 'telefono').eq('normalizado', telToken.slice(-10)).order('principal', { ascending: false }).limit(1).maybeSingle();
        if (c) {
          const r = await admin.schema('trol3').from('personas').select('id, nombre, legacy_cliente_id').eq('id', c.persona_id).maybeSingle();
          per = r.data;
        }
      }
      if (per) {
        const { data: tel } = await admin.schema('trol3').from('contactos').select('valor').eq('persona_id', per.id).eq('tipo', 'telefono').order('principal', { ascending: false }).limit(1).maybeSingle();
        cli = { id: per.legacy_cliente_id ?? per.id, nombre: per.nombre, telefono: tel?.valor ?? '' } as { id: string; nombre: string | null; telefono: string | null };
        await admin.schema('trol3').rpc('emitir_evento', { p_persona: per.id, p_tipo: 'link_abierto', p_actor: 'cliente', p_actor_id: per.id, p_payload: { campania } });
      }
    }
    if (cli) {
      telPrefill = soloDigitos(cli.telefono ?? '').slice(-10);
      nombre = (cli.nombre ?? '').trim().split(/\s+/)[0] ?? '';
      try { await admin.from('links_campania').insert({ cliente_id: cli.id, campania, evento: 'apertura' }); } catch {}
    }
  } catch {
    // Atribución/prefill best-effort: si falla, igual mostramos el login.
  }

  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <header className="mb-6 flex items-center gap-2">
        <span className="rounded-lg bg-ink px-2.5 py-1 text-xl font-extrabold tracking-tight text-white">
          <img src="/marca/logo-trol-blanco.svg" alt="Trol financiero" className="inline-block h-[1.35em] w-auto align-middle" />
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
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink/70">Tu expediente en El Trol</div>
          <h1 className="mt-1 text-xl font-extrabold leading-tight text-ink">
            {nombre ? `${nombre}, tu pensión, en claro` : 'Tu pensión, en claro'}
          </h1>
          <p className="mt-1 text-sm text-ink/80">
            Aquí ves lo que te tocaría hoy, lo máximo que podrías lograr y los pasos para llegar, con tu experto a un mensaje de distancia. Entra con tu celular.
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
