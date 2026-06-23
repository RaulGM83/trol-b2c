import Link from 'next/link';
import type { DiagnosticoVM } from '@/lib/diagnostico';
import { Stepper } from './Stepper';

const money = (n: number | null) =>
  n == null ? 'N/A' : '$' + Math.round(n).toLocaleString('es-MX');

export function Diagnostico({ vm, demo = false }: { vm: DiagnosticoVM; demo?: boolean }) {
  return (
    <main className="mx-auto max-w-xl px-5 py-6">
      {/* Marca */}
      <header className="mb-6 flex items-center gap-2">
        <span className="text-xl font-extrabold tracking-tight">
          tr<span className="text-lime">o</span>l
        </span>
        <span className="text-xs text-muted">· tu diagnóstico</span>
      </header>

      {demo && (
        <div className="mb-4 rounded-lg border border-line bg-cream px-3 py-2 text-[11px] text-muted">
          Modo demo · datos de ejemplo. <a href="/login" className="font-semibold text-ink underline">Entra con tu celular</a> para ver tu caso real.
        </div>
      )}

      <Stepper activo={1} />

      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">
        Hola, {vm.nombre}
      </h1>
      <p className="mb-5 text-sm text-muted">
        Régimen <b className="text-ink">{vm.ley === 'Ley73' ? 'Ley 73' : 'Ley 97'}</b> ·{' '}
        {vm.edadActual} años · {vm.semanas.toLocaleString('es-MX')} semanas
      </p>

      {/* Pensión hoy + escenario máximo */}
      <section className="mb-4 rounded-2xl bg-ink p-5 text-white">
        <div className="text-[11px] font-bold uppercase tracking-wide text-lime">
          Tu pensión estimada hoy
        </div>
        <div className="mt-1 text-4xl font-extrabold tracking-tight">{money(vm.pensionHoy)}</div>
        <div className="mt-3 border-t border-white/15 pt-3 text-sm text-white/70">
          Escenario máximo:{' '}
          <b className="text-white">{money(vm.escenarioMaximo.monto)}</b> a los{' '}
          {vm.escenarioMaximo.edad} años
        </div>
      </section>

      {/* Conserva derechos — solo aplica a Ley 73 */}
      {vm.ley === 'Ley73' && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3 text-sm">
          <span className="text-muted">Conservación de derechos (Ley 73)</span>
          <span className={`font-bold ${vm.conservaDerechos ? 'text-ink' : 'text-red-600'}`}>
            {vm.conservaDerechos ? 'Vigente ✓' : 'Revisar'}
          </span>
        </div>
      )}

      {/* Mejor jugada */}
      {vm.mejorJugada && (
        <section className="mb-6 rounded-2xl bg-lime p-5">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink/70">
              Tu mejor jugada
            </div>
            {vm.mejorJugada.multiplicador != null && vm.mejorJugada.multiplicador >= 1.1 && (
              <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-bold text-lime">
                ×{vm.mejorJugada.multiplicador.toFixed(1)} tu pensión
              </span>
            )}
          </div>
          <div className="mt-1 text-lg font-extrabold">{vm.mejorJugada.titulo}</div>
          <div className="mt-2 text-2xl font-extrabold tracking-tight">
            {money(vm.mejorJugada.de)} <span className="text-ink/50">→</span> {money(vm.mejorJugada.a)}
            <span className="ml-2 text-base font-bold text-ink/70">
              +{money(vm.mejorJugada.deltaMensual)}/mes
            </span>
          </div>

          {/* Marco realista: efectivo del cliente, no el bruto del proyecto */}
          {vm.mejorJugada.efectivoCliente != null && (
            <div className="mt-3 rounded-xl bg-white/60 px-3 py-2 text-sm">
              {vm.mejorJugada.seAutofinancia ? (
                <span className="font-semibold text-ink">
                  Se financia solo · te quedan ~{money(Math.abs(vm.mejorJugada.efectivoCliente))} a favor
                </span>
              ) : (
                <span className="font-semibold text-ink">
                  Pones de tu bolsa ~{money(Math.abs(vm.mejorJugada.efectivoCliente))}
                </span>
              )}
              {vm.mejorJugada.costoProyecto != null && (
                <span className="text-ink/60"> · proyecto {money(vm.mejorJugada.costoProyecto)} (financiado)</span>
              )}
            </div>
          )}

          <p className="mt-2 text-sm text-ink/80">{vm.mejorJugada.nota}</p>
        </section>
      )}

      {/* CTA → pantalla 2 (Mejor jugada) */}
      <Link
        href="/mejor-jugada"
        className="block rounded-xl bg-ink px-4 py-3 text-center text-sm font-bold text-white"
      >
        Ver mi mejor jugada y desbloquear
      </Link>

      {/* Acceso al hub de asesorías */}
      <Link
        href="/asesoria"
        className="mt-2 block rounded-xl border border-line bg-white px-4 py-3 text-center text-sm font-bold text-ink"
      >
        Quiero mi plan completo con un asesor
      </Link>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-muted">
        El trámite ante el IMSS es gratis. El Trol no pide anticipos en efectivo ni garantiza montos.
        <br />Cálculo con el motor oficial de Trol (Ley 73/97 · Modalidad 40).
      </p>
    </main>
  );
}
