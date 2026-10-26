import Link from 'next/link';
import { requireMiembro, t3 } from '@/lib/trol3/server';
import { EventoPanel, cortesEvento, type PanelEvento } from '@/components/trol3/EventoPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Panel del evento · Trol equipo' };

// 191 · El panel del evento (claude/88): el embudo del código contra la meta y la lista de
// registrados con lo que le toca al equipo. Es la pantalla de los días previos y posteriores
// al Foro; la del pasillo (registrar en vivo, QR) sigue siendo /trabajo/evento.
export default async function Panel({ searchParams }: { searchParams: { c?: string; f?: string; e?: string } }) {
  await requireMiembro();
  const db = t3();
  const { data: eventos } = await db.from('codigos_invitacion').select('codigo,etiqueta').eq('tipo', 'evento').eq('activo', true).order('created_at', { ascending: false });
  const lista = (eventos ?? []) as { codigo: string; etiqueta: string | null }[];
  const codigo = lista.find((e) => e.codigo === searchParams.c)?.codigo ?? lista[0]?.codigo ?? null;
  if (!codigo) return <p className="text-sm text-muted">No hay ningún evento activo.</p>;
  // 262 · corte por envío (?e=hoy | ?e=<fecha del envío>): fechas en hora de CDMX.
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const { data: cfg } = await db.from('config').select('valor').eq('clave', 'evento_meta').maybeSingle();
  let envios: { fecha: string; nombre: string }[] | undefined;
  try { envios = (JSON.parse(String((cfg as { valor?: string } | null)?.valor ?? '{}'))?.[codigo]?.envios) ?? undefined; } catch { envios = undefined; }
  const corte = cortesEvento(envios, hoy).find((x) => x.clave === searchParams.e) ?? { clave: 'todos', nombre: 'Todos' };
  const cdmx = (d?: string) => (d ? `${d}T00:00:00-06:00` : null);
  const { data, error } = await db.rpc('evento_panel', { p_codigo: codigo, p_limit: 400, p_desde: cdmx(corte.desde), p_hasta: cdmx(corte.hasta) });
  if (error) return <p className="text-sm text-red-600">{error.message}</p>;
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex gap-2">
          {lista.map((e) => <Link key={e.codigo} href={`/trabajo/evento/panel?c=${e.codigo}`} className={e.codigo === codigo ? 'rounded-full bg-ink px-3 py-1 font-bold text-white' : 'rounded-full border border-line bg-white px-3 py-1 font-semibold'}>{e.etiqueta ?? e.codigo}</Link>)}
        </div>
        <Link href={`/trabajo/evento?c=${codigo}`} className="font-semibold underline">Pantalla del pasillo (registrar en vivo) →</Link>
      </div>
      <EventoPanel codigo={codigo} etiqueta={lista.find((e) => e.codigo === codigo)?.etiqueta ?? codigo} panel={data as PanelEvento} filtroInicial={searchParams.f ?? 'todos'} corte={corte.clave} hoy={hoy} />
    </div>
  );
}
