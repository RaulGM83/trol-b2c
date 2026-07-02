// Pantalla 1 del Incremento 0 — Diagnóstico.
// Lee la semilla real del cliente autenticado (Llave 1); fallback a demo.
import { Diagnostico } from '@/components/Diagnostico';
import { CalculadoraEspera } from '@/components/CalculadoraEspera';
import { ReferralClaim } from '@/components/ReferralClaim';
import { getSesionCliente } from '@/lib/cliente';
import { getEstadoMision, otorgarBienvenida } from '@/lib/puntos';

export const dynamic = 'force-dynamic';

export default async function DiagnosticoPage() {
  const sesion = await getSesionCliente();

  // Si llegó por un link de referido y ya tiene sesión, registra/otorga puntos.
  const claim = sesion.autenticado ? <ReferralClaim /> : null;

  // Autenticado pero aún sin semilla (sin SISEC): calculadora de espera
  // (estimación manual con el mismo motor, sin depender del historial).
  if (!sesion.vm) {
    return (
      <>
        {claim}
        <CalculadoraEspera />
      </>
    );
  }

  // Gamificación: bono de bienvenida (+20, idempotente, fija etapa >= 1) y
  // estado de la misión "Activa tu plan" para la UI.
  let mision = null;
  let bono = { otorgado: false, puntos: 0 };
  if (sesion.real) {
    bono = await otorgarBienvenida();
    mision = await getEstadoMision();
  }

  return (
    <>
      {claim}
      <Diagnostico vm={sesion.vm} demo={!sesion.real} mision={mision} bonoRecienOtorgado={bono.otorgado} />
    </>
  );
}
