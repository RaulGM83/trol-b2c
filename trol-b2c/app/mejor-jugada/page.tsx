// Pantalla 2 del Incremento 0 — Mejor jugada + desbloqueo dual.
import Link from 'next/link';
import { MejorJugadaFull } from '@/components/MejorJugadaFull';
import { getSesionCliente, tieneProducto } from '@/lib/cliente';
import { getSaldoPuntos } from '@/lib/puntos';
import { getProducto } from '@/lib/productos';

export const dynamic = 'force-dynamic';

export default async function MejorJugadaPage({ searchParams }: { searchParams: { p?: string } }) {
  const sesion = await getSesionCliente();
  if (!sesion.vm) {
    return (
      <main className="mx-auto max-w-xl px-5 py-10 text-center">
        <p className="text-sm text-muted">Tu diagnóstico aún no está listo.</p>
        <Link href="/login" className="mt-4 inline-block rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white">
          Volver a entrar
        </Link>
      </main>
    );
  }
  const producto = getProducto(searchParams.p ?? 'CALCULADORA_ADDON');
  const saldoPuntos = await getSaldoPuntos();
  const yaTiene = await tieneProducto(producto.code);
  return <MejorJugadaFull vm={sesion.vm} producto={producto} saldoPuntos={saldoPuntos} yaTiene={yaTiene} />;
}
