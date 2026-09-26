'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { activarLote, fijarReto } from '@/app/trabajo/actions';
import { CarrilFila, type FilaCompleta } from '@/components/trol3/CarrilFila';
import type { Miembro } from '@/components/trol3/CarrilAcciones';

/**
 * 187 · Tibios: de dónde se llena Calientes con el reto del día. El reto lo pone el asesor;
 * el tope de toques (25) lo acota. El lote manda hasta `libres` plantillas en serie, cada quien
 * con SU oportunidad; a quien tocas del pozo te lo quedas. Dos tramos: primero los que nadie
 * ha tocado en 30 días (por potencial), al final los tocados hace poco (para no tocar siempre
 * a los mismos).
 */
export function TibiosLista({ filas, reto, tope, tocados, libres, alcance, esAdmin, miembros, equipo }: {
  filas: FilaCompleta[]; reto: { meta: number | null; llevas: number }; tope: number; tocados: number; libres: number;
  alcance: 'mios' | 'pozo'; esAdmin: boolean; miembros: Miembro[]; equipo: boolean;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [meta, setMeta] = useState<string>(String(reto.meta ?? ''));
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pending, start] = useTransition();
  const max = Math.max(0, Math.min(20, libres));
  const elegibles = filas.filter((f) => f.oportunidad_id && !f.no_contactar && (f.toque?.tipo ?? 'plantilla') !== 'llamada');
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else if (n.size < max) n.add(id); return n; });
  const mandar = () => {
    const items = elegibles.filter((f) => sel.has(f.persona_id)).map((f) => ({ opId: f.oportunidad_id as string, personaId: f.persona_id }));
    if (!items.length) return;
    if (!window.confirm(`Se le avisa a ${items.length} ${items.length === 1 ? 'persona' : 'personas'}: dentro de su chat si sigue abierto, o con la plantilla de lo que le encontramos. Pasan a Calientes por hoy${alcance === 'pozo' ? ' y quedan como tuyas' : ''}. ¿Mandamos?`)) return;
    start(async () => {
      const r = await activarLote(items) as { ok: boolean; error?: string; texto?: string };
      setMsg(r.ok ? { ok: true, texto: r.texto ?? 'Enviado.' } : { ok: false, texto: r.error ?? 'No se pudo.' });
      if (r.ok) { setSel(new Set()); router.refresh(); }
    });
  };
  const guardarMeta = () => {
    const n = Number(meta); if (!n || n < 1) return;
    start(async () => { const r = await fijarReto(Math.min(n, tope)) as { ok: boolean; error?: string }; if (r.ok) router.refresh(); else setMsg({ ok: false, texto: r.error ?? 'No se pudo guardar el reto.' }); });
  };
  const cumplido = reto.meta != null && reto.llevas >= reto.meta;
  const t1 = filas.filter((f) => (f.tramo ?? 1) === 1); const t2 = filas.filter((f) => f.tramo === 2);
  const fila = (f: FilaCompleta, atenuada = false) => (
    <CarrilFila key={f.persona_id} f={f} libres={libres} alcance={alcance} esAdmin={esAdmin} miembros={miembros} equipo={equipo} atenuada={atenuada}
      izquierda={<input type="checkbox" aria-label={`Seleccionar a ${f.nombre ?? 'esta persona'}`} className="h-4 w-4" checked={sel.has(f.persona_id)} disabled={!elegibles.includes(f) || (!sel.has(f.persona_id) && sel.size >= max)} onChange={() => alternar(f.persona_id)} />} />
  );
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-cream px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-bold">Tu reto de hoy:</span>
          <label htmlFor="reto" className="text-muted">tocar</label>
          <input id="reto" type="number" min={1} max={tope} value={meta} onChange={(e) => setMeta(e.target.value)} onBlur={guardarMeta} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className="w-16 rounded-lg border border-line bg-white px-2 py-1 font-mono text-sm" placeholder="—" />
          <span>· llevas <b className="font-mono">{reto.llevas}</b></span>
          {cumplido ? <span className="rounded-full bg-lime px-2 py-0.5 text-[11px] font-bold text-ink">Reto cumplido</span> : null}
        </div>
        <div className="text-xs text-muted">
          {libres > 0 ? <>Te caben <b className="font-mono text-ink">{libres}</b> en Calientes ahora ({tocados} de {tope} tocados esperando reacción).</> : <span className="font-semibold text-red-700">Tope del día alcanzado: se libera cuando alguien reaccione o mañana.</span>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <button type="button" disabled={!max} className="rounded-lg border border-line bg-white px-2.5 py-1 font-semibold disabled:opacity-50" onClick={() => setSel(sel.size ? new Set() : new Set(elegibles.slice(0, max).map((f) => f.persona_id)))}>{sel.size ? 'Quitar selección' : `Seleccionar ${Math.min(max, elegibles.length)}`}</button>
          <span className="text-muted">{sel.size} de {max} seleccionados · sólo los que van por plantilla o Lukas</span>
        </div>
        <button type="button" disabled={pending || !sel.size} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" onClick={mandar}>{pending ? 'Enviando…' : 'Tocar a los seleccionados'}</button>
      </div>
      {msg ? <p className={msg.ok ? 'mt-2 text-xs text-green-700' : 'mt-2 text-xs text-red-600'}>{msg.texto}</p> : null}
      {t1.length ? <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Sin tocar en 30 días · por potencial</div> : null}
      <ul>{t1.map((f) => fila(f))}</ul>
      {t2.length ? <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Tocados hace poco · al final, sin importar el potencial</div> : null}
      <ul>{t2.map((f) => fila(f, true))}</ul>
      {!filas.length ? <p className="border-t border-line py-4 text-sm text-muted">Nadie en este tema por ahora.</p> : null}
    </div>
  );
}
