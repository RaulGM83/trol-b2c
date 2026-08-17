import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { EmailOtpType } from '@supabase/supabase-js';

// Callback de magic link / OAuth.
// - PKCE (`code`): requiere que el enlace se abra en el MISMO navegador donde se pidió (el verifier vive en cookie).
// - `token_hash` + `type`: funciona desde cualquier navegador/dispositivo (plantilla de correo con {{ .TokenHash }}).
// Si falla, regresa al login con el motivo en vez de dejar al usuario en un bucle silencioso.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const nextRaw = url.searchParams.get('next') ?? '/trabajo';
  const next = nextRaw.startsWith('/') ? nextRaw : '/trabajo';
  const loginPath = next.startsWith('/mi') ? '/mi' : '/trabajo/login';

  const supabase = createClient();
  let error: string | null = null;
  if (tokenHash && type) {
    const r = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    error = r.error?.message ?? null;
  } else if (code) {
    const r = await supabase.auth.exchangeCodeForSession(code);
    error = r.error?.message ?? null;
  } else {
    error = 'Enlace incompleto.';
  }
  if (error) {
    const dest = new URL(loginPath, url.origin);
    dest.searchParams.set('error', mensaje(error));
    return NextResponse.redirect(dest);
  }
  return NextResponse.redirect(new URL(next, url.origin));
}

function mensaje(e: string) {
  const s = e.toLowerCase();
  if (s.includes('code verifier') || s.includes('pkce') || s.includes('code challenge')) return 'Abre el enlace en el mismo navegador donde pediste el acceso (o pide uno nuevo desde este navegador).';
  if (s.includes('expired') || s.includes('invalid') || s.includes('not found')) return 'El enlace ya se usó o caducó. Pide uno nuevo y ábrelo una sola vez.';
  return e;
}
