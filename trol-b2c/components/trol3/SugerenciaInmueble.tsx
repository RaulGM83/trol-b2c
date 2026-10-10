'use client';
// 228 · Panel "Qué inmueble le conviene" de la asesoría Infonavit. Sólo lo ve el asesor.
// Orden por ventaja del motor al horizonte de referencia; el semáforo informa riesgo
// (vacancia, retención, aportaciones sin cabida, urgencia) pero no reordena. Los factores
// personales se capturan en "Palancas del cliente" (230).
import type { Sugerencia } from '@/lib/infonavit/sugerencia';

const mxn0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const money = (n: number) => (Number.isFinite(n) ? mxn0.format(n) : '—');
const pct = (n: number, d = 0) => (Number.isFinite(n) ? `${(n * 100).toFixed(d)}%` : '—');
const PUNTO: Record<string, string> = { verde: 'bg-emerald-500', ambar: 'bg-amber-400', rojo: 'bg-red-500' };
const TEXTO: Record<string, string> = { verde: 'Sostenible', ambar: 'Con cuidado', rojo: 'No lo recomiendes' };


export function SugerenciaInmueble({ sugerencia, proyectoId, onElegir }: {
  sugerencia: Sugerencia | null;
  proyectoId: string;
  onElegir: (id: string) => void;
}) {
  const filas = sugerencia?.filas ?? [];
  const mejor = filas[0];
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Qué inmueble le conviene</h2>
        {sugerencia && (
          <span className="text-[11px] text-muted">
            Comparados a {sugerencia.horizonte_ref} meses · orden por ventaja · empate técnico si la diferencia es ≤ {money(sugerencia.umbral_empate)} (gana el de menor pago) ·
            crédito mayor a {sugerencia.reglas.apalancamiento_max}× su saldo = para saldos mayores, al final
          </span>
        )}
      </div>


      {!filas.length ? (
        <p className="mt-3 text-sm text-muted">Con este saldo ningún inmueble del catálogo deja crédito mínimo.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-wide text-muted">
                <th className="py-1.5 pr-2">Inmueble</th>
                <th className="py-1.5 pr-2 text-right">Crédito</th>
                <th className="py-1.5 pr-2 text-right">Pago / renta neta</th>
                <th className="py-1.5 pr-2 text-right">Retención</th>
                <th className="py-1.5 pr-2 text-right">Ventaja a {sugerencia?.horizonte_ref} m</th>
                <th className="py-1.5 pr-2 text-right">Recibe al vender</th>
                <th className="py-1.5 pr-2">Lectura</th>
                <th className="py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const actual = f.id === proyectoId;
                return (
                  <tr key={f.id} className={`border-b border-line align-top ${actual ? 'bg-cream/60' : ''}`}>
                    <td className="py-2 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-block h-2 w-2 rounded-full ${PUNTO[f.semaforo]}`} title={TEXTO[f.semaforo]} />
                        <b>{f.desarrollo}</b>
                      </div>
                      <div className="text-[10px] text-muted">
                        {f.zona ?? ''}{f === mejor ? ' · recomendado' : ''}{f.empate ? ' · empate técnico' : ''}{f.para_saldos_mayores ? ' · para saldos mayores' : ''}{actual ? ' · seleccionado' : ''} · {f.apalancamiento.toFixed(1)}× su saldo
                        {f.sobreprecio_requerido > 0 ? ` · requiere escriturar +${money(f.sobreprecio_requerido)}` : ''}
                      </div>
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{money(f.credito)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{money(f.pmt)} / {money(f.renta_neta)}<div className="text-[10px] text-muted">cubre {pct(Math.min(f.cobertura, 9.99))}</div></td>
                    <td className={`py-2 pr-2 text-right tabular-nums ${f.pct_salario > 0.3 ? 'font-semibold text-red-600' : ''}`}>{pct(f.pct_salario)}</td>
                    <td className={`py-2 pr-2 text-right font-semibold tabular-nums ${f.ventaja < 0 ? 'text-red-600' : ''}`}>{money(f.ventaja)}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{money(f.recibe_dia)}</td>
                    <td className="py-2 pr-2 text-[11px] leading-snug text-muted">
                      <span className="font-semibold text-ink">{TEXTO[f.semaforo]}.</span> {f.motivos.join('. ')}.
                    </td>
                    <td className="py-2 text-right">
                      {actual ? <span className="text-[10px] text-muted">en uso</span> : (
                        <button onClick={() => onElegir(f.id)} className="rounded-lg border border-line bg-white px-2 py-1 text-[11px] font-semibold hover:bg-cream">Usar</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] text-muted">
            La aportación patronal no paga la mensualidad: cae a capital. Por eso un crédito chico para quien seguirá cotizando años
            deja aportaciones sin dónde caer, y uno grande para quien deja de cotizar pronto depende sólo de la renta y de su bolsa.
            Los factores personales (arriba, en Palancas del cliente) y este ranking se guardan con la asesoría y no aparecen en el material del cliente.
          </p>
        </div>
      )}
    </section>
  );
}
