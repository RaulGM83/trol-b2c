import Link from 'next/link';
import { requireMiembro, t3, fmtMXN, fmtFecha, type Any } from '@/lib/trol3/server';
import { ETAPAS_INFONAVIT } from '@/lib/aliado/infonavit';

export const dynamic = 'force-dynamic';

// 285 · Negocio → Trámites Infonavit (claude/114): todos los prospectos con compra_inmueble y su fase.
// Las 7 etapas son las mismas que ve el broker; antes van "Por contactar" e "Interesado".
const FASES: { clave: string; nombre: string }[] = [
  { clave: 'por_contactar', nombre: 'Por contactar' },
  { clave: 'interesado', nombre: 'Interesado' },
  ...ETAPAS_INFONAVIT,
];
const POR_PAGINA = 50;
// 288 · Rangos de saldo para ir según el inventario de inmuebles.
const RANGOS: [string, string][] = [['100-250', '$100–250k'], ['250-500', '$250–500k'], ['500-800', '$500–800k'], ['800+', '$800k+']];

export default async function TramitesInfonavit({ searchParams }: { searchParams: { fase?: string; asesor?: string; pag?: string; rango?: string } }) {
  await requireMiembro();
  const db = t3();
  const fase = FASES.some((f) => f.clave === searchParams.fase) ? searchParams.fase! : 'en_tramite';
  const asesor = searchParams.asesor;
  const rango = RANGOS.some(([k]) => k === searchParams.rango) ? searchParams.rango : undefined;
  const pag = Math.max(1, Number(searchParams.pag) || 1);

  const [{ data: todas }, { data: miembros }] = await Promise.all([
    db.from('v_tramites_infonavit').select('oportunidad_id,persona_id,nombre,apellidos,fase,fase_en,cabecera_id,asesor,saldo,monto_credito,inmueble,broker,docs,tramite_infonavit,rango').limit(5000),
    db.from('miembros').select('id,nombre').eq('activo', true).order('nombre'),
  ]);
  const porAsesor = ((todas ?? []) as Any[]).filter((r) => !asesor || (asesor === 'sin' ? !r.cabecera_id : r.cabecera_id === asesor));
  const nRango = new Map<string, number>();
  porAsesor.forEach((r) => { if (r.rango) nRango.set(r.rango, (nRango.get(r.rango) ?? 0) + 1); });
  const base = porAsesor.filter((r) => !rango || r.rango === rango);
  const conteo = new Map<string, number>();
  base.forEach((r) => conteo.set(r.fase, (conteo.get(r.fase) ?? 0) + 1));
  const enTramite = new Set(ETAPAS_INFONAVIT.map((e) => e.clave));
  const nTramite = base.filter((r) => enTramite.has(r.fase)).length;
  const orden = new Map(FASES.map((f, i) => [f.clave, i]));
  const filas = base
    .filter((r) => (fase === 'en_tramite' ? enTramite.has(r.fase) : r.fase === fase))
    .sort((a, b) => (fase === 'en_tramite' ? (orden.get(b.fase) ?? 0) - (orden.get(a.fase) ?? 0) : 0)
      || Number(b.monto_credito ?? b.saldo ?? 0) - Number(a.monto_credito ?? a.saldo ?? 0));
  const total = filas.length;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const vista = filas.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA);
  const nombreFase = new Map(FASES.map((f) => [f.clave, f.nombre]));
  const href = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    Object.entries({ fase: fase !== 'en_tramite' ? fase : undefined, asesor, rango, ...patch }).forEach(([k, v]) => { if (v) sp.set(k, v); });
    const s = sp.toString();
    return `/trabajo/infonavit${s ? `?${s}` : ''}`;
  };
  const dias = (f: string | null) => (f ? Math.max(0, Math.floor((Date.now() - new Date(f).getTime()) / 86400000)) : null);
  const chip = (activo: boolean) => (activo ? 'rounded-full bg-ink px-3 py-1 font-semibold text-white' : 'rounded-full border border-line bg-white px-3 py-1 font-semibold');

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-xl font-bold">Trámites Infonavit</h1>
      <p className="mt-1 text-sm text-muted">Clientes con oportunidad de compra de inmueble validada y en qué fase va cada uno. Las etapas del trámite son las mismas que ve el broker; se mueven en el expediente, pestaña Infonavit.</p>

      <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="font-semibold text-muted">Asesor:</span>
        <Link href={href({ asesor: undefined, pag: undefined })} className={chip(!asesor)}>Todos</Link>
        {((miembros ?? []) as Any[]).map((x) => <Link key={x.id} href={href({ asesor: x.id, pag: undefined })} className={chip(asesor === x.id)}>{(x.nombre ?? '').split(' ')[0]}</Link>)}
        <Link href={href({ asesor: 'sin', pag: undefined })} className={chip(asesor === 'sin')}>Sin dueño</Link>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="font-semibold text-muted">Saldo Infonavit:</span>
        <Link href={href({ rango: undefined, pag: undefined })} className={chip(!rango)}>Todos</Link>
        {RANGOS.map(([k, l]) => <Link key={k} href={href({ rango: k, pag: undefined })} className={chip(rango === k)}>{l} · {nRango.get(k) ?? 0}</Link>)}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-10">
        <Link href={href({ fase: undefined, pag: undefined })} className={`rounded-xl border p-2 ${fase === 'en_tramite' ? 'border-ink bg-ink text-white' : 'border-line bg-white'}`}>
          <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">En trámite</div>
          <div className="text-lg font-bold">{nTramite}</div>
        </Link>
        {FASES.map((f) => (
          <Link key={f.clave} href={href({ fase: f.clave, pag: undefined })} className={`rounded-xl border p-2 ${fase === f.clave ? 'border-ink bg-ink text-white' : 'border-line bg-white'}`}>
            <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{f.nombre}</div>
            <div className="text-lg font-bold">{conteo.get(f.clave) ?? 0}</div>
          </Link>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
            <tr className="border-b border-line">
              <th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Fase</th><th className="px-3 py-2">En la fase</th>
              <th className="px-3 py-2">Asesor</th><th className="px-3 py-2 text-right">Saldo</th><th className="px-3 py-2 text-right">Crédito</th>
              <th className="px-3 py-2">Inmueble</th><th className="px-3 py-2">Broker</th><th className="px-3 py-2 text-right">Docs</th>
            </tr>
          </thead>
          <tbody>
            {vista.map((r) => {
              const d = dias(r.fase_en);
              return (
                <tr key={r.oportunidad_id} className="border-b border-line last:border-0 hover:bg-cream">
                  <td className="px-3 py-2"><Link href={`/trabajo/p/${r.persona_id}?tab=infonavit`} className="font-semibold hover:underline">{[r.nombre, r.apellidos].filter(Boolean).join(' ') || 'Sin nombre'}</Link></td>
                  <td className="px-3 py-2">{nombreFase.get(r.fase) ?? r.fase}</td>
                  <td className={`px-3 py-2 ${d != null && d > 7 && enTramite.has(r.fase) && r.fase !== 'entregado' ? 'font-semibold text-red-700' : 'text-muted'}`} title={r.fase_en ? fmtFecha(r.fase_en) : ''}>{d == null ? '—' : `${d} d`}</td>
                  <td className="px-3 py-2 text-muted">{r.asesor ? String(r.asesor).split(' ')[0] : 'Sin dueño'}</td>
                  <td className="px-3 py-2 text-right">{r.saldo != null ? fmtMXN(Number(r.saldo)) : '—'}</td>
                  <td className="px-3 py-2 text-right">{r.monto_credito != null ? fmtMXN(Number(r.monto_credito)) : '—'}</td>
                  <td className="px-3 py-2 text-muted">{r.inmueble ?? '—'}</td>
                  <td className="px-3 py-2 text-muted">{r.broker ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-muted">{r.docs}/7</td>
                </tr>
              );
            })}
            {vista.length === 0 ? <tr><td colSpan={9} className="px-3 py-6 text-center text-muted">Nada en esta fase.</td></tr> : null}
          </tbody>
        </table>
      </div>

      {paginas > 1 ? (
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-muted">{(pag - 1) * POR_PAGINA + 1}–{Math.min(total, pag * POR_PAGINA)} de {total} · página {pag} de {paginas}</span>
          <div className="flex gap-1.5">
            {pag > 1 ? <Link href={href({ pag: pag - 1 > 1 ? String(pag - 1) : undefined })} className="rounded-lg border border-line bg-white px-3 py-1.5 font-bold">← Anterior</Link> : null}
            {pag < paginas ? <Link href={href({ pag: String(pag + 1) })} className="rounded-lg bg-ink px-3 py-1.5 font-bold text-white">Siguiente →</Link> : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
