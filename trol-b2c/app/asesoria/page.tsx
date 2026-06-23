// Hub de asesorías de pago (Plan Maestro §6) — Diagnóstico avanzado y +sesión.
import Link from 'next/link';
import { AsesoriaHub } from '@/components/AsesoriaHub';
import { getSesionCliente, tieneProducto } from '@/lib/cliente';
import { getSaldoPuntos } from '@/lib/puntos';
import { ASESORIAS } from '@/lib/productos';

export const dynamic = 'force-dynamic';

export default async function AsesoriaPage() {
  const sesion = await getSesionCliente();
  if (!sesion.vm) {
    return (
      <main className="mx-auto max-w-xl px-5 py-10 text-center">
        <p className="text-sm text-muted">Entra con tu celular para ver y contratar tus asesorías.</p>
        <Link href="/login" className="mt-4 inline-block rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white">
          Entrar
        </Link>
      </main>
    );
  }
  const saldoPuntos = await getSaldoPuntos();
  const items = await Promise.all(
    ASESORIAS.map(async (producto) => ({ producto, yaTiene: await tieneProducto(producto.code) })),
  );
  return <AsesoriaHub items={items} saldoPuntos={saldoPuntos} />;
}
