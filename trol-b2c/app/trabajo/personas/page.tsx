import Link from 'next/link';
import { requireMiembro, t3, type Any } from '@/lib/trol3/server';
import { AltaPersonaForm } from '@/components/trol3/AltaPersonaForm';

export const dynamic = 'force-dynamic';

export default async function Personas({ searchParams }: { searchParams: { q?: string } }) {
  const m = await requireMiembro();
  const q = (searchParams.q ?? '').trim();
  const db = t3();
  let rows: Any[] = [];
  let error: string | null = null;
  if (q.length >= 4) {
    const r = await db.rpc('buscar_personas', { p_q: q, p_limit: 40 });
    rows = r.data ?? [];
    error = r.error?.message ?? null;
  } else {
    const r = await db.from('personas').select('id,nombre,apellidos,curp,etapa,cabecera_id,updated_at').order('updated_at', { ascending: false }).limit(30);
    rows = r.data ?? [];
    error = r.error?.message ?? null;
  }
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      <section>
        <h1 className="mb-3 text-xl font-extrabold">Personas {q ? <span className="text-sm font-normal text-muted">· resultados para “{q}”</span> : <span className="text-sm font-normal text-muted">· actividad reciente</span>}</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-cream text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-3 py-2">Nombre</th><th className="px-3 py-2">CURP</th><th className="px-3 py-2">Tel</th><th className="px-3 py-2">Ley / semanas</th><th className="px-3 py-2">Etapa</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t border-line hover:bg-cream/60">
                  <td className="px-3 py-2"><Link href={`/trabajo/p/${p.id}`} className="font-semibold hover:underline">{p.nombre ?? '(sin nombre)'} {p.apellidos ?? ''}</Link>{p.edad ? <span className="text-xs text-muted"> · {p.edad} años</span> : null}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.curp ?? '—'}</td>
                  <td className="px-3 py-2 text-xs">{p.telefono ?? ''}</td>
                  <td className="px-3 py-2 text-xs">{p.ley ?? '—'} {p.semanas ? `· ${p.semanas} sem` : ''}</td>
                  <td className="px-3 py-2 text-xs">{p.etapa}{p.cabecera_id === m.id ? ' · tuyo' : ''}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted">Sin resultados.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <aside>
        <div className="rounded-2xl border border-line bg-white p-4">
          <h2 className="mb-2 text-sm font-bold">Dar de alta (recepción)</h2>
          <p className="mb-3 text-xs text-muted">Solo teléfono confirmado. Tú quedas como cabecera.</p>
          <AltaPersonaForm />
        </div>
      </aside>
    </div>
  );
}
