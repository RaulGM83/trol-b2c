import Link from 'next/link';

// Chip de saldo de puntos, siempre visible en el header de las pantallas
// autenticadas. La moneda del juego a la vista (gamificación).
export function PuntosChip({ saldo }: { saldo: number }) {
  return (
    <Link
      href="/mejor-jugada"
      className="ml-auto rounded-full bg-cream px-2.5 py-1 text-[11px] font-bold text-ink hover:opacity-80"
      title="Tus puntos desbloquean herramientas y asesorías"
    >
      ⭐ {saldo} pts
    </Link>
  );
}
