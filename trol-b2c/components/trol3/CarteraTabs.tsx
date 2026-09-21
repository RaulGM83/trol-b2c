// Fase 5 · Mi cartera tiene dos pestañas: los clientes y los compromisos ("Mis pendientes", la
// pantalla de Tareas de siempre, que salió del menú). Sin hooks: la pintan dos páginas de servidor.
import Link from 'next/link';

export function CarteraTabs({ activa, pendientes, vencidas }: { activa: 'clientes' | 'pendientes'; pendientes: number; vencidas: number }) {
  const cls = (on: boolean) => (on ? 'border-b-2 border-ink px-1 pb-2 text-sm font-bold' : 'border-b-2 border-transparent px-1 pb-2 text-sm text-muted hover:text-ink');
  return (
    <div className="flex gap-5 border-b border-line">
      <Link href="/trabajo/cartera" className={cls(activa === 'clientes')}>Clientes</Link>
      <Link href="/trabajo/tareas" className={cls(activa === 'pendientes')}>Mis pendientes{pendientes ? <span className="ml-1.5 rounded-full bg-cream px-1.5 py-0.5 text-[11px] font-bold text-ink">{pendientes}</span> : null}{vencidas ? <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-800">{vencidas} vencida{vencidas === 1 ? '' : 's'}</span> : null}</Link>
    </div>
  );
}
