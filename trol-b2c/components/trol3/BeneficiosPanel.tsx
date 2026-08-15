'use client';
import { useState, useTransition } from 'react';
import { otorgarBeneficio, revocarBeneficio } from '@/app/trabajo/actions';

/* eslint-disable @typescript-eslint/no-explicit-any */
export function BeneficiosPanel({ personaId, beneficios, catalogo }: { personaId: string; beneficios: any[]; catalogo: { codigo: string; nombre: string }[] }) {
  const [codigo, setCodigo] = useState(catalogo[0]?.codigo ?? '');
  const [origen, setOrigen] = useState('asesor');
  const [motivo, setMotivo] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const activos = beneficios.filter((b) => !b.revocado_at && (!b.expira || new Date(b.expira) > new Date()));
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="mb-1 text-sm font-bold">Habilitaciones del cliente</h2>
      <p className="mb-2 text-xs text-muted">Lo que el cliente ve desbloqueado en su web. Úsalo cuando pagó por transferencia, por un aliado o como cortesía.</p>
      <ul className="mb-3 space-y-1 text-xs">
        {activos.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-2 border-t border-line/70 py-1">
            <span><b>{catalogo.find((c) => c.codigo === b.codigo)?.nombre ?? b.codigo}</b> <span className="text-muted">· {b.origen}{b.motivo ? ` · ${b.motivo}` : ''} · {new Date(b.desde).toLocaleDateString('es-MX')}</span></span>
            <button disabled={pending} className="text-[10px] text-red-600 underline" onClick={() => start(async () => { await revocarBeneficio(personaId, b.id); })}>quitar</button>
          </li>
        ))}
        {!activos.length && <li className="text-muted">Nada habilitado todavía.</li>}
      </ul>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select value={codigo} onChange={(e) => setCodigo(e.target.value)} className="rounded-lg border border-line px-2 py-1.5">{catalogo.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}</select>
        <select value={origen} onChange={(e) => setOrigen(e.target.value)} className="rounded-lg border border-line px-2 py-1.5"><option value="asesor">Pago fuera de la web</option><option value="promo">Cortesía / promoción</option><option value="aliado">Vía aliado</option></select>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo / referencia (p. ej. transferencia 15-ago)" className="min-w-[200px] flex-1 rounded-lg border border-line px-2 py-1.5" />
        <button disabled={pending || !codigo} className="rounded-lg bg-ink px-3 py-1.5 font-semibold text-white disabled:opacity-50" onClick={() => start(async () => { const r = await otorgarBeneficio(personaId, codigo, motivo, origen); setMsg(r.ok ? 'Habilitado; el cliente lo ve ya.' : (r as { error?: string }).error ?? 'error'); if (r.ok) setMotivo(''); })}>Habilitar</button>
        {msg && <span className="text-muted">{msg}</span>}
      </div>
    </section>
  );
}
