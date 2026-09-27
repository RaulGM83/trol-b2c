import { requireMiembro, t3, t3admin } from '@/lib/trol3/server';
import { MillasDepositos, type MovCashback } from '@/components/trol3/MillasDepositos';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Por depositar a Millas · Trol equipo' };

// 193 · Negocio → Por depositar a Millas (claude/88). El cashback nace solo con cada cobro
// (10 % asesorías · 5 % gestorías, sobre lo cobrado con IVA) de quien llegó con Millas. Aquí se
// junta lo pendiente, se hace UNA transferencia a la CLABE de Millas con la CURP de cada quien
// como referencia, y se marca depositado con la referencia bancaria.
export default async function Millas({ searchParams }: { searchParams: { ver?: string } }) {
  await requireMiembro();
  const db = t3();
  const ver = searchParams.ver === 'depositado' ? 'depositado' : 'por_depositar';
  const [{ data }, { data: clabe }] = await Promise.all([
    db.rpc('cashback_lista', { p_estado: ver, p_limit: 300 }),
    t3admin().from('config').select('valor').eq('clave', 'millas_clabe').maybeSingle(), // config no es legible con la sesión: se lee después de requireMiembro
  ]);
  return <MillasDepositos movs={(data ?? []) as MovCashback[]} ver={ver} clabe={((clabe as { valor?: string } | null)?.valor ?? '') || null} />;
}
