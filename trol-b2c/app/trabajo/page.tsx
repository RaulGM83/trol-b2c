import Link from 'next/link';
import { requireMiembro, t3, fmtMXN, fmtFecha, ESTADO_OP_LABEL, type Any } from '@/lib/trol3/server';

export const dynamic = 'force-dynamic';

const NIVEL_LABEL: Record<number, string> = { 1: 'Orden', 2: 'Hoy', 3: 'Crecer' };

export default async function ListaTrabajo({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const m = await requireMiembro();
  const db = t3();
  const mias = searchParams.mias === '1';
  const estado = searchParams.estado ?? 'abiertas';
  const codigo = searchParams.codigo;
  const nivel = searchParams.nivel ? Number(searchParams.nivel) : undefined;
  const orden = searchParams.orden ?? 'valor';
  const page = Math.max(1, Number(searchParams.page ?? 1));
  const PAGE = 50;

  const { data: catalogo } = await db.from('catalogo_oportunidades').select('codigo,nombre,nivel').order('orden');
  const catMap = new Map((catalogo ?? []).map((c: Any) => [c.codigo, c]));

  let q = db
    .from('oportunidades')
    .select('id,persona_id,codigo,estado,valor_estimado,urgencia_fecha,urgencia_score,motivo,datos_faltantes,dueno_id,detectada_en,presentada_en, personas!inner(nombre,apellidos,curp,etapa,cabecera_id,fecha_nacimiento)', { count: 'exact' });
  if (estado === 'abiertas') q = q.in('estado', ['detectada', 'presentada', 'en_proceso']);
  else if (estado !== 'todas') q = q.eq('estado', estado);
  if (codigo) q = q.eq('codigo', codigo);
  if (nivel) q = q.in('codigo', (catalogo ?? []).filter((c: Any) => c.nivel === nivel).map((c: Any) => c.codigo));
  if (mias) q = q.or(`dueno_id.eq.${m.id},especialista_id.eq.${m.id}`);
  if (orden === 'urgencia') q = q.order('urgencia_score', { ascending: false }).order('valor_estimado', { ascending: false, nullsFirst: false });
  else if (orden === 'reciente') q = q.order('detectada_en', { ascending: false });
  else q = q.order('valor_estimado', { ascending: false, nullsFirst: false }).order('urgencia_score', { ascending: false });
  q = q.range((page - 1) * PAGE, page * PAGE - 1);
  const { data: ops, count, error } = await q;

  // Resumen por código (abiertas)
  const { data: resumen } = await db.rpc('resumen_lista_trabajo', { p_miembro: mias ? m.id : null });

  const params = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const all = { ...searchParams, ...patch };
    Object.entries(all).forEach(([k, v]) => { if (v) sp.set(k, v); });
    return `/trabajo?${sp.toString()}`;
  };

  return (
    <div className="grid gap-6 md:grid-cols-[260px_1fr]">
      <aside className="space-y-4">
        <div className="rounded-2xl border border-line bg-white p-4">
          <h2 className="mb-2 text-sm font-bold">Vista</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <Link href={params({ mias: undefined, page: undefined })} className={`rounded-full border px-3 py-1 ${!mias ? 'bg-ink text-white' : ''}`}>Todas</Link>
            <Link href={params({ mias: '1', page: undefined })} className={`rounded-full border px-3 py-1 ${mias ? 'bg-ink text-white' : ''}`}>Mías</Link>
          </div>
          <h2 className="mb-2 mt-4 text-sm font-bold">Estado</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            {['abiertas', 'detectada', 'presentada', 'en_proceso', 'ganada', 'perdida', 'todas'].map((e) => (
              <Link key={e} href={params({ estado: e, page: undefined })} className={`rounded-full border px-3 py-1 ${estado === e ? 'bg-ink text-white' : ''}`}>{ESTADO_OP_LABEL[e] ?? e}</Link>
            ))}
          </div>
          <h2 className="mb-2 mt-4 text-sm font-bold">Orden</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            {[['valor', 'Valor'], ['urgencia', 'Urgencia'], ['reciente', 'Recientes']].map(([k, l]) => (
              <Link key={k} href={params({ orden: k, page: undefined })} className={`rounded-full border px-3 py-1 ${orden === k ? 'bg-ink text-white' : ''}`}>{l}</Link>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4">
          <h2 className="mb-2 text-sm font-bold">Oportunidades abiertas</h2>
          <ul className="space-y-1 text-xs">
            <li><Link href={params({ codigo: undefined, nivel: undefined, page: undefined })} className={`block rounded px-2 py-1 hover:bg-cream ${!codigo && !nivel ? 'font-bold' : ''}`}>Todas</Link></li>
            {[1, 2, 3].map((n) => (
              <li key={n}>
                <Link href={params({ nivel: String(n), codigo: undefined, page: undefined })} className={`mt-2 block rounded px-2 py-1 text-[11px] uppercase tracking-wide text-muted hover:bg-cream ${nivel === n ? 'font-bold text-ink' : ''}`}>Nivel {n} · {NIVEL_LABEL[n]}</Link>
                {(resumen ?? []).filter((r: Any) => catMap.get(r.codigo)?.nivel === n).map((r: Any) => (
                  <Link key={r.codigo} href={params({ codigo: r.codigo, nivel: undefined, page: undefined })} className={`flex justify-between rounded px-2 py-1 hover:bg-cream ${codigo === r.codigo ? 'bg-cream font-bold' : ''}`}>
                    <span>{catMap.get(r.codigo)?.nombre ?? r.codigo}</span><span className="text-muted">{r.n}</span>
                  </Link>
                ))}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h1 className="text-xl font-extrabold">Lista de trabajo</h1>
          <span className="text-xs text-muted">{count ?? 0} oportunidades · página {page}</span>
        </div>
        {error && <p className="text-sm text-red-600">Error: {error.message}. ¿Está expuesto el esquema trol3 en la Data API?</p>}
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream text-left text-xs uppercase tracking-wide text-muted">
              <tr><th className="px-3 py-2">Persona</th><th className="px-3 py-2">Oportunidad</th><th className="px-3 py-2 text-right">Valor est.</th><th className="px-3 py-2">Urgencia</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Motivo</th></tr>
            </thead>
            <tbody>
              {(ops ?? []).map((o: Any) => {
                const p = o.personas;
                const edad = p?.fecha_nacimiento ? Math.floor((Date.now() - new Date(p.fecha_nacimiento).getTime()) / 31557600000) : null;
                return (
                  <tr key={o.id} className="border-t border-line align-top hover:bg-cream/60">
                    <td className="px-3 py-2">
                      <Link href={`/trabajo/p/${o.persona_id}`} className="font-semibold hover:underline">{p?.nombre ?? '(sin nombre)'} {p?.apellidos ?? ''}</Link>
                      <div className="text-xs text-muted">{edad ? `${edad} años · ` : ''}{p?.etapa}{p?.cabecera_id === m.id ? ' · tuyo' : p?.cabecera_id ? '' : ' · sin cabecera'}</div>
                    </td>
                    <td className="px-3 py-2"><span className="rounded-full bg-cream px-2 py-0.5 text-xs">N{catMap.get(o.codigo)?.nivel}</span> {catMap.get(o.codigo)?.nombre ?? o.codigo}</td>
                    <td className="px-3 py-2 text-right font-semibold">{o.valor_estimado ? fmtMXN(o.valor_estimado) : '—'}</td>
                    <td className="px-3 py-2 text-xs">{o.urgencia_fecha ? fmtFecha(o.urgencia_fecha) : '—'}</td>
                    <td className="px-3 py-2 text-xs">{ESTADO_OP_LABEL[o.estado]}</td>
                    <td className="px-3 py-2 text-xs text-muted">{o.motivo}{o.datos_faltantes?.length ? ` · falta: ${o.datos_faltantes.join(', ')}` : ''}</td>
                  </tr>
                );
              })}
              {!ops?.length && !error && <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-muted">Sin oportunidades con estos filtros.</td></tr>}
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
