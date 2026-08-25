'use client';
// Cambio de etapa de una oportunidad (ciclo unificado, migración 084).
// Se usa en el expediente (/trabajo/p/[id]) y en la lista por línea (/trabajo/embudo).
import { useState, useTransition } from 'react';
import { cambiarEstadoOportunidad, asignarEspecialista } from '@/app/trabajo/actions';

type R = { ok: boolean; error?: string };
export type Motivo = { codigo: string; nombre: string };
export type ProveedorOp = { codigo: string; nombre: string; lineas: string[] };
export type OpEtapa = {
  id: string; codigo: string; estado: string; especialista_id?: string | null;
  motivo_perdida?: string | null; proveedor?: string | null; contactar_despues?: string | null; nota_estado?: string | null;
};

const ESTADOS: [string, string][] = [
  ['detectada', 'Detectada'], ['presentada', 'Presentada'], ['interesada', 'Interesada'], ['en_proceso', 'En proceso'], ['ganada', 'Ganada'], ['perdida', 'Perdida'], ['no_aplica', 'No aplica'],
];
export const ESTADO_COLOR: Record<string, string> = {
  posible: 'bg-cream text-muted', detectada: 'bg-cream text-ink', presentada: 'bg-sky-100 text-sky-900', interesada: 'bg-lime/60 text-ink',
  en_proceso: 'bg-amber-100 text-amber-900', ganada: 'bg-emerald-100 text-emerald-900', perdida: 'bg-red-100 text-red-900', no_aplica: 'bg-gray-100 text-gray-500',
};
const btnDark = 'rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50';
const sel = 'rounded-lg border border-line bg-white px-2 py-1 text-xs';

export function OportunidadEtapa({ op, personaId, motivos, proveedores, miembros, compacto }: {
  op: OpEtapa; personaId: string; motivos: Motivo[]; proveedores: ProveedorOp[]; miembros?: { id: string; nombre: string }[]; compacto?: boolean;
}) {
  const [pending, start] = useTransition();
  const [estado, setEstado] = useState(op.estado === 'posible' ? 'detectada' : op.estado);
  const [motivo, setMotivo] = useState(op.motivo_perdida ?? '');
  const [prov, setProv] = useState(op.proveedor ?? '');
  const [fecha, setFecha] = useState(op.contactar_despues ?? '');
  const [nota, setNota] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const provs = proveedores.filter((p) => !p.lineas?.length || p.lineas.includes(op.codigo));
  const cambio = estado !== op.estado || motivo !== (op.motivo_perdida ?? '') || prov !== (op.proveedor ?? '') || fecha !== (op.contactar_despues ?? '') || !!nota.trim();
  const guardar = () => start(async () => {
    setMsg(null);
    const r = (await cambiarEstadoOportunidad(op.id, personaId, estado, { motivo: motivo || null, proveedor: prov || null, contactar_despues: fecha || null, nota })) as R;
    if (!r.ok) setMsg(r.error ?? 'error'); else setNota('');
  });
  return (
    <div className={`mt-2 flex flex-wrap items-center gap-2 ${compacto ? '' : ''}`}>
      <select value={estado} onChange={(e) => setEstado(e.target.value)} className={`${sel} font-semibold ${ESTADO_COLOR[estado] ?? ''}`} disabled={pending}>
        {ESTADOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      {estado === 'perdida' && (
        <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={sel} disabled={pending}>
          <option value="">Motivo…</option>
          {motivos.map((m) => <option key={m.codigo} value={m.codigo}>{m.nombre}</option>)}
        </select>
      )}
      {['interesada', 'en_proceso', 'ganada'].includes(estado) && provs.length > 0 && (
        <select value={prov} onChange={(e) => setProv(e.target.value)} className={sel} disabled={pending}>
          <option value="">Proveedor…</option>
          {provs.map((p) => <option key={p.codigo} value={p.codigo}>{p.nombre}</option>)}
        </select>
      )}
      {['detectada', 'presentada', 'interesada', 'en_proceso'].includes(estado) && (
        <label className="flex items-center gap-1 text-[11px] text-muted">contactar después
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={sel} disabled={pending} />
        </label>
      )}
      <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder={compacto ? 'Nota' : 'Nota (queda en bitácora)'} className={`${sel} min-w-[160px] flex-1`} disabled={pending} />
      {miembros && (
        <select value={op.especialista_id ?? ''} onChange={(e) => start(async () => { await asignarEspecialista(op.id, personaId, e.target.value || null); })} className={sel} disabled={pending}>
          <option value="">Especialista: —</option>
          {miembros.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
      )}
      <button disabled={pending || !cambio || (estado === 'perdida' && !motivo)} className={btnDark} onClick={guardar}>{pending ? '…' : 'Guardar'}</button>
      {msg && <span className="text-xs text-red-600">{msg}</span>}
    </div>
  );
}

export function EtapaChip({ estado, label }: { estado: string; label?: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ESTADO_COLOR[estado] ?? 'bg-cream'}`}>{label ?? estado}</span>;
}
