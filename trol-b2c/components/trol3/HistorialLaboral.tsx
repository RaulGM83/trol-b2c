type Periodo = {
  empleador?: string;
  fecha_inicio?: string;
  fecha_fin?: string;
  salario_base?: number;
  entidad_federativa?: string;
  registro_patronal?: string;
};

const money = (n?: number) =>
  n == null ? '—' : n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 });
const f = (s?: string) =>
  s && /^\d{4}-\d{2}-\d{2}/.test(s) ? new Date(s + 'T00:00:00').toLocaleDateString('es-MX', { year: 'numeric', month: 'short' }) : '—';

export function HistorialLaboral({ historial }: { historial: Periodo[] }) {
  if (!historial?.length) return null;
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="mb-3 text-sm font-bold">
        Historial laboral (IMSS) <span className="ml-1 text-xs font-normal text-muted">{historial.length} periodos · salario base diario de cotización</span>
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="text-muted">
            <tr className="border-b border-line">
              <th className="py-1 pr-3 font-semibold">Patrón</th>
              <th className="py-1 pr-3 font-semibold">Entidad</th>
              <th className="py-1 pr-3 font-semibold">Desde</th>
              <th className="py-1 pr-3 font-semibold">Hasta</th>
              <th className="py-1 pr-3 text-right font-semibold">Salario base</th>
            </tr>
          </thead>
          <tbody>
            {historial.map((p, i) => (
              <tr key={i} className="border-b border-line/60 align-top">
                <td className="py-1.5 pr-3">
                  {p.empleador ?? '—'}
                  {p.registro_patronal ? <span className="block text-[10px] text-muted">RP {p.registro_patronal}</span> : null}
                </td>
                <td className="py-1.5 pr-3">{p.entidad_federativa ?? '—'}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{f(p.fecha_inicio)}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{f(p.fecha_fin)}</td>
                <td className="py-1.5 pr-3 text-right font-semibold whitespace-nowrap">{money(p.salario_base)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
