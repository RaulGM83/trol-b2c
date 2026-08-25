import Link from 'next/link';
import { requireMiembro, t3, fmtMXN, fmtFecha, ESTADO_OP_LABEL, type Any } from '@/lib/trol3/server';
import { OportunidadEtapa, EtapaChip, type Motivo, type ProveedorOp } from '@/components/trol3/OportunidadEtapa';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Embudo · Trol' };

const ESTADOS = ['detectada', 'presentada', 'interesada', 'en_proceso', 'ganada', 'perdida', 'no_aplica'] as const;
const ABIERTOS = ['detectada', 'presentada', 'interesada', 'en_proceso'];
const NIVEL_LABEL: Record<number, string> = { 1: 'Orden', 2: 'Hoy', 3: 'Crecer' };

export default async function Embudo({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const m = await requireMiembro();
  const db = t3();
  const mias = searchParams.mias === '1';
  const codigo = searchParams.codigo;
  const estado = searchParams.estado;
  const [{ data: emb, error }, { data: cat }, { data: motivos }, { data: provs }, { data: miembros }] = await Promise.all([
    db.rpc('embudo_oportunidades', { p_codigo: null, p_miembro: mias ? m.id : null }),
    db.from('catalogo_oportunidades').select('codigo,nombre,nivel,orden').order('nivel').order('orden'),
    db.from('catalogo_motivos_perdida').select('codigo,nombre').eq('activo', true).order('orden'),
    db.from('catalogo_proveedores').select('codigo,nombre,lineas').eq('activo', true).order('orden'),
    db.from('miembros').select('id,nombre,email').eq('activo', true),
  ]);
  const { data: lista } = codigo
    ? await db.rpc('lista_embudo', { p_codigo: codigo, p_estado: estado && estado !== 'abiertas' ? estado : null, p_miembro: mias ? m.id : null, p_limit: 300 })
    : { data: null };

  // matriz código × estado
  const mat = new Map<string, Record<string, { n: number; valor: number; dias: number | null; con_fecha: number }>>();
  for (const r of (emb ?? []) as Any[]) {
    const row = mat.get(r.codigo) ?? {};
    row[r.estado] = { n: Number(r.n), valor: Number(r.valor ?? 0), dias: r.dias_prom == null ? null : Number(r.dias_prom), con_fecha: Number(r.con_fecha ?? 0) };
    mat.set(r.codigo, row);
  }
  const filas = ((cat ?? []) as Any[]).filter((c) => mat.has(c.codigo));
  const tot = (row: Record<string, { n: number }>, ks: readonly string[]): number => { let s = 0; for (const k of ks) s += row[k]?.n ?? 0; return s; };
  const href = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    Object.entries({ ...searchParams, ...patch }).forEach(([k, v]) => { if (v) sp.set(k, v); });
    return `/trabajo/embudo?${sp.toString()}`;
  };
  const motivoNombre = new Map(((motivos ?? []) as Motivo[]).map((x) => [x.codigo, x.nombre]));
  const provNombre = new Map(((provs ?? []) as ProveedorOp[]).map((x) => [x.codigo, x.nombre]));
  const catNombre = new Map(((cat ?? []) as Any[]).map((c) => [c.codigo, c.nombre]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-extrabold">Embudo por línea</h1>
        <div className="flex gap-2 text-xs">
          <Link href={href({ mias: undefined })} className={`rounded-full border px-3 py-1 ${!mias ? 'bg-ink text-white' : ''}`}>Todo el equipo</Link>
          <Link href={href({ mias: '1' })} className={`rounded-full border px-3 py-1 ${mias ? 'bg-ink text-white' : ''}`}>Mías</Link>
        </div>
        <span className="text-xs text-muted">Clic en un número para ver la lista. Los días son promedio en la etapa actual.</span>
      </div>
      {error && <p className="text-sm text-red-600">{error.message}</p>}

      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2">Línea</th>
              {ESTADOS.map((e) => <th key={e} className="px-2 py-2 text-right">{ESTADO_OP_LABEL[e]}</th>)}
              <th className="px-2 py-2 text-right">Abiertas</th>
              <th className="px-2 py-2 text-right">Conv.</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3].map((n) => {
              const fs = filas.filter((c) => c.nivel === n);
              if (!fs.length) return null;
              return [
                <tr key={`n${n}`} className="border-t border-line bg-cream/40"><td colSpan={ESTADOS.length + 3} className="px-3 py-1 text-[11px] uppercase tracking-wide text-muted">Nivel {n} · {NIVEL_LABEL[n]}</td></tr>,
                ...fs.map((c) => {
                  const row = mat.get(c.codigo)!;
                  const abiertas = tot(row, ABIERTOS);
                  const gestionadas = tot(row, ['presentada', 'interesada', 'en_proceso', 'ganada', 'perdida']);
                  const conv = gestionadas ? Math.round(100 * (row.ganada?.n ?? 0) / gestionadas) : null;
                  return (
                    <tr key={c.codigo} className={`border-t border-line ${codigo === c.codigo ? 'bg-lime/20' : 'hover:bg-cream/60'}`}>
                      <td className="px-3 py-2 font-semibold"><Link href={href({ codigo: c.codigo, estado: undefined })} className="hover:underline">{c.nombre}</Link></td>
                      {ESTADOS.map((e) => {
                        const cell = row[e];
                        const activo = codigo === c.codigo && estado === e;
                        return (
                          <td key={e} className="px-2 py-2 text-right tabular-nums">
                            {cell ? (
                              <Link href={href({ codigo: c.codigo, estado: e })} className={`inline-block rounded px-1.5 ${activo ? 'bg-ink text-white' : 'hover:bg-cream'}`} title={`${fmtMXN(cell.valor)} · ${cell.dias ?? '—'} días prom.${cell.con_fecha ? ` · ${cell.con_fecha} con fecha` : ''}`}>
                              {cell.n}{cell.dias != null && ABIERTOS.includes(e) ? <span className="ml-1 text-[10px] text-muted">{Math.round(cell.dias)}d</span> : null}
                              </Link>
                            ) : <span className="text-muted/50">·</span>}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-right font-semibold tabular-nums"><Link href={href({ codigo: c.codigo, estado: 'abiertas' })} className="hover:underline">{abiertas}</Link></td>
                      <td className="px-2 py-2 text-right text-xs text-muted tabular-nums">{conv == null ? '—' : `${conv}%`}</td>
                    </tr>
                  );
                }),
              ];
            })}
          </tbody>
        </table>
      </div>

      {codigo && (
        <section className="rounded-2xl border border-line bg-white p-4">
          <div className="mb-3 flex flex-wrap items-baseline gap-2">
            <h2 className="text-base font-extrabold">{catNombre.get(codigo) ?? codigo}</h2>
            <div className="flex flex-wrap gap-1 text-xs">
              <Link href={href({ estado: 'abiertas' })} className={`rounded-full border px-2.5 py-0.5 ${!estado || estado === 'abiertas' ? 'bg-ink text-white' : ''}`}>Abiertas</Link>
              {ESTADOS.map((e) => <Link key={e} href={href({ estado: e })} className={`rounded-full border px-2.5 py-0.5 ${estado === e ? 'bg-ink text-white' : ''}`}>{ESTADO_OP_LABEL[e]}</Link>)}
            </div>
            <span className="ml-auto text-xs text-muted">{lista?.length ?? 0} oportunidades{(lista?.length ?? 0) >= 300 ? ' (máx. 300; filtra por etapa)' : ''}</span>
          </div>
          <ul className="divide-y divide-line">
            {((lista ?? []) as Any[]).map((o) => {
              const pospuesta = o.contactar_despues && o.contactar_despues > new Date().toISOString().slice(0, 10);
              return (
                <li key={o.id} className={`py-2 ${pospuesta ? 'opacity-60' : ''}`}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                    <Link href={`/trabajo/p/${o.persona_id}?tab=oportunidades`} className="font-semibold hover:underline">{o.nombre || '(sin nombre)'}</Link>
                    {o.telefono && <a href={`https://wa.me/${String(o.telefono).replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-xs text-muted hover:underline">{o.telefono}</a>}
                    <EtapaChip estado={o.estado} label={ESTADO_OP_LABEL[o.estado]} />
                    <span className="text-xs text-muted">{o.dias_en_etapa} d en etapa</span>
                    {o.valor_estimado ? <span className="text-xs font-semibold">{fmtMXN(o.valor_estimado)}</span> : null}
                    {o.urgencia_fecha && <span className="text-xs text-amber-700">límite {fmtFecha(o.urgencia_fecha)}</span>}
                    {o.proveedor && <span className="text-xs text-muted">vía {provNombre.get(o.proveedor) ?? o.proveedor}</span>}
                    {o.motivo_perdida && <span className="text-xs text-red-700">{motivoNombre.get(o.motivo_perdida) ?? o.motivo_perdida}</span>}
                    {o.contactar_despues && <span className="text-xs text-muted">contactar {fmtFecha(o.contactar_despues)}</span>}
                    <span className="ml-auto text-[11px] text-muted">{o.dueno ?? 'sin dueño'}{o.especialista ? ` · esp. ${o.especialista}` : ''}</span>
                  </div>
                  {o.nota_estado && <p className="text-xs text-muted">{o.nota_estado}</p>}
                  <OportunidadEtapa compacto op={{ id: o.id, codigo, estado: o.estado, motivo_perdida: o.motivo_perdida, proveedor: o.proveedor, contactar_despues: o.contactar_despues }} personaId={o.persona_id} motivos={(motivos ?? []) as Motivo[]} proveedores={(provs ?? []) as ProveedorOp[]} miembros={((miembros ?? []) as Any[]).map((x) => ({ id: x.id, nombre: x.nombre ?? x.email }))} />
                </li>
              );
            })}
            {!lista?.length && <li className="py-6 text-center text-sm text-muted">Nada en esta etapa.</li>}
          </ul>
        </section>
      )}
    </div>
  );
}
