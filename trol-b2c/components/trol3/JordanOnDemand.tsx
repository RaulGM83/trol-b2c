'use client';
import { useState, useTransition } from 'react';
import { pedirActa, pedirVentanilla, revisarConsultaJordan } from '@/app/trabajo/actions';
import type { TipoActa } from '@/lib/jordan/client';

// Los dos servicios on demand de Jordan (132). Individuales, con el costo a la
// vista y bloqueados fuera de horario: cada clic cuesta créditos.
//   · Ventanilla: sólo aparece cuando la consulta automática no pudo.
//   · Actas: las pide Trol para un trámite (Infonavit sobre todo); el cliente
//     ve el PDF en /mi cuando ya existe.

export type ConsultaJordan = { id: string; tipo: string; estado: string; error: string | null; created_at: string; completed_at: string | null; payload_in: Record<string, unknown> | null };
export type ServicioInfo = { abierto: boolean; horario: string; costo: number | null };

type R = { ok: boolean; error?: string; mensaje?: string; estado?: string; cambio?: boolean; eta_min?: number };
const mxn = (n: number | null) => (n == null ? 'costo por confirmar' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n));
const fecha = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' }) : '—');
const btnDark = 'rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50';
const btn = 'rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold hover:bg-cream disabled:opacity-50';
const ESTADO_JORDAN: Record<string, string> = { recibida: 'en cola en Jordan', en_ventanilla: 'en ventanilla del IMSS', QUEUED: 'en cola en Jordan', PROCESSING: 'en trámite con el Registro Civil' };

