// Checkout integrado a la experiencia /mi. El webhook "pagado" corre el
// fulfillment (procesar_pago_orden → cashback → beneficios trol3, mig. 082).
// No exige semilla: quien viene de /mi puede pagar aunque su cálculo legado
// no exista; el resumen del caso sólo se muestra cuando sí lo hay.
import { redirect } from 'next/navigation';
import { Checkout } from '@/components/Checkout';
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
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/checkout?p=${searchParams.p ?? ''}`)}`);

  const producto = getProducto(searchParams.p);
  // La asesoría básica es gratis: no pasa por checkout.
  if (producto.precioMXN === 0) redirect('/asesoria');

  const sesion = await getSesionCliente();
  const via = searchParams.via === 'puntos' ? 'puntos' : 'pago';
  const saldoPuntos = await getSaldoPuntos();
  return (
    <Checkout
      vm={sesion.real ? sesion.vm : null}
      producto={producto}
      via={via}
      saldoPuntos={saldoPuntos}
      mixInicial={searchParams.mix === '1'}
    />
  );
}
