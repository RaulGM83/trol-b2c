// Checkout integrado a la experiencia /mi. El webhook "pagado" corre el
// fulfillment (procesar_pago_orden → cashback → beneficios trol3, mig. 082).
// No exige semilla: quien viene de /mi puede pagar aunque su cálculo legado
// no exista; el resumen del caso sólo se muestra cuando sí lo hay.
import { redirect } from 'next/navigation';
import { Checkout } from '@/components/Checkout';
import { createClient } from '@/lib/supabase/server';
import { getSesionCliente } from '@/lib/cliente';
import { buscarProducto, PRODUCTOS } from '@/lib/productos';
import { waLink } from '@/lib/whatsapp';
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

  // Sin ?p= es el link viejo de la calculadora. Con un ?p= que este catálogo no conoce
  // NO se cobra otra cosa: hoy eso se paga por el chat, y se le dice.
  const producto = searchParams.p ? buscarProducto(searchParams.p) : PRODUCTOS.CALCULADORA_ADDON;
  if (!producto) {
    return (
      <main className="mx-auto max-w-md space-y-3 px-5 py-10 text-sm">
        <h1 className="text-lg font-extrabold">Esto se paga por tu chat de Trol</h1>
        <p className="text-muted">Todavía no se puede pagar desde aquí. Escríbenos y te mandamos la forma de pago; en cuanto quede, lo activamos y te avisamos por WhatsApp.</p>
        <a href={waLink(`Hola, vengo de mi cuenta Trol (app.trol.mx). Quiero pagar: ${searchParams.p}. ¿Cómo le hago?`)} className="inline-block rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white">Abrir mi chat</a>
        <p><a href="/mi" className="text-xs text-muted underline">← Volver a mi cuenta</a></p>
      </main>
    );
  }
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
