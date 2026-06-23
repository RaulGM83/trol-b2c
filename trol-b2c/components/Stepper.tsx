import Link from 'next/link';

// Stepper firma "Tu avance" — 6 pasos del modelo de progreso del cliente (§16).
// Cada paso con ruta es clickeable para saltar a esa sección.
const PASOS: { label: string; href?: string }[] = [
  { label: 'Tus datos', href: '/login' },
  { label: 'Diagnóstico', href: '/diagnostico' },
  { label: 'Mejor jugada', href: '/mejor-jugada' },
  { label: 'Calculadora', href: '/calculadora' },
  { label: 'Asesoría', href: '/asesoria' },
  { label: 'Implementar' }, // sin ruta aún
];

export function Stepper({ activo }: { activo: number }) {
  return (
    <div className="mb-6">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Tu avance</div>
      <div className="flex gap-1.5">
        {PASOS.map((p, i) => {
          const done = i <= activo;
          const here = i === activo;
          const inner = (
            <>
              <div className={`h-1.5 rounded-full ${done ? 'bg-lime' : 'bg-line'}`} />
              <div className={`mt-1 text-[10px] ${here ? 'font-bold text-ink' : 'text-muted'}`}>{p.label}</div>
            </>
          );
          return p.href ? (
            <Link
              key={p.label}
              href={p.href}
              className="flex-1 cursor-pointer transition-opacity hover:opacity-70"
              aria-current={here ? 'step' : undefined}
            >
              {inner}
            </Link>
          ) : (
            <div key={p.label} className="flex-1">
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}
