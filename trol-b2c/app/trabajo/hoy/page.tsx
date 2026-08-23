import Link from 'next/link';
import { requireMiembro, t3, type Any } from '@/lib/trol3/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Hoy · Trol equipo' };

const fmtFecha = (s?: string | null) => (s ? new Date(s).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' }) : '—');
const fmtMXN = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);

// Tablero del día: primero lo que requiere acción del equipo, luego el pulso
// de la experiencia B2C (24 h vs 7 días). Todo sale de trol3.tablero_hoy().
export default async function TrabajoHoy() {
  await requireMiembro();
  const { data, error } = await t3().rpc('tablero_hoy');
  if (error || !data) return <section className="text-sm text-red-600">Error cargando el tablero: {error?.message ?? 'sin datos'}</section>;
  const d = data as Any;
  const ahorro: Any[] = d.ahorro_pendiente ?? [];
  const docs: Any[] = d.docs_solicitados ?? [];
  const canjes: Any[] = d.canjes ?? [];
  const curp: Any[] = d.curp_problema ?? [];
  const atoradas: Any[] = d.consultas_atoradas ?? [];
  const hayAccion = ahorro.length + docs.length + canjes.length + curp.length + atoradas.length > 0;
  const P = ({ id, nombre }: { id: string; nombre?: string | null }) => <Link href={`/trabajo/p/${id}`} className="font-semibold underline">{nombre || 'Sin nombre'}</Link>;

  const METRICAS: [string, string][] = [
    ['altas', 'Altas nuevas'],
    ['visitas_mi', 'Primeras visitas a /mi'],
    ['links_abiertos', 'Links abiertos'],
    ['consultas_completadas', 'Consultas IMSS completadas'],
    ['consultas_fallidas', 'Consultas fallidas'],
    ['datos_declarados', 'Datos declarados por clientes'],
    ['handoffs', 'Handoffs a WhatsApp'],
    ['docs_subidos', 'Documentos subidos'],
    ['puntos_emitidos', 'Puntos emitidos'],
  ];

  return (
    <section className="space-y-5">
      <h1 className="text-xl font-extrabold">Hoy</h1>

      <div className="rounded-2xl border-2 border-lime bg-white p-5">
        <h2 className="text-sm font-bold">Requiere acción {hayAccion ? <span className="ml-1 rounded-full bg-lime px-2 py-0.5 text-[11px]">{ahorro.length + docs.length + canjes.length + curp.length + atoradas.length}</span> : null}</h2>
        {!hayAccion && <p className="mt-1 text-sm text-muted">Nada pendiente. 🎉</p>}
        <ul className="mt-2 space-y-2 text-sm">
          {ahorro.map((s, k) => (
            <li key={`a${k}`} className="rounded-xl bg-amber-50 p-3"><b>Ahorro con puntos:</b> <P id={s.persona_id} nombre={s.nombre} /> pidió enviar {s.puntos} pts ({fmtMXN(Number(s.pesos))}) a su AFORE · {fmtFecha(s.fecha)}. Procesar en el lote de Millas para el Retiro.</li>
          ))}
          {docs.map((x, k) => (
            <li key={`d${k}`} className="rounded-xl bg-cream p-3"><b>Documento solicitado:</b> <P id={x.persona_id} nombre={x.nombre} /> pidió “{x.tipo}”{x.precio ? ` (${fmtMXN(Number(x.precio))})` : ''} · {fmtFecha(x.fecha)}. Cobrar y entregar.</li>
          ))}
          {canjes.map((x, k) => (
            <li key={`c${k}`} className="rounded-xl bg-cream p-3"><b>Canje de puntos:</b> <P id={x.persona_id} nombre={x.nombre} /> · {x.motivo} ({x.puntos} pts) · {fmtFecha(x.fecha)}.</li>
          ))}
          {curp.map((x, k) => (
            <li key={`i${k}`} className="rounded-xl bg-red-50 p-3"><b>CURP con problema:</b> <P id={x.persona_id} nombre={x.nombre} /> confirmó su CURP y el IMSS no la reconoce. Revisar la cuenta con el cliente.</li>
          ))}
          {atoradas.map((x, k) => (
            <li key={`q${k}`} className="rounded-xl bg-amber-50 p-3"><b>Consulta atorada:</b> {x.tipo} de <P id={x.persona_id} nombre={x.nombre} /> lleva desde {fmtFecha(x.fecha)} en “{x.estado}”.</li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h2 className="text-sm font-bold">Pulso de la experiencia B2C</h2>
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted"><tr><th className="py-1">Métrica</th><th className="py-1 text-right">Últimas 24 h</th><th className="py-1 text-right">7 días</th></tr></thead>
          <tbody>
            {METRICAS.map(([k, l]) => (
              <tr key={k} className="border-t border-line/70"><td className="py-1.5">{l}</td><td className="py-1.5 text-right font-semibold">{d.pulso?.h24?.[k] ?? 0}</td><td className="py-1.5 text-right font-semibold">{d.pulso?.d7?.[k] ?? 0}</td></tr>
            ))}
            <tr className="border-t border-line/70"><td className="py-1.5">Pagos cobrados</td><td className="py-1.5 text-right font-semibold">{d.pulso?.h24?.pagos?.n ?? 0} · {fmtMXN(Number(d.pulso?.h24?.pagos?.monto ?? 0))}</td><td className="py-1.5 text-right font-semibold">{d.pulso?.d7?.pagos?.n ?? 0} · {fmtMXN(Number(d.pulso?.d7?.pagos?.monto ?? 0))}</td></tr>
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-muted">Mismo corte que el resumen diario que le llega a Raúl a las 8:00. “Requiere acción” junta ahorro pendiente, documentos con costo, canjes, CURP con problema y consultas atoradas (+2 h).</p>
      </div>
    </section>
  );
}
