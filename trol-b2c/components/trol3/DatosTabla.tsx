'use client';
import { useState, useTransition } from 'react';
import { declararAsesor, pedirConsulta } from '@/app/trabajo/actions';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface DatoRow { campo: string; nombre: string; tipo: string; grupo: string; opciones?: string[] | null; valor: any; capa?: string; proveedor?: string | null; origen_tipo?: string; obtenido_en?: string | null; vigente?: boolean | null; }
type R = { ok: boolean; error?: string; resultado?: unknown };

const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
const fmtNum = (n: number) => new Intl.NumberFormat('es-MX').format(n);
const fmtFecha = (d?: string | null) => (d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const CAPA: Record<string, [string, string]> = { validado: ['Oficial', 'bg-green-50 text-green-700'], calculado: ['Trol', 'bg-blue-50 text-blue-700'], declarado: ['Declarado', 'bg-amber-50 text-amber-700'] };

function show(r: DatoRow) {
  const v = r.valor;
  if (v == null) return <span className="text-muted">—</span>;
  if (r.tipo === 'bool') return <>{v === true ? 'Sí' : v === false ? 'No' : String(v)}</>;
  if (r.tipo === 'number') return <>{/saldo|pension|costo|ingreso|infonavit|salario|expectativa/.test(r.campo) ? fmtMXN(Number(v)) : fmtNum(Number(v))}</>;
  if (r.tipo === 'date') return <>{fmtFecha(String(v))}</>;
  if (r.tipo === 'json') return <span className="text-muted">json</span>;
  return <>{String(v)}</>;
}

const CONSULTA_POR_GRUPO: Record<string, [string, string]> = { imss: ['imss_historial', 'Actualizar del IMSS'], afore: ['cda', 'Consultar AFORE (CDA)'], infonavit: ['infonavit', 'Consultar Infonavit'], issste: ['issste', 'Consultar ISSSTE'] };
const GRUPO_LABEL: Record<string, string> = { identidad: 'Identidad', imss: 'IMSS', afore: 'AFORE', infonavit: 'Infonavit', issste: 'ISSSTE', contexto: 'Contexto personal', calculo: 'Cálculos Trol' };

export function DatosTabla({ personaId, rows, grupos, compacto = false, fechas = {} }: { personaId: string; rows: DatoRow[]; grupos: string[]; compacto?: boolean; fechas?: Record<string, string | null | undefined> }) {
  return (
    <div className={`grid gap-5 ${compacto ? '' : 'md:grid-cols-2'}`}>
      {grupos.map((g) => {
        const rs = rows.filter((r) => r.grupo === g && r.campo !== 'semilla');
        if (!rs.length) return null;
        return <Grupo key={g} g={g} rows={rs} personaId={personaId} fecha={fechas[g] ?? null} />;
      })}
    </div>
  );
}

function Grupo({ g, rows, personaId, fecha }: { g: string; rows: DatoRow[]; personaId: string; fecha: string | null }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cq = CONSULTA_POR_GRUPO[g];
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase text-muted">{GRUPO_LABEL[g] ?? g}{fecha ? <span className="ml-2 font-normal normal-case">· datos al {fmtFecha(fecha)}</span> : null}</h3>
        {cq && (
          <button disabled={pending} className="rounded-lg border border-line bg-white px-2 py-0.5 text-[11px] font-semibold hover:bg-cream disabled:opacity-50" onClick={() => start(async () => {
            const r = (await pedirConsulta(personaId, cq[0], false, 'desde expediente', false)) as R;
            const res = r.resultado as { ok?: boolean; motivo?: string; proveedor?: string; estado?: string; error?: string } | undefined;
            setMsg(!r.ok ? r.error ?? 'error' : !res?.ok ? (res?.motivo === 'validado_vigente' ? 'Ya está actualizado (<90 días). Usa "forzar" en Pedir información.' : res?.motivo === 'consulta_en_curso' ? 'Ya hay una consulta en curso.' : `No enviada: ${res?.motivo}`) : res.estado === 'error' ? `No se pudo: ${res.error}` : res.error ? `Registrada, pendiente: ${res.error}` : `Solicitada (${res.proveedor})`);
          })}>{pending ? '…' : cq[1]}</button>
        )}
      </div>
      {msg && <p className="mb-1 text-[11px] text-muted">{msg}</p>}
      <table className="w-full text-sm"><tbody>{rows.map((r) => <Fila key={r.campo} r={r} personaId={personaId} />)}</tbody></table>
    </div>
  );
}

function Fila({ r, personaId }: { r: DatoRow; personaId: string }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState('');
  const [capa, setCapa] = useState<'declarado' | 'validado'>('declarado');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const parse = (): unknown => (r.tipo === 'number' ? Number(val.replace(/[^0-9.\-]/g, '')) : r.tipo === 'bool' ? /^(s|si|sí|true|1|y)/i.test(val) : val);
  const c = r.capa ? CAPA[r.capa] : null;
  return (
    <tr className="border-t border-line/70 align-top">
      <td className="py-1 pr-2 text-xs text-muted">{r.nombre}</td>
      <td className="py-1 text-right font-medium">
        {!edit ? show(r) : (
          <span className="inline-flex flex-wrap items-center justify-end gap-1">
            {r.tipo === 'bool' ? (
              <select value={val} onChange={(e) => setVal(e.target.value)} className="rounded border border-line px-1 py-0.5 text-xs"><option value="">—</option><option value="si">Sí</option><option value="no">No</option></select>
            ) : r.opciones?.length ? (
              <select autoFocus value={val} onChange={(e) => setVal(e.target.value)} className="rounded border border-line px-1 py-0.5 text-xs"><option value="">—</option>{r.opciones.map((o) => <option key={o} value={o}>{o}</option>)}</select>
            ) : (
              <input autoFocus type={r.tipo === 'number' ? 'number' : r.tipo === 'date' ? 'date' : 'text'} value={val} onChange={(e) => setVal(e.target.value)} className="w-32 rounded border border-line px-1 py-0.5 text-xs" />
            )}
            {r.grupo !== 'contexto' && r.grupo !== 'calculo' && (
              <select value={capa} onChange={(e) => setCapa(e.target.value as 'declarado' | 'validado')} className="rounded border border-line px-1 py-0.5 text-[10px]"><option value="declarado">me lo dijo</option><option value="validado">vi documento</option></select>
            )}
            <button disabled={pending || !val} className="rounded bg-ink px-2 py-0.5 text-[10px] font-semibold text-white disabled:opacity-50" onClick={() => start(async () => {
              const res = (await declararAsesor(personaId, r.campo, parse(), r.grupo === 'contexto' ? 'declarado' : capa)) as R;
              setMsg(res.ok ? null : res.error ?? 'error'); if (res.ok) { setEdit(false); setVal(''); }
            })}>Guardar</button>
            <button className="text-[10px] text-muted underline" onClick={() => { setEdit(false); setMsg(null); }}>cancelar</button>
          </span>
        )}
        {msg && <div className="text-[10px] text-red-600">{msg}</div>}
      </td>
      <td className="whitespace-nowrap py-1 pl-2 text-right text-[10px] text-muted">
        {c ? <span title={`${c[0]} · ${r.proveedor ?? r.origen_tipo ?? ''} · ${fmtFecha(r.obtenido_en)}`} className={`rounded px-1 ${c[1]} ${r.vigente === false ? 'line-through' : ''}`}>{c[0]}</span> : null}
        {r.grupo !== 'calculo' && !edit && <button className="ml-1 text-[10px] underline" onClick={() => setEdit(true)} title="Capturar / corregir">editar</button>}
      </td>
    </tr>
  );
}
