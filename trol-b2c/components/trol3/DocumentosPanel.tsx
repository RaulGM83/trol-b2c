'use client';
import { useState, useTransition } from 'react';
import { solicitarDiagnosticoAvanzado, subirDocumento } from '@/app/trabajo/actions';

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = { ok: boolean; error?: string; resultado?: unknown };
const btnDark = 'rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50';
const fmtFecha = (d?: string | null) => (d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

type TipoSubida = { tipo: string; nombre: string; formatos: string[]; parseable: boolean };

export function DocumentosPanel({ personaId, docs, legacy, tiposSubida = [], tieneCurp = true }: { personaId: string; docs: any[]; legacy: any | null; tiposSubida?: TipoSubida[]; tieneCurp?: boolean }) {
  const [curp, setCurp] = useState('');
  const [pedirCurp, setPedirCurp] = useState(!tieneCurp);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [tipo, setTipo] = useState(tiposSubida[0]?.tipo ?? 'constancia_semanas');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subMsg, setSubMsg] = useState<string | null>(null);
  const [subiendo, startSubida] = useTransition();
  const tipoSel = tiposSubida.find((t) => t.tipo === tipo);
  const generando = !!legacy?.diag_avanzado_solicitado_at;
  const tieneSemilla = !!legacy?.tiene_semilla;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-3 text-sm font-bold">Documentos del cliente</h2>
        {!docs.length && <p className="text-sm text-muted">Sin documentos todavía.</p>}
        <ul className="divide-y divide-line text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2">
              <div>
                <div className="font-medium">{d.nombre ?? d.tipo}</div>
                <div className="text-[11px] text-muted">{d.tipo} · {fmtFecha(d.created_at)} · {d.origen_tipo}{d.gating !== 'gratis' ? ` · cliente: ${d.gating}${d.precio_mxn ? ` $${d.precio_mxn}` : ''}` : ' · visible al cliente'}</div>
              </div>
              {d.storage_path ? <a href={`/trabajo/doc/${d.id}`} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold hover:bg-cream">Abrir</a>
               : d.url_externa ? <a href={d.url_externa} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold hover:bg-cream">Abrir</a> : <span className="text-xs text-muted">—</span>}
            </li>
          ))}
        </ul>
        {legacy?.drive_folder && <a href={legacy.drive_folder} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs underline">Abrir carpeta de Drive del cliente</a>}
      </section>
      <aside className="space-y-4">
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="mb-1 text-sm font-bold">Subir a la bóveda</h2>
          <p className="mb-3 text-xs text-muted">Se guarda en el expediente (privado, visible para el cliente). Si es la <b>constancia de semanas del IMSS</b>, arranca la extracción y el cálculo automáticamente.</p>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="mb-2 w-full rounded-lg border border-line px-3 py-2 text-sm">
            {tiposSubida.map((t) => <option key={t.tipo} value={t.tipo}>{t.nombre}</option>)}
          </select>
          <input type="file" accept={(tipoSel?.formatos ?? ['pdf']).map((f) => (f === 'jpg' ? '.jpg,.jpeg' : `.${f}`)).join(',')} onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="mb-2 block w-full text-xs" />
          {tipo === 'constancia_semanas' && pedirCurp && (
            <div className="mb-2">
              <input value={curp} onChange={(e) => setCurp(e.target.value.toUpperCase())} maxLength={18} placeholder="CURP de la persona (18 caracteres)" className="w-full rounded-lg border border-line px-3 py-2 font-mono text-sm uppercase" />
              <p className="mt-1 text-[11px] text-muted">La persona no tiene CURP en el expediente. Intentamos leerla del PDF; si no se puede, la usamos de aquí. Sin CURP no corre el cálculo.</p>
            </div>
          )}
          <button disabled={subiendo || !archivo} className={btnDark} onClick={() => startSubida(async () => {
            if (!archivo) return;
            setSubMsg(null);
            const fd = new FormData(); fd.set('personaId', personaId); fd.set('tipo', tipo); fd.set('archivo', archivo); if (curp) fd.set('curp', curp);
            const r = (await subirDocumento(fd)) as R & { procesando?: boolean; aviso?: string; falta_curp?: boolean };
            setSubMsg(r.ok ? (r.aviso ?? (r.procesando ? 'Guardado. Extrayendo datos y recalculando; en unos minutos se actualiza el expediente.' : 'Guardado en la bóveda.')) : r.error ?? 'error');
            if (r.ok && r.falta_curp) setPedirCurp(true);
            if (r.ok && !r.falta_curp) { setArchivo(null); if (r.procesando) setPedirCurp(false); }
          })}>{subiendo ? 'Subiendo…' : 'Subir documento'}</button>
          {subMsg && <p className="mt-2 text-xs text-muted">{subMsg}</p>}
        </section>
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="mb-1 text-sm font-bold">Diagnóstico avanzado</h2>
          <p className="mb-3 text-xs text-muted">Reporte completo en PDF: escenarios por edad, estrategia, Infonavit y ahorro. Uso interno, sin costo. Llega en unos minutos y aparece en la lista.</p>
          {!legacy ? <p className="text-xs text-amber-700">Requiere que la persona tenga ficha (espejo HubSpot).</p>
          : !tieneSemilla ? <p className="text-xs text-amber-700">Requiere SISEC/cálculo actualizado (semilla v2).</p>
          : generando ? <p className="text-xs text-muted">Generando… (solicitado {fmtFecha(legacy.diag_avanzado_solicitado_at)}). Recarga en unos minutos.</p>
          : (
            <button disabled={pending} className={btnDark} onClick={() => start(async () => { const r = (await solicitarDiagnosticoAvanzado(personaId)) as R; setMsg(r.ok ? 'Solicitado; llega en unos minutos.' : r.error ?? 'error'); })}>
              {pending ? 'Solicitando…' : legacy.diag_avanzado_url ? 'Regenerar diagnóstico avanzado' : 'Generar diagnóstico avanzado'}
            </button>
          )}
          {legacy?.diag_avanzado_url && <a href={legacy.diag_avanzado_url} target="_blank" rel="noreferrer" className="mt-2 block text-xs underline">Abrir el último diagnóstico avanzado</a>}
          {msg && <p className="mt-2 text-xs text-muted">{msg}</p>}
        </section>
        <section className="rounded-2xl border border-line bg-white p-5 text-xs text-muted">
          <h2 className="mb-1 text-sm font-bold text-ink">Otros</h2>
          {legacy?.checkup_url && <a href={legacy.checkup_url} target="_blank" rel="noreferrer" className="block underline">Checkup pensional</a>}
          {legacy?.link_diagnostico && <a href={legacy.link_diagnostico} target="_blank" rel="noreferrer" className="block underline">Diagnóstico Trol (básico)</a>}
          {legacy?.sisec_url && <a href={legacy.sisec_url} target="_blank" rel="noreferrer" className="block underline">SISEC</a>}
          {legacy?.sisec_refresh_solicitado_at && <p className="mt-1">Actualización IMSS en proceso desde {fmtFecha(legacy.sisec_refresh_solicitado_at)}.</p>}
        </section>
      </aside>
    </div>
  );
}
