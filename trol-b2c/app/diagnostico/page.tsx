// Pantalla 1 del Incremento 0 — Diagnóstico.
// Lee la semilla real del cliente autenticado (Llave 1); fallback a demo.
import { redirect } from 'next/navigation';
import { Diagnostico } from '@/components/Diagnostico';
import { CalculadoraEspera } from '@/components/CalculadoraEspera';
import { ReferralClaim } from '@/components/ReferralClaim';
import { getSesionCliente } from '@/lib/cliente';
import { getEstadoMision, otorgarBienvenida } from '@/lib/puntos';

export const dynamic = 'force-dynamic';

export default async function DiagnosticoPage() {
  const sesion = await getSesionCliente();

  // Nunca lo hemos visto (referido, tráfico nuevo): el default es REGISTRO.
  // Nunca "no encontramos tu información" — ese copy exige un identificador
  // real que hayamos buscado, y aquí no hay ninguno.
  if (sesion.motivo === 'no_match') redirect('/alta');

  // Cliente nuestro pero aún sin semilla (sin SISEC): calculadora de espera
  // (estimación manual con el mismo motor) + ruta de constancia.
  if (!sesion.vm) return <CalculadoraEspera />;

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
      {/* Anti-fraude: el crédito del referido se otorga al llegar a etapa 1
          (diagnóstico REAL), igual que el bono de bienvenida. Antes bastaba con
          estar autenticado, así que la pantalla de espera —sin semilla y sin
          etapa 1— ya disparaba los +100/+50. */}
      {sesion.real && <ReferralClaim />}
      <Diagnostico vm={sesion.vm} demo={!sesion.real} mision={mision} bonoRecienOtorgado={bono.otorgado} />
    </>
  );
}
