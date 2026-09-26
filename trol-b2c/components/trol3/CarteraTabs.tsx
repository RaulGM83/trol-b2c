// 187 · Mi cartera por carriles (claude/84): Favoritos · Calientes · Tibios · Fríos, más los
// compromisos ("Mis pendientes", la pantalla de Tareas de siempre). Sin hooks: la pintan páginas
// de servidor. `conteos` sólo trae el de la pestaña que se calculó; las demás no se cuentan.
import Link from 'next/link';

export type Carril = 'favoritos' | 'calientes' | 'tibios' | 'frios';
export type TabCartera = Carril | 'pendientes';
const CARRILES: { id: Carril; nombre: string; dot: string }[] = [
  { id: 'favoritos', nombre: 'Favoritos', dot: 'bg-sky-600' },
  { id: 'calientes', nombre: 'Calientes', dot: 'bg-red-500' },
  { id: 'tibios', nombre: 'Tibios', dot: 'bg-amber-500' },
  { id: 'frios', nombre: 'Fríos', dot: 'bg-slate-400' },
];

export function CarteraTabs({ activa, pendientes, vencidas, conteos = {}, query = '' }: {
  activa: TabCartera; pendientes: number; vencidas: number;
  conteos?: Partial<Record<Carril, string>>; query?: string;
}) {
  const cls = (on: boolean) => (on ? 'flex items-center gap-1.5 border-b-2 border-ink px-1 pb-2 text-sm font-bold' : 'flex items-center gap-1.5 border-b-2 border-transparent px-1 pb-2 text-sm text-muted hover:text-ink');
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-line">
      {CARRILES.map((c) => (
        <Link key={c.id} href={`/trabajo/cartera?tab=${c.id}${query}`} className={cls(activa === c.id)}>
          <span className={`h-2 w-2 rounded-full ${c.dot}`} />{c.nombre}
          {conteos[c.id] ? <span className="rounded-full bg-cream px-1.5 py-0.5 font-mono text-[11px] font-bold text-ink">{conteos[c.id]}</span> : null}
        </Link>
      ))}
      <Link href="/trabajo/tareas" className={cls(activa === 'pendientes')}>Mis pendientes{pendientes ? <span className="ml-1.5 rounded-full bg-cream px-1.5 py-0.5 text-[11px] font-bold text-ink">{pendientes}</span> : null}{vencidas ? <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-800">{vencidas} vencida{vencidas === 1 ? '' : 's'}</span> : null}</Link>
    </div>
  );
}
