'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { activarLote } from '@/app/trabajo/actions';
import { CarteraAcciones, type FilaCartera } from '@/components/trol3/CarteraAcciones';

type Fila = FilaCartera & { nombre: string | null; edad: number | null; ley: string | null; semanas: number | null; urgencia?: string | null; ultimo_contacto?: { fecha: string; texto?: string } | null };
const TAKO_LINE = 'm2MS9fYJb1EhjJQykLUz';
const takoUrl = (tel?: string | null) => (tel ? `https://portal.takohub.com/trol-financiero/pas/chats?line=${TAKO_LINE}&number=521${String(tel).replace(/\D/g, '').slice(-10)}` : null);

/**
 * 167 · "Por activar" con lote chico: hasta 20 seleccionados, cada quien con SU oportunidad y
 * SU plantilla, en serie. No es una campaña — ésas siguen saliendo por cola_envios.
 */
export function PorActivarLista({ filas }: { filas: Fila[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pending, start] = useTransition();
  const elegibles = filas.filter((f) => f.oportunidad_id && !f.no_contactar);
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else if (n.size < 20) n.add(id); return n; });
  const mandar = () => {
    const items = elegibles.filter((f) => sel.has(f.persona_id)).map((f) => ({ opId: f.oportunidad_id as string, personaId: f.persona_id }));
    if (!items.length) return;
    if (!window.confirm(`Se le avisa a ${items.length} ${items.length === 1 ? 'persona' : 'personas'}: dentro de su chat si sigue abierto, o con la plantilla de lo que le encontramos. Cada una cuenta para el tope de una al día. Quedan como tuyas. ¿Mandamos?`)) return;
    start(async () => {
      const r = await activarLote(items) as { ok: boolean; error?: string; texto?: string };
      setMsg(r.ok ? { ok: true, texto: r.texto ?? 'Enviado.' } : { ok: false, texto: r.error ?? 'No se pudo.' });
      if (r.ok) { setSel(new Set()); router.refresh(); }
    });
  };
  return (
    <div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <div className="flex items-center gap-2 text-xs">
          <button type="button" className="rounded-lg border border-line bg-white px-2.5 py-1 font-semibold" onClick={() => setSel(sel.size ? new Set() : new Set(elegibles.slice(0, 20).map((f) => f.persona_id)))}>{sel.size ? 'Quitar selección' : 'Seleccionar los 20'}</button>
          <span className="text-muted">{sel.size} de 20 seleccionados</span>
        </div>
        <button type="button" disabled={pending || !sel.size} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" onClick={mandar}>{pending ? 'Enviando…' : 'Avisarle al lote'}</button>
      </div>
      {msg ? <p className={msg.ok ? 'mt-2 text-xs text-green-700' : 'mt-2 text-xs text-red-600'}>{msg.texto}</p> : null}
      <ul className="mt-1">
        {filas.map((f) => (
          <li key={f.persona_id} className="grid grid-cols-1 items-center gap-3 border-t border-line py-3 md:grid-cols-[24px_220px_minmax(0,1fr)_auto]">
            <input type="checkbox" aria-label={`Seleccionar a ${f.nombre ?? 'esta persona'}`} className="h-4 w-4" checked={sel.has(f.persona_id)} disabled={!f.oportunidad_id || f.no_contactar} onChange={() => alternar(f.persona_id)} />
            <div>
              <Link href={`/trabajo/p/${f.persona_id}`} className="text-sm font-bold hover:underline">{f.nombre ?? '(sin nombre)'}</Link>
              <div className="text-xs text-muted">{[f.edad ? `${f.edad} años` : null, f.ley === 'Ley73' ? 'Ley 73' : f.ley === 'Ley97' ? 'Ley 97' : null, f.semanas ? `${Math.round(Number(f.semanas)).toLocaleString('es-MX')} sem.` : null].filter(Boolean).join(' · ') || 'sin información oficial'}</div>
            </div>
            <div className="text-[13px] leading-snug">
              {f.oportunidad}{f.urgencia ? <span className="font-semibold text-amber-700"> · límite {new Date(f.urgencia).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</span> : null}
              <div className="text-xs text-muted">{f.ultimo_contacto?.texto ? `Lo último: ${f.ultimo_contacto.texto}` : 'Sin contacto todavía'} · <span className={f.chat_abierto ? 'font-semibold text-green-700' : ''}>{f.chat_abierto ? 'chat abierto' : 'chat cerrado'}</span></div>
            </div>
            <CarteraAcciones fila={f} takoUrl={takoUrl(f.telefono)} porActivar />
          </li>
        ))}
        {!filas.length ? <li className="border-t border-line py-4 text-sm text-muted">Nadie en este grupo por ahora (o todos recibieron plantilla hoy).</li> : null}
      </ul>
    </div>
  );
}
