// Pantalla 3 del Incremento 0 — Checkout integrado.
// En producción: webhook "pagado" → corre workflow_id → genera/abre producto →
// cashback (§14). Aquí simula el pago en el cliente.
import Link from 'next/link';
import { Checkout } from '@/components/Checkout';
import { getSesionCliente } from '@/lib/cliente';
import { getProducto } from '@/lib/productos';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: { p?: string; via?: string };
}) {
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
  const producto = getProducto(searchParams.p);
  const via = searchParams.via === 'puntos' ? 'puntos' : 'pago';
  return <Checkout vm={sesion.vm} producto={producto} via={via} />;
}
