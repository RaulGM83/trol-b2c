import { createClient } from '@supabase/supabase-js';

// Cliente con service role para escrituras de servidor (webhooks, fulfillment)
// que deben saltar RLS de forma controlada. SOLO servidor — nunca en el cliente.
// Requiere SUPABASE_SERVICE_ROLE_KEY en .env.local (secreto).
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
