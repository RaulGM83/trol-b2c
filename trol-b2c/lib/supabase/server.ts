import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieToSet = { name: string; value: string; options: CookieOptions };

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/** Cliente Supabase para Server Components / route handlers (lectura con RLS). */
export function createClient() {
  const cookieStore = cookies();
  return createServerClient(URL, KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(list: CookieToSet[]) {
        try {
          list.forEach(({ name, value, options }) => cookieStore.set({ name, value, ...options }));
        } catch {
          // Llamado desde un Server Component sin response mutable: lo refresca el middleware.
        }
      },
    },
  });
}
