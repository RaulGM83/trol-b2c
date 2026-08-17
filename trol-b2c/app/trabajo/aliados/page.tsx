import Link from 'next/link';
import { requireMiembro, t3, fmtFecha, type Any } from '@/lib/trol3/server';
import { GestionAliado } from '@/components/trol3/GestionAliado';

export const dynamic = 'force-dynamic';

const EST_LABEL: Record<string, string> = {
  nuevo: 'Nuevo', en_revision: 'En revisión', vobo: 'VoBo', rechazado: 'Rechazado', cerrado: 'Cerrado', error: 'Error',
};
const EST_ORDER = ['nuevo', 'en_revision', 'vobo', 'rechazado', 'cerrado', 'error'];

export default async function ConsultasAliados({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const m = await requireMiembro();
  const db = t3();
  const aliado = searchParams.aliado;
  const estatus = searchParams.estatus ?? 'activas';
  const mias = searchParams.mias === '1';
  const q = (searchParams.q ?? '').trim().replace(/[,()*%]/g, ' ').trim();
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const PAGE = 50;

  // Resumen para el panel lateral (proyección ligera).
  const { data: resumen } = await db.from('consultas_aliados').select('aliado,gestion_estatus');
  const porAliado = new Map<string, number>();
  const porEstatus = new Map<string, number>();
  (resumen ?? []).forEach((r: Any) => {
    porAliado.set(r.aliado, (porAliado.get(r.aliado) ?? 0) + 1);
    porEstatus.set(r.gestion_estatus, (porEstatus.get(r.gestion_estatus) ?? 0) + 1);
  });
  const aliados = [...porAliado.entries()].sort((a, b) => b[1] - a[1]);

  // Miembros para asignación.
  const { data: miembros } = await db.from('miembros').select('id,nombre,email,roles').eq('activo', true).order('nombre');
  const miembrosOpt = (miembros ?? []).map((x: Any) => ({ id: x.id, nombre: x.nombre ?? x.email }));

  // Consulta principal.
  let query = db
    .from('consultas_aliados')
    .select('id,aliado,nombre,apellidos,curp,edad,estado_republica,canal,status_origen,gestion_estatus,vobo,asignado_a,comentario,creada_en,documento_diagnostico_url,documento_diagnostico_avanzado_url,documento_sisec_url', { count: 'exact' });
  if (aliado) query = query.eq('aliado', aliado);
  if (estatus === 'activas') query = query.in('gestion_estatus', ['nuevo', 'en_revision', 'error']);
  else if (estatus !== 'todas') query = query.eq('gestion_estatus', estatus);
  if (mias) query = query.eq('asignado_a', m.id);
  if (q) query = query.or(`nombre.ilike.%${q}%,apellidos.ilike.%${q}%,curp.ilike.%${q}%`);
  query = query.order('creada_en', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  const { data: rows, count, error } = await query;

  const params = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    Object.entries({ ...searchParams, ...patch }).forEach(([k, v]) => { if (v) sp.set(k, v); });
    return `/trabajo/aliados?${sp.toString()}`;
  };

  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <aside className="space-y-4">
        <div className="rounded-2xl border border-line bg-white p-4">
          <h2 className="mb-2 text-sm font-bold">Vista</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <Link href={params({ mias: undefined, page: undefined })} className={`rounded-full border px-3 py-1 ${!mias ? 'bg-ink text-white' : ''}`}>Todas</Link>
            <Link href={params({ mias: '1', page: undefined })} className={`rounded-full border px-3 py-1 ${mias ? 'bg-ink text-white' : ''}`}>Asignadas a mí</Link>
          </div>
          <h2 className="mb-2 mt-4 text-sm font-bold">Estatus</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            {['activas', ...EST_ORDER, 'todas'].map((e) => (
              <Link key={e} href={params({ estatus: e, page: undefined })} className={`rounded-full border px-3 py-1 ${estatus === e ? 'bg-ink text-white' : ''}`}>
                {e === 'activas' ? 'Por revisar' : e === 'todas' ? 'Todas' : EST_LABEL[e]}{porEstatus.get(e) ? ` · ${porEstatus.get(e)}` : ''}
              </Link>
            ))}
          </div>
          <h2 className="mb-2 mt-4 text-sm font-bold">Aliado</h2>
          <ul className="space-y-1 text-xs">
            <li><Link href={params({ aliado: undefined, page: undefined })} className={`block rounded px-2 py-1 hover:bg-cream ${!aliado ? 'font-bold' : ''}`}>Todos</Link></li>
            {aliados.map(([a, n]) => (
              <li key={a}>
                <Link href={params({ aliado: a, page: undefined })} className={`flex justify-between rounded px-2 py-1 hover:bg-cream ${aliado === a ? 'bg-cream font-bold' : ''}`}>
                  <span>{a}</span><span className="text-muted">{n}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h1 className="text-xl font-extrabold">Consultas de aliados</h1>
          <span className="text-xs text-muted">{count ?? 0} consultas · página {page}</span>
        </div>
        <form action="/trabajo/aliados" className="mb-3">
          {aliado && <input type="hidden" name="aliado" value={aliado} />}
          {estatus && <input type="hidden" name="estatus" value={estatus} />}
          {mias && <input type="hidden" name="mias" value="1" />}
          <input name="q" defaultValue={q} placeholder="Buscar nombre o CURP" className="w-72 rounded-lg border border-line px-3 py-1.5 text-sm" />
        </form>
        {error && <p className="text-sm text-red-600">Error: {error.message}. ¿Está expuesto el esquema trol3 en la Data API?</p>}
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Persona</th>
                <th className="px-3 py-2">Aliado</th>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Pipeline</th>
                <th className="px-3 py-2">Docs</th>
                <th className="px-3 py-2">Gestión</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((r: Any) => (
                <tr key={r.id} className="border-t border-line align-top hover:bg-cream/40">
                  <td className="px-3 py-2">
                    <div className="font-semibold">{r.nombre ?? '(sin nombre)'} {r.apellidos ?? ''}</div>
                    <div className="text-[11px] text-muted">{r.curp}{r.edad ? ` · ${r.edad} años` : ''}{r.estado_republica ? ` · ${r.estado_republica}` : ''}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">{r.aliado}<div className="text-[11px] text-muted">{r.canal}</div></td>
                  <td className="px-3 py-2 text-xs">{fmtFecha(r.creada_en)}</td>
                  <td className="px-3 py-2 text-xs text-muted">{r.status_origen}</td>
                  <td className="px-3 py-2 text-xs">
                    <div className="flex flex-col gap-0.5">
                      {r.documento_diagnostico_url && <a href={r.documento_diagnostico_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">Diagnóstico</a>}
                      {r.documento_diagnostico_avanzado_url && <a href={r.documento_diagnostico_avanzado_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">Avanzado</a>}
                      {r.documento_sisec_url && <a href={r.documento_sisec_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">SISEC</a>}
                      {!r.documento_diagnostico_url && !r.documento_diagnostico_avanzado_url && !r.documento_sisec_url && <span className="text-muted">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <GestionAliado id={r.id} estatus={r.gestion_estatus} vobo={r.vobo} asignadoA={r.asignado_a} comentario={r.comentario} miembros={miembrosOpt} />
                  </td>
                </tr>
              ))}
              {!rows?.length && !error && <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-muted">Sin consultas con estos filtros.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex justify-between text-xs">
          {page > 1 ? <Link href={params({ page: String(page - 1) })} className="underline">← Anterior</Link> : <span />}
          {(count ?? 0) > page * PAGE ? <Link href={params({ page: String(page + 1) })} className="underline">Siguiente →</Link> : <span />}
        </div>
      </section>
    </div>
  );
}
