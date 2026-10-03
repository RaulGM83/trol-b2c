'use client';
// 216 (claude/97) · Opinión sobre la AFORE, en trol3.
//
// Antes esto era una encuesta de 15 preguntas en el mundo legacy (public.encuesta_afore + un
// workflow de n8n que mandaba correos). Doce de esas preguntas ya las responden «los cinco» del
// paso 0 y los datos del expediente. Lo que vale la pena pedir aquí es la OPINIÓN: cómo la trata su
// AFORE, qué tan útiles son sus herramientas y si la recomendaría. Eso alimenta el Índice Trol de
// AFOREs y el argumento de traspaso. Si ya conocemos su AFORE (SISEC o dato declarado) no se le
// pregunta: se le confirma.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { AFORES, PUNTOS_ENCUESTA } from '@/lib/afores';

export type OpinionPrevia = { afore: string; atencion: number | null; asesoria: number | null; recomendaria: number | null; comentario: string | null; actualizado_en: string } | null;

export function EncuestaAfore({ aforeConocida, previa, volverHref, puntosYaDados }: {
  /** La AFORE que ya tenemos en su expediente (dato validado o declarado), si la hay. */
  aforeConocida: string | null;
  /** Lo que respondió la última vez, para corregirlo. */
  previa: OpinionPrevia;
  volverHref: string;
  /** Ya cobró los 50 puntos alguna vez: se le dice que esta vez es sólo actualizar. */
  puntosYaDados: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [afore, setAfore] = useState(previa?.afore ?? aforeConocida ?? '');
  const [cambiarAfore, setCambiarAfore] = useState(!(previa?.afore ?? aforeConocida));
  const [atencion, setAtencion] = useState(previa?.atencion ?? 0);
  const [asesoria, setAsesoria] = useState(previa?.asesoria ?? 0);
  const [recomendaria, setRecomendaria] = useState<number | null>(previa?.recomendaria ?? null);
  const [comentario, setComentario] = useState(previa?.comentario ?? '');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<{ puntos: number; afore: string } | null>(null);
  const vieneDeComparativo = volverHref === '/comparativo';

  async function enviar() {
    setError(null);
    if (!afore) return setError('Elige tu AFORE.');
    if (!atencion || !asesoria) return setError('Califica la atención y las herramientas de asesoría.');
    if (recomendaria == null) return setError('Indica qué tan probable es que la recomiendes.');
    setCargando(true);
    const { data, error } = await supabase.schema('trol3').rpc('opinar_afore', {
      p_afore: afore, p_atencion: atencion, p_asesoria: asesoria, p_recomendaria: recomendaria, p_comentario: comentario.trim() || null,
    });
    setCargando(false);
    if (error) {
      const m = error.message || '';
      return setError(m.includes('sin_persona') ? 'Entra con el celular de tu cuenta Trol para evaluar tu AFORE.' : m.includes('afore_invalida') ? 'Esa AFORE no está en la lista.' : 'No se pudo guardar tu opinión. Intenta de nuevo.');
    }
    const r = data as { ok?: boolean; puntos?: number; afore?: string };
    setListo({ puntos: r?.puntos ?? 0, afore: r?.afore ?? afore });
    router.refresh();
  }

  if (listo) {
    return (
      <main className="mx-auto max-w-xl px-5 py-6">
        <div className="rounded-2xl bg-ink p-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-lime text-xl font-extrabold text-ink">✓</div>
          <h1 className="text-xl font-extrabold">¡Gracias por tu opinión sobre {listo.afore}!</h1>
          {listo.puntos > 0 ? (
            <div className="mx-auto mt-4 inline-block rounded-full bg-lime px-3 py-1 text-sm font-bold text-ink">+{listo.puntos} pts acreditados</div>
          ) : (
            <p className="mt-1 text-sm text-white/70">Actualizamos tu evaluación.</p>
          )}
          <p className="mt-3 text-xs text-white/60">Tu experto la ve en tu expediente y cuenta para el Índice Trol de AFOREs.</p>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          {vieneDeComparativo ? (
            <Link href="/comparativo" className="rounded-xl bg-lime px-4 py-3 text-center text-sm font-bold text-ink">Ver dónde queda mi AFORE en mi comparativo →</Link>
          ) : (
            <Link href="/mi" className="rounded-xl bg-lime px-4 py-3 text-center text-sm font-bold text-ink">Volver a mi cuenta</Link>
          )}
          <Link href="/comparador" className="rounded-xl border border-line bg-white px-4 py-3 text-center text-sm font-bold text-ink">Ver todas las AFOREs</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-6">
      <header className="mb-6 flex items-center gap-2">
        <span className="rounded-lg bg-ink px-2.5 py-1 text-xl font-extrabold tracking-tight text-white">
          <img src="/marca/logo-trol-blanco.svg" alt="Trol financiero" className="inline-block h-[1.35em] w-auto align-middle" />
        </span>
        <Link href={volverHref} className="text-xs text-muted hover:underline">← mi cuenta</Link>
      </header>

      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">{previa ? 'Tu opinión sobre tu AFORE' : 'Evalúa tu AFORE'}</h1>
      <p className="mb-5 text-sm text-muted">
        Te toma 30 segundos. Lo que digas lo ve tu experto y, junto con lo que opinan otros clientes, sirve para saber qué AFOREs tratan bien a la gente.
        {!puntosYaDados ? <> Ganas <b className="text-ink">{PUNTOS_ENCUESTA} puntos</b>.</> : null}
      </p>

      <section className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-5">
        <div>
          <div className="mb-2 text-sm font-semibold">Tu AFORE</div>
          {!cambiarAfore && afore ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-ink px-3 py-1.5 text-sm font-bold text-white">{afore}</span>
              <span className="text-xs text-muted">{aforeConocida && afore === aforeConocida ? 'según tu información del IMSS / CONSAR' : 'la que nos dijiste'}</span>
              <button type="button" className="text-xs underline" onClick={() => setCambiarAfore(true)}>no es ésa</button>
            </div>
          ) : (
            <select value={afore} onChange={(e) => setAfore(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2 text-sm">
              <option value="">Elige tu AFORE…</option>
              {AFORES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          )}
        </div>

        <Estrellas label="¿Cómo te atienden?" value={atencion} onChange={setAtencion} />
        <Estrellas label="¿Qué tan útiles son su app y sus herramientas para planear tu retiro?" value={asesoria} onChange={setAsesoria} />

        <div>
          <div className="mb-2 text-sm font-semibold">¿Qué tan probable es que la recomiendes a un amigo? (0–10)</div>
          <div className="grid grid-cols-11 gap-1">
            {Array.from({ length: 11 }, (_, n) => (
              <button key={n} type="button" onClick={() => setRecomendaria(n)}
                className={`rounded-md border py-1.5 text-xs font-bold ${recomendaria === n ? 'border-ink bg-ink text-white' : 'border-line'}`}>{n}</button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-sm font-semibold">¿Algo que quieras contar de tu AFORE? (opcional)</div>
          <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} maxLength={400}
            placeholder="Lo bueno, lo malo, tu experiencia…" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
        </div>
      </section>

      <button onClick={enviar} disabled={cargando} className="mt-4 w-full rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
        {cargando ? 'Guardando…' : previa ? 'Actualizar mi opinión' : puntosYaDados ? 'Enviar' : `Enviar y ganar ${PUNTOS_ENCUESTA} pts`}
      </button>
      {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}
      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">
        Tu opinión se usa de forma agregada (sin tu nombre) para comparar AFOREs. Tu experto sí la ve, para asesorarte mejor.
      </p>
    </main>
  );
}

function Estrellas({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold">{label}</div>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)} className={`text-2xl leading-none ${n <= value ? 'text-lime' : 'text-line'}`} aria-label={`${n} de 5`}>★</button>
        ))}
      </div>
    </div>
  );
}
