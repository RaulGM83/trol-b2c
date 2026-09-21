// Historia laboral con las fechas EXACTAS de alta y baja (día, mes, año), tal como vienen del
// IMSS: un renglón por movimiento, sin agrupar ni redondear a años. Arriba, la vida laboral en
// una sola barra; entre renglones, los huecos sin cotizar — que es de lo que se habla en asesoría.
// Sin hooks a propósito: lo usan la sesión del asesor (cliente) y "Presentar" (servidor).
import { periodos, mxn, type VistaAsesoria } from '@/lib/trol3/asesoria';

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dia = (iso: string) => `${Number(iso.slice(8, 10))} ${MES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const dura = (d: number) => {
  if (d < 31) return `${d} ${d === 1 ? 'día' : 'días'}`;
  const m = Math.round(d / 30.44); if (m < 12) return `${m} ${m === 1 ? 'mes' : 'meses'}`;
  const a = Math.floor(m / 12); const r = m % 12;
  return `${a} ${a === 1 ? 'año' : 'años'}${r ? ` ${r} m` : ''}`;
};

export function HistoriaLaboral({ historial, grande = false }: { historial: VistaAsesoria['historial']; grande?: boolean }) {
  const ps = periodos(historial);
  if (!ps.length) return null;
  const t0 = new Date(ps[0].alta).getTime(); const t1 = Date.now(); const span = Math.max(1, t1 - t0);
  const y0 = Number(ps[0].alta.slice(0, 4)); const y1 = new Date().getFullYear();
  const paso = y1 - y0 > 30 ? 10 : y1 - y0 > 12 ? 5 : y1 - y0 > 5 ? 2 : 1;
  const marcas: number[] = []; for (let y = Math.ceil(y0 / paso) * paso; y <= y1; y += paso) marcas.push(y);
  const pct = (iso: string | null) => ((iso ? new Date(iso).getTime() : t1) - t0) / span * 100;
  const tx = grande ? 'text-base' : 'text-sm'; const chico = grande ? 'text-sm' : 'text-xs';
  return (
    <div>
      <div className="relative mt-3 h-5 overflow-hidden rounded-full bg-cream" aria-hidden>
        {ps.map((p, i) => <span key={i} className={p.baja ? 'absolute top-0 h-full bg-ink/80' : 'absolute top-0 h-full bg-lime'} style={{ left: `${pct(p.alta)}%`, width: `${Math.max(0.4, pct(p.baja) - pct(p.alta))}%` }} />)}
      </div>
      <div className={`relative mt-1 h-4 ${chico} text-muted`} aria-hidden>
        {marcas.map((y) => <span key={y} className="absolute -translate-x-1/2 font-mono" style={{ left: `${pct(`${y}-01-01`)}%` }}>{y}</span>)}
      </div>
      <div className={`mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-b border-line pb-1 ${chico} font-semibold uppercase tracking-wide text-muted sm:grid-cols-[120px_120px_minmax(0,1fr)_90px_90px]`}>
        <span className="hidden sm:block">Alta</span><span className="hidden sm:block">Baja</span><span>Patrón</span><span className="hidden text-right sm:block">Duración</span><span className="text-right">Salario diario</span>
      </div>
      <ul className={`divide-y divide-line ${tx}`}>
        {ps.slice().reverse().map((p, i) => (
          <li key={i}>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 py-1.5 sm:grid-cols-[120px_120px_minmax(0,1fr)_90px_90px]">
              <span className="hidden font-mono sm:block">{dia(p.alta)}</span>
              <span className="hidden font-mono sm:block">{p.baja ? dia(p.baja) : <b className="rounded bg-lime px-1.5 font-sans">vigente</b>}</span>
              <span className="min-w-0"><span className="block truncate">{p.empleador}</span><span className={`block font-mono ${chico} text-muted sm:hidden`}>{dia(p.alta)} → {p.baja ? dia(p.baja) : 'vigente'} · {dura(p.dias)}</span></span>
              <span className={`hidden text-right ${chico} text-muted sm:block`}>{dura(p.dias)}</span>
              <span className="text-right font-mono">{p.salario != null ? mxn(p.salario) : '—'}</span>
            </div>
            {p.hueco > 31 ? <div className={`-mt-0.5 pb-1.5 ${chico} text-amber-700`}>↑ {dura(p.hueco)} sin cotizar antes de esta alta</div> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
