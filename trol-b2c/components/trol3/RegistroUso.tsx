'use client';
// 309 · Medición de uso de /trabajo (claude/122): registra una vista cada vez que cambia la ruta o
// la pestaña (no en cada recarga). Va directo a Supabase con la sesión del asesor; si falla, no pasa nada.
import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function registrarUso(ruta: string, tab: string | null, accion = 'vista') {
  try {
    void createClient().schema('trol3').rpc('registrar_uso', { p_ruta: ruta, p_tab: tab, p_accion: accion }).then(() => undefined, () => undefined);
  } catch { /* la medición nunca rompe la pantalla */ }
}

export function RegistroUso() {
  const ruta = usePathname();
  const tab = useSearchParams().get('tab');
  const ultimo = useRef('');
  useEffect(() => {
    if (!ruta) return;
    const clave = `${ruta}?${tab ?? ''}`;
    if (ultimo.current === clave) return;
    ultimo.current = clave;
    registrarUso(ruta, tab);
  }, [ruta, tab]);
  return null;
}
