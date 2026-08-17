'use client';

import { useEffect, useRef, useState } from 'react';
import { autorizarViraal } from '@/app/trabajo/actions';

type Prefill = Record<string, number | null>;
type Autorizacion = {
  id: number;
  banda: string | null;
  nivel: string | null;
  escenario: string | null;
  margen: number | null;
  margen_costo: number | null;
  margen_credito: number | null;
  precio: number | null;
  created_at: string;
  miembro?: string | null;
  nota?: string | null;
};

const mx = (n: number | null | undefined) => (n == null ? '—' : '$' + Math.round(n).toLocaleString('es-MX'));
const pc = (n: number | null | undefined) => (n == null ? '—' : (n * 100).toFixed(1) + '%');
const BANDA: Record<string, { label: string; cls: string }> = {
  verde: { label: 'Verde · automático', cls: 'bg-green-100 text-green-800' },
  ambar: { label: 'Ámbar · comité mayoría', cls: 'bg-amber-100 text-amber-800' },
  naranja: { label: 'Naranja · unánime + aportación', cls: 'bg-orange-100 text-orange-800' },
  rojo: { label: 'Rojo · no autorizar', cls: 'bg-red-100 text-red-700' },
};

export function MesaViraal({ personaId, prefill, historial }: { personaId: string; prefill: Prefill; historial: Autorizacion[] }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [alto, setAlto] = useState(1600);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = (e.data ?? {}) as { type?: string; height?: number; payload?: Record<string, unknown> };
      if (!d.type) return;
      if (d.type === 'viraal_ready') {
        ref.current?.contentWindow?.postMessage({ type: 'viraal_prefill', payload: prefill }, '*');
      } else if (d.type === 'viraal_height' && d.height) {
        setAlto(Math.max(600, Math.min(4000, d.height + 24)));
      } else if (d.type === 'viraal_autorizar' && d.payload) {
        void autorizar(d.payload);
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  async function autorizar(payload: Record<string, unknown>) {
    const banda = String(payload.banda ?? '');
    const aviso = banda === 'rojo'
      ? 'Este escenario está en ROJO (no autorizar por política). ¿Registrar la autorización de todas formas?'
      : '¿Autorizar este proyecto y registrar el caso con estos números?';
    if (!window.confirm(aviso)) return;
    const nota = window.prompt('Nota de la autorización (opcional): motivo de excepción, condición del comité, etc.', '') ?? '';
    setGuardando(true);
    setMsg(null);
    const r = await autorizarViraal(personaId, { ...payload, nota });
    setGuardando(false);
    if (r.ok) {
      setMsg('✓ Autorización registrada · generando PDF…');
      const id = (r as { id?: number }).id;
      if (id) window.open(`/trabajo/viraal/pdf/${id}`, '_blank');
      setTimeout(() => window.location.reload(), 1300);
    } else {
      setMsg(`Error: ${(r as { error?: string }).error ?? 'no se pudo guardar'}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-white p-3">
        <div className="mb-2 flex items-center justify-between px-2">
          <h2 className="text-sm font-bold">Mesa Viraal — autorización del proyecto</h2>
          {guardando ? <span className="text-xs text-muted">Guardando…</span> : msg ? <span className="text-xs font-semibold text-ink">{msg}</span> : <span className="text-xs text-muted">Pre-llenada con el expediente (usa el saldo ajustado si lo corregiste) · “Autorizar proyecto” registra el caso y genera el PDF</span>}
        </div>
        <iframe ref={ref} src="/viraal/calc.html" title="Mesa Viraal" style={{ width: '100%', height: alto, border: 0, borderRadius: 12 }} />
      </div>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-3 text-sm font-bold">Autorizaciones registradas <span className="ml-1 text-xs font-normal text-muted">{historial.length}</span></h2>
        {historial.length === 0 ? (
          <p className="text-sm text-muted">Aún no hay autorizaciones guardadas para este caso.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr className="border-b border-line">
                  <th className="py-1 pr-3 font-semibold">Fecha</th>
                  <th className="py-1 pr-3 font-semibold">Banda</th>
                  <th className="py-1 pr-3 font-semibold">Escenario</th>
                  <th className="py-1 pr-3 text-right font-semibold">Margen</th>
                  <th className="py-1 pr-3 text-right font-semibold">s/costo</th>
                  <th className="py-1 pr-3 text-right font-semibold">s/crédito</th>
                  <th className="py-1 pr-3 font-semibold">Por</th>
                  <th className="py-1 pr-3 font-semibold">Resumen</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((a) => (
                  <tr key={a.id} className="border-b border-line/60">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(a.created_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td className="py-1.5 pr-3"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${BANDA[a.banda ?? '']?.cls ?? 'bg-gray-100 text-gray-700'}`}>{BANDA[a.banda ?? '']?.label ?? a.banda ?? '—'}</span></td>
                    <td className="py-1.5 pr-3">{a.nivel ? `${a.nivel} · ${a.escenario ?? ''}` : a.escenario ?? '—'}{a.nota ? <span className="block text-[10px] text-muted">{a.nota}</span> : null}</td>
                    <td className="py-1.5 pr-3 text-right font-semibold">{mx(a.margen)}</td>
                    <td className="py-1.5 pr-3 text-right">{pc(a.margen_costo)}</td>
                    <td className="py-1.5 pr-3 text-right">{pc(a.margen_credito)}</td>
                    <td className="py-1.5 pr-3">{a.miembro ?? '—'}</td>
                    <td className="py-1.5 pr-3"><a href={`/trabajo/viraal/pdf/${a.id}`} target="_blank" rel="noreferrer" className="font-semibold text-ink underline">PDF</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
