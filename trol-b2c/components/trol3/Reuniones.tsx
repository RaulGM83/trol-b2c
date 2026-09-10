'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { decidirPropuestaReunion, releerReunion, ligarReunion, buscarPersonasRapido } from '@/app/trabajo/actions';

// Reuniones (135): lo que Granola escuchó, y lo que propone para el expediente.
// Lo blando ya se aplicó solo (marcado "auto"); lo duro espera al asesor.
export type ReunionRow = {
  id: string; persona_id: string | null; miembro: string | null; titulo: string | null; inicio: string | null; fin: string | null;
  resumen_md: string | null; web_url: string | null; propuestas: Propuesta[]; extraccion_estado: string; extraccion_error: string | null;
  persona_nombre?: string | null; sin_expediente?: boolean; pendientes?: number;
};
export type Propuesta = { i: number; tipo: 'dato' | 'tarea' | 'nota'; campo?: string; nombre_campo?: string; valor?: unknown; texto?: string; detalle?: string; quien?: string; vence_el?: string | null; evidencia?: string; auto: boolean; estado: 'pendiente' | 'aplicada' | 'descartada' };

type R = { ok: boolean; error?: string; mensaje?: string };
const fecha = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' }) : '—');
const btn = 'rounded-lg border border-line bg-white px-2 py-0.5 text-[11px] font-semibold hover:bg-cream disabled:opacity-50';
const btnDark = 'rounded-lg bg-ink px-2 py-0.5 text-[11px] font-semibold text-white hover:opacity-90 disabled:opacity-50';
const mostrarValor = (v: unknown) => (typeof v === 'number' ? new Intl.NumberFormat('es-MX').format(v) : typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v ?? ''));

