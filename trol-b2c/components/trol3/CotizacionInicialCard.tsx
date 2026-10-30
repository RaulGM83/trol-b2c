'use client';
// 276 · Cotización inicial Infonavit: dos plazos listos para compartir por WhatsApp sin abrir la
// calculadora. Copiar el texto o abrir la imagen deja la foto de los números en la bitácora.
import { useState, useTransition } from 'react';
import { registrarCotizacionInicial } from '@/app/trabajo/actions';
import type { CotizacionInicial } from '@/lib/infonavit/cotizacion-inicial';

const mxn0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const money = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : mxn0.format(n));
const btn = 'rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-cream disabled:opacity-50';

const CRITERIO: Record<string, string> = {
  menor_pago: 'el que pide menos al mes',
  mayor_potencial: 'el de mayor potencial a ese plazo',
  mismo_inmueble: 'el mismo inmueble, vendiendo más tarde',
};

export function CotizacionInicialCard({ personaId, cot, texto, motivo }: {
  personaId: string; cot: CotizacionInicial | null; texto: string | null; motivo: string | null;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pend, start] = useTransition();
  if (!cot || !texto) {
    return (
      <section className="mb-4 rounded-2xl border border-line bg-white p-4 text-xs text-muted">
        <b className="text-ink">Cotización inicial Infonavit:</b> {motivo ?? 'no disponible'}.
      </section>
    );
  }
  const registrar = (medio: 'texto' | 'imagen') => start(async () => {
    const r = await registrarCotizacionInicial(personaId, medio, cot);
    setMsg(r.ok ? (medio === 'texto' ? 'Mensaje copiado. Quedó en la bitácora.' : 'Imagen abierta. Quedó en la bitácora.') : `No se registró: ${(r as { error?: string }).error ?? ''}`);
  });
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); } catch { setMsg('No pude copiar; selecciona el texto abajo.'); return; }
    registrar('texto');
  };
  return (
    <section className="mb-4 rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Cotización inicial · para WhatsApp</h2>
          <p className="mt-0.5 text-xs text-muted">
            Saldo validado {money(cot.saldo)}{cot.credito_max ? ` · crédito Infonavit hasta ${money(cot.credito_max)}` : ''}
            {cot.fecha_saldo ? ` · ${new Date(cot.fecha_saldo).toLocaleDateString('es-MX')}` : ''}. Un titular, supuestos globales.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={btn} disabled={pend} onClick={copiar}>Copiar mensaje</button>
          <a className={btn} href={`/trabajo/infonavit/cotizacion/${personaId}`} target="_blank" rel="noreferrer" onClick={() => registrar('imagen')}>Imagen</a>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {cot.opciones.map((o) => (
          <div key={o.plazo} className="rounded-xl border border-line p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted">Si vende en {o.plazo} meses</div>
            <div className="mt-1 text-sm font-bold">{o.nombre}</div>
            {o.ubicacion ? <div className="text-xs">{o.ubicacion}</div> : null}
            <div className="text-[11px] text-muted">{o.desarrollo}{o.zona ? ` · ${o.zona}` : ''}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div><div className="text-[11px] text-muted">Pone al mes (crédito − renta)</div><div className="font-semibold tabular-nums">{o.pone_al_mes > 0 ? money(o.pone_al_mes) : 'La renta lo cubre'}</div></div>
              <div><div className="text-[11px] text-muted">Recibe al vender</div><div className="font-bold tabular-nums text-green-800">{money(o.recibe_al_vender)}</div></div>
            </div>
            <div className="mt-2 text-[11px] text-muted">
              Crédito {money(o.credito)} · pago {money(o.pago)} · renta neta {money(o.renta_neta)} · ventaja {money(o.ventaja)} · {CRITERIO[o.criterio]}
              {o.ficha_url ? <> · <a href={o.ficha_url} target="_blank" rel="noreferrer" className="underline">ficha</a></> : null}
            </div>
          </div>
        ))}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-muted">Ver el mensaje</summary>
        <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-cream p-3 text-xs">{texto}</pre>
      </details>
      {msg ? <p className="mt-2 text-xs text-muted">{msg}</p> : null}
    </section>
  );
}
