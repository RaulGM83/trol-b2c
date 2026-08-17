'use client';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { gestionarConsultaAliado } from '@/app/trabajo/actions';

type Props = {
  id: string;
  estatus: string;
  vobo: boolean;
  asignadoA: string | null;
  comentario: string | null;
  miembros: { id: string; nombre: string }[];
};

const ESTATUS: [string, string][] = [
  ['nuevo', 'Nuevo'],
  ['en_revision', 'En revisión'],
  ['vobo', 'VoBo'],
  ['rechazado', 'Rechazado'],
  ['cerrado', 'Cerrado'],
  ['error', 'Error'],
];

const sel = 'rounded-lg border border-line bg-white px-2 py-1 text-xs';

export function GestionAliado({ id, estatus, vobo, asignadoA, comentario, miembros }: Props) {
  const [pending, start] = useTransition();
  const [nota, setNota] = useState(comentario ?? '');
  const [editNota, setEditNota] = useState(false);

  const run = (patch: Parameters<typeof gestionarConsultaAliado>[1], okMsg: string) =>
    start(async () => {
      const r = (await gestionarConsultaAliado(id, patch)) as { ok: boolean; error?: string };
      if (r.ok) toast.success(okMsg);
      else toast.error(r.error ?? 'Error al guardar');
    });

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          disabled={pending}
          value={estatus}
          onChange={(e) => run({ estatus: e.target.value }, 'Estatus actualizado')}
          className={sel}
        >
          {ESTATUS.map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>

        <button
          disabled={pending}
          onClick={() => run({ vobo: !vobo }, vobo ? 'VoBo retirado' : 'VoBo otorgado')}
          className={`rounded-lg px-2 py-1 text-xs font-semibold ${vobo ? 'bg-lime text-ink' : 'border border-line bg-white hover:bg-cream'}`}
          title="Visto bueno (se sincroniza al portal del aliado)"
        >
          {vobo ? '✓ VoBo' : 'Dar VoBo'}
        </button>

        <select
          disabled={pending}
          value={asignadoA ?? ''}
          onChange={(e) => run({ reasignar: true, asignado: e.target.value || null }, 'Asignación actualizada')}
          className={sel}
          title="Asignar a un asesor"
        >
          <option value="">Sin asignar</option>
          {miembros.map((m) => (
            <option key={m.id} value={m.id}>{m.nombre}</option>
          ))}
        </select>

        {!editNota && (
          <button onClick={() => setEditNota(true)} className="rounded-lg border border-line bg-white px-2 py-1 text-xs hover:bg-cream">
            {comentario ? '✎ Nota' : '+ Nota'}
          </button>
        )}
      </div>

      {comentario && !editNota && <p className="max-w-[260px] text-[11px] text-muted">“{comentario}”</p>}

      {editNota && (
        <div className="flex items-center gap-1.5">
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Comentario interno"
            className="min-w-[180px] flex-1 rounded-lg border border-line px-2 py-1 text-xs"
          />
          <button
            disabled={pending}
            onClick={() => run({ comentario: nota }, 'Comentario guardado')}
            className="rounded-lg bg-ink px-2 py-1 text-xs font-semibold text-white hover:opacity-90"
          >
            Guardar
          </button>
          <button onClick={() => { setNota(comentario ?? ''); setEditNota(false); }} className="text-xs text-muted underline">cancelar</button>
        </div>
      )}
    </div>
  );
}
