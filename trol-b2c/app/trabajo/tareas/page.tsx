import Link from 'next/link';
import { requireMiembro, t3, type Any } from '@/lib/trol3/server';
import { TareasPanel, type MiembroOpcion, type Tarea } from '@/components/trol3/TareasPanel';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Tareas del equipo (114).
//
// "Mías" es lo primero que se ve porque es lo que el asesor puede hacer hoy;
// "Todas" existe porque la dirección tiene que poder ver los compromisos de
// todos sin pedirle a nadie un reporte.
//
// "Vencidas" no es un filtro más: es la única vista que contesta la pregunta
// que importa —¿a quién le estamos quedando mal?— así que va con su propio
// contador desde el principio.
// ---------------------------------------------------------------------------

const FILTROS = [
  ['mias', 'Mías'],
  ['vencidas', 'Vencidas'],
  ['todas', 'Todas'],
  ['cerradas', 'Cerradas'],
] as const;

type Filtro = (typeof FILTROS)[number][0];

export default async function TareasPage({
  searchParams,
}: {
  searchParams: { f?: string };
}) {
  const miembro = await requireMiembro();
  const db = t3();
  const filtro: Filtro = (FILTROS.map((f) => f[0]) as string[]).includes(searchParams.f ?? '')
    ? (searchParams.f as Filtro)
    : 'mias';

  const [{ data: crudas, error }, { data: equipo }] = await Promise.all([
    db
      .from('v_tareas')
      .select(
        'id,persona_id,persona_nombre,titulo,detalle,responsable_id,responsable_nombre,vence_el,estado,origen,vencida,dias_para_vencer,hecha_en,nota_cierre',
      )
      .order('vence_el', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(400),
    db.from('miembros').select('id,nombre,email').eq('activo', true).order('nombre'),
  ]);

  const todas = (crudas ?? []) as Tarea[];
  const abiertas = todas.filter((t) => t.estado === 'pendiente');

  const conteos = {
    mias: abiertas.filter((t) => t.responsable_id === miembro.id).length,
    vencidas: abiertas.filter((t) => t.vencida).length,
    todas: abiertas.length,
    cerradas: todas.filter((t) => t.estado !== 'pendiente').length,
  };

  const visibles =
    filtro === 'mias'
      ? todas.filter((t) => t.responsable_id === miembro.id)
      : filtro === 'vencidas'
        ? todas.filter((t) => t.estado === 'pendiente' && t.vencida)
        : filtro === 'cerradas'
          ? todas.filter((t) => t.estado !== 'pendiente')
          : todas;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <h1 className="mr-3 text-xl font-extrabold">Tareas</h1>
        {FILTROS.map(([k, label]) => (
          <Link
            key={k}
            href={`/trabajo/tareas?f=${k}`}
            className={`rounded-full border px-3 py-1 ${filtro === k ? 'bg-ink text-white' : ''} ${
              k === 'vencidas' && conteos.vencidas > 0 && filtro !== k ? 'border-red-300 text-red-700' : ''
            }`}
          >
            {label}
            {conteos[k] > 0 && <span className="ml-1 opacity-70">{conteos[k]}</span>}
          </Link>
        ))}
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error.message}</p>}

      <TareasPanel
        tareas={visibles}
        miembros={((equipo ?? []) as Any[]).map((m) => ({
          id: m.id,
          nombre: m.nombre,
          email: m.email,
        })) as MiembroOpcion[]}
        yoId={miembro.id}
        titulo={FILTROS.find((f) => f[0] === filtro)?.[1] ?? 'Tareas'}
        mostrarCliente
      />
    </div>
  );
}
