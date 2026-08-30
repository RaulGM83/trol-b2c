'use client';
// Checklist de una oportunidad en proceso (migración 090): los items salen del catálogo por
// tipo (trol3.checklist_catalogo) y aquí se palomean. Cada cambio guarda quién y cuándo.
import { useState, useTransition } from 'react';
import { marcarChecklist } from '@/app/trabajo/actions';

export type ItemChecklist = { id: string; item: string; detalle: string | null; quien: string; estado: string };
type R = { ok: boolean; error?: string };

const SIGUIENTE: Record<string, string> = { pendiente: 'entregado', entregado: 'validado', validado: 'pendiente', no_aplica: 'pendiente' };
const CHIP: Record<string, [string, string]> = {
  pendiente: ['pendiente', 'bg-white border border-line text-muted'],
  entregado: ['entregado', 'bg-amber-100 text-amber-800'],
  validado: ['validado', 'bg-green-100 text-green-800'],
  no_aplica: ['no aplica', 'bg-cream text-muted line-through'],
};

function Grupo({ titulo, items, personaId, onMsg }: { titulo: string; items: ItemChecklist[]; personaId: string; onMsg: (m: string | null) => void }) {
  const [pending, start] = useTransition();
  if (!items.length) return null;
  return (
    <div className="min-w-[220px] flex-1">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted">{titulo}</div>
      <ul className="space-y-1">
        {items.map((i) => {
          const [label, cls] = CHIP[i.estado] ?? CHIP.pendiente;
          return (
            <li key={i.id} className="flex items-start justify-between gap-2 text-xs">
              <span className={i.estado === 'no_aplica' ? 'text-muted line-through' : ''}>
                {i.item}{i.detalle ? <span className="text-muted"> — {i.detalle}</span> : null}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button disabled={pending} title="Clic para avanzar: pendiente → entregado → validado"
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls} disabled:opacity-50`}
                  onClick={() => start(async () => {
                    const r = (await marcarChecklist(personaId, i.id, SIGUIENTE[i.estado] ?? 'entregado')) as R;
                    onMsg(r.ok ? null : r.error ?? 'error');
                  })}>{label}</button>
                {i.estado !== 'no_aplica' && (
                  <button disabled={pending} title="No aplica" className="text-[10px] text-muted underline disabled:opacity-50"
                    onClick={() => start(async () => {
                      const r = (await marcarChecklist(personaId, i.id, 'no_aplica')) as R;
                      onMsg(r.ok ? null : r.error ?? 'error');
                    })}>n/a</button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ChecklistOportunidad({ personaId, items }: { personaId: string; items: ItemChecklist[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  if (!items.length) return null;
  const aplicables = items.filter((i) => i.estado !== 'no_aplica');
  const listos = aplicables.filter((i) => i.estado === 'validado').length;
  return (
    <details className="mt-2 rounded-lg bg-cream/60 p-2" open={listos < aplicables.length}>
      <summary className="cursor-pointer text-[11px] font-bold">
        Checklist <span className="font-normal text-muted">· {listos}/{aplicables.length} validados</span>
      </summary>
      <div className="mt-2 flex flex-wrap gap-4">
        <Grupo titulo="El cliente comparte" items={items.filter((i) => i.quien === 'cliente')} personaId={personaId} onMsg={setMsg} />
        <Grupo titulo="Lo trabajamos juntos" items={items.filter((i) => i.quien === 'equipo')} personaId={personaId} onMsg={setMsg} />
      </div>
      {msg && <p className="mt-1 text-[11px] text-red-600">{msg}</p>}
    </details>
  );
}
