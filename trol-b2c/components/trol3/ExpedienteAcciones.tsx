'use client';
import { useState, useTransition } from 'react';
import { tomarCabecera, cambiarEstadoOportunidad, asignarEspecialista, pedirConsulta, agregarNota, declararAsesor, marcarEtapa, crearCita, reevaluar } from '@/app/trabajo/actions';

type R = { ok: boolean; error?: string; resultado?: unknown };
const btn = 'rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-cream disabled:opacity-50';
const btnDark = 'rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50';

export function ExpedienteAcciones({ personaId, esMia, sinCabecera, etapa }: { personaId: string; esMia: boolean; sinCabecera: boolean; etapa: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const run = (fn: () => Promise<R>) => start(async () => { const r = (await fn()) as R; setMsg(r.ok ? null : r.error ?? 'error'); });
  return (
    <div className="mt-2 flex flex-wrap justify-end gap-2">
      {sinCabecera && <button disabled={pending} className={btnDark} onClick={() => run(() => tomarCabecera(personaId))}>Tomarlo como mi cliente</button>}
      {etapa !== 'asesorado' && etapa !== 'cliente' && <button disabled={pending} className={btn} onClick={() => run(() => marcarEtapa(personaId, 'asesorado'))}>Marcar “situación entendida”</button>}
      {etapa !== 'cliente' && <button disabled={pending} className={btn} onClick={() => run(() => marcarEtapa(personaId, 'cliente'))}>Marcar cliente</button>}
      <button disabled={pending} className={btn} onClick={() => run(() => reevaluar(personaId))}>Re-evaluar</button>
      {msg && <span className="text-xs text-red-600">{msg}</span>}
      {esMia ? null : null}
    </div>
  );
}

export function OportunidadAcciones({ op, personaId, miembros }: { op: { id: string; estado: string; especialista_id: string | null }; personaId: string; miembros: { id: string; nombre: string }[] }) {
  const [pending, start] = useTransition();
  const [nota, setNota] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const go = (estado: string) => start(async () => { const r = (await cambiarEstadoOportunidad(op.id, personaId, estado, nota || undefined)) as R; setMsg(r.ok ? null : r.error ?? 'error'); if (r.ok) setNota(''); });
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {['posible', 'detectada'].includes(op.estado) && <button disabled={pending} className={btnDark} onClick={() => go('presentada')}>Presentar al cliente</button>}
      {['presentada'].includes(op.estado) && <button disabled={pending} className={btnDark} onClick={() => go('en_proceso')}>En proceso</button>}
      {['presentada', 'en_proceso'].includes(op.estado) && <button disabled={pending} className={btn} onClick={() => go('ganada')}>Ganada</button>}
      {['presentada', 'en_proceso'].includes(op.estado) && <button disabled={pending} className={btn} onClick={() => go('perdida')}>Perdida</button>}
      {['posible', 'detectada'].includes(op.estado) && <button disabled={pending} className={btn} onClick={() => go('no_aplica')}>No aplica</button>}
      <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional; si presentas, el cliente la ve)" className="min-w-[200px] flex-1 rounded-lg border border-line px-2 py-1 text-xs" />
      <select value={op.especialista_id ?? ''} onChange={(e) => start(async () => { await asignarEspecialista(op.id, personaId, e.target.value || null); })} className="rounded-lg border border-line px-2 py-1 text-xs">
        <option value="">Especialista: —</option>
        {miembros.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
      </select>
      {msg && <span className="text-xs text-red-600">{msg}</span>}
    </div>
  );
}

