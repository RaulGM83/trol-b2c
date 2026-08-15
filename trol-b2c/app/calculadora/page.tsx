// Pantalla 4 del Inc 0 — Calculadora pro (gated por compra/desbloqueo).
// Trol 3.0: un asesor (miembro) puede abrirla para cualquier persona con ?persona=<id>.
import { redirect } from 'next/navigation';
import { CalculadoraPro } from '@/components/CalculadoraPro';
import { CalculadoraEspera } from '@/components/CalculadoraEspera';
import { getSemillaV2Cliente, tieneProducto } from '@/lib/cliente';
import { getMiembro, t3 } from '@/lib/trol3/server';
import { parseSemillaV2 } from '@trol/pension-core/semilla';

export const dynamic = 'force-dynamic';

export default async function CalculadoraPage({ searchParams }: { searchParams: { persona?: string } }) {
  if (searchParams.persona) {
    const m = await getMiembro();
    if (!m) redirect('/trabajo/login');
    const { data } = await t3().from('datos').select('valor').eq('persona_id', searchParams.persona).eq('campo', 'semilla').order('obtenido_en', { ascending: false }).limit(1).maybeSingle();
    const s = parseSemillaV2(data?.valor);
    if (!s) return <CalculadoraEspera />;
    return <CalculadoraPro semilla={s} />;
  }
  const semilla = await getSemillaV2Cliente();
  // Sin semilla (sin SISEC): calculadora de espera (estimación manual).
  if (!semilla) return <CalculadoraEspera />;

  // Con semilla pero sin desbloquear → al paywall (no se vuelve a pedir si ya pagó).
  const desbloqueada = await tieneProducto('CALCULADORA_ADDON');
  if (!desbloqueada) redirect('/mejor-jugada');

  return <CalculadoraPro semilla={semilla} />;
}
