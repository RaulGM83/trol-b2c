'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { activarCliente, agregarNota, enviarPropuesta, registrarContacto } from '@/app/trabajo/actions';

const dark = 'rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white disabled:opacity-50';
const line = 'rounded-lg border border-line bg-white px-3 py-2 text-xs font-bold disabled:opacity-50';
const campo = 'mt-1 block w-full rounded-lg border border-line px-2.5 py-2 text-sm';

type R = { ok: boolean; error?: string; texto?: string };
function useAccion() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<R>, exito: string, alTerminar?: () => void) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? { ok: true, texto: r.texto ?? exito } : { ok: false, texto: r.error ?? 'No se pudo.' });
    if (r.ok) { alTerminar?.(); router.refresh(); }
  });
  return { msg, pending, run };
}
const Msg = ({ m }: { m: { ok: boolean; texto: string } | null }) => (m ? <p className={m.ok ? 'mt-2 text-xs text-green-700' : 'mt-2 text-xs text-red-600'}>{m.texto}</p> : null);

/** Lo que el equipo escribía a mano en la bitácora, en un clic; y la nota libre al lado. */
export function RegistroRapido({ personaId }: { personaId: string }) {
  const { msg, pending, run } = useAccion();
  const [nota, setNota] = useState('');
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button disabled={pending} className={line} onClick={() => run(() => registrarContacto(personaId, 'contesto'), 'Anotado: contestó.')}>Llamé · contestó</button>
        <button disabled={pending} className={line} onClick={() => run(() => registrarContacto(personaId, 'no_contesto'), 'Anotado: no contestó.')}>Llamé · no contestó</button>
        <button disabled={pending} className={line} onClick={() => run(() => registrarContacto(personaId, 'buzon'), 'Anotado: buzón.')}>Buzón</button>
        <button disabled={pending} className={line} onClick={() => run(() => registrarContacto(personaId, 'atendido_chat'), 'Anotado: atendido por WhatsApp.')}>Lo atendí por WhatsApp</button>
      </div>
      <div className="mt-2 flex gap-1.5">
        <label className="flex-1"><span className="sr-only">Nota</span><input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota: qué se habló, qué quedó pendiente…" className="w-full rounded-lg border border-line px-2.5 py-2 text-sm" /></label>
        <button disabled={pending || !nota.trim()} className={dark} onClick={() => run(() => agregarNota(personaId, nota.trim(), 'nota', false), 'Nota guardada.', () => setNota(''))}>Guardar</button>
      </div>
      <Msg m={msg} />
    </div>
  );
}

