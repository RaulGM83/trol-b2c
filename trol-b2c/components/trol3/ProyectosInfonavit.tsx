'use client';
// Inventario de inmuebles y supuestos globales de la asesoría Infonavit.
// Uso interno: aquí viven el costo del aliado y la comisión del desarrollador.
import { useState, useTransition } from 'react';
import { guardarProyecto, alternarProyecto, guardarSupuestosInfonavit } from '@/app/trabajo/actions';

type R = { ok: boolean; error?: string };
export interface ProyectoRow {
  id: string; clave: number | null; desarrollo: string; zona: string | null; m2: number | null;
  avaluo: number; escrituracion: number; costo_aliado: number | null; renta: number;
  renta_estimada: boolean; plusvalia: number; plusvalia_validada: boolean;
  notariales_credito: number; notariales_adicionales: number; comision_desarrollador: number;
  aliado_cubre_notariales: boolean; disponible: boolean; notas: string | null;
}

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const money = (n: number | null) => (n == null ? '—' : mxn.format(n));
const inp = 'w-full rounded-lg border border-line px-2 py-1 text-sm';
const btn = 'rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-cream disabled:opacity-50';
const btnDark = 'rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50';

const VACIO: ProyectoRow = {
  id: '', clave: null, desarrollo: '', zona: '', m2: null, avaluo: 0, escrituracion: 0, costo_aliado: null,
  renta: 0, renta_estimada: true, plusvalia: 0.06, plusvalia_validada: false, notariales_credito: 0,
  notariales_adicionales: 0, comision_desarrollador: 0, aliado_cubre_notariales: true, disponible: true, notas: '',
};

function Campo({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-muted">{label}</span>
      {children}
      {sub ? <span className="mt-0.5 block text-[10px] text-muted">{sub}</span> : null}
    </label>
  );
}

