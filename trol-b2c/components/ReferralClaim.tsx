'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// Si el usuario llegó por un link de referido (cookie trol_ref) y ya está
// autenticado, registra el vínculo y otorga puntos cuando hay diagnóstico.
// Idempotente del lado del RPC; limpia la cookie solo al confirmarse.
export function ReferralClaim() {
  useEffect(() => {
    const m = document.cookie.match(/(?:^|; )trol_ref=([^;]+)/);
    if (!m) return;
    const codigo = decodeURIComponent(m[1]);
    const supabase = createClient();
    supabase.rpc('registrar_referido', { p_codigo: codigo }).then(({ data }) => {
      const r = data as { ok?: boolean; otorgado?: boolean } | null;
      // Limpia la cookie cuando ya se otorgó (o si el código era inválido/auto).
      if (r?.otorgado) document.cookie = 'trol_ref=; Max-Age=0; path=/';
    });
  }, []);
  return null;
}
