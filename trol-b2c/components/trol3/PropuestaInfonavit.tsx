'use client';
// 299 · Propuesta Infonavit guardada, en /trabajo/infonavit: chip de estado + Copiar / Imagen / WhatsApp.
// Mandar por cualquier medio la marca como enviada (bitácora + cierra la tarea "Cotización inicial lista").
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { marcarPropuestaEnviada, generarPropuestasPendientes } from '@/app/trabajo/actions';
import { copiarTexto } from '@/components/trol3/CopiarMensaje';

export interface PropuestaGuardada {
  estado: 'lista' | 'enviada' | 'sin_cotizacion';
  motivo?: string | null;
  texto?: string | null;
  token?: string | null;
  preliminar?: boolean;
  enviada_en?: string | null;
  huella?: string | null;
  enviada_huella?: string | null;
  generada_en?: string | null;
}

const btn = 'rounded-lg border border-line bg-white px-2 py-0.5 text-[11px] font-semibold hover:bg-cream disabled:opacity-50';
const fecha = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '');

export function PropuestaInfonavit({ personaId, telefono, p }: { personaId: string; telefono: string | null; p: PropuestaGuardada | null }) {
  const [pend, start] = useTransition();
  if (!p) return <span className="text-[11px] text-muted">Sin generar</span>;
  if (p.estado === 'sin_cotizacion') return <span className="text-[11px] text-muted" title={p.motivo ?? ''}>Sin propuesta: {(p.motivo ?? '').slice(0, 60)}{(p.motivo ?? '').length > 60 ? '…' : ''}</span>;
  const cambio = p.estado === 'enviada' && p.enviada_huella && p.huella && p.enviada_huella !== p.huella;
  const tel = (telefono ?? '').replace(/\D/g, '');
  const wa = p.texto ? `https://wa.me/${tel.length === 10 ? '52' + tel : tel}?text=${encodeURIComponent(p.texto)}` : null;
  const marcar = (medio: 'texto' | 'imagen' | 'whatsapp') => start(async () => { const r = await marcarPropuestaEnviada(personaId, medio); if (!r.ok) toast.error((r as { error?: string }).error ?? 'No se registró'); });
  const copiar = async () => {
    if (!p.texto) return;
    if (await copiarTexto(p.texto)) { toast.success('Mensaje copiado'); marcar('texto'); } else toast.error('No se pudo copiar; usa WhatsApp');
  };
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.estado === 'enviada' ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>
        {p.estado === 'enviada' ? `Enviada ${fecha(p.enviada_en)}${cambio ? ' · cifras cambiaron' : ''}` : `Lista${p.preliminar ? ' (preliminar)' : ''}`}
      </span>
      <button type="button" className={btn} disabled={pend || !p.texto} onClick={copiar}>Copiar</button>
      {p.token ? <a className={btn} href={`/cotizacion/${p.token}.png`} target="_blank" rel="noreferrer" onClick={() => marcar('imagen')}>Imagen</a> : null}
      {wa ? <a className={btn} href={wa} target="_blank" rel="noreferrer" onClick={() => marcar('whatsapp')}>WhatsApp</a> : null}
    </div>
  );
}

export function GenerarPropuestas({ pendientes }: { pendientes: number }) {
  const [pend, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (!pendientes && !msg) return null;
  return (
    <span className="inline-flex items-center gap-2 text-[11px]">
      <button type="button" disabled={pend || !pendientes} className="rounded-lg border border-ink bg-white px-2.5 py-1 font-bold text-ink hover:bg-cream disabled:opacity-50"
        onClick={() => start(async () => { const r = await generarPropuestasPendientes(); setMsg(r.ok ? `Generadas ${(r as { generadas?: number }).generadas ?? 0}, sin propuesta ${(r as { sin_cotizacion?: number }).sin_cotizacion ?? 0}; faltan ${Math.max(0, pendientes - 60)}` : 'No se pudo'); })}>
        {pend ? 'Generando…' : `Generar propuestas pendientes (${pendientes})`}
      </button>
      {msg ? <span className="text-muted">{msg}</span> : null}
    </span>
  );
}
