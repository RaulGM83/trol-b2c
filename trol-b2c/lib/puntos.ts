// ============================================================================
// Economía de puntos (Plan Maestro §6). Ancla: 1 punto = 1 peso de desbloqueo.
// Saldo real desde Supabase (RPC saldo_puntos); el gasto se hace con el RPC
// desbloquear_con_puntos (atómico, SECURITY DEFINER). Caducidad 6 meses.
// ============================================================================

import { createClient } from './supabase/server';

/** Formas de ganar puntos (info estática para la UI). */
export const GANAR_PUNTOS = [
  { motivo: 'Refiere a alguien que llega a su diagnóstico', puntos: 40 },
  { motivo: 'Refiere a alguien que contrata', puntos: 80 },
  { motivo: 'Contesta la encuesta', puntos: 20 },
];

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
