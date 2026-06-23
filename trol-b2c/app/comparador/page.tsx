// Comparador de AFOREs (público + clientes). Datos duros (afore_datos) +
// señal cualitativa agregada de la encuesta (vista_comparador_afore).
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSemillaV2Cliente } from '@/lib/cliente';
import { ComparadorView, type FilaAfore } from '@/components/ComparadorView';

export const dynamic = 'force-dynamic';

export default async function ComparadorPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Prefill del año de nacimiento si el cliente tiene semilla (para el IRN por generación).
  let anioPrefill: number | undefined;
  if (user) {
    try {
      const semilla = await getSemillaV2Cliente();
      const f = semilla?.perfil?.fecha_nacimiento;
      if (f) anioPrefill = new Date(f).getUTCFullYear();
    } catch {
      /* sin prefill */
    }
  }

  // Service role: la vista agrega la encuesta (RLS no aplica a agregados).
  let filas: FilaAfore[] = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from('vista_comparador_afore')
      .select('afore, comision, rendimiento_neto, afiliados_millones, fortaleza, n_resenas, atencion_prom, asesoria_prom, recomienda_pct');
    filas = (data ?? []) as FilaAfore[];
  } catch {
    filas = [];
  }

  return <ComparadorView filas={filas} autenticado={!!user} anioPrefill={anioPrefill} />;
}
