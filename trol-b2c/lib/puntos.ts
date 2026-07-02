// ============================================================================
// Economía de puntos (Plan Maestro §6). Ancla: 1 punto = 1 peso de desbloqueo.
// Saldo real desde Supabase (RPC saldo_puntos); el gasto se hace con el RPC
// desbloquear_con_puntos (atómico, SECURITY DEFINER). Caducidad 6 meses.
// ============================================================================

import { createClient } from './supabase/server';

/** Formas de ganar puntos (info estática para la UI — valores REALES del backend). */
export const GANAR_PUNTOS = [
  { motivo: 'Entra a tu diagnóstico (bienvenida)', puntos: 20, href: '/diagnostico' },
  { motivo: 'Evalúa tu AFORE (encuesta)', puntos: 50, href: '/encuesta' },
  { motivo: 'Invita a un amigo que llegue a su diagnóstico', puntos: 100, href: '/referidos' },
];

/** Estado de la misión "Activa tu plan" (RPC estado_mision). */
export interface EstadoMision {
  saldo: number;
  bienvenida: boolean;
  encuesta: boolean;
  referidos: number;
}

/** Otorga el bono de bienvenida (+20, idempotente) y fija etapa >= 1. */
export async function otorgarBienvenida(): Promise<{ otorgado: boolean; puntos: number }> {
  try {
    const supabase = createClient();
    const { data } = await supabase.rpc('otorgar_bienvenida');
    const r = data as { ok?: boolean; otorgado?: boolean; puntos?: number } | null;
    return { otorgado: !!r?.otorgado, puntos: r?.puntos ?? 0 };
  } catch {
    return { otorgado: false, puntos: 0 };
  }
}

/** Estado de la misión para el cliente autenticado (null si no hay ficha). */
export async function getEstadoMision(): Promise<EstadoMision | null> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('estado_mision');
    const r = data as
      | { ok?: boolean; saldo?: number; bienvenida?: boolean; encuesta?: boolean; referidos?: number }
      | null;
    if (error || !r?.ok) return null;
    return {
      saldo: r.saldo ?? 0,
      bienvenida: !!r.bienvenida,
      encuesta: !!r.encuesta,
      referidos: r.referidos ?? 0,
    };
  } catch {
    return null;
  }
}

/** Saldo de puntos del cliente autenticado (0 si no hay sesión/ficha). */
export async function getSaldoPuntos(): Promise<number> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('saldo_puntos');
    if (error || typeof data !== 'number') return 0;
    return data;
  } catch {
    return 0;
  }
}

export function alcanzaPuntos(saldo: number, precioMXN: number): boolean {
  return saldo >= precioMXN;
}