function FilaAbierta({ c, personaId, etiqueta }: { c: ConsultaJordan; personaId: string; etiqueta: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ej = (c.payload_in?.estado_jordan as string | undefined) ?? c.estado;
  return (
    <div className="rounded-lg bg-cream p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span><b>{etiqueta}</b> · {ESTADO_JORDAN[ej] ?? ej} · desde {fecha(c.created_at)}</span>
        <button disabled={pending} className={btn} onClick={() => start(async () => { const r = (await revisarConsultaJordan(c.id, personaId)) as R; setMsg(r.ok ? r.mensaje ?? r.estado ?? 'ok' : r.error ?? 'error'); })}>{pending ? '…' : 'Revisar'}</button>
      </div>
      {msg && <p className="mt-1 text-muted">{msg}</p>}
    </div>
  );
}

export function VentanillaBloque({ personaId, servicio, tieneNss, abierta, ultima, mostrar }: {
  personaId: string; servicio: ServicioInfo | null; tieneNss: boolean; abierta: ConsultaJordan | null; ultima: ConsultaJordan | null; mostrar: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!mostrar && !abierta && !ultima) return null;
  const puede = !!servicio?.abierto && tieneNss && !abierta;
  return (
    <div className="mt-3 space-y-2 border-t border-line pt-3 text-xs">
      <div className="font-bold">Semanas por ventanilla del IMSS</div>
      <p className="text-muted">Cuando la consulta automática no puede, Jordan hace el trámite presencial (~30 min hábiles, L–V). {servicio ? <span className={servicio.abierto ? 'text-green-700' : 'text-amber-700'}>{servicio.horario}</span> : <span className="text-amber-700">no se pudo leer el horario de Jordan</span>}.</p>
      {abierta ? <FilaAbierta c={abierta} personaId={personaId} etiqueta="Ventanilla" /> : null}
      {!abierta && ultima ? (
        <div className={`rounded-lg p-2 ${ultima.estado === 'completada' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
          Última ventanilla: <b>{ultima.estado}</b> · {fecha(ultima.completed_at ?? ultima.created_at)}{ultima.error ? ` · ${ultima.error}` : ''}
        </div>
      ) : null}
      {!tieneNss ? <p className="text-amber-700">Jordan exige el NSS: captúralo en Identidad y contacto antes de pedirla.</p> : null}
      {!abierta && (confirmando ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2">
          <p className="text-amber-900">Se manda a ventanilla y se apartan <b>{mxn(servicio?.costo ?? null)}</b>. Si no sale, Jordan devuelve los créditos. ¿Confirmas?</p>
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" className="mt-2 w-full rounded-lg border border-line px-2 py-1.5" />
          <div className="mt-2 flex gap-2">
            <button disabled={pending} className={btnDark} onClick={() => start(async () => {
              const r = (await pedirVentanilla(personaId, motivo)) as R;
              setConfirmando(false);
              setMsg(r.ok ? `Enviada a ventanilla; Jordan estima ${r.eta_min ?? 30} min hábiles. El expediente se actualiza solo cuando llegue el PDF.` : r.error ?? 'error');
            })}>{pending ? 'Enviando…' : 'Sí, pedir en ventanilla'}</button>
            <button disabled={pending} className={btn} onClick={() => setConfirmando(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button disabled={!puede || pending} className={btnDark + ' w-full py-2'} title={!servicio?.abierto ? 'Fuera de horario' : !tieneNss ? 'Falta el NSS' : ''} onClick={() => { setMsg(null); setConfirmando(true); }}>
          Pedir en ventanilla · {mxn(servicio?.costo ?? null)}
        </button>
      ))}
      {msg && <p className="text-muted">{msg}</p>}
    </div>
  );
}

const ACTA_LABEL: Record<TipoActa, string> = { nacimiento: 'Nacimiento', matrimonio: 'Matrimonio', defuncion: 'Defunción', divorcio: 'Divorcio' };

export function ActasBloque({ personaId, servicio, tieneCurp, abiertas, ultimas }: {
  personaId: string; servicio: ServicioInfo | null; tieneCurp: boolean; abiertas: ConsultaJordan[]; ultimas: ConsultaJordan[];
}) {
  const [tipo, setTipo] = useState<TipoActa>('nacimiento');
  const [folio, setFolio] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const puede = !!servicio?.abierto && tieneCurp;
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="mb-1 text-sm font-bold">Pedir acta al Registro Civil</h2>
      <p className="mb-3 text-xs text-muted">Jordan la tramita por CURP y la deja en Documentos (30–90 s, a veces hasta 10 min). Sólo se cobra si la entrega. {servicio ? <span className={servicio.abierto ? 'text-green-700' : 'text-amber-700'}>{servicio.horario}</span> : <span className="text-amber-700">no se pudo leer el horario de Jordan</span>}.</p>
      <div className="space-y-2 text-xs">
        {abiertas.map((c) => <FilaAbierta key={c.id} c={c} personaId={personaId} etiqueta={`Acta de ${ACTA_LABEL[(c.payload_in?.tipo_acta as TipoActa) ?? 'nacimiento'] ?? ''}`} />)}
        {ultimas.filter((c) => c.estado === 'error').slice(0, 2).map((c) => (
          <div key={c.id} className="rounded-lg bg-red-50 p-2 text-red-700">Acta de {ACTA_LABEL[(c.payload_in?.tipo_acta as TipoActa) ?? 'nacimiento']} · {fecha(c.completed_at ?? c.created_at)} · {c.error ?? 'no se pudo'}</div>
        ))}
        {!tieneCurp ? <p className="text-amber-700">Falta la CURP.</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <select value={tipo} onChange={(e) => { setTipo(e.target.value as TipoActa); setConfirmando(false); }} className="rounded-lg border border-line px-2 py-1.5">
            {(Object.keys(ACTA_LABEL) as TipoActa[]).map((t) => <option key={t} value={t}>{ACTA_LABEL[t]}</option>)}
          </select>
          <label className="flex items-center gap-1"><input type="checkbox" checked={folio} disabled={tipo === 'divorcio'} onChange={(e) => setFolio(e.target.checked)} /> con folio de validación</label>
        </div>
        {confirmando ? (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-2">
            <p className="text-amber-900">Se pide el acta de <b>{ACTA_LABEL[tipo].toLowerCase()}</b>{folio && tipo !== 'divorcio' ? ' con folio' : ''} por <b>{mxn(servicio?.costo ?? null)}</b> (sólo si la entrega). ¿Confirmas?</p>
            <div className="mt-2 flex gap-2">
              <button disabled={pending} className={btnDark} onClick={() => start(async () => {
                const r = (await pedirActa(personaId, tipo, folio && tipo !== 'divorcio', '')) as R;
                setConfirmando(false);
                setMsg(r.ok ? 'Pedida. Suele llegar en uno o dos minutos; usa "Revisar" si no aparece.' : r.error ?? 'error');
              })}>{pending ? 'Pidiendo…' : 'Sí, pedir el acta'}</button>
              <button disabled={pending} className={btn} onClick={() => setConfirmando(false)}>Cancelar</button>
            </div>
          </div>
        ) : (
          <button disabled={!puede || pending} className={btnDark} title={!servicio?.abierto ? 'Fuera de horario' : ''} onClick={() => { setMsg(null); setConfirmando(true); }}>Pedir acta · {mxn(servicio?.costo ?? null)}</button>
        )}
        {msg && <p className="text-muted">{msg}</p>}
      </div>
    </section>
  );
}
