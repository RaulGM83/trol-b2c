import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Resuelve la fila legacy `clientes` del usuario autenticado para cobrar.
 *
 * El vínculo directo (clientes.auth_user_id) sólo lo deja puesto el flujo de
 * magic link (/m). Quien entra con SMS queda vinculado en trol3.personas
 * (vincular_sesion), así que aquí se resuelve por esa vía y de paso se sella
 * clientes.auth_user_id para la próxima.
 */
export async function clienteDePago(
  admin: SupabaseClient,
  userId: string,
): Promise<{ id: string; nombre: string | null } | null> {
  const { data: directo } = await admin
    .from('clientes')
    .select('id, nombre')
    .eq('auth_user_id', userId)
    .limit(1)
    .maybeSingle();
  if (directo) return directo as { id: string; nombre: string | null };

  const { data: per } = await admin
    .schema('trol3')
    .from('personas')
    .select('legacy_cliente_id')
    .eq('auth_user_id', userId)
    .is('merged_into', null)
    .not('legacy_cliente_id', 'is', null)
    .limit(1)
    .maybeSingle();
  const cid = (per?.legacy_cliente_id as string | null) ?? null;
  if (!cid) return null;

  try {
    await admin.from('clientes').update({ auth_user_id: userId }).eq('id', cid).is('auth_user_id', null);
  } catch {
    /* best-effort */
  }
  const { data: cli } = await admin.from('clientes').select('id, nombre').eq('id', cid).maybeSingle();
  return (cli as { id: string; nombre: string | null } | null) ?? null;
}
