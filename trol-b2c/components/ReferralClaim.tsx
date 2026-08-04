'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

// Acredita los puntos de referido (+100 al referidor / +50 al referido) cuando
// el cliente llega a etapa 1 (diagnóstico real). Solo se monta con semilla real
// — ver app/diagnostico/page.tsx.
//
// Dos vías, porque el vínculo puede haberse creado por cualquiera de las dos:
//  1. `otorgar_puntos_referido()` — resuelve el referidor desde `referidos`, sin
//     cookie. Cubre el caso en que el vínculo lo creó el trigger de atribución
//     al registrarse el lead (WhatsApp abrió el link en otro navegador, etc.).
//  2. `registrar_referido(codigo)` — solo si la cookie sigue ahí. Crea el
//     vínculo cuando no existía y acredita en el mismo paso.
//
// Ambas son idempotentes y la segunda no duplica lo que hizo la primera: el
// hito se cierra con un UPDATE condicionado sobre `puntos_etapa1_otorgados`.
export function ReferralClaim() {
  useEffect(() => {
    const supabase = createClient();

    (async () => {
      // 1) Vía sin cookie. Si el RPC aún no existe (migración sin aplicar), el
      //    error se ignora y queda la vía 2 como estaba antes.
      let otorgado = false;
      try {
        const { data } = await supabase.rpc('otorgar_puntos_referido');
        otorgado = !!(data as { otorgado?: boolean } | null)?.otorgado;
      } catch {
        /* migración pendiente */
      }

      // 2) Vía cookie: necesaria mientras el vínculo no exista en la tabla.
      const m = document.cookie.match(/(?:^|; )trol_ref=([^;]+)/);
      if (!m) return;
      const codigo = decodeURIComponent(m[1]);

      if (!otorgado) {
        const { data } = await supabase.rpc('registrar_referido', { p_codigo: codigo });
        otorgado = !!(data as { otorgado?: boolean } | null)?.otorgado;
      }

      // La cookie se limpia solo al confirmarse el hito (o si el código era
      // inválido/auto-referido, donde `registrar_referido` nunca otorgará).
      if (otorgado) document.cookie = 'trol_ref=; Max-Age=0; path=/';
    })();
  }, []);

  return null;
}
