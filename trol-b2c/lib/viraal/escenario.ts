// ============================================================================
// Escritura del snapshot de escenario autorizado.
//
// La única puerta de entrada a `trol3.escenarios` es la RPC
// `trol3.autorizar_escenario` (security definer): la tabla no tiene política de
// INSERT y `authenticated` no tiene el privilegio. Aquí sólo se arma la llamada.
//
// El cliente entra por parámetro para que el test pueda pasar uno falso: la app
// no tiene forma de correr Supabase en pruebas.
// ============================================================================

import type { SnapshotEscenario } from '@/lib/viraal/snapshot';

/**
 * Lo mínimo que se le pide a un cliente de Supabase para escribir esto.
 *
 * `PromiseLike` y no `Promise` porque `supabase.rpc()` devuelve un builder
 * thenable, no una promesa: pedir `Promise` deja fuera al cliente real.
 */
export interface ClienteRpcEscenario {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Un escenario cuelga de un expediente (persona) o de una consulta de aliado,
 * nunca de los dos: son los dos contextos desde los que autoriza la Mesa Viraal.
 */
export type SujetoEscenario =
  | { personaId: string; consultaAliadoId?: undefined }
  | { consultaAliadoId: string; personaId?: undefined };

export type ResultadoAutorizacion =
  | { ok: true; id: string }
  | { ok: false; error: string };

/**
 * Guarda el snapshot y devuelve el id de la fila creada.
 *
 * Cada llamada crea una fila NUEVA. No hay upsert ni update: reautorizar el
 * mismo caso con otra fecha de trámite deja dos filas, que es justo lo que se
 * quiere poder auditar después.
 */
export async function guardarEscenarioAutorizado(
  db: ClienteRpcEscenario,
  sujeto: SujetoEscenario,
  snapshot: SnapshotEscenario,
): Promise<ResultadoAutorizacion> {
  const { data, error } = await db.rpc('autorizar_escenario', {
    p_persona: sujeto.personaId ?? null,
    p_consulta_aliado: sujeto.consultaAliadoId ?? null,
    // Los tres objetos van TAL CUAL salieron de construirSnapshot. Si aquí se
    // re-derivara algo, el PDF y la fila podrían dejar de coincidir.
    p_inputs: snapshot.inputs,
    p_resultado: snapshot.resultado,
    p_ventana: snapshot.ventana,
    p_tipo: 'autorizacion',
  });
  if (error) return { ok: false, error: error.message };
  if (typeof data !== 'string' || !data) {
    return { ok: false, error: 'la RPC no devolvió el id del escenario' };
  }
  return { ok: true, id: data };
}
