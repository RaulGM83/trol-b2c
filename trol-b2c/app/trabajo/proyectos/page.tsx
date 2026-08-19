import { requireMiembro, t3, type Any } from '@/lib/trol3/server';
import { ProyectosInfonavit, type ProyectoRow } from '@/components/trol3/ProyectosInfonavit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inmuebles · Trol' };

export default async function Proyectos() {
  await requireMiembro();
  const db = t3();
  const [{ data: proys }, { data: sup }] = await Promise.all([
    db.from('proyectos_inmobiliarios').select('*').order('clave', { nullsFirst: false }),
    db.from('infonavit_supuestos').select('*').eq('id', 'default').maybeSingle(),
  ]);
  return <ProyectosInfonavit proyectos={((proys ?? []) as Any[]) as ProyectoRow[]} supuestos={(sup ?? {}) as Record<string, unknown>} />;
}
