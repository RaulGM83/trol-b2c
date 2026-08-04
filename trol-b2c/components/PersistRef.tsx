'use client';

import { useEffect } from 'react';

/**
 * Persiste en cookie el código del referidor que llega por URL.
 *
 * Vive en cliente porque un Server Component no puede escribir cookies en
 * Next 14 (`cookies().set()` solo funciona en Server Actions y Route
 * Handlers; desde una página lanza y devuelve 500).
 *
 * La cookie es el respaldo: la fuente primaria es el parámetro en la URL, que
 * `/api/lead` recibe directo y ancla server-side sin depender del navegador.
 */
export function PersistRef({ codigo }: { codigo: string }) {
  useEffect(() => {
    if (!codigo) return;
    const seguro = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      `trol_ref=${encodeURIComponent(codigo)}` +
      `; Max-Age=${60 * 60 * 24 * 30}; path=/; SameSite=Lax${seguro}`;
  }, [codigo]);

  return null;
}
