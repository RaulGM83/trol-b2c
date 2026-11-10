import { requireMiembro, t3, type Any } from '@/lib/trol3/server';
import { SemaforoProveedores, type FilaSemaforo } from '@/components/trol3/SemaforoProveedores';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Proveedores · Trol' };

// 302a · Negocio → Proveedores: semáforo de Jordan / Precalix / BDI por las consultas de las últimas 24 h y el
// apagador manual. Apagado = las consultas nuevas esperan sin mandarse y el aliado pasa directo al camino
// mínimo (Infonavit) o al SISEC (IMSS). Al encender se redespachan las que esperaban.
export default async function Proveedores() {
  await requireMiembro();
  const { data } = await t3().rpc('semaforo_proveedores');
  const filas = ((data ?? []) as Any[]) as FilaSemaforo[];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Proveedores</h1>
        <p className="text-xs text-muted">Qué tan bien están respondiendo hoy. Si uno está apagado o en rojo, los aliados ven de inmediato la captura a mano (Infonavit) o la opción de subir el SISEC (IMSS); las consultas nuevas se quedan en espera y se mandan solas al encenderlo.</p>
      </div>
      <SemaforoProveedores filas={filas} />
    </div>
  );
}
