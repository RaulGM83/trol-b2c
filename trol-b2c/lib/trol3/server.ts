// ============================================================================
// Trol 3.0 — acceso al esquema `trol3` desde Server Components / actions.
// Requiere que `trol3` esté en "Exposed schemas" del proyecto Supabase.
// ============================================================================
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Any = any;

export function t3() {
  return createClient().schema('trol3');
}
export function t3admin() {
  return createAdminClient().schema('trol3');
}

export interface Miembro {
  id: string;
  email: string;
  nombre: string | null;
  roles: string[];
}

/** Miembro Trol autenticado (asesor) o null. */
export async function getMiembro(): Promise<Miembro | null> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .schema('trol3')
      .from('miembros')
      .select('id,email,nombre,roles')
      .eq('auth_user_id', user.id)
      .eq('activo', true)
      .maybeSingle();
    if (data) return data as Miembro;
    // Auto-vincular por email si el miembro existe sin auth_user_id (primer login)
    if (user.email) {
      const admin = t3admin();
      const { data: m } = await admin.from('miembros').select('id,email,nombre,roles,auth_user_id').eq('email', user.email.toLowerCase()).maybeSingle();
      if (m && !m.auth_user_id) {
        await admin.from('miembros').update({ auth_user_id: user.id }).eq('id', m.id);
        return m as Miembro;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Persona del cliente autenticado (vincula por teléfono si hace falta). */
export async function getPersonaMia(): Promise<string | null> {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase.schema('trol3').rpc('vincular_sesion', { p_canal: 'organico' });
    if (error) return null;
    return data as string;
  } catch {
    return null;
  }
}

export const fmtMXN = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(n));
export const fmtNum = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('es-MX').format(Number(n)));
export const fmtFecha = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const CAPA_LABEL: Record<string, string> = { declarado: 'Declarado', calculado: 'Calculado por Trol', validado: 'Validado' };
export const ESTADO_OP_LABEL: Record<string, string> = {
  posible: 'Posible', detectada: 'Detectada', presentada: 'Presentada', en_proceso: 'En proceso', ganada: 'Ganada', perdida: 'Perdida', no_aplica: 'No aplica',
};
export const CHECK_LABEL: Record<string, string> = {
  cuenta_sin_inconsistencias: 'Cuenta IMSS sin inconsistencias',
  semanas_reconocidas: 'Semanas reconocidas',
  afore_top: 'AFORE entre las mejores',
  cuenta_registrada: 'Cuenta AFORE registrada',
  derechos_vigentes: 'Derechos vigentes (Ley 73)',
  situacion_entendida: 'Entiendo mi situación',
  datos_vigentes: 'Información actualizada',
};

/** Exige miembro autenticado; redirige a login si no hay sesión. */
export async function requireMiembro(): Promise<Miembro> {
  const { redirect } = await import('next/navigation');
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/trabajo/login');
  const m = await getMiembro();
  if (!m) redirect('/trabajo/sin-acceso');
  return m as Miembro;
}
