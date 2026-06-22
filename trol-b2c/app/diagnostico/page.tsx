// Pantalla 1 del Incremento 0 — Diagnóstico.
// Lee la semilla real del cliente autenticado (Llave 1); fallback a demo.
import { Diagnostico } from '@/components/Diagnostico';
import { CalculadoraEspera } from '@/components/CalculadoraEspera';
import { getSesionCliente } from '@/lib/cliente';

export const dynamic = 'force-dynamic';

export default async function DiagnosticoPage() {
  const sesion = await getSesionCliente();

  // Autenticado pero aún sin semilla (sin SISEC): calculadora de espera
  // (estimación manual con el mismo motor, sin depender del historial).
  if (!sesion.vm) {
    return <CalculadoraEspera />;
  }

  return <Diagnostico vm={sesion.vm} demo={!sesion.real} />;
}
