import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ComparativoPersonal } from '@/components/ComparativoPersonal';
import { parseContrafactual, buildComparativoVM } from '@/lib/contrafactual';
import { generacionPorAnio } from '@/lib/afores';
import { WA } from '@/lib/whatsapp';
import Link from 'next/link';

// ============================================================================
// /comparativo — landing del gancho "Compara Afore" (magic link ?c=comparaafore_w1).
// Lee el bloque contrafactual calculado en batch + la AFORE declarada en la
// encuesta. Siempre requiere sesión: aquí no hay modo demo (son números
// personales simulados con la historia real del cliente).
// ============================================================================

const soloDigitos = (s: string) => s.replace(/\D/g, '');

export default async function ComparativoPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/comparativo');

  // Mismo patrón de match que lib/cliente.ts (auth_user_id → fallback teléfono).
  let { data: cliente } = await supabase
    .from('clientes')
    .select('id, nombre, fecha_nacimiento, calculo_pensional')
    .eq('auth_user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!cliente && user.phone) {
    const d10 = soloDigitos(user.phone).slice(-10);
    ({ data: cliente } = await supabase
      .from('clientes')
      .select('id, nombre, fecha_nacimiento, calculo_pensional')
      .or(`telefono.eq.${d10},telefono.eq.52${d10},telefono.eq.+52${d10},telefono.ilike.%${d10}`)
      .limit(1)
      .maybeSingle());
  }

  const bloque = cliente ? parseContrafactual(cliente.calculo_pensional) : null;

  if (!cliente || !bloque) {
    return (
      <main className="mx-auto max-w-xl px-5 py-6">
        <header className="mb-6 flex items-center gap-2">
          <span className="text-xl font-extrabold tracking-tight">
            tr<span className="text-lime">o</span>l
          </span>
          <span className="text-xs text-muted">· tu comparativo de AFORE</span>
        </header>
        <section className="rounded-2xl bg-ink p-6 text-white">
          <h1 className="text-xl font-extrabold">Tu comparativo aún no está listo</h1>
          <p className="mt-2 text-sm text-white/70">
            Necesitamos tu historia laboral del IMSS para simular tu ahorro en cada AFORE. Escríbenos y lo preparamos
            gratis.
          </p>
          <a
            href={WA.asesoriaBasica()}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 block rounded-xl bg-lime px-4 py-3 text-center text-sm font-bold text-ink"
          >
            Prepararlo por WhatsApp
          </a>
        </section>
        <Link
          href="/diagnostico"
          className="mt-3 block rounded-xl border border-line bg-white px-4 py-3 text-center text-sm font-bold text-ink"
        >
          Ir a mi diagnóstico
        </Link>
      </main>
    );
  }

  const vm = buildComparativoVM(bloque);

  // AFORE declarada en la encuesta (camino ligero de captura, +50 pts).
  let aforeActual: string | null = null;
  let encuestaContestada = false;
  try {
    const { data: enc } = await supabase
      .from('encuesta_afore')
      .select('afore')
      .eq('cliente_id', cliente.id)
      .maybeSingle();
    if (enc) {
      encuestaContestada = true;
      aforeActual = enc.afore ?? null;
    }
  } catch {
    /* sin encuesta */
  }

  // Saldo real ya declarado (prefill del SaldoRealCard).
  let saldoDeclarado: number | null = null;
  try {
    const { data: sd } = await supabase
      .from('saldos_declarados')
      .select('saldo_afore')
      .eq('cliente_id', cliente.id)
      .maybeSingle();
    if (sd?.saldo_afore != null) saldoDeclarado = Number(sd.saldo_afore);
  } catch {
    /* sin saldo declarado */
  }

  // Retiros por desempleo: semanas descontadas netas (advertencia en el feedback).
  const perfil = (cliente.calculo_pensional as Record<string, unknown> | null)?.perfil as
    | { semanas?: { descontadas?: number; recuperadas?: number } }
    | undefined;
  const retirosDesempleo = Math.max(
    0,
    Number(perfil?.semanas?.descontadas ?? 0) - Number(perfil?.semanas?.recuperadas ?? 0),
  );

  // IRN oficial CONSAR de su AFORE para su generación (cita de respaldo).
  let irnAfore: { irn: number; periodo: string | null } | null = null;
  if (aforeActual && cliente.fecha_nacimiento) {
    try {
      const gen = generacionPorAnio(Number(String(cliente.fecha_nacimiento).slice(0, 4)));
      const { data: irn } = await supabase
        .from('afore_irn')
        .select('irn, periodo')
        .eq('afore', aforeActual)
        .eq('generacion', gen)
        .maybeSingle();
      if (irn?.irn != null) irnAfore = { irn: Number(irn.irn), periodo: irn.periodo ?? null };
    } catch {
      /* IRN opcional */
    }
  }

  const nombre = (cliente.nombre ?? '').split(' ')[0] || 'hola';

  return (
    <ComparativoPersonal
      nombre={nombre}
      vm={vm}
      aforeActual={aforeActual}
      encuestaContestada={encuestaContestada}
      irnAfore={irnAfore}
      unlockHref={WA.comparaAfore()}
      traspasoHref={WA.traspasoSura()}
      saldoDeclarado={saldoDeclarado}
      retirosDesempleo={retirosDesempleo}
    />
  );
}