const TIPOS = [
  ['imss_historial', 'Historial IMSS (Belvo → Jordan)'], ['cda', 'CDA / AFORE (gratis)'], ['calculo_base', 'Recalcular con SISEC'], ['issste', 'ISSSTE (Nubarium)'], ['infonavit', 'Saldo Infonavit (Jordan)'], ['pdf_semanas', 'Subir PDF de semanas'],
];
export function ConsultaForm({ personaId }: { personaId: string }) {
  const [tipo, setTipo] = useState('imss_historial');
  const [prov, setProv] = useState('');
  const [notificar, setNotificar] = useState(false);
  const [forzar, setForzar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2 text-xs">
      <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full rounded-lg border border-line px-2 py-1.5">{TIPOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      {tipo === 'imss_historial' && (
        <select value={prov} onChange={(e) => setProv(e.target.value)} className="w-full rounded-lg border border-line px-2 py-1.5">
          <option value="">Proveedor según canal</option><option value="belvo">Belvo ($2.5)</option><option value="jordan">Jordan ($13, actualizado)</option>
        </select>
      )}
      <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (opcional)" className="w-full rounded-lg border border-line px-2 py-1.5" />
      <label className="flex items-center gap-2"><input type="checkbox" checked={notificar} onChange={(e) => setNotificar(e.target.checked)} /> Notificar al cliente cuando llegue</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={forzar} onChange={(e) => setForzar(e.target.checked)} /> Forzar aunque haya dato vigente</label>
      <button disabled={pending} className={btnDark + ' w-full py-2'} onClick={() => start(async () => {
        const r = await pedirConsulta(personaId, tipo, notificar, motivo, forzar, prov || undefined);
        const res = (r as R).resultado as { ok?: boolean; motivo?: string; proveedor?: string; costo?: number; estado?: string; error?: string } | undefined;
        setMsg(!r.ok ? (r as R).error ?? 'error' : !res?.ok ? `No enviada: ${res?.motivo === 'validado_vigente' ? 'ya hay dato oficial de menos de 90 días (marca "forzar")' : res?.motivo === 'consulta_en_curso' ? 'ya hay una consulta en curso' : res?.motivo}` : res.estado === 'error' ? `No se pudo: ${res.error}` : res.error ? `Registrada, pendiente: ${res.error}` : `Solicitada vía ${res.proveedor} (${res.costo ?? 0} MXN)`);
      })}>{pending ? 'Enviando…' : 'Solicitar'}</button>
      {msg && <p className="text-muted">{msg}</p>}
    </div>
  );
}

export function NotaForm({ personaId }: { personaId: string }) {
  const [txt, setTxt] = useState('');
  const [canal, setCanal] = useState('nota');
  const [vis, setVis] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <select value={canal} onChange={(e) => setCanal(e.target.value)} className="rounded-lg border border-line px-2 py-1.5"><option value="nota">Nota</option><option value="llamada">Llamada</option><option value="wa">WhatsApp</option><option value="email">Correo</option></select>
      <input value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Qué pasó / qué se acordó" className="min-w-[240px] flex-1 rounded-lg border border-line px-2 py-1.5" />
      <label className="flex items-center gap-1"><input type="checkbox" checked={vis} onChange={(e) => setVis(e.target.checked)} /> visible al cliente</label>
      <button disabled={pending || !txt} className={btnDark} onClick={() => start(async () => { const r = await agregarNota(personaId, txt, canal, vis); if (r.ok) setTxt(''); })}>Guardar</button>
    </div>
  );
}

export function DeclararForm({ personaId, campos }: { personaId: string; campos: { campo: string; nombre: string; tipo: string; grupo: string }[] }) {
  const [campo, setCampo] = useState(campos.find((c) => c.grupo === 'contexto')?.campo ?? campos[0]?.campo ?? '');
  const [valor, setValor] = useState('');
  const [capa, setCapa] = useState<'declarado' | 'validado'>('declarado');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const c = campos.find((x) => x.campo === campo);
  const parse = (): unknown => {
    if (!c) return valor;
    if (c.tipo === 'number') return Number(valor.replace(/[^0-9.\-]/g, ''));
    if (c.tipo === 'bool') return /^(s|si|sí|true|1|y)/i.test(valor);
    return valor;
  };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs">
      <span className="font-semibold">Capturar dato:</span>
      <select value={campo} onChange={(e) => setCampo(e.target.value)} className="rounded-lg border border-line px-2 py-1.5">
        {campos.map((x) => <option key={x.campo} value={x.campo}>{x.grupo} · {x.nombre}</option>)}
      </select>
      <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder={c?.tipo === 'bool' ? 'sí / no' : c?.tipo === 'date' ? 'AAAA-MM-DD' : 'valor'} className="w-40 rounded-lg border border-line px-2 py-1.5" />
      <select value={capa} onChange={(e) => setCapa(e.target.value as 'declarado' | 'validado')} className="rounded-lg border border-line px-2 py-1.5"><option value="declarado">Declarado (me lo dijo)</option><option value="validado">Validado (vi documento)</option></select>
      <button disabled={pending || !valor} className={btnDark} onClick={() => start(async () => { const r = await declararAsesor(personaId, campo, parse(), capa); setMsg(r.ok ? 'Guardado' : (r as R).error ?? 'error'); if (r.ok) setValor(''); })}>Guardar</button>
      {msg && <span className="text-muted">{msg}</span>}
    </div>
  );
}

