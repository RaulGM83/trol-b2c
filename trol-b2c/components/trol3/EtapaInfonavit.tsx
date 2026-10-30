'use client';
// 282/285 · Etapa del trámite Infonavit (claude/114). La ve el broker que refirió; al pasar a
// Escrituras se le devenga su comisión fija. 285: inmueble asignado y fecha real de cada etapa
// (para capturar trámites pasados con su fecha).
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { moverEtapaInfonavit } from '@/app/trabajo/actions';
import { ETAPAS_INFONAVIT } from '@/lib/aliado/infonavit';

type Props = {
  personaId: string; oportunidadId: string; etapa: string | null; broker: string | null;
  proyectos?: { id: string; nombre: string }[]; proyectoId?: string | null; fechas?: Record<string, string>;
};

const hoy = () => new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);
const corta = (f: string) => { const [y, m, d] = f.split('-'); return `${d}/${m}/${y.slice(2)}`; };

export function EtapaInfonavit({ personaId, oportunidadId, etapa, broker, proyectos = [], proyectoId = null, fechas = {} }: Props) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [fecha, setFecha] = useState(hoy());
  const [proy, setProy] = useState(proyectoId ?? '');
  const correr = (clave: string, f: string | null, p: string | null) => start(async () => {
    const r = await moverEtapaInfonavit(personaId, oportunidadId, clave, f, p) as { ok: boolean; error?: string };
    if (r.ok) { toast.success('Trámite actualizado'); router.refresh(); } else toast.error(r.error ?? 'No se pudo');
  });
  const mover = (clave: string) => {
    if (clave === 'escrituras' && broker && !window.confirm(`Al pasar a Escrituras se le devenga a ${broker} su comisión fija. ¿Seguimos?`)) return;
    correr(clave, fecha, proy || null);
  };
  const cambiarInmueble = (v: string) => {
    setProy(v);
    if (etapa && v) correr(etapa, fechas[etapa] ?? null, v);
  };
  return (
    <section className="mb-4 rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Trámite Infonavit</h2>
        {broker ? <span className="text-xs text-muted">La ve {broker} (broker)</span> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="font-semibold text-muted">Inmueble</span>
          <select value={proy} disabled={pend} onChange={(ev) => cambiarInmueble(ev.target.value)} className="rounded-lg border border-line bg-white px-2 py-1">
            <option value="">Sin asignar</option>
            {proyectos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="font-semibold text-muted">Fecha del paso</span>
          <input type="date" value={fecha} max={hoy()} onChange={(ev) => setFecha(ev.target.value)} className="rounded-lg border border-line bg-white px-2 py-1" />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ETAPAS_INFONAVIT.map((e) => (
          <button key={e.clave} disabled={pend} onClick={() => mover(e.clave)}
            className={`rounded-lg border px-2.5 py-1 text-left text-xs font-semibold disabled:opacity-50 ${e.clave === etapa ? 'border-ink bg-ink text-white' : fechas[e.clave] ? 'border-line bg-cream' : 'border-line bg-white hover:bg-cream'}`}>
            {e.nombre}{fechas[e.clave] ? <span className="ml-1 font-normal opacity-70">{corta(fechas[e.clave])}</span> : null}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">Toca la etapa a la que llegó con la fecha en que pasó. Al llegar a Entregado la oportunidad queda ganada.</p>
    </section>
  );
}
