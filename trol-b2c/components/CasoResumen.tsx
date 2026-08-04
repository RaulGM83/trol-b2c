import type { DiagnosticoVM } from '@/lib/diagnostico';
import { BadgeNegativa } from './NegativaPension';

const money = (n: number | null) => (n == null ? '—' : '$' + Math.round(n).toLocaleString('es-MX'));

/** Una línea que explique la negativa, según la ley y la causa. */
function resumenNegativa(vm: DiagnosticoVM): string {
  const r73 = vm.razon73;
  if (r73) {
    if (r73.pierdeConservacion && !r73.faltanSemanas) {
      return `Tiene las ${r73.semanasRequeridas} semanas, pero sus derechos de Ley 73 están suspendidos: reactiva con ${r73.semanasParaReactivar} semanas de nuevas cotizaciones.`;
    }
    if (r73.pierdeConservacion) {
      return `Le faltan ${r73.semanasFaltantes.toLocaleString('es-MX')} semanas y sus derechos de Ley 73 están suspendidos.`;
    }
    return `Le faltan ${r73.semanasFaltantes.toLocaleString('es-MX')} de las ${r73.semanasRequeridas} semanas que pide la Ley 73.`;
  }
  const r97 = vm.razon97;
  if (r97) {
    return `Le faltan ${r97.semanasFaltantes.toLocaleString('es-MX')} de las ${r97.semanasRequeridas.toLocaleString('es-MX')} semanas que pide su retiro en ${r97.anioRetiro}.`;
  }
  return 'Con sus semanas actuales no alcanza el mínimo para pensionarse.';
}

/** "El caso a la vista" (§13): el resumen del diagnóstico que acompaña al desbloqueo y al checkout. */
export function CasoResumen({ vm }: { vm: DiagnosticoVM }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted">Tu caso</div>
      <div className="mt-1 text-sm">
        <b>{vm.nombre}</b> · {vm.ley === 'Ley73' ? 'Ley 73' : 'Ley 97'} · {vm.edadActual} años ·{' '}
        {vm.semanas.toLocaleString('es-MX')} semanas
      </div>
      {vm.status !== 'viable' ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <BadgeNegativa />
          <span className="text-ink/70">{resumenNegativa(vm)}</span>
        </div>
      ) : (
        vm.mejorJugada && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="text-muted">{vm.mejorJugada.titulo}:</span>
            <b>{money(vm.mejorJugada.de)}</b>
            <span className="text-muted">→</span>
            <b className="text-ink">{money(vm.mejorJugada.a)}</b>
            {vm.mejorJugada.multiplicador != null && vm.mejorJugada.multiplicador >= 1.1 && (
              <span className="rounded-full bg-lime px-2 py-0.5 text-[11px] font-bold">
                ×{vm.mejorJugada.multiplicador.toFixed(1)}
              </span>
            )}
          </div>
        )
      )}
    </div>
  );
}
