// Pantalla 4 del Inc 0 — Calculadora pro (gated por compra/desbloqueo).
import { redirect } from 'next/navigation';
import { CalculadoraPro } from '@/components/CalculadoraPro';
import { CalculadoraEspera } from '@/components/CalculadoraEspera';
import { getSemillaV2Cliente, tieneProducto } from '@/lib/cliente';

export const dynamic = 'force-dynamic';

export default async function CalculadoraPage() {
  const semilla = await getSemillaV2Cliente();
  // Sin semilla (sin SISEC): calculadora de espera (estimación manual).
  if (!semilla) return <CalculadoraEspera />;

  // Con semilla pero sin desbloquear → al paywall (no se vuelve a pedir si ya pagó).
  const desbloqueada = await tieneProducto('CALCULADORA_ADDON');
  if (!desbloqueada) redirect('/mejor-jugada');

  return <CalculadoraPro semilla={semilla} />;
}
