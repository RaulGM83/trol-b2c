// ---------------------------------------------------------------------------
// Lo que ve el aliado que refiere (126).
//
// Todo sale de vistas que corren con los permisos del dueño y traen su propio
// filtro por `current_aliado_id()`. Aquí NO se consulta ninguna tabla directa:
// si algún día alguien agrega un `db.from('personas')` en esta página, se cae
// la única frontera que hay.
//
// Y lo que se enseña es avance y resultado. Nunca saldos, semanas, CURP ni
// nada del expediente: esa gente es cliente de Trol, no de él.
// ---------------------------------------------------------------------------
import QRCode from 'qrcode';
import { requireAliado, t3, fmtMXN, fmtFecha, type Any } from '@/lib/trol3/server';
import { LinkAliado } from '@/components/trol3/LinkAliado';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tus referidos · Trol' };

// Las etapas internas dichas como se las diría uno por teléfono. Lo que él
// necesita saber es si ya lo agarramos y qué tan lejos va, no nuestro
// vocabulario.
const ETAPA_LABEL: Record<string, string> = {
  nuevo: 'Recién llegado',
  expediente_base: 'Con su información reunida',
  conversando: 'Hablando con nosotros',
  asesorado: 'Ya lo asesoramos',
  cliente: 'Cliente',
};

export default async function EspacioAliado() {
  const a = await requireAliado();
  const db = t3();
  const sitio = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.trol.mx';
  const link = a.codigo ? `${sitio}/i/${a.codigo}` : null;

  const [{ data: referidos }, { data: comisiones }] = await Promise.all([
    db
      .from('v_referidos_aliado')
      .select('referido_id,nombre,apellidos,etapa,ultima_cita,diagnostico_entregado_en,pension_estimada,productos_contratados,comision_devengada,referido_en')
      .order('referido_en', { ascending: false }),
    db.from('v_comisiones_aliado').select('id,cliente,base,pct,monto,estado,creado_en,pagada_en').order('creado_en', { ascending: false }),
  ]);

  const refs = (referidos ?? []) as Any[];
  const coms = (comisiones ?? []) as Any[];
  const porPagar = coms.filter((c) => c.estado === 'devengada').reduce((s, c) => s + Number(c.monto), 0);
  const pagado = coms.filter((c) => c.estado === 'pagada').reduce((s, c) => s + Number(c.monto), 0);

  const qr = link ? await QRCode.toDataURL(link, { margin: 1, width: 320 }) : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Tus referidos</h1>
        <p className="text-xs text-muted">
          Son clientes de Trol: nosotros los contactamos y los atendemos. Aquí ves cómo van.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted">Personas referidas</div>
          <div className="text-2xl font-extrabold">{refs.length}</div>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted">Por pagarte</div>
          <div className="text-2xl font-extrabold">{fmtMXN(porPagar)}</div>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted">Ya pagado</div>
          <div className="text-2xl font-extrabold">{fmtMXN(pagado)}</div>
        </div>
      </div>

      {link ? (
        <LinkAliado link={link} qr={qr} pct={a.comision_pct} />
      ) : (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          Todavía no tienes tu liga para compartir. Escríbenos y te la generamos.
        </section>
      )}

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-3 text-sm font-bold">Cómo van</h2>
        {refs.length === 0 ? (
          <p className="text-sm text-muted">
            Todavía no llega nadie por tu liga. En cuanto alguien escriba, aparece aquí.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr className="border-b border-line">
                  <th className="py-1 pr-3 font-semibold">Persona</th>
                  <th className="py-1 pr-3 font-semibold">Cómo va</th>
                  <th className="py-1 pr-3 font-semibold">Última cita</th>
                  <th className="py-1 pr-3 font-semibold">Diagnóstico</th>
                  <th className="py-1 pr-3 font-semibold">Contrató</th>
                  <th className="py-1 text-right font-semibold">Tu comisión</th>
                </tr>
              </thead>
              <tbody>
                {refs.map((r) => (
                  <tr key={r.referido_id} className="border-b border-line/60 align-top">
                    <td className="py-1.5 pr-3 font-semibold">
                      {[r.nombre, r.apellidos].filter(Boolean).join(' ').trim() || 'Sin nombre'}
                      <div className="font-normal text-muted">{fmtFecha(r.referido_en)}</div>
                    </td>
                    <td className="py-1.5 pr-3">{ETAPA_LABEL[r.etapa] ?? r.etapa ?? '—'}</td>
                    <td className="py-1.5 pr-3">{fmtFecha(r.ultima_cita)}</td>
                    <td className="py-1.5 pr-3">{fmtFecha(r.diagnostico_entregado_en)}</td>
                    <td className="py-1.5 pr-3">{r.productos_contratados ?? '—'}</td>
                    <td className="py-1.5 text-right font-semibold">
                      {Number(r.comision_devengada ?? 0) > 0 ? fmtMXN(Number(r.comision_devengada)) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {coms.length ? (
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="mb-1 text-sm font-bold">Tus comisiones</h2>
          <p className="mb-3 text-xs text-muted">
            Se calculan sobre lo que Trol cobró por esa operación, con el porcentaje pactado.
          </p>
          <ul className="space-y-1 text-sm">
            {coms.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2">
                <span className="flex-1">
                  <b>{c.cliente || 'Cliente'}</b>
                  <span className="text-muted"> · {fmtFecha(c.creado_en)}</span>
                </span>
                <span className="text-xs text-muted">
                  {fmtMXN(Number(c.base))} × {Math.round(Number(c.pct) * 100)}%
                </span>
                <span className="font-semibold">{fmtMXN(Number(c.monto))}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.estado === 'pagada' ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}
                >
                  {c.estado === 'pagada' ? `pagada ${fmtFecha(c.pagada_en)}` : 'por pagar'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
