import type { DiagnosticoVM } from '@/lib/diagnostico';

const money = (n: number | null) => (n == null ? 'N/A' : '$' + Math.round(n).toLocaleString('es-MX'));

/** "El caso a la vista" (§13): el resumen del diagnóstico que acompaña al desbloqueo y al checkout. */
export function CasoResumen({ vm }: { vm: DiagnosticoVM }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="text-[11px] font-bold uppercase tracking-wide text-muted">Tu caso</div>
      <div className="mt-1 text-sm">
        <b>{vm.nombre}</b> · {vm.ley === 'Ley73' ? 'Ley 73' : 'Ley 97'} · {vm.edadActual} años ·{' '}
        {vm.semanas.toLocaleString('es-MX')} semanas
      </div>
      {vm.mejorJugada && (
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
      )}
    </div>
  );
}
