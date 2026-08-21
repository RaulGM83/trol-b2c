import Link from 'next/link';
import { requireMiembro, t3, fmtFecha, type Any } from '@/lib/trol3/server';
import { FusionarGrupo, LigarFamiliaresGrupo, type PersonaDup } from '@/components/trol3/DuplicadosAcciones';
import { clasificarGrupo } from '@/lib/trol3/duplicados';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Duplicados · Trol' };

const fmtTel = (t: string) => (t.length === 10 ? `${t.slice(0, 2)} ${t.slice(2, 6)} ${t.slice(6)}` : t);
const nombreDe = (p: PersonaDup) => [p.nombre, p.apellidos].filter(Boolean).join(' ') || '(sin nombre)';

/**
 * De los 73 teléfonos con más de un expediente, la mayoría son familiares compartiendo
 * número: 51 tienen CURPs distintas. Por eso la pantalla clasifica antes de ofrecer nada,
 * y sólo propone fusionar donde las CURPs no se contradicen.
 */
export default async function Duplicados() {
  await requireMiembro();
  const db = t3();
  const { data: grupos, error } = await db.from('v_personas_duplicadas').select('*').order('n', { ascending: false });

  const ids = [...new Set(((grupos ?? []) as Any[]).flatMap((g) => (g.personas ?? []) as string[]))];
  const { data: personas } = ids.length
    ? await db.from('personas').select('id,nombre,apellidos,curp,etapa,created_at').in('id', ids)
    : { data: [] as Any[] };
  const pmap = new Map(((personas ?? []) as Any[]).map((p) => [p.id, p as PersonaDup]));

  const filas = ((grupos ?? []) as Any[])
    .map((g) => ({ llave: g.llave as string, motivo: g.motivo as string, ...clasificarGrupo<PersonaDup>((g.personas ?? []) as string[], pmap) }))
    .filter((f) => f.miembros.length > 1);

  const candidatos = filas.filter((f) => !f.familiares);
  const familias = filas.filter((f) => f.familiares);

  const Grupo = ({ f }: { f: (typeof filas)[number] }) => (
    <li className="rounded-2xl border border-line bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-bold">
          {f.motivo === 'telefono' ? <>Teléfono <span className="font-mono">{fmtTel(f.llave)}</span></> : <>CURP <span className="font-mono">{f.llave}</span></>}
        </span>
        <span className="text-xs text-muted">{f.miembros.length} expedientes</span>
      </div>
      <table className="mt-2 w-full text-sm">
        <tbody>
          {f.miembros.map((p) => (
            <tr key={p.id} className="border-t border-line/70">
              <td className="py-1"><Link href={`/trabajo/p/${p.id}`} className="font-semibold hover:underline">{nombreDe(p)}</Link></td>
              <td className="py-1 font-mono text-xs">{p.curp ?? <span className="text-muted">sin CURP</span>}</td>
              <td className="py-1 text-right text-xs text-muted">{p.etapa ?? '—'} · {fmtFecha(p.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {f.familiares
        ? <LigarFamiliaresGrupo telefono={f.llave} personas={f.miembros} sugerido={f.sugerido} />
        : <FusionarGrupo personas={f.miembros} sugerido={f.sugerido} />}
    </li>
  );

  return (
    <section>
      <div className="mb-3">
        <h1 className="text-xl font-extrabold">Duplicados</h1>
        <p className="mt-1 text-sm text-muted">
          {filas.length} números o CURPs con más de un expediente: <b>{candidatos.length}</b> pueden ser la misma persona y <b>{familias.length}</b> son familiares compartiendo teléfono.
          Regla: <b>un teléfono, una CURP</b>. Si las CURPs difieren no se fusiona — se ligan como familiares y el número queda a nombre de su dueño.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error.message}</p>}

      <h2 className="mt-4 text-sm font-bold uppercase tracking-wide text-muted">Candidatos a fusión ({candidatos.length})</h2>
      {candidatos.length ? (
        <ul className="mt-2 space-y-3">{candidatos.map((f) => <Grupo key={`${f.motivo}-${f.llave}`} f={f} />)}</ul>
      ) : <p className="mt-2 text-sm text-muted">Nada por fusionar.</p>}

      <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-muted">Familiares compartiendo teléfono ({familias.length})</h2>
      <p className="mt-1 text-xs text-muted">Estos <b>no</b> se fusionan: son personas distintas. Lígalos y define de quién es el número.</p>
      {familias.length ? (
        <ul className="mt-2 space-y-3">{familias.map((f) => <Grupo key={`${f.motivo}-${f.llave}`} f={f} />)}</ul>
      ) : <p className="mt-2 text-sm text-muted">Ninguno.</p>}
    </section>
  );
}
