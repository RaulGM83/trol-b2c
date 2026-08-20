import Link from 'next/link';
import { requireMiembro, t3, type Any } from '@/lib/trol3/server';
import { AltaPersonaBoton } from '@/components/trol3/AltaPersonaForm';

export const dynamic = 'force-dynamic';

const TAKO_LINE = 'm2MS9fYJb1EhjJQykLUz';
const takoUrl = (tel10: string) => `https://portal.takohub.com/trol-financiero/pas/chats?line=${TAKO_LINE}&number=521${tel10}`;
const fmtFecha = (s?: string | null) => (s ? new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'America/Mexico_City' }) : '—');
const fmtTel = (t?: string | null) => (t && t.length === 10 ? `${t.slice(0, 2)} ${t.slice(2, 6)} ${t.slice(6)}` : t ?? '');

// Dirección por defecto de cada columna (texto asc, números/fechas desc)
const DIR_DEFAULT: Record<string, 'asc' | 'desc'> = { nombre: 'asc', curp: 'asc', telefono: 'asc', ley: 'asc', edad: 'desc', semanas: 'desc', creado: 'desc' };

export default async function TrabajoHome({ searchParams }: { searchParams: { q?: string; orden?: string; dir?: string } }) {
  const m = await requireMiembro();
  const q = (searchParams.q ?? '').trim();
  const orden = searchParams.orden ?? 'actividad';
  const dir = (searchParams.dir === 'asc' || searchParams.dir === 'desc') ? searchParams.dir : (DIR_DEFAULT[orden] ?? 'desc');
  const db = t3();
  // Una sola RPC: con búsqueda (>=4 chars o teléfono) filtra; sin búsqueda trae la actividad reciente (u ordenado por la columna elegida).
  const r = await db.rpc('buscar_personas', { p_q: q, p_limit: q.length >= 4 ? 40 : 30, p_orden: orden, p_dir: dir });
  const rows: Any[] = r.data ?? [];
  const error: string | null = r.error?.message ?? null;

  const Th = ({ col, children, right }: { col: string; children: React.ReactNode; right?: boolean }) => {
    const activo = orden === col;
    const sig = activo && dir === (DIR_DEFAULT[col] ?? 'desc') ? (dir === 'asc' ? 'desc' : 'asc') : (DIR_DEFAULT[col] ?? 'desc');
    const sp = new URLSearchParams(); if (q) sp.set('q', q); sp.set('orden', col); sp.set('dir', activo ? sig : (DIR_DEFAULT[col] ?? 'desc'));
    return (
      <th className={`px-3 py-2 ${right ? 'text-right' : ''}`}>
        <Link href={`/trabajo?${sp.toString()}`} className={`inline-flex items-center gap-1 hover:text-ink ${activo ? 'text-ink' : ''}`}>
          {children}{activo ? <span>{dir === 'asc' ? '▲' : '▼'}</span> : null}
        </Link>
      </th>
    );
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold">Personas {q ? <span className="text-sm font-normal text-muted">· resultados para “{q}”</span> : <span className="text-sm font-normal text-muted">{orden === 'actividad' ? '· actividad reciente' : '· ordenado'}</span>}</h1>
        <div className="flex items-center gap-2">
          {orden !== 'actividad' && <Link href={q ? `/trabajo?q=${encodeURIComponent(q)}` : '/trabajo'} className="text-xs text-muted underline">Quitar orden</Link>}
          <AltaPersonaBoton />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <Th col="nombre">Nombre</Th>
              <Th col="curp">CURP</Th>
              <Th col="telefono">Teléfono</Th>
              <Th col="edad">Edad</Th>
              <Th col="ley">Ley</Th>
              <Th col="semanas">Semanas</Th>
              <Th col="creado">Creado</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const tel10: string | null = p.tel10 ?? (p.telefono ? String(p.telefono).replace(/\D/g, '').slice(-10) : null);
              return (
                <tr key={p.id} className="border-t border-line hover:bg-cream/60">
                  <td className="px-3 py-2">
                    <Link href={`/trabajo/p/${p.id}`} className="font-semibold hover:underline">{p.nombre ?? '(sin nombre)'} {p.apellidos ?? ''}</Link>
                    {p.cabecera_id === m.id ? <span className="ml-1 rounded bg-lime/30 px-1.5 py-0.5 text-[10px] font-semibold text-ink">tuyo</span> : null}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{p.curp ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">
                    {tel10 ? (
                      <a href={takoUrl(tel10)} target="_blank" rel="noreferrer" title="Abrir conversación en Tako" className="font-mono font-semibold text-ink underline decoration-dotted hover:decoration-solid">{fmtTel(tel10)}</a>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">{p.edad ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{p.ley ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{p.semanas != null ? Math.round(Number(p.semanas)) : '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted" title={p.created_at ?? ''}>{fmtFecha(p.created_at)}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted">Sin resultados.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
