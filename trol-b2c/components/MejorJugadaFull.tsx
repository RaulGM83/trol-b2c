import Link from 'next/link';
import type { DiagnosticoVM } from '@/lib/diagnostico';
import { GANAR_PUNTOS, alcanzaPuntos } from '@/lib/puntos';
import type { Producto } from '@/lib/productos';
import { Stepper } from './Stepper';

const money = (n: number | null) => (n == null ? 'N/A' : '$' + Math.round(n).toLocaleString('es-MX'));

/** Pantalla 2 del Inc 0 — Mejor jugada completa + desbloqueo dual (§16). */
export function MejorJugadaFull({ vm, producto, saldoPuntos, yaTiene = false }: { vm: DiagnosticoVM; producto: Producto; saldoPuntos: number; yaTiene?: boolean }) {
  const j = vm.mejorJugada;
  const puedePuntos = alcanzaPuntos(saldoPuntos, producto.precioMXN);
  const faltan = Math.max(0, producto.precioMXN - saldoPuntos);

  return (
    <main className="mx-auto max-w-xl px-5 py-6">
      <header className="mb-6 flex items-center gap-2">
        <span className="text-xl font-extrabold tracking-tight">
          tr<span className="text-lime">o</span>l
        </span>
        <Link href="/diagnostico" className="text-xs text-muted hover:underline">
          ← volver al diagnóstico
        </Link>
      </header>

      <Stepper activo={2} />

      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Tu mejor jugada</h1>

      {j && (
        <section className="mb-5 rounded-2xl bg-ink p-5 text-white">
          <div className="text-[11px] font-bold uppercase tracking-wide text-lime">{j.titulo}</div>
          <div className="mt-1 text-3xl font-extrabold tracking-tight">
            {money(j.de)} <span className="text-white/40">→</span> {money(j.a)}
          </div>
          <div className="mt-1 text-sm text-white/70">
            +{money(j.deltaMensual)}/mes
            {j.multiplicador != null && j.multiplicador >= 1.1 && (
              <span className="ml-2 rounded-full bg-lime px-2 py-0.5 text-[11px] font-bold text-ink">
                ×{j.multiplicador.toFixed(1)} tu pensión
              </span>
            )}
          </div>
          {j.efectivoCliente != null && (
            <div className="mt-3 border-t border-white/15 pt-3 text-sm text-white/80">
              {j.seAutofinancia
                ? `Se financia solo · te quedan ~${money(Math.abs(j.efectivoCliente))} a favor.`
                : `Pones de tu bolsa ~${money(Math.abs(j.efectivoCliente))} (el resto se financia).`}
            </div>
          )}
          <p className="mt-2 text-sm text-white/70">{j.nota}</p>
        </section>
      )}

      {/* Producto a desbloquear */}
      <section className="mb-5 rounded-2xl border border-line bg-white p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-extrabold">{producto.nombre}</h2>
          <span className="text-lg font-extrabold">${producto.precioMXN}</span>
        </div>
        <p className="mt-1 text-sm text-muted">{producto.descripcion}</p>

        {yaTiene ? (
          <Link href="/calculadora" className="mt-4 block rounded-xl bg-lime px-4 py-3 text-center text-sm font-bold text-ink">
            Abrir tu calculadora
          </Link>
        ) : (
        <>
        {/* Desbloqueo dual (§16) */}
        <div className="mt-4 flex flex-col gap-2">
          <Link
            href={`/checkout?p=${producto.code}&via=pago`}
            className="rounded-xl bg-ink px-4 py-3 text-center text-sm font-bold text-white"
          >
            Pagar ${producto.precioMXN}
          </Link>

          {puedePuntos ? (
            <Link
              href={`/checkout?p=${producto.code}&via=puntos`}
              className="rounded-xl bg-lime px-4 py-3 text-center text-sm font-bold text-ink"
            >
              Gánala con puntos · tienes {saldoPuntos} pts
            </Link>
          ) : (
            <div className="rounded-xl border border-line px-4 py-3 text-center text-sm">
              <span className="font-bold text-ink">Te faltan {faltan} pts</span>{' '}
              <span className="text-muted">(tienes {saldoPuntos})</span>
            </div>
          )}
        </div>

        {/* Cómo ganar puntos */}
        <div className="mt-4 rounded-xl bg-cream p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted">Gana puntos</div>
          <ul className="mt-1 space-y-1 text-sm">
            {GANAR_PUNTOS.map((g) => (
              <li key={g.motivo} className="flex justify-between gap-3">
                <span className="text-ink/80">{g.motivo}</span>
                <span className="font-bold">+{g.puntos}</span>
              </li>
            ))}
          </ul>
        </div>
        </>
        )}
      </section>

      <p className="text-center text-[11px] leading-relaxed text-muted">
        El trámite ante el IMSS es gratis. Solo cobramos nuestras asesorías y herramientas; nunca pedimos anticipos en efectivo.
      </p>
    </main>
  );
}
