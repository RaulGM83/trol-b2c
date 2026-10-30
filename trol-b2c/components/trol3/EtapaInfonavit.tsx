'use client';
// 282 · Etapa de la operación Infonavit (claude/114). La ve el broker que refirió; al pasar a
// Escrituras se le devenga su comisión fija.
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { moverEtapaInfonavit } from '@/app/trabajo/actions';
import { ETAPAS_INFONAVIT } from '@/lib/aliado/infonavit';

export function EtapaInfonavit({ personaId, oportunidadId, etapa, broker }: { personaId: string; oportunidadId: string; etapa: string | null; broker: string | null }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const mover = (clave: string) => {
    if (clave === 'escrituras' && broker && !window.confirm(`Al pasar a Escrituras se le devenga a ${broker} su comisión fija. ¿Seguimos?`)) return;
    start(async () => {
      const r = await moverEtapaInfonavit(personaId, oportunidadId, clave) as { ok: boolean; error?: string };
      if (r.ok) { toast.success('Etapa actualizada'); router.refresh(); } else toast.error(r.error ?? 'No se pudo');
    });
  };
  return (
    <section className="mb-4 rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Etapa de la operación</h2>
        {broker ? <span className="text-xs text-muted">La ve {broker} (broker)</span> : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {ETAPAS_INFONAVIT.map((e) => (
          <button key={e.clave} disabled={pend} onClick={() => mover(e.clave)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${e.clave === etapa ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:bg-cream'}`}>{e.nombre}</button>
        ))}
      </div>
    </section>
  );
}
