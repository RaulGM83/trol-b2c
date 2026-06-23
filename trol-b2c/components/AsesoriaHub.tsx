import Link from 'next/link';
import type { Producto } from '@/lib/productos';
import { alcanzaPuntos } from '@/lib/puntos';

type Item = { producto: Producto; yaTiene: boolean };

/** Hub de asesorías de pago (§6) — Diagnóstico avanzado y +sesión, con desbloqueo dual. */
export function AsesoriaHub({ items, saldoPuntos }: { items: Item[]; saldoPuntos: number }) {
  return (
    <main className="mx-auto max-w-xl px-5 py-6">
      <header className="mb-6 flex items-center gap-2">
        <span className="text-xl font-extrabold tracking-tight">
          tr<span className="text-lime">o</span>l
        </span>
        <Link href="/diagnostico" className="text-xs text-muted hover:underline">
          ← volver a mi diagnóstico
        </Link>
      </header>

      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Lleva tu plan más lejos</h1>
      <p className="mb-5 text-sm text-muted">
        Pasa de la estimación a un plan accionable, con un experto en pensiones de tu lado.
      </p>

      <div className="flex flex-col gap-4">
        {items.map(({ producto, yaTiene }) => {
          const puedePuntos = alcanzaPuntos(saldoPuntos, producto.precioMXN);
          const faltan = Math.max(0, producto.precioMXN - saldoPuntos);
          return (
            <section key={producto.code} className="rounded-2xl border border-line bg-white p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-extrabold">{producto.nombre}</h2>
                {yaTiene ? (
                  <span className="rounded-full bg-lime px-2.5 py-1 text-xs font-bold text-ink">Pagado ✓</span>
                ) : (
                  <span className="text-lg font-extrabold">${producto.precioMXN}</span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted">{producto.descripcion}</p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-ink/50">{producto.entrega}</p>

              {yaTiene ? (
                <Link
                  href="/checkout?p=__none__"
                  className="pointer-events-none mt-4 block rounded-xl bg-cream px-4 py-3 text-center text-sm font-bold text-ink/60"
                >
                  Ya tienes acceso
                </Link>
              ) : (
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
                    <div className="rounded-xl border border-line px-4 py-2.5 text-center text-xs">
                      <span className="font-bold text-ink">Te faltan {faltan} pts</span>{' '}
                      <span className="text-muted">para canjearla (tienes {saldoPuntos})</span>
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-muted">
        El trámite ante el IMSS es gratis. Cobramos nuestras asesorías y herramientas; nunca pedimos anticipos en efectivo
        ni garantizamos montos. Temas de AFORE y PPR los atiende un experto en pensiones autorizado.
      </p>
    </main>
  );
}
