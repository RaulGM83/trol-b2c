'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MEJORES_POR_GENERACION, generacionPorAnio } from '@/lib/afores';

export type FilaAfore = {
  afore: string;
  comision: number | null;
  rendimiento_neto: number | null;
  afiliados_millones: number | null;
  fortaleza: string | null;
  n_resenas: number;
  atencion_prom: number | null;
  asesoria_prom: number | null;
  recomienda_pct: number | null;
};

type Orden = 'rendimiento' | 'comision' | 'recomienda';
const MIN_RESENAS = 3;

export function ComparadorView({
  filas,
  autenticado,
  anioPrefill,
}: {
  filas: FilaAfore[];
  autenticado: boolean;
  anioPrefill?: number;
}) {
  const [orden, setOrden] = useState<Orden>('rendimiento');
  const [anio, setAnio] = useState<string>(anioPrefill ? String(anioPrefill) : '');

  const gen = useMemo(() => {
    const n = parseInt(anio, 10);
    if (!Number.isFinite(n) || n < 1940 || n > 2010) return null;
    return MEJORES_POR_GENERACION[generacionPorAnio(n)];
  }, [anio]);

  const ordenadas = useMemo(() => {
    const f = [...filas];
    if (orden === 'rendimiento') f.sort((a, b) => (b.rendimiento_neto ?? 0) - (a.rendimiento_neto ?? 0));
    if (orden === 'comision') f.sort((a, b) => (a.comision ?? 99) - (b.comision ?? 99));
    if (orden === 'recomienda') f.sort((a, b) => (b.recomienda_pct ?? -1) - (a.recomienda_pct ?? -1));
    return f;
  }, [filas, orden]);

  return (
    <main className="mx-auto max-w-2xl px-5 py-6">
      <header className="mb-5 flex items-center gap-2">
        <span className="text-xl font-extrabold tracking-tight">
          tr<span className="text-lime">o</span>l
        </span>
        <span className="text-xs text-muted">· comparador de AFOREs</span>
      </header>

      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Compara las AFOREs de México</h1>
      <p className="mb-4 text-sm text-muted">
        Las comisiones son casi iguales (~0.55%), así que el <b className="text-ink">rendimiento neto</b> es lo que más
        cambia tu pensión. Súmale lo que opina la comunidad de El Trol.
      </p>

      {/* Mejor para tu edad (IRN por generación) */}
      <section className="mb-5 rounded-2xl bg-ink p-5 text-white">
        <div className="text-[11px] font-bold uppercase tracking-wide text-lime">La mejor para tu edad</div>
        <p className="mt-1 text-sm text-white/70">
          El rendimiento (IRN) depende de tu año de nacimiento. Escríbelo para ver las mejor calificadas para tu
          generación.
        </p>
        <input
          inputMode="numeric"
          value={anio}
          onChange={(e) => setAnio(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="Año de nacimiento (ej. 1968)"
          className="mt-3 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40"
        />
        {gen && (
          <div className="mt-3 rounded-xl bg-white/10 p-3">
            <div className="text-[11px] uppercase tracking-wide text-white/60">Para tu generación ({gen.rango})</div>
            <div className="mt-2 flex flex-col gap-1.5">
              {gen.top.map((t, i) => (
                <div key={t.afore} className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-white">
                    {i + 1}. {t.afore}
                  </span>
                  <span className="font-extrabold text-lime">{t.irn.toFixed(2)}% IRN</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-white/50">
              IRN de CONSAR (corte reciente, referencia). Verifica el dato vigente en consar.gob.mx antes de decidir.
            </p>
          </div>
        )}
      </section>

      {/* Orden */}
      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            ['rendimiento', 'Mayor rendimiento'],
            ['comision', 'Menor comisión'],
            ['recomienda', 'Más recomendadas'],
          ] as [Orden, string][]
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setOrden(k)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
              orden === k ? 'border-ink bg-ink text-white' : 'border-line text-ink'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-cream text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2 text-left font-bold">AFORE</th>
              <th className="px-3 py-2 text-right font-bold">IRN (ref.)</th>
              <th className="px-3 py-2 text-right font-bold">Comisión</th>
              <th className="px-3 py-2 text-right font-bold">Recomiendan</th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((f, i) => {
              const conResenas = f.n_resenas >= MIN_RESENAS;
              return (
                <tr key={f.afore} className={`border-t border-line ${i === 0 && orden === 'rendimiento' ? 'bg-lime/10' : ''}`}>
                  <td className="px-3 py-3">
                    <div className="font-bold text-ink">{f.afore}</div>
                    {f.fortaleza && <div className="text-[11px] text-muted">{f.fortaleza}</div>}
                    {conResenas && (
                      <div className="mt-1 text-[11px] text-ink/70">
                        Atención {f.atencion_prom}★ · Asesoría {f.asesoria_prom}★{' '}
                        <span className="text-muted">({f.n_resenas})</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-extrabold">
                    {f.rendimiento_neto != null ? `${Number(f.rendimiento_neto).toFixed(2)}%` : '—'}
                  </td>
                  <td className="px-3 py-3 text-right">{f.comision != null ? `${Number(f.comision).toFixed(2)}%` : '—'}</td>
                  <td className="px-3 py-3 text-right font-bold">
                    {conResenas && f.recomienda_pct != null ? `${f.recomienda_pct}%` : <span className="text-muted">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* CTA */}
      <section className="mt-5 rounded-2xl bg-ink p-5 text-white">
        {autenticado ? (
          <>
            <div className="text-lg font-extrabold">¿Ya evaluaste tu AFORE?</div>
            <p className="mt-1 text-sm text-white/70">Comparte tu experiencia y gana 50 puntos para tu calculadora.</p>
            <Link href="/encuesta" className="mt-3 block rounded-xl bg-lime px-4 py-3 text-center text-sm font-bold text-ink">
              Evaluar mi AFORE (+50 pts)
            </Link>
          </>
        ) : (
          <>
            <div className="text-lg font-extrabold">¿Y cuánto te queda de pensión?</div>
            <p className="mt-1 text-sm text-white/70">Tu AFORE importa, pero tu pensión depende de más cosas. Calcúlala gratis, sin CURP.</p>
            <Link href="/calcula?ref=comparador" className="mt-3 block rounded-xl bg-lime px-4 py-3 text-center text-sm font-bold text-ink">
              Calcular mi pensión
            </Link>
          </>
        )}
      </section>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">
        Rendimiento neto (IRN) y comisiones con base en CONSAR; el IRN exacto varía según tu año de nacimiento
        (SIEFORE generacional). "Recomiendan" y las estrellas son de la comunidad de El Trol (encuestas con al menos{' '}
        {MIN_RESENAS} respuestas). No es una recomendación de inversión.
      </p>
    </main>
  );
}
