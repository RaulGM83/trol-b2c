'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { milesTexto } from '@/lib/contrafactual';

// ============================================================================
// "¿Cuánto tienes tú?" — el cliente escribe su saldo real de AFORE, se guarda
// (RPC declarar_saldo → saldos_declarados + aviso al asesor) y recibe feedback
// inmediato de dónde se ubica entre canasta baja / mediana / canasta top de SU
// simulación, con lectura honesta de si sus elecciones le han funcionado.
// Si tiene retiros por desempleo (semanas descontadas), se le advierte que
// esos retiros bajan su saldo real y no están simulados.
// ============================================================================

export function SaldoRealCard({
  top,
  mediana,
  baja,
  saldoInicial,
  retirosDesempleo,
  unlockHref,
}: {
  top: number;
  mediana: number;
  baja: number;
  /** Saldo ya declarado antes (prefill) o null. */
  saldoInicial: number | null;
  /** Semanas descontadas netas por retiros por desempleo (0 = sin retiros). */
  retirosDesempleo: number;
  unlockHref: string;
}) {
  const [texto, setTexto] = useState(saldoInicial ? String(saldoInicial) : '');
  const [guardado, setGuardado] = useState<number | null>(saldoInicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsear = (s: string) => {
    const n = Number(s.replace(/[$,\s]/g, ''));
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  };

  async function guardar() {
    setError(null);
    const n = parsear(texto);
    if (!n) return setError('Escribe un monto válido (ej. 850,000).');
    if (n > 50_000_000) return setError('Verifica el monto — parece demasiado alto.');
    setCargando(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('declarar_saldo', { p_datos: { saldo_afore: n } });
    setCargando(false);
    const r = data as { ok?: boolean; error?: string } | null;
    if (error || !r?.ok) return setError('No se pudo guardar. Intenta de nuevo.');
    setGuardado(n);
  }

  // Posición del saldo real entre las referencias simuladas
  const feedback = (n: number) => {
    if (n >= top * 0.95) {
      return {
        titulo: '🏆 Nivel canasta top',
        texto:
          'Tu saldo real está a la altura de las mejores AFOREs de tu generación. Tus elecciones (y tu constancia) han funcionado — el siguiente paso es protegerlo y sumarle ahorro voluntario.',
        tono: 'bien' as const,
      };
    }
    if (n >= mediana) {
      return {
        titulo: '✓ Arriba del promedio',
        texto: `Estás por encima de la mediana del sistema (${milesTexto(mediana)}). Vas bien; frente a la canasta top habría ${milesTexto(Math.max(0, top - n))} de espacio — vale revisar si tu AFORE actual sigue siendo de las mejores.`,
        tono: 'bien' as const,
      };
    }
    if (n >= baja * 0.95) {
      return {
        titulo: 'Entre el promedio y el fondo',
        texto: `Tu saldo está por debajo de la mediana simulada (${milesTexto(mediana)}). Parte puede ser la AFORE donde has estado, parte tu historia — un experto puede decirte cuál pesa más y si conviene moverte.`,
        tono: 'regular' as const,
      };
    }
    return {
      titulo: 'Por debajo de lo esperado',
      texto: `Tu saldo está incluso debajo de la canasta baja simulada (${milesTexto(baja)}). Eso casi siempre indica algo más que la AFORE: retiros, huecos de cotización o datos incompletos. Vale la pena revisarlo con un experto — puede haber dinero por aclarar.`,
      tono: 'alerta' as const,
    };
  };

  const fb = guardado ? feedback(guardado) : null;

  // ------- Tira de posición (misma lógica del hero: eje acotado al rango) -------
  // Escalar desde cero amontona todo a la derecha; acotamos al rango
  // [min(tú, fondo) .. max(tú, top)] con aire, y las etiquetas de referencia
  // van ABAJO con anti-colisión horizontal (el "tú" va solo, ARRIBA).
  const tira = (n: number) => {
    const lo = Math.min(n, baja);
    const hi = Math.max(n, top);
    const span = Math.max(1, hi - lo);
    const dLo = lo - span * 0.12;
    const dHi = hi + span * 0.12;
    const X0 = 30;
    const X1 = 490;
    const sx = (v: number) => X0 + ((v - dLo) / (dHi - dLo)) * (X1 - X0);
    // referencias con separación mínima de etiquetas (leader si se mueven)
    const refs = [
      { l: 'Fondo', v: baja },
      { l: 'Promedio', v: mediana },
      { l: 'Top', v: top },
    ].map((r) => ({ ...r, x: sx(r.v) }));
    const MIN = 88;
    const lx = refs.map((r) => r.x);
    for (let i = 1; i < lx.length; i++) lx[i] = Math.max(lx[i], lx[i - 1] + MIN);
    lx[lx.length - 1] = Math.min(lx[lx.length - 1], 448);
    for (let i = lx.length - 2; i >= 0; i--) lx[i] = Math.min(lx[i], lx[i + 1] - MIN);
    lx[0] = Math.max(lx[0], 72);
    return { sx, refs: refs.map((r, i) => ({ ...r, labelX: lx[i] })), tuX: Math.min(462, Math.max(58, sx(n))) };
  };

  return (
    <section className="mb-4 rounded-2xl bg-ink p-5 text-white">
      <div className="text-lg font-extrabold">¿Cuánto tienes tú?</div>
      <p className="mt-1 text-sm text-white/70">
        Escribe tu saldo actual de AFORE (lo ves en tu app o estado de cuenta) y te decimos dónde te
        ubicas frente a tu simulación.
      </p>

      <div className="mt-3 flex gap-2">
        <div className="flex w-full items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3">
          <span className="text-sm text-white/50">$</span>
          <input
            inputMode="numeric"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="850,000"
            className="w-full bg-transparent py-3 text-sm text-white placeholder:text-white/40 focus:outline-none"
          />
        </div>
        <button
          onClick={guardar}
          disabled={cargando}
          className="shrink-0 rounded-xl bg-lime px-4 py-3 text-sm font-bold text-ink disabled:opacity-60"
        >
          {cargando ? '…' : guardado ? 'Actualizar' : 'Ver'}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {guardado != null && fb && (
        <div className="mt-4 rounded-xl bg-white/10 p-4">
          {/* Tira de posición: tú (arriba) vs fondo/promedio/top (abajo) */}
          {(() => {
            const t = tira(guardado);
            return (
              <svg
                viewBox="0 0 520 118"
                className="w-full"
                role="img"
                aria-label={`Tu saldo ${milesTexto(guardado)}; fondo ${milesTexto(baja)}, promedio ${milesTexto(mediana)}, top ${milesTexto(top)}`}
              >
                {/* track + zona de canastas */}
                <line x1="30" y1="58" x2="490" y2="58" className="stroke-white/15" strokeWidth="2" />
                <line
                  x1={t.sx(baja)}
                  y1="58"
                  x2={t.sx(top)}
                  y2="58"
                  className="stroke-lime/35"
                  strokeWidth="4"
                />
                {/* referencias: tick en su posición real, etiqueta abajo con leader */}
                {t.refs.map((r) => (
                  <g key={r.l}>
                    <line x1={r.x} y1="50" x2={r.x} y2="66" className="stroke-white/50" strokeWidth="2" />
                    <line x1={r.x} y1="66" x2={r.labelX} y2="84" className="stroke-white/25" strokeWidth="1" />
                    <text x={r.labelX} y="97" textAnchor="middle" className="fill-white/60 text-[11px] font-bold">
                      {r.l}
                    </text>
                    <text x={r.labelX} y="111" textAnchor="middle" className="fill-white/40 text-[10px]">
                      {milesTexto(r.v)}
                    </text>
                  </g>
                ))}
                {/* tú: marcador lime con su valor arriba */}
                <line x1={t.sx(guardado)} y1="44" x2={t.sx(guardado)} y2="72" className="stroke-lime" strokeWidth="4" />
                <text x={t.tuX} y="16" textAnchor="middle" className="fill-lime text-[12px] font-extrabold">
                  Tú
                </text>
                <text x={t.tuX} y="32" textAnchor="middle" className="fill-lime text-[12px] font-bold">
                  {milesTexto(guardado)}
                </text>
              </svg>
            );
          })()}

          <div className="mt-2 text-sm font-extrabold text-white">{fb.titulo}</div>
          <p className="mt-1 text-sm leading-relaxed text-white/80">{fb.texto}</p>

          {retirosDesempleo > 0 && (
            <p className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-[12px] leading-relaxed text-white/70">
              ⚠ Tu historial muestra <b className="text-white">{retirosDesempleo} semanas descontadas</b> por
              retiros por desempleo. Esos retiros redujeron tu saldo real y <i>no</i> están en la simulación,
              así que parte de la diferencia puede venir de ahí (y algunos se pueden reintegrar — pregúntanos).
            </p>
          )}

          <a
            href={unlockHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block rounded-xl bg-lime px-4 py-3 text-center text-sm font-bold text-ink"
          >
            Cuadrarlo con mi estado de cuenta · gratis
          </a>
        </div>
      )}

      <p className="mt-2 text-center text-[11px] text-white/50">
        Tu saldo es dato sensible: solo se usa para tu comparativo y tu asesoría. Puedes pedir que lo borremos.
      </p>
    </section>
  );
}
