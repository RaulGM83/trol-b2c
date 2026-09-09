'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { reintentarConsultaAliado } from '@/app/trabajo/actions';

type Intento = { proveedor?: string; en?: string; status_previo?: string };
type Props = {
  id: string;
  statusOrigen: string | null;
  exitosa: boolean;
  intentos: Intento[];
  reintentoDe: string | null;
};

const PROV: { k: 'belvo' | 'jordan'; label: string; costo: string }[] = [
  { k: 'belvo', label: 'Reintentar con Belvo', costo: '~$2.50 USD' },
  { k: 'jordan', label: 'Reintentar con Jordan', costo: '~$13 USD' },
];

const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '');

export function ReintentarConsultaAliado({ id, statusOrigen, exitosa, intentos, reintentoDe }: Props) {
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<'belvo' | 'jordan' | null>(null);
  const router = useRouter();

  const ultimo = intentos[intentos.length - 1];
  const enCurso = statusOrigen === 'processing' && !!ultimo?.en && Date.now() - new Date(ultimo.en).getTime() < 30 * 60_000;

  const go = (prov: 'belvo' | 'jordan') =>
    start(async () => {
      const r = (await reintentarConsultaAliado(id, prov)) as { ok: boolean; error?: string; modo?: string; id?: string };
      setConfirm(null);
      if (!r.ok) return void toast.error(r.error ?? 'No se pudo reintentar');
      if (r.modo === 'nueva' && r.id) {
        toast.success('Consulta nueva creada; se está procesando');
        router.push(`/trabajo/aliados/${r.id}`);
      } else {
        toast.success(`Reintento enviado a ${prov === 'belvo' ? 'Belvo' : 'Jordan'}`);
        router.refresh();
      }
    });

  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">Consulta IMSS</div>
      <div className="mb-2 text-xs text-muted">
        Pipeline: <b className="text-ink">{statusOrigen ?? '—'}</b>
        {reintentoDe && (
          <>
            {' · '}
            <a href={`/trabajo/aliados/${reintentoDe}`} className="underline">viene de un reintento</a>
          </>
        )}
      </div>
      {confirm ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs">
          <p className="mb-2">
            {exitosa
              ? `Esta consulta ya fue exitosa: se creará una consulta NUEVA con ${confirm === 'belvo' ? 'Belvo' : 'Jordan'} y se cobrará de nuevo al aliado.`
              : `Se volverá a pedir el historial a ${confirm === 'belvo' ? 'Belvo' : 'Jordan'} (${PROV.find((p) => p.k === confirm)?.costo}).`}
          </p>
          <div className="flex gap-2">
            <button disabled={pending} onClick={() => go(confirm)} className="rounded-lg bg-ink px-3 py-1 font-semibold text-white disabled:opacity-50">
              {pending ? 'Enviando…' : 'Confirmar'}
            </button>
            <button disabled={pending} onClick={() => setConfirm(null)} className="rounded-lg border border-line px-3 py-1">Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          {PROV.map((p) => (
            <button
              key={p.k}
              disabled={pending || enCurso}
              onClick={() => setConfirm(p.k)}
              className="flex items-center justify-between rounded-lg border border-line px-3 py-2 font-semibold hover:bg-cream disabled:opacity-50"
              title={enCurso ? 'Hay un reintento en curso (menos de 30 min)' : p.costo}
            >
              <span>{p.label}</span>
              <span className="text-[11px] font-normal text-muted">{p.costo}</span>
            </button>
          ))}
        </div>
      )}
      {enCurso && <p className="mt-1 text-[11px] text-amber-700">Reintento en curso desde {fmt(ultimo?.en)}.</p>}
      {intentos.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-muted">
          {intentos.slice(-3).reverse().map((i, n) => (
            <li key={n}>{fmt(i.en)} · {i.proveedor}{i.status_previo ? ` (antes: ${i.status_previo})` : ''}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
