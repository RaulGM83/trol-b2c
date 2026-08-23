'use client';

import { useState } from 'react';

function Copiable({ label, url }: { label: string; url: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="mt-2 first:mt-0">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-line bg-cream px-2 py-1 text-xs text-ink"
        />
        <button
          type="button"
          onClick={async () => {
            try { await navigator.clipboard.writeText(url); setOk(true); setTimeout(() => setOk(false), 1500); } catch { /* noop */ }
          }}
          className="shrink-0 rounded-lg border border-ink px-2.5 py-1 text-xs font-bold text-ink hover:bg-cream"
        >
          {ok ? '¡Copiado!' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}

export function CompartirLinks({ directo = null, expediente, referido }: { directo?: string | null; expediente: string; referido?: string | null }) {
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="mb-2 text-sm font-bold">Links para compartir</h2>
      {directo ? <Copiable label="Su expediente · entra directo (7 días)" url={directo} /> : null}
      <Copiable label={directo ? 'Link permanente (pide código SMS)' : 'Su expediente'} url={expediente} />
      {referido ? <Copiable label="Invitar amigos (referido)" url={referido} /> : null}
      <p className="mt-2 text-[11px] text-muted">Mándalos SOLO por el WhatsApp del propio cliente (Tako): el directo abre su expediente sin código. El de referido le da puntos por cada persona que llegue a diagnóstico.</p>
    </section>
  );
}
