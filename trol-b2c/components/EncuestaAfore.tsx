'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  AFORES,
  PUNTOS_ENCUESTA,
  ESTADOS_MX,
  HORIZONTE_RETIRO,
  SITUACION_LABORAL,
  AHORRO_MENSUAL,
  CONTACTO_CANAL,
  CONTACTO_HORARIO,
} from '@/lib/afores';

type Prefill = {
  afore?: string;
  atencion?: number;
  asesoria?: number;
  recomendaria?: number;
  comentario?: string;
  infonavit_usado?: boolean | null;
  interes_ahorro?: boolean | null;
  estado?: string;
  situacion_pensional?: string;
  horizonte_retiro?: string;
  situacion_laboral?: string;
  ahorro_mensual?: string;
  contacto_canal?: string;
  contacto_horario?: string;
};

export function EncuestaAfore({ prefill }: { prefill?: Prefill }) {
  const [afore, setAfore] = useState(prefill?.afore ?? '');
  const [atencion, setAtencion] = useState(prefill?.atencion ?? 0);
  const [asesoria, setAsesoria] = useState(prefill?.asesoria ?? 0);
  const [recomendaria, setRecomendaria] = useState<number | null>(prefill?.recomendaria ?? null);
  const [comentario, setComentario] = useState(prefill?.comentario ?? '');

  const [infonavit, setInfonavit] = useState<boolean | null>(prefill?.infonavit_usado ?? null);
  const [interes, setInteres] = useState<boolean | null>(prefill?.interes_ahorro ?? null);
  const [estado, setEstado] = useState(prefill?.estado ?? '');
  const [situacion, setSituacion] = useState(prefill?.situacion_pensional ?? '');
  const [horizonte, setHorizonte] = useState(prefill?.horizonte_retiro ?? '');
  const [laboral, setLaboral] = useState(prefill?.situacion_laboral ?? '');
  const [ahorro, setAhorro] = useState(prefill?.ahorro_mensual ?? '');
  const [canal, setCanal] = useState(prefill?.contacto_canal ?? '');
  const [horario, setHorario] = useState(prefill?.contacto_horario ?? '');

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<{ otorgado: boolean } | null>(null);

  async function enviar() {
    setError(null);
    if (!afore) return setError('Elige tu AFORE.');
    if (!atencion || !asesoria) return setError('Califica atención y herramientas de asesoría.');
    if (recomendaria == null) return setError('Indica qué tan probable es que la recomiendes.');

    setCargando(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('responder_encuesta_afore', {
      p_datos: {
        afore,
        atencion,
        asesoria,
        recomendaria,
        comentario: comentario || null,
        infonavit_usado: infonavit,
        interes_ahorro: interes,
        estado: estado || null,
        situacion_pensional: situacion || null,
        horizonte_retiro: horizonte || null,
        situacion_laboral: laboral || null,
        ahorro_mensual: ahorro || null,
        contacto_canal: canal || null,
        contacto_horario: horario || null,
      },
    });
    setCargando(false);
    const r = data as { ok?: boolean; otorgado?: boolean; error?: string } | null;
    if (error) return setError(error.message);
    if (!r?.ok) {
      if (r?.error === 'sin_cliente')
        return setError('Necesitas tener tu diagnóstico para evaluar tu AFORE. Entra con el celular de tu cuenta.');
      return setError('No se pudo guardar tu respuesta. Intenta de nuevo.');
    }
    setListo({ otorgado: !!r.otorgado });
  }

  if (listo) {
    return (
      <main className="mx-auto max-w-xl px-5 py-6">
        <div className="rounded-2xl bg-ink p-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-lime text-xl font-extrabold text-ink">
            ✓
          </div>
          <h1 className="text-xl font-extrabold">¡Gracias por tu opinión!</h1>
          {listo.otorgado ? (
            <div className="mx-auto mt-4 inline-block rounded-full bg-lime px-3 py-1 text-sm font-bold text-ink">
              +{PUNTOS_ENCUESTA} pts acreditados
            </div>
          ) : (
            <p className="mt-1 text-sm text-white/70">Actualizamos tu evaluación.</p>
          )}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <Link href="/mejor-jugada" className="rounded-xl bg-lime px-4 py-3 text-center text-sm font-bold text-ink">
            Usar mis puntos
          </Link>
          <Link href="/diagnostico" className="rounded-xl border border-line bg-white px-4 py-3 text-center text-sm font-bold text-ink">
            Volver a mi diagnóstico
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-6">
      <header className="mb-6 flex items-center gap-2">
        <span className="text-xl font-extrabold tracking-tight">
          tr<span className="text-lime">o</span>l
        </span>
        <Link href="/diagnostico" className="text-xs text-muted hover:underline">
          ← volver
        </Link>
      </header>

      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Evalúa tu AFORE y gana puntos</h1>
      <p className="mb-5 text-sm text-muted">
        Tu opinión ayuda a otros y nos permite personalizar tu plan. Te toma 1 minuto y ganas{' '}
        <b className="text-ink">{PUNTOS_ENCUESTA} puntos</b>.
      </p>

      {/* Sección 1: tu AFORE */}
      <section className="flex flex-col gap-5 rounded-2xl border border-line bg-white p-5">
        <div className="text-[11px] font-bold uppercase tracking-wide text-muted">Tu AFORE</div>
        <div>
          <div className="mb-2 text-sm font-semibold">¿En qué AFORE estás?</div>
          <select value={afore} onChange={(e) => setAfore(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2 text-sm">
            <option value="">Elige tu AFORE…</option>
            {AFORES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
            <option value="No sé">No sé cuál es mi AFORE</option>
          </select>
        </div>

        <Estrellas label="Atención al cliente" value={atencion} onChange={setAtencion} />
        <Estrellas label="Herramientas de asesoría" value={asesoria} onChange={setAsesoria} />

        <div>
          <div className="mb-2 text-sm font-semibold">¿Qué tan probable es que la recomiendes? (0–10)</div>
          <div className="grid grid-cols-11 gap-1">
            {Array.from({ length: 11 }, (_, n) => (
              <button key={n} type="button" onClick={() => setRecomendaria(n)}
                className={`rounded-md border py-1.5 text-xs font-bold ${recomendaria === n ? 'border-ink bg-ink text-white' : 'border-line'}`}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-sm font-semibold">¿Algo de tu AFORE que quieras contar? (opcional)</div>
          <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} rows={2} maxLength={400}
            placeholder="Lo bueno, lo malo, tu experiencia…" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
        </div>
      </section>

      {/* Sección 2: tu situación (prospección, opcional) */}
      <section className="mt-5 flex flex-col gap-5 rounded-2xl border border-line bg-white p-5">
        <div className="text-[11px] font-bold uppercase tracking-wide text-muted">Tu situación (para personalizar tu plan)</div>

        <SiNo label="¿Ya usaste tu crédito Infonavit?" value={infonavit} onChange={setInfonavit} />
        <SiNo label="¿Te interesa conocer productos de ahorro e inversión?" value={interes} onChange={setInteres} />

        <Selector label="¿Cuándo planeas pensionarte?" value={horizonte} onChange={setHorizonte} opciones={HORIZONTE_RETIRO} />
        <Selector label="¿Cuál es tu situación laboral hoy?" value={laboral} onChange={setLaboral} opciones={SITUACION_LABORAL} />
        <Selector label="¿Cuánto podrías ahorrar al mes para tu retiro?" value={ahorro} onChange={setAhorro} opciones={AHORRO_MENSUAL} />

        <div>
          <div className="mb-2 text-sm font-semibold">¿En qué estado vives?</div>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2 text-sm">
            <option value="">Elige tu estado…</option>
            {ESTADOS_MX.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold">¿Cómo prefieres que te contactemos?</div>
          <div className="grid grid-cols-2 gap-2">
            {CONTACTO_CANAL.map((o) => (
              <button key={o.v} type="button" onClick={() => setCanal(o.v)}
                className={`rounded-lg border py-2 text-sm font-bold ${canal === o.v ? 'border-ink bg-ink text-white' : 'border-line'}`}>
                {o.l}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {CONTACTO_HORARIO.map((o) => (
              <button key={o.v} type="button" onClick={() => setHorario(o.v)}
                className={`rounded-lg border py-2 text-xs font-bold ${horario === o.v ? 'border-ink bg-ink text-white' : 'border-line'}`}>
                {o.l}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-sm font-semibold">Cuéntanos tu situación pensional (opcional)</div>
          <textarea value={situacion} onChange={(e) => setSituacion(e.target.value)} rows={3} maxLength={600}
            placeholder="Tus dudas, tu meta, lo que te preocupa de tu pensión…" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
        </div>
      </section>

      <button onClick={enviar} disabled={cargando}
        className="mt-4 w-full rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white disabled:opacity-60">
        {cargando ? 'Guardando…' : `Enviar y ganar ${PUNTOS_ENCUESTA} pts`}
      </button>
      {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}

      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">
        Tus respuestas de AFORE se usan de forma agregada para el comparador. El resto nos ayuda a darte mejor asesoría.
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
          <button key={n} type="button" onClick={() => onChange(n)}
            className={`text-2xl leading-none ${n <= value ? 'text-lime' : 'text-line'}`} aria-label={`${n} de 5`}>
            ★
          </button>
        ))}
      </div>
    </div>
  );
}

function SiNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold">{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onChange(true)}
          className={`rounded-lg border py-2 text-sm font-bold ${value === true ? 'border-ink bg-ink text-white' : 'border-line'}`}>
          Sí
        </button>
        <button type="button" onClick={() => onChange(false)}
          className={`rounded-lg border py-2 text-sm font-bold ${value === false ? 'border-ink bg-ink text-white' : 'border-line'}`}>
          No
        </button>
      </div>
    </div>
  );
}

function Selector({
  label, value, onChange, opciones,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  opciones: readonly { v: string; l: string }[];
}) {
  return (
    <div>
      <div className="mb-2 text-sm font-semibold">{label}</div>
      <div className="flex flex-wrap gap-2">
        {opciones.map((o) => (
          <button key={o.v} type="button" onClick={() => onChange(o.v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${value === o.v ? 'border-ink bg-ink text-white' : 'border-line'}`}>
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}