export type Puede = { ok: boolean; motivo?: string; ultima?: string | null; horas?: number };
const hace = (iso?: string | null) => { if (!iso) return 'nunca'; const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600e3); return h < 1 ? 'hace menos de una hora' : h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`; };

/** Activar: con el chat abierto se le escribe directo; cerrado, sólo lo reabre una plantilla (una al día). */
export function ActivarCard({ personaId, chatAbierto, takoUrl, op, puede }: { personaId: string; chatAbierto: boolean; takoUrl: string | null; op: { id: string; nombre: string; plantilla: string | null } | null; puede: Puede | null }) {
  const { msg, pending, run } = useAccion();
  const bloqueo = puede && !puede.ok
    ? puede.motivo === 'no_contactar' ? 'Pidió que no le escribamos (BAJA).'
      : puede.motivo === 'sin_telefono' ? 'No tiene teléfono registrado.'
      : `Ya recibió una plantilla ${hace(puede.ultima)}. Es una al día; mientras, llámale.`
    : null;
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="text-sm font-bold">Activar</h2>
      <p className="mt-2"><span className={chatAbierto ? 'rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-semibold text-green-900' : 'rounded-full border border-line px-2.5 py-0.5 text-[11px] font-semibold text-muted'}>{chatAbierto ? 'Chat abierto' : 'Chat cerrado'}</span></p>
      <p className="mt-2 text-xs leading-relaxed text-muted">{chatAbierto ? 'Tiene la ventana de 24 h abierta: escríbele directo desde Tako, sin plantilla.' : 'Su ventana de 24 h está cerrada. Sólo se puede reabrir con una plantilla aprobada, y sólo una al día.'}</p>
      {op ? (
        <div className="mt-3 rounded-xl border border-line p-3">
          <div className="text-[11px] font-bold text-muted">{op.plantilla ?? 'sin plantilla'} · la que le toca por lo que le encontramos</div>
          <div className="mt-1 text-sm font-semibold">{op.nombre}</div>
        </div>
      ) : <p className="mt-3 text-xs text-muted">No tiene una oportunidad abierta con la cual escribirle. Llámale o deja una nota.</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-muted">Última plantilla: {hace(puede?.ultima)}</span>
        <div className="flex gap-1.5">
          {takoUrl ? <a href={takoUrl} target="_blank" rel="noreferrer" className={chatAbierto ? dark : line}>Abrir su chat</a> : null}
          {op && !chatAbierto ? <button disabled={pending || !!bloqueo || !op.plantilla} className={dark} onClick={() => { if (window.confirm(`Saldrá la plantilla ${op.plantilla} (“${op.nombre}”). Sólo se puede una al día. ¿La mandamos?`)) run(() => activarCliente(op.id, personaId), 'Enviada.'); }}>Mandar plantilla</button> : null}
        </div>
      </div>
      {bloqueo ? <p className="mt-2 text-xs text-amber-700">{bloqueo}</p> : null}
      <Msg m={msg} />
    </section>
  );
}

/** Enviar propuesta: una sola acción. Queda como "Tu plan" en su cuenta y le llega por WhatsApp. */
export function PropuestaForm({ personaId, ops, pensionBase, sugerido }: { personaId: string; ops: { id: string; nombre: string; estado: string; propuesta: { texto?: string; pension_con_plan?: number; costo?: number; enviada_en?: string } | null }[]; pensionBase: number | null; sugerido?: { pension?: number | null; costo?: number | null; texto?: string | null } }) {
  const { msg, pending, run } = useAccion();
  const [opId, setOpId] = useState(ops[0]?.id ?? '');
  const actual = ops.find((o) => o.id === opId) ?? null;
  // 169 · Desde la asesoría llegan sugeridos los números del camino recomendado; lo ya enviado manda.
  const sug = (n?: number | null) => (n != null && Number(n) > 0 ? String(Math.round(Number(n))) : '');
  const [texto, setTexto] = useState(actual?.propuesta?.texto ?? sugerido?.texto ?? '');
  const [pension, setPension] = useState(actual?.propuesta?.pension_con_plan != null ? String(actual.propuesta.pension_con_plan) : sug(sugerido?.pension));
  const [costo, setCosto] = useState(actual?.propuesta?.costo != null ? String(actual.propuesta.costo) : sug(sugerido?.costo));
  const elegir = (id: string) => {
    setOpId(id); const o = ops.find((x) => x.id === id);
    setTexto(o?.propuesta?.texto ?? ''); setPension(o?.propuesta?.pension_con_plan != null ? String(o.propuesta.pension_con_plan) : ''); setCosto(o?.propuesta?.costo != null ? String(o.propuesta.costo) : '');
  };
  if (!ops.length) return null;
  const num = (s: string) => { const n = Number(s.replace(/[^0-9.]/g, '')); return s.trim() && !Number.isNaN(n) ? n : null; };
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="text-sm font-bold">Enviar propuesta</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">Le llega por WhatsApp y le aparece en su cuenta como “Tu plan”, con el botón “Quiero avanzar”. Escríbela como se la dirías a él.</p>
      <label className="mt-3 block text-xs font-semibold">Qué le propones
        <select value={opId} onChange={(e) => elegir(e.target.value)} className={campo}>{ops.map((o) => <option key={o.id} value={o.id}>{o.nombre}{o.propuesta?.enviada_en ? ' · ya enviada' : ''}</option>)}</select>
      </label>
      <label className="mt-3 block text-xs font-semibold">En tus palabras
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} placeholder="Qué es, por qué le conviene a él y qué sigue. Sin tecnicismos." className={campo} />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-xs font-semibold">Su pensión pasaría a (al mes)<input value={pension} onChange={(e) => setPension(e.target.value)} inputMode="decimal" placeholder={pensionBase ? `hoy: ${Math.round(pensionBase).toLocaleString('es-MX')}` : 'opcional'} className={campo} /></label>
        <label className="text-xs font-semibold">Lo que le cuesta<input value={costo} onChange={(e) => setCosto(e.target.value)} inputMode="decimal" placeholder="opcional" className={campo} /></label>
      </div>
      <p className="mt-2 text-[11px] text-muted">Los dos números son opcionales y <b>sí los ve el cliente</b>. No pongas aquí tu margen ni el costo del gestor.</p>
      <div className="mt-3"><button disabled={pending || texto.trim().length < 20} className={dark} onClick={() => { if (window.confirm('Se le avisa por WhatsApp y aparece en su cuenta como “Tu plan”. ¿Enviamos?')) run(() => enviarPropuesta(opId, personaId, texto.trim(), num(pension), num(costo)), 'Propuesta enviada.'); }}>{actual?.propuesta?.enviada_en ? 'Actualizar y reenviar' : 'Enviar propuesta'}</button></div>
      <Msg m={msg} />
    </section>
  );
}
