import Link from 'next/link';
import QRCode from 'qrcode';
import { requireMiembro, t3, fmtFecha, type Any } from '@/lib/trol3/server';
import {
  fusionarCodigos, ordenar, totales, conversion, pct, TIPOS, TIPO_LABEL, DIR_DEFAULT,
  type ColumnaEmbudo, type FilaEmbudo, type FilaVista, type CodigoRegistrado,
} from '@/lib/trol3/atribucion';
import { LinksEquipo, type LinkAsesor } from '@/components/trol3/LinksEquipo';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Atribución · Trol' };

const BASE = 'https://app.trol.mx';

export default async function Atribucion({ searchParams }: { searchParams: { orden?: string; dir?: string; tipo?: string } }) {
  const m = await requireMiembro();
  const db = t3();
  const [{ data: vista, error }, { data: codigos }, { data: miembros }] = await Promise.all([
    db.from('v_embudo_codigo').select('*'),
    db.from('codigos_invitacion').select('codigo,tipo,etiqueta,miembro_id,activo'),
    db.from('miembros').select('id,nombre,email').eq('activo', true),
  ]);

  const nombrePorMiembro = new Map(((miembros ?? []) as Any[]).map((x) => [x.id as string, (x.nombre ?? x.email) as string]));
  const todas = fusionarCodigos((vista ?? []) as FilaVista[], (codigos ?? []) as CodigoRegistrado[], nombrePorMiembro);

  const col = (['codigo', 'tipo', 'clics', 'altas', 'con_curp', 'con_consulta', 'asesorados', 'ultima_actividad'] as ColumnaEmbudo[])
    .includes(searchParams.orden as ColumnaEmbudo) ? (searchParams.orden as ColumnaEmbudo) : 'altas';
  const dir = searchParams.dir === 'asc' || searchParams.dir === 'desc' ? searchParams.dir : DIR_DEFAULT[col];
  const tipoFiltro = TIPOS.includes(searchParams.tipo as (typeof TIPOS)[number]) ? searchParams.tipo! : null;

  const filtradas = tipoFiltro ? todas.filter((f) => f.tipo === tipoFiltro) : todas;
  const filas = ordenar(filtradas, col, dir);
  const t = totales(filas);

  // Links del equipo: los códigos de asesor, el del miembro con sesión primero.
  const deAsesor = todas.filter((f) => f.tipo === 'asesor');
  const codigoPorId = new Map(((codigos ?? []) as CodigoRegistrado[]).map((c) => [c.codigo, c.miembro_id]));
  const links: LinkAsesor[] = await Promise.all(
    deAsesor.map(async (f) => {
      const url = `${BASE}/i/${f.codigo}`;
      return {
        codigo: f.codigo,
        etiqueta: f.etiqueta ?? f.miembro ?? f.codigo,
        url,
        svg: await QRCode.toString(url, { type: 'svg', margin: 1, width: 240 }),
        esMio: codigoPorId.get(f.codigo) === m.id,
        altas: f.altas,
        clics: f.clics,
      };
    }),
  );
  links.sort((a, b) => Number(b.esMio) - Number(a.esMio) || a.etiqueta.localeCompare(b.etiqueta, 'es'));

  const qs = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    const base: Record<string, string | null> = { orden: col, dir, tipo: tipoFiltro, ...patch };
    for (const [k, v] of Object.entries(base)) if (v) sp.set(k, v);
    return `/trabajo/atribucion?${sp.toString()}`;
  };

  const Th = ({ c, children, right }: { c: ColumnaEmbudo; children: React.ReactNode; right?: boolean }) => {
    const activo = col === c;
    const siguiente = activo ? (dir === 'asc' ? 'desc' : 'asc') : DIR_DEFAULT[c];
    return (
      <th className={`px-3 py-2 ${right ? 'text-right' : ''}`}>
        <Link href={qs({ orden: c, dir: siguiente })} className={`inline-flex items-center gap-1 hover:text-ink ${activo ? 'text-ink' : ''}`}>
          {children}{activo ? <span>{dir === 'asc' ? '▲' : '▼'}</span> : null}
        </Link>
      </th>
    );
  };

  // Sin clics no hay denominador: la conversión de entrada es desconocida, no cero.
  const Conv = ({ v, sinDatos }: { v: number | null; sinDatos?: boolean }) =>
    v == null ? (
      <span className="text-muted" title={sinDatos ? 'Este código es anterior al registro de clics: no sabemos cuánta gente abrió el link.' : 'Sin base para calcular.'}>
        {sinDatos ? 'sin datos de clic' : '—'}
      </span>
    ) : (
      <span>{pct(v)}</span>
    );

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold">Atribución por código</h1>
        <p className="mt-1 text-sm text-muted">
          Qué pasó con cada link: clics → altas → CURP capturada → consulta completada → asesorado.
          Los códigos de campaña históricos son anteriores al registro de clics, así que su primera conversión sale como <b>sin datos de clic</b>.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error.message}</p>}

      <section>
        <h2 className="mb-2 text-sm font-bold">Links del equipo</h2>
        <p className="mb-2 text-xs text-muted">Cada asesor comparte el suyo: <span className="font-mono">{BASE}/i/&lt;codigo&gt;</span>. Abre el WhatsApp del bot con el código dentro del mensaje.</p>
        <LinksEquipo links={links} />
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold">Embudo por código <span className="font-normal text-muted">· {filas.length} de {todas.length}</span></h2>
          <div className="flex flex-wrap gap-1 text-xs">
            <Link href={qs({ tipo: null })} className={`rounded-lg px-2 py-1 ${!tipoFiltro ? 'bg-ink font-semibold text-white' : 'border border-line bg-white'}`}>Todos</Link>
            {TIPOS.map((x) => (
              <Link key={x} href={qs({ tipo: x })} className={`rounded-lg px-2 py-1 ${tipoFiltro === x ? 'bg-ink font-semibold text-white' : 'border border-line bg-white'}`}>
                {TIPO_LABEL[x]}
              </Link>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <Th c="codigo">Código</Th>
                <Th c="tipo">Tipo</Th>
                <Th c="clics" right>Clics</Th>
                <Th c="altas" right>Altas</Th>
                <th className="px-3 py-2 text-right">clic→alta</th>
                <Th c="con_curp" right>CURP</Th>
                <th className="px-3 py-2 text-right">alta→CURP</th>
                <Th c="con_consulta" right>Consulta</Th>
                <th className="px-3 py-2 text-right">CURP→consulta</th>
                <Th c="asesorados" right>Asesorados</Th>
                <Th c="ultima_actividad" right>Última actividad</Th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f: FilaEmbudo) => (
                <tr key={f.codigo} className="border-t border-line hover:bg-cream/60">
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs font-semibold">{f.codigo}</span>
                    {f.etiqueta || f.miembro ? <div className="text-[11px] text-muted">{f.etiqueta ?? f.miembro}</div> : null}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {TIPO_LABEL[f.tipo] ?? f.tipo}
                    {!f.registrado ? <span className="ml-1 text-muted">· histórico</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">{f.clics || <span className="text-muted">0</span>}</td>
                  <td className="px-3 py-2 text-right text-xs font-semibold">{f.altas}</td>
                  <td className="px-3 py-2 text-right text-xs"><Conv v={conversion(f.altas, f.clics)} sinDatos={f.clics === 0} /></td>
                  <td className="px-3 py-2 text-right text-xs">{f.con_curp}</td>
                  <td className="px-3 py-2 text-right text-xs"><Conv v={conversion(f.con_curp, f.altas)} /></td>
                  <td className="px-3 py-2 text-right text-xs">{f.con_consulta}</td>
                  <td className="px-3 py-2 text-right text-xs"><Conv v={conversion(f.con_consulta, f.con_curp)} /></td>
                  <td className="px-3 py-2 text-right text-xs">{f.asesorados}</td>
                  <td className="px-3 py-2 text-right text-xs text-muted">{f.ultima_actividad ? fmtFecha(f.ultima_actividad) : <span title="Nunca se ha usado">sin uso</span>}</td>
                </tr>
              ))}
              {!filas.length && <tr><td colSpan={11} className="px-3 py-6 text-center text-muted">Sin códigos para ese filtro.</td></tr>}
            </tbody>
            {filas.length ? (
              <tfoot className="border-t-2 border-line bg-cream/60 text-xs font-semibold">
                <tr>
                  <td className="px-3 py-2" colSpan={2}>Total</td>
                  <td className="px-3 py-2 text-right">{t.clics}</td>
                  <td className="px-3 py-2 text-right">{t.altas}</td>
                  <td className="px-3 py-2 text-right"><Conv v={conversion(t.altas, t.clics)} sinDatos={t.clics === 0} /></td>
                  <td className="px-3 py-2 text-right">{t.con_curp}</td>
                  <td className="px-3 py-2 text-right"><Conv v={conversion(t.con_curp, t.altas)} /></td>
                  <td className="px-3 py-2 text-right">{t.con_consulta}</td>
                  <td className="px-3 py-2 text-right"><Conv v={conversion(t.con_consulta, t.con_curp)} /></td>
                  <td className="px-3 py-2 text-right">{t.asesorados}</td>
                  <td />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>
    </section>
  );
}
