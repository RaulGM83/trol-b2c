// Inmuebles del catálogo que se muestran en trol.mx/infonavit (314).
// Se leen de la función trol3.inmuebles_sitio(), que sólo expone lo que va en las
// fichas (nada de costos ni comisiones). Disponibles primero; los agotados que
// salen son los marcados con mostrar_agotado en el catálogo.
import { createClient } from '@supabase/supabase-js';

export type Inmueble = {
  clave: number;
  slug: string;
  nombre: string;
  ubicacion: string;
  m2: number | null;
  precio: number;
  renta: number | null;
  renta_estimada: boolean;
  disponible: boolean;
  ficha_url: string | null;
  actualizado: string | null;
};

export async function inmueblesSitio(): Promise<Inmueble[]> {
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const { data, error } = await db.schema('trol3').rpc('inmuebles_sitio');
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      clave: Number(r.clave),
      slug: String(r.slug),
      nombre: String(r.nombre),
      ubicacion: String(r.ubicacion),
      m2: r.m2 == null ? null : Number(r.m2),
      precio: Number(r.precio),
      renta: r.renta == null ? null : Number(r.renta),
      renta_estimada: Boolean(r.renta_estimada),
      disponible: Boolean(r.disponible),
      ficha_url: (r.ficha_url as string | null) ?? null,
      actualizado: (r.actualizado as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}

export const pesos = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);

/** Rendimiento bruto anual: renta de 12 meses entre el precio. */
export const rendimientoBruto = (i: Pick<Inmueble, 'renta' | 'precio'>) =>
  i.renta && i.precio ? `${((i.renta * 12 * 100) / i.precio).toFixed(1)}%` : null;
