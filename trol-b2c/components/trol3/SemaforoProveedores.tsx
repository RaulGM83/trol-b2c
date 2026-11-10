'use client';
// 302a · Semáforo y apagador de proveedores (claude/120).
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { habilitarProveedor } from '@/app/trabajo/actions';

export interface FilaSemaforo {
  codigo: string; nombre: string; en_espera: number;
  salud: { estado: 'verde' | 'amarillo' | 'rojo' | 'sin_datos'; motivo?: string; habilitado?: boolean; ok_24h?: number; fallidas_24h?: number; colgadas?: number; ultima_ok?: string | null; ultima_fallida?: string | null; nota?: string | null };
}

export const COLOR_SEMAFORO: Record<string, [string, string]> = {
  verde: ['Responde bien', 'bg-emerald-100 text-emerald-900'],
  amarillo: ['Con fallas', 'bg-amber-100 text-amber-900'],
  rojo: ['No responde', 'bg-red-100 text-red-900'],
  sin_datos: ['Sin consultas recientes', 'bg-cream text-muted'],
};
const QUE_ES: Record<string, string> = {
  jordan: 'Historial del IMSS (semanas, salarios, patrones). Sin él, el aliado puede subir el SISEC.',
  precalix: 'Precalificación Infonavit (saldo, monto, relación laboral). Sin él, el aliado captura saldo y salario a mano.',
  bdi: 'Buró de Ingresos (nómina SAT / ISSSTE).',
};
const fechaHora = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');

export function SemaforoProveedores({ filas }: { filas: FilaSemaforo[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [nota, setNota] = useState<Record<string, string>>({});
  const cambiar = (codigo: string, habilitado: boolean) => start(async () => {
    const r = await habilitarProveedor(codigo, habilitado, nota[codigo] ?? null) as { ok: boolean; error?: string; redespachadas?: number };
    if (!r.ok) { toast.error(r.error ?? 'No se pudo'); return; }
    toast.success(habilitado ? `Encendido. ${r.redespachadas ?? 0} consultas redespachadas.` : 'Apagado: las consultas nuevas esperan.');
    router.refresh();
  });
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {filas.map((f) => {
        const s = f.salud ?? { estado: 'sin_datos' as const };
        const [label, cls] = COLOR_SEMAFORO[s.estado] ?? COLOR_SEMAFORO.sin_datos;
        const apagado = s.habilitado === false;
        return (
          <section key={f.codigo} className={`rounded-2xl border bg-white p-4 ${apagado ? 'border-red-300' : 'border-line'}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-bold">{f.nombre}</div>
                <div className="text-[11px] text-muted">{QUE_ES[f.codigo] ?? ''}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${apagado ? 'bg-red-100 text-red-900' : cls}`}>{apagado ? 'Apagado' : label}</span>
            </div>
            <div className="mt-2 text-xs">{s.motivo}</div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted">
              <dt>Buenas 24 h</dt><dd className="text-ink">{s.ok_24h ?? 0}</dd>
              <dt>Fallidas 24 h</dt><dd className="text-ink">{s.fallidas_24h ?? 0}</dd>
              <dt>Colgadas (&gt;20 min)</dt><dd className="text-ink">{s.colgadas ?? 0}</dd>
              <dt>Última buena</dt><dd className="text-ink">{fechaHora(s.ultima_ok)}</dd>
              <dt>Última fallida</dt><dd className="text-ink">{fechaHora(s.ultima_fallida)}</dd>
              {f.en_espera > 0 ? <><dt>En espera por apagado</dt><dd className="font-semibold text-ink">{f.en_espera}</dd></> : null}
            </dl>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {apagado ? (
                <button disabled={pending} onClick={() => cambiar(f.codigo, true)} className="rounded-lg bg-ink px-3 py-1 text-xs font-bold text-white disabled:opacity-40">Encender{f.en_espera > 0 ? ` y mandar ${f.en_espera}` : ''}</button>
              ) : (
                <>
                  <input value={nota[f.codigo] ?? ''} onChange={(e) => setNota({ ...nota, [f.codigo]: e.target.value })} placeholder="Motivo (opcional)" className="w-40 rounded-lg border border-line px-2 py-1 text-xs" />
                  <button disabled={pending} onClick={() => cambiar(f.codigo, false)} className="rounded-lg border border-red-300 px-3 py-1 text-xs font-bold text-red-900 hover:bg-red-50 disabled:opacity-40">Apagar</button>
                </>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