function Propuestas({ reunion, personaId }: { reunion: ReunionRow; personaId: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const decidir = (i: number, decision: 'aplicar' | 'descartar') => start(async () => { const r = (await decidirPropuestaReunion(reunion.id, i, decision, personaId)) as R; setMsg(r.ok ? null : r.error ?? 'error'); });
  const pend = reunion.propuestas.filter((p) => p.estado === 'pendiente');
  const hechas = reunion.propuestas.filter((p) => p.estado !== 'pendiente');
  return (
    <div className="mt-2 space-y-1 text-xs">
      {pend.length ? <div className="font-semibold">Propone ({pend.length}) — confirma o descarta:</div> : null}
      {pend.map((p) => (
        <div key={p.i} className="flex flex-wrap items-start justify-between gap-2 rounded-lg bg-amber-50 px-2 py-1">
          <span>
            {p.tipo === 'dato' ? <><b>{p.nombre_campo ?? p.campo}</b>: {mostrarValor(p.valor)}{p.evidencia ? <span className="text-muted"> · “{p.evidencia}”</span> : null}</> : null}
            {p.tipo === 'tarea' ? <><b>Pendiente</b> ({p.quien === 'cliente' ? 'cliente' : 'Trol'}{p.vence_el ? `, para ${p.vence_el}` : ''}): {p.texto}</> : null}
            {p.tipo === 'nota' ? <><b>Nota</b>: {p.texto}</> : null}
          </span>
          <span className="flex shrink-0 gap-1">
            <button disabled={pending} className={btnDark} onClick={() => decidir(p.i, 'aplicar')}>Aplicar</button>
            <button disabled={pending} className={btn} onClick={() => decidir(p.i, 'descartar')}>Descartar</button>
          </span>
        </div>
      ))}
      {hechas.length ? (
        <details className="text-muted"><summary className="cursor-pointer">Ya decididas ({hechas.length})</summary>
          <ul className="mt-1 space-y-0.5">{hechas.map((p) => <li key={p.i} className={p.estado === 'descartada' ? 'line-through' : ''}>{p.tipo === 'dato' ? `${p.nombre_campo ?? p.campo}: ${mostrarValor(p.valor)}` : p.texto}{p.auto && p.estado === 'aplicada' ? ' · auto' : ''}</li>)}</ul>
        </details>
      ) : null}
      {msg && <p className="text-red-600">{msg}</p>}
    </div>
  );
}

export function ReunionesPanel({ reuniones, personaId }: { reuniones: ReunionRow[]; personaId: string }) {
  const [abierta, setAbierta] = useState<string | null>(reuniones[0]?.id ?? null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!reuniones.length) return null;
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="mb-2 text-sm font-bold">Reuniones {reuniones.some((r) => (r.pendientes ?? 0) > 0) ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">{reuniones.reduce((s, r) => s + (r.pendientes ?? 0), 0)} por confirmar</span> : null}</h2>
      <ul className="space-y-2 text-sm">
        {reuniones.map((r) => (
          <li key={r.id} className="rounded-xl bg-cream/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button className="text-left font-semibold" onClick={() => setAbierta(abierta === r.id ? null : r.id)}>{fecha(r.inicio)}{r.miembro ? ` · ${r.miembro.split(' ')[0]}` : ''}{r.titulo ? ` · ${r.titulo}` : ''}</button>
              <span className="flex items-center gap-2 text-xs">
                {r.extraccion_estado === 'error' ? <span className="text-red-600" title={r.extraccion_error ?? ''}>lectura falló</span> : r.extraccion_estado === 'pendiente' ? <span className="text-muted">sin leer</span> : null}
                {r.web_url ? <a href={r.web_url} target="_blank" rel="noreferrer" className="underline">Granola</a> : null}
                <button disabled={pending} className="underline" onClick={() => start(async () => { const x = (await releerReunion(r.id, personaId)) as R; setMsg(x.ok ? x.mensaje ?? 'leída' : x.error ?? 'error'); })}>{pending ? '…' : 'Volver a leer'}</button>
              </span>
            </div>
            {abierta === r.id ? (
              <div className="mt-2">
                {r.resumen_md ? <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-2 text-xs leading-snug">{r.resumen_md}</pre> : <p className="text-xs text-muted">Sin resumen.</p>}
                <Propuestas reunion={r} personaId={personaId} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {msg && <p className="mt-2 text-xs text-muted">{msg}</p>}
    </section>
  );
}

/** Hoy: reuniones que llegaron sin expediente. */
export function ReunionesSinExpediente({ reuniones }: { reuniones: ReunionRow[] }) {
  if (!reuniones.length) return null;
  return (
    <ul className="space-y-1 text-sm">
      {reuniones.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-2 py-1"><span><b>{fecha(r.inicio)}</b>{r.miembro ? ` · ${r.miembro.split(' ')[0]}` : ''} · {r.titulo ?? 'Reunión'}{r.web_url ? <> · <a href={r.web_url} target="_blank" rel="noreferrer" className="underline">Granola</a></> : null}</span><LigarReunion reunionId={r.id} /></li>)}
    </ul>
  );
}

function LigarReunion({ reunionId }: { reunionId: string }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ id: string; nombre: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs">
      <span className="text-amber-800">sin expediente</span>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="nombre o teléfono" className="w-36 rounded border border-line px-1 py-0.5" />
      <button disabled={pending || q.trim().length < 3} className="underline disabled:opacity-40" onClick={() => start(async () => { const r = await buscarPersonasRapido(q.trim()); setRes(r.ok ? (r as { personas?: { id: string; nombre: string }[] }).personas ?? [] : []); })}>buscar</button>
      {res.map((p) => <button key={p.id} disabled={pending} className={btnDark} onClick={() => start(async () => { const r = (await ligarReunion(reunionId, p.id)) as R; setMsg(r.ok ? r.mensaje ?? 'ligada' : r.error ?? 'error'); })}>{p.nombre}</button>)}
      {msg && <span className="text-muted">{msg}</span>}
      <Link href="/trabajo" className="text-muted underline">buscar más</Link>
    </span>
  );
}