export function CitaForm({ personaId }: { personaId: string }) {
  const [dt, setDt] = useState('');
  const [notas, setNotas] = useState('');
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <input type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} className="rounded-lg border border-line px-2 py-1.5" />
      <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas" className="flex-1 rounded-lg border border-line px-2 py-1.5" />
      <button disabled={pending || !dt} className={btnDark} onClick={() => start(async () => { const r = await crearCita(personaId, new Date(dt).toISOString(), notas); if (r.ok) { setDt(''); setNotas(''); } })}>Agendar</button>
    </div>
  );
}

/**
 * Saldo Infonavit con su procedencia. Lo que la persona reporta de su propia cuenta
 * le gana a nuestro estimado (migración 056); aquí se ve de dónde salió el número y
 * se puede corregir sin salir del resumen.
 */
export function SaldoInfonavitAccion({ personaId, saldo, estimado, capa, origen, en, vigente, credito }: {
  personaId: string; saldo: number | null; estimado: number | null;
  capa: string | null; origen: string | null; en: string | null; vigente: boolean | null; credito: boolean | null;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');
  const [cred, setCred] = useState<'' | 'si' | 'no'>(credito == null ? '' : credito ? 'si' : 'no');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const mxn = (n: number | null) => (n == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n));
  const reportado = capa === 'declarado' || capa === 'validado';
  const vencido = vigente === false;
  const brecha = reportado && !vencido && estimado != null && saldo != null && Math.max(saldo, estimado) > 0
    ? Math.abs(saldo - estimado) / Math.max(saldo, estimado) : 0;
  const fecha = en ? new Date(en).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : null;

  const guardar = () => start(async () => {
    const n = Number(val.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(n) || n < 0) return setMsg('Escribe el saldo en pesos.');
    const r = (await declararAsesor(personaId, 'saldo_infonavit', n, 'declarado')) as R;
    if (!r.ok) return setMsg(r.error ?? 'error');
    if (cred) await declararAsesor(personaId, 'credito_infonavit_vigente', cred === 'si', 'declarado');
    setMsg(null); setVal(''); setOpen(false);
  });

  return (
    <div className="mt-4 rounded-xl bg-cream p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <b className="text-sm">{mxn(saldo)}</b> de saldo Infonavit ·{' '}
          {vencido ? <span className="text-amber-700">reportado {fecha} · vencido, conviene reconfirmar</span>
            : capa === 'validado' ? <span className="text-green-700">validado{fecha ? ` el ${fecha}` : ''}</span>
            : capa === 'declarado' ? <span className="text-amber-700">reportado por {origen === 'cliente' ? 'el cliente' : origen === 'asesor' ? 'un asesor' : 'Trol'}{fecha ? ` el ${fecha}` : ''}</span>
            : <span className="text-blue-700">estimado por Trol con su historial de salarios, sin confirmar</span>}
          {brecha > 0.2 && estimado != null ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">nuestro estimado era {mxn(estimado)}</span> : null}
        </span>
        <button className={btn} onClick={() => setOpen(!open)}>{reportado && !vencido ? 'Actualizar' : 'Confirmar el saldo real'}</button>
      </div>
      {!reportado || vencido ? (
        <p className="mt-1 text-muted">Nuestro estimado sirve para detectar la oportunidad y sale de su historial de salarios. Para <b>formalizar una propuesta</b> necesitas el saldo real de su cuenta Infonavit.</p>
      ) : null}
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2">
          <input value={val} onChange={(e) => setVal(e.target.value)} inputMode="decimal" placeholder={estimado ? `Saldo real (estimado ${mxn(estimado)})` : 'Saldo real en pesos'} className="w-64 rounded-lg border border-line px-2 py-1" />
          <select value={cred} onChange={(e) => setCred(e.target.value as '' | 'si' | 'no')} className="rounded-lg border border-line px-2 py-1">
            <option value="">¿Ya usó su crédito?</option>
            <option value="no">No lo ha usado</option>
            <option value="si">Ya lo usó / está vigente</option>
          </select>
          <button disabled={pending} className={btnDark} onClick={guardar}>Guardar</button>
          <span className="text-muted">Vale 180 días; después se vuelve a pedir.</span>
          {msg && <span className="text-red-600">{msg}</span>}
        </div>
      )}
    </div>
  );
}
