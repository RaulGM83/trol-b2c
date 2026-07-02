import Link from 'next/link';
import type { EstadoMision } from '@/lib/puntos';

// Misión "Activa tu plan" — checklist gamificado con barra de progreso hacia
// los 100 pts que desbloquean la Calculadora pro. Cada tarea acerca a la meta.
const META = 100;

export function Mision({ mision }: { mision: EstadoMision }) {
  const { saldo, bienvenida, encuesta, referidos } = mision;
  const pct = Math.min(100, Math.round((saldo / META) * 100));
  const faltan = Math.max(0, META - saldo);
  const completa = saldo >= META;

  const tareas: { label: string; pts: number; done: boolean; href?: string }[] = [
    { label: 'Ver mi diagnóstico', pts: 20, done: bienvenida },
    { label: 'Evaluar mi AFORE (2 min)', pts: 50, done: encuesta, href: '/encuesta' },
    { label: 'Invitar a un amigo que vea su diagnóstico', pts: 100, done: referidos > 0, href: '/referidos' },
  ];

  return (
    <section className="mt-5 rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-bold uppercase tracking-wide text-muted">
          Misión: activa tu calculadora
        </div>
        <span className="rounded-full bg-cream px-2.5 py-1 text-[11px] font-bold text-ink">
          ⭐ {saldo} / {META} pts
        </span>
      </div>

      {/* Barra de progreso */}
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-lime transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">
        {completa ? (
          <b className="text-ink">¡Lo lograste! Ya puedes desbloquear tu calculadora sin pagar.</b>
        ) : (
          <>
            Te faltan <b className="text-ink">{faltan} pts</b> para desbloquear tu Calculadora pro gratis.
          </>
        )}
      </p>

      {/* Tareas */}
      <ul className="mt-3 space-y-2">
        {tareas.map((t) => {
          const contenido = (
            <>
              <span className="flex items-center gap-2">
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    t.done ? 'bg-lime text-ink' : 'border border-line text-muted'
                  }`}
                >
                  {t.done ? '✓' : ''}
                </span>
                <span className={t.done ? 'line-through' : 'font-semibold text-ink'}>{t.label}</span>
              </span>
              <span className={`shrink-0 text-xs font-bold ${t.done ? 'text-muted' : 'text-ink'}`}>+{t.pts}</span>
            </>
          );
          return (
            <li key={t.label}>
              {!t.done && t.href ? (
                <Link
                  href={t.href}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2.5 text-sm hover:bg-cream"
                >
                  {contenido}
                </Link>
              ) : (
                <div
                  className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm ${
                    t.done ? 'bg-cream text-muted' : 'border border-line'
                  }`}
                >
                  {contenido}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {completa && (
        <Link
          href="/checkout?p=CALCULADORA_ADDON&via=puntos"
          className="mt-4 block rounded-xl bg-lime px-4 py-3 text-center text-sm font-bold text-ink"
        >
          Desbloquear mi calculadora con mis puntos
        </Link>
      )}
    </section>
  );
}
