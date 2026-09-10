'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ligarCita, buscarPersonasRapido } from '@/app/trabajo/actions';

// Citas (134). La liga de reserva es de Google Calendar: la de la cabecera si
// tiene, si no la general del equipo. El asesor la abre o la copia para
// pegarla en WhatsApp. La cita agendada regresa sola a trol3 por api-trol.
export type LinkCitas = { link?: string; miembro?: string | null; general?: boolean };

const btn = 'rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-cream disabled:opacity-50';

export function AgendarBoton({ info }: { info: LinkCitas | null }) {
  const [msg, setMsg] = useState<string | null>(null);
  if (!info?.link) return null;
  const quien = info.general ? 'agenda del equipo' : `agenda de ${info.miembro?.split(' ')[0] ?? 'su experto'}`;
  return (
    <span className="inline-flex items-center gap-1">
      <a href={info.link} target="_blank" rel="noreferrer" className={btn} title={quien}>Agendar</a>
      <button className="text-[10px] text-muted underline" title={`Copiar la liga (${quien})`} onClick={async () => { try { await navigator.clipboard.writeText(info.link!); setMsg('copiada'); setTimeout(() => setMsg(null), 1500); } catch { setMsg(info.link!); } }}>{msg ?? 'copiar liga'}</button>
    </span>
  );
}

export type CitaEquipo = { id: string; persona_id: string | null; miembro: string | null; inicio: string; fin: string | null; estado: string; fuente: string; titulo: string | null; meet_url: string | null; nombre: string | null; invitado_telefono: string | null; invitado_email: string | null; sin_expediente: boolean };

const fecha = (s: string) => new Date(s).toLocaleString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });

export function CitasEquipo({ citas }: { citas: CitaEquipo[] }) {
  if (!citas.length) return <p className="text-xs text-muted">Sin citas en los próximos 7 días.</p>;
  return (
    <ul className="space-y-1 text-sm">
      {citas.map((c) => (
        <li key={c.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1 ${c.sin_expediente ? 'bg-amber-50' : 'bg-cream/60'} ${c.estado === 'cancelada' ? 'line-through opacity-60' : ''}`}>
          <span>
            <b>{fecha(c.inicio)}</b> · {c.persona_id ? <Link href={`/trabajo/p/${c.persona_id}`} className="font-semibold underline">{c.nombre || 'Sin nombre'}</Link> : <span>{c.nombre || c.invitado_email || 'Sin nombre'}</span>}
            {c.miembro ? <span className="text-muted"> · {c.miembro.split(' ')[0]}</span> : null}
            {c.invitado_telefono ? <span className="text-muted"> · {c.invitado_telefono}</span> : null}
            {c.estado !== 'programada' ? <span className="ml-1 rounded-full bg-white px-1.5 text-[10px]">{c.estado}</span> : null}
          </span>
          <span className="flex items-center gap-2 text-xs">
            {c.meet_url ? <a href={c.meet_url} target="_blank" rel="noreferrer" className="underline">Meet</a> : null}
            {c.sin_expediente ? <LigarCita citaId={c.id} /> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

// La cita llegó del calendario con un teléfono o correo que no está en trol3:
// alguien del equipo la liga a mano buscando a la persona.
function LigarCita({ citaId }: { citaId: string }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ id: string; nombre: string }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="text-amber-800">sin expediente</span>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="nombre o teléfono" className="w-36 rounded border border-line px-1 py-0.5 text-xs" />
      <button disabled={pending || q.trim().length < 3} className="underline disabled:opacity-40" onClick={() => start(async () => { const r = await buscarPersonasRapido(q.trim()); setRes(r.ok ? (r as { ok: boolean; personas?: { id: string; nombre: string }[] }).personas ?? [] : []); })}>buscar</button>
      {res.map((p) => <button key={p.id} disabled={pending} className="rounded bg-ink px-1.5 py-0.5 text-[10px] text-white" onClick={() => start(async () => { const r = await ligarCita(citaId, p.id); setMsg(r.ok ? 'ligada' : (r as { error?: string }).error ?? 'error'); })}>{p.nombre}</button>)}
      {msg && <span className="text-muted">{msg}</span>}
    </span>
  );
}
