// Comparador de AFOREs (público + clientes). Datos duros (afore_datos) +
// señal cualitativa agregada de la encuesta (vista_comparador_afore).
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSemillaV2Cliente } from '@/lib/cliente';
import { ComparadorView, type FilaAfore, type FilaIRN } from '@/components/ComparadorView';

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
      .select('afore, comision, rendimiento_neto, afiliados_millones, fortaleza, n_resenas, atencion_prom, asesoria_prom, recomienda_pct, fuga_cuentas_pct, fuga_saldo_pct');
    filas = (data ?? []) as FilaAfore[];
  } catch {
    filas = [];
  }

  // Matriz IRN oficial por generación (para "la mejor para tu edad").
  let irn: FilaIRN[] = [];
  try {
    const admin = createAdminClient();
    const { data } = await admin.from('afore_irn').select('afore, generacion, irn');
    irn = (data ?? []) as FilaIRN[];
  } catch {
    irn = [];
  }

  return <ComparadorView filas={filas} irn={irn} autenticado={!!user} anioPrefill={anioPrefill} />;
}
