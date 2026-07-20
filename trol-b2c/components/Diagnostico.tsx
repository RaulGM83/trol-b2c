import Link from 'next/link';
import type { DiagnosticoVM } from '@/lib/diagnostico';
import type { EstadoMision } from '@/lib/puntos';
import { WA } from '@/lib/whatsapp';
import { Stepper } from './Stepper';
import { Mision } from './Mision';
import { PuntosChip } from './PuntosChip';

const money = (n: number | null) =>
  n == null ? 'N/A' : '$' + Math.round(n).toLocaleString('es-MX');

// Pantalla 1 — Diagnóstico. Un solo camino: la mejor jugada se INSINÚA aquí
// (título + multiplicador) y el detalle completo vive en /mejor-jugada. Lo
// demás (encuesta, referidos) vive en la misión, no como CTAs sueltos.
export function Diagnostico({
  vm,
  demo = false,
  mision = null,
  bonoRecienOtorgado = false,
}: {
  vm: DiagnosticoVM;
  demo?: boolean;
  mision?: EstadoMision | null;
  bonoRecienOtorgado?: boolean;
}) {
  return (
    <main className="mx-auto max-w-xl px-5 py-6">
      {/* Marca + saldo de puntos siempre visible */}
      <header className="mb-6 flex items-center gap-2">
        <span className="text-xl font-extrabold tracking-tight">
          tr<span className="text-lime">o</span>l
        </span>
        <span className="text-xs text-muted">· tu diagnóstico</span>
        {!demo && mision && <PuntosChip saldo={mision.saldo} />}
      </header>

      {demo && (
        <div className="mb-4 rounded-lg border border-line bg-cream px-3 py-2 text-[11px] text-muted">
          Modo demo · datos de ejemplo. <a href="/login" className="font-semibold text-ink underline">Entra con tu celular</a> para ver tu caso real.
        </div>
      )}

      {/* Bono de bienvenida: refuerzo inmediato al entrar */}
      {bonoRecienOtorgado && (
        <div className="mb-4 rounded-xl bg-lime px-4 py-3 text-sm font-bold text-ink">
          🎉 +20 pts de bienvenida por ver tu diagnóstico
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

      {/* Mejor jugada — TEASER: título + tamaño de la oportunidad. El "de X a Y"
          y el cómo viven en la siguiente pantalla (un paso claro a la vez). */}
      {vm.mejorJugada && (
        <section className="mb-5 rounded-2xl bg-lime p-5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-ink/70">
            Encontramos tu mejor jugada
          </div>
          <div className="mt-1 text-lg font-extrabold">{vm.mejorJugada.titulo}</div>
          <p className="mt-1 text-sm text-ink/80">
            {vm.mejorJugada.multiplicador != null && vm.mejorJugada.multiplicador >= 1.1 ? (
              <>
                Tu caso puede llevar tu pensión a{' '}
                <b>×{vm.mejorJugada.multiplicador.toFixed(1)} de lo que te tocaría hoy</b>. Te mostramos
                los números y cómo lograrlo.
              </>
            ) : (
              <>Te mostramos los números de tu caso y el paso a paso.</>
            )}
          </p>
        </section>
      )}

      {/* UN siguiente paso primario */}
      <Link
        href="/mejor-jugada"
        className="block rounded-xl bg-ink px-4 py-3.5 text-center text-sm font-bold text-white"
      >
        Ver mi mejor jugada →
      </Link>

      {/* Paso humano gratuito (asesoría básica) */}
      <a
        href={WA.asesoriaBasica()}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 block rounded-xl border border-line bg-white px-4 py-3 text-center text-sm font-bold text-ink"
      >
        Prefiero platicarlo con un experto · gratis por WhatsApp
      </a>

      {/* Misión gamificada: aquí viven encuesta y referidos, con meta visible */}
      {!demo && mision && <Mision mision={mision} />}

      {/* Herramientas: acceso discreto a lo demás sin saturar el camino principal */}
      {!demo && (
        <section className="mt-5">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Herramientas</div>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/comparativo"
              className="rounded-xl border border-line bg-white px-3 py-3 text-sm font-bold text-ink"
            >
              Compara tu AFORE
              <span className="mt-0.5 block text-[11px] font-normal text-muted">con tu historia real</span>
            </Link>
            <Link
              href="/comparador"
              className="rounded-xl border border-line bg-white px-3 py-3 text-sm font-bold text-ink"
            >
              Comparador AFOREs
              <span className="mt-0.5 block text-[11px] font-normal text-muted">todas, con opiniones</span>
            </Link>
          </div>
        </section>
      )}

      <p className="mt-6 text-center text-[11px] leading-relaxed text-muted">
        El trámite ante el IMSS es gratis. El Trol no pide anticipos en efectivo ni garantiza montos.
        <br />Cálculo con el motor oficial de Trol (Ley 73/97 · Modalidad 40).
      </p>
    </main>
  );
}
