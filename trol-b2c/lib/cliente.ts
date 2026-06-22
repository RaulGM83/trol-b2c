// ============================================================================
// Lectura de la semilla real del cliente autenticado (Llave 1).
// Identidad: teléfono+OTP (Supabase Auth) → match contra clientes por los
// últimos 10 dígitos del teléfono → adopta el perfil ya calculado (§14).
// RLS por cliente debe restringir clientes a su propia fila en producción.
// Fallback a la semilla demo para desarrollo sin proveedor SMS configurado.
// ============================================================================

import { createClient } from './supabase/server';
import { buildDiagnostico, type DiagnosticoVM } from './diagnostico';
import { SEED_DEMO, HOY_DEMO } from './seed-demo';
import { parseSemillaV2, type SemillaV2 } from '@trol/pension-core/semilla';

const soloDigitos = (s: string) => s.replace(/\D/g, '');

export interface SesionCliente {
  autenticado: boolean;
  /** true si el VM viene de la semilla real del cliente; false si es la demo. */
  real: boolean;
  vm: DiagnosticoVM | null;
  /** Motivo cuando no hay VM real (sin sesión / sin match / semilla v1 o hueca). */
  motivo?: 'sin_sesion' | 'sin_match' | 'semilla_invalida';
}

/** jsonb crudo de clientes.calculo_pensional para el cliente autenticado, o null. */
async function getSemillaCruda(): Promise<{ seed: unknown } | { error: SesionCliente['motivo'] }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'sin_sesion' }; // sin login → demo público

  // 1) Match exacto por auth_user_id (vínculo fijado al iniciar sesión).
  let { data } = await supabase
    .from('clientes')
    .select('id, nombre, calculo_pensional')
    .eq('auth_user_id', user.id)
    .limit(1)
    .maybeSingle();

  // 2) Fallback por teléfono (cliente aún sin vincular).
  if (!data && user.phone) {
    const d10 = soloDigitos(user.phone).slice(-10);
    ({ data } = await supabase
      .from('clientes')
      .select('id, nombre, calculo_pensional')
      .or(`telefono.eq.${d10},telefono.eq.52${d10},telefono.eq.+52${d10},telefono.ilike.%${d10}`)
      .limit(1)
      .maybeSingle());
  }

  // Autenticado pero sin ficha o sin semilla → "calculadora aún no lista"
  // (NUNCA demo una vez que hay sesión).
  if (!data?.calculo_pensional) return { error: 'semilla_invalida' };
  return { seed: data.calculo_pensional };
}

/** VM de diagnóstico del cliente autenticado, con fallback a la semilla demo. */
export async function getSesionCliente(): Promise<SesionCliente> {
  let crudo: Awaited<ReturnType<typeof getSemillaCruda>>;
  try {
    crudo = await getSemillaCruda();
  } catch {
    crudo = { error: 'sin_sesion' };
  }

  if ('seed' in crudo) {
    try {
      return { autenticado: true, real: true, vm: buildDiagnostico(crudo.seed, new Date()) };
    } catch {
      // Semilla v1 o hueca (sin SISEC): calculadora no disponible.
      return { autenticado: true, real: false, vm: null, motivo: 'semilla_invalida' };
    }
  }

  // Sin login → demo público (preview). Con login pero sin ficha/semilla →
  // "calculadora aún no lista" (vm null), nunca el demo.
  if (crudo.error === 'sin_sesion') {
    return { autenticado: false, real: false, vm: buildDiagnostico(SEED_DEMO, HOY_DEMO), motivo: 'sin_sesion' };
  }
  return { autenticado: true, real: false, vm: null, motivo: crudo.error };
}

/** Semilla v2 parseada del cliente autenticado (para la calculadora pro). null si no hay. */
export async function getSemillaV2Cliente(): Promise<SemillaV2 | null> {
  let crudo: Awaited<ReturnType<typeof getSemillaCruda>>;
  try {
    crudo = await getSemillaCruda();
  } catch {
    return null;
  }
  if (!('seed' in crudo)) return null;
  return parseSemillaV2(crudo.seed);
}

/** ¿El cliente ya desbloqueó (orden cumplida) el producto dado? RLS limita a sus filas. */
export async function tieneProducto(code: string): Promise<boolean> {
  try {
    const supabase = createClient();
    const { data } = await supabase
      .from('ordenes_b2c')
      .select('id')
      .eq('product_code', code)
      .eq('estado', 'cumplida')
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}
