// Pantalla 3 del Incremento 0 — Checkout integrado.
// En producción: webhook "pagado" → corre workflow_id → genera/abre producto →
// cashback (§14). Aquí simula el pago en el cliente.
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Checkout } from '@/components/Checkout';
import { VerificarTelefono } from '@/components/VerificarTelefono';
import { createClient } from '@/lib/supabase/server';
import { getSesionCliente } from '@/lib/cliente';
import { getProducto } from '@/lib/productos';
import { getSaldoPuntos } from '@/lib/puntos';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: { p?: string; via?: string; mix?: string };
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
  // La asesoría básica es gratis: no pasa por checkout.
  if (producto.precioMXN === 0) redirect('/asesoria');

  // Step-up para sesiones de magic link (entraron sin OTP): antes de pagar o
  // gastar puntos, el celular se verifica UNA vez por SMS.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && !user.phone) {
    const { data: fila } = await supabase
      .from('clientes')
      .select('telefono')
      .eq('auth_user_id', user.id)
      .limit(1)
      .maybeSingle();
    const tel10 = (fila?.telefono ?? '').replace(/\D/g, '').slice(-10);
    return <VerificarTelefono telInicial={tel10} />;
  }

  const via = searchParams.via === 'puntos' ? 'puntos' : 'pago';
  const saldoPuntos = await getSaldoPuntos();
  return (
    <Checkout
      vm={sesion.vm}
      producto={producto}
      via={via}
      saldoPuntos={saldoPuntos}
      mixInicial={searchParams.mix === '1'}
    />
  );
}