function Editor({ inicial, onListo }: { inicial: ProyectoRow; onListo: () => void }) {
  const [p, setP] = useState<ProyectoRow>(inicial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof ProyectoRow>(k: K, v: ProyectoRow[K]) => setP((o) => ({ ...o, [k]: v }));
  const n = (v: string) => (v === '' ? 0 : Number(v));

  return (
    <div className="rounded-xl border border-line bg-cream/50 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo label="Desarrollo"><input value={p.desarrollo} onChange={(e) => set('desarrollo', e.target.value)} className={inp} /></Campo>
        <Campo label="Zona"><input value={p.zona ?? ''} onChange={(e) => set('zona', e.target.value)} className={inp} /></Campo>
        <Campo label="Clave (referencia)"><input type="number" value={p.clave ?? ''} onChange={(e) => set('clave', e.target.value === '' ? null : Number(e.target.value))} className={inp} /></Campo>
        <Campo label="m²"><input type="number" step="0.01" value={p.m2 ?? ''} onChange={(e) => set('m2', e.target.value === '' ? null : Number(e.target.value))} className={inp} /></Campo>
        <Campo label="Valor de avalúo"><input type="number" value={p.avaluo} onChange={(e) => set('avaluo', n(e.target.value))} className={inp} /></Campo>
        <Campo label="Valor de escrituración" sub="Es el precio que de verdad paga el cliente"><input type="number" value={p.escrituracion} onChange={(e) => set('escrituracion', n(e.target.value))} className={inp} /></Campo>
        <Campo label="Costo para el aliado" sub="INTERNO: no se muestra al cliente"><input type="number" value={p.costo_aliado ?? ''} onChange={(e) => set('costo_aliado', e.target.value === '' ? null : Number(e.target.value))} className={inp} /></Campo>
        <Campo label="Comisión del desarrollador" sub="INTERNO: proporción, p. ej. 0.03"><input type="number" step="0.01" value={p.comision_desarrollador} onChange={(e) => set('comision_desarrollador', n(e.target.value))} className={inp} /></Campo>
        <Campo label="Renta mensual"><input type="number" value={p.renta} onChange={(e) => set('renta', n(e.target.value))} className={inp} /></Campo>
        <Campo label="Plusvalía anual" sub="Proporción, p. ej. 0.06"><input type="number" step="0.005" value={p.plusvalia} onChange={(e) => set('plusvalia', n(e.target.value))} className={inp} /></Campo>
        <Campo label="Notariales del crédito" sub="Siempre se financian dentro del crédito"><input type="number" value={p.notariales_credito} onChange={(e) => set('notariales_credito', n(e.target.value))} className={inp} /></Campo>
        <Campo label="Notariales adicionales"><input type="number" value={p.notariales_adicionales} onChange={(e) => set('notariales_adicionales', n(e.target.value))} className={inp} /></Campo>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={p.aliado_cubre_notariales} onChange={(e) => set('aliado_cubre_notariales', e.target.checked)} /> El aliado cubre los notariales adicionales</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={p.renta_estimada} onChange={(e) => set('renta_estimada', e.target.checked)} /> La renta es estimación nuestra (no observada)</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={p.plusvalia_validada} onChange={(e) => set('plusvalia_validada', e.target.checked)} /> Plusvalía validada con datos de mercado</label>
        <label className="flex items-center gap-1.5"><input type="checkbox" checked={p.disponible} onChange={(e) => set('disponible', e.target.checked)} /> Disponible</label>
      </div>
      <Campo label="Notas"><textarea value={p.notas ?? ''} onChange={(e) => set('notas', e.target.value)} rows={2} className={`${inp} mt-1`} /></Campo>
      <div className="mt-3 flex items-center gap-2">
        <button disabled={pending} className={btnDark} onClick={() => start(async () => {
          const r = (await guardarProyecto({ ...p, id: p.id || null })) as R;
          if (!r.ok) return setMsg(r.error ?? 'error');
          setMsg(null); onListo();
        })}>Guardar</button>
        <button className={btn} onClick={onListo}>Cancelar</button>
        {msg && <span className="text-xs text-red-600">{msg}</span>}
      </div>
    </div>
  );
}

export function ProyectosInfonavit({ proyectos, supuestos }: { proyectos: ProyectoRow[]; supuestos: Record<string, unknown> }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [pending, start] = useTransition();
  const [sup, setSup] = useState(supuestos);
  const [supMsg, setSupMsg] = useState<string | null>(null);

  const numSup = (k: string) => Number(sup[k] ?? 0);
  const setSupK = (k: string, v: unknown) => setSup((o) => ({ ...o, [k]: v }));

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-extrabold">Inmuebles para asesoría Infonavit</h1>
            <p className="text-xs text-muted">Costo del aliado y comisión del desarrollador son internos: no aparecen en la propuesta del cliente.</p>
          </div>
          {!nuevo && <button className={btnDark} onClick={() => { setNuevo(true); setEditando(null); }}>+ Agregar inmueble</button>}
        </div>
        {nuevo && <div className="mt-4"><Editor inicial={VACIO} onListo={() => setNuevo(false)} /></div>}
      </section>

      {proyectos.map((p) => (
        <section key={p.id} className="rounded-2xl border border-line bg-white p-5">
          {editando === p.id ? (
            <Editor inicial={p} onListo={() => setEditando(null)} />
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold">{p.desarrollo} {p.disponible ? null : <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-muted">no disponible</span>}</h2>
                  <p className="text-xs text-muted">{p.zona ?? 'sin zona'}{p.m2 ? ` · ${p.m2} m²` : ''}</p>
                </div>
                <div className="flex gap-2">
                  <button className={btn} onClick={() => { setEditando(p.id); setNuevo(false); }}>Editar</button>
                  <button disabled={pending} className={btn} onClick={() => start(async () => { await alternarProyecto(p.id, !p.disponible); })}>
                    {p.disponible ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <Dato k="Avalúo" v={money(p.avaluo)} />
                <Dato k="Escrituración" v={money(p.escrituracion)} />
                <Dato k="Renta" v={money(p.renta)} nota={p.renta_estimada ? 'estimada' : 'observada'} alerta={p.renta_estimada} />
                <Dato k="Plusvalía" v={`${(p.plusvalia * 100).toFixed(1)}%`} nota={p.plusvalia_validada ? 'validada' : 'sin validar'} alerta={!p.plusvalia_validada} />
                <Dato k="Notariales del crédito" v={money(p.notariales_credito)} />
                <Dato k="Notariales adicionales" v={money(p.notariales_adicionales)} nota={p.aliado_cubre_notariales ? 'los cubre el aliado' : 'los paga el cliente'} alerta={!p.aliado_cubre_notariales} />
                <Dato k="Costo aliado (interno)" v={money(p.costo_aliado)} />
                <Dato k="Comisión desarrollador (interno)" v={`${(p.comision_desarrollador * 100).toFixed(1)}%`} />
              </div>
              {p.notas && <p className="mt-3 rounded-lg bg-cream p-2 text-xs text-muted">{p.notas}</p>}
            </>
          )}
        </section>
      ))}

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Supuestos globales</h2>
        <p className="mt-1 text-xs text-muted">Aplican a todos los inmuebles y escenarios. Cambiarlos mueve todas las propuestas nuevas.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {([
            ['r_ssv', 'Rendimiento de la Subcuenta de Vivienda', 0.005],
            ['inflacion', 'Inflación anual estimada', 0.005],
            ['mantenimiento', 'Mantenimiento (% de la renta)', 0.01],
            ['gestion', 'Gestión de rentas (% de la renta)', 0.01],
            ['comision_venta', 'Comisión de venta', 0.005],
            ['alterno', 'Rendimiento alterno del cliente', 0.005],
            ['uma_mensual', 'UMA mensual', 0.01],
            ['monto_max_credito', 'Monto máximo de crédito por titular', 1],
            ['meses_cotizando_default', 'Meses que asumimos que sigue cotizando', 1],
            ['saldo_min_asesoria', 'Saldo desde el que abre la pestaña', 1000],
          ] as [string, string, number][]).map(([k, label, step]) => (
            <Campo key={k} label={label}>
              <input type="number" step={step} value={numSup(k)} onChange={(e) => setSupK(k, Number(e.target.value))} className={inp} />
            </Campo>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={Boolean(sup.aplica_gestion)} onChange={(e) => setSupK('aplica_gestion', e.target.checked)} /> Aplica gestión de rentas
        </label>
        <div className="mt-3 flex items-center gap-2">
          <button disabled={pending} className={btnDark} onClick={() => start(async () => {
            const campos = ['r_ssv','inflacion','mantenimiento','gestion','comision_venta','alterno','uma_mensual','monto_max_credito','meses_cotizando_default','saldo_min_asesoria','aplica_gestion'];
            const patch = Object.fromEntries(campos.map((k) => [k, sup[k]]));
            const r = (await guardarSupuestosInfonavit(patch)) as R;
            setSupMsg(r.ok ? 'Guardado.' : r.error ?? 'error');
          })}>Guardar supuestos</button>
          {supMsg && <span className="text-xs text-muted">{supMsg}</span>}
        </div>
      </section>
    </div>
  );
}

function Dato({ k, v, nota, alerta }: { k: string; v: string; nota?: string; alerta?: boolean }) {
  return <div><div className="text-[11px] text-muted">{k}</div><div className="font-semibold">{v}</div>{nota ? <div className={`text-[10px] ${alerta ? 'text-amber-700' : 'text-muted'}`}>{nota}</div> : null}</div>;
}
