// Contenido del sitio guardado en trol3.contenidos (313): artículos del blog y
// guías de los pilares. Se publica desde /trabajo/contenido, sin despliegue.
// Lectura pública con la llave anónima: el RLS sólo deja ver lo publicado.
import { createClient } from '@supabase/supabase-js';

export type Pregunta = { pregunta: string; respuesta: string };

export type Contenido = {
  id: string;
  tipo: 'articulo' | 'guia';
  pilar: 'pensiones' | 'infonavit' | 'marca';
  slug: string;
  titulo: string;
  resumen: string;
  cuerpo_md: string;
  autor: string;
  preguntas: Pregunta[];
  codigo_atribucion: string | null;
  estado: 'borrador' | 'publicado';
  publicado_en: string | null;
  actualizado_en: string | null;
  requiere_revision_legal: boolean;
  notas: string | null;
  created_at: string;
  updated_at: string;
};

export const CAMPOS_PUBLICOS =
  'id,tipo,pilar,slug,titulo,resumen,cuerpo_md,autor,preguntas,codigo_atribucion,estado,publicado_en,actualizado_en';

function anon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  }).schema('trol3');
}

export const preguntasDe = (c: { preguntas?: unknown }): Pregunta[] =>
  Array.isArray(c.preguntas)
    ? (c.preguntas as Pregunta[]).filter((q) => q && typeof q.pregunta === 'string' && typeof q.respuesta === 'string' && q.pregunta.trim() && q.respuesta.trim())
    : [];

/** Artículos publicados, del más reciente al más antiguo. Si la base falla, lista vacía: el blog no se cae. */
export async function articulosPublicados(): Promise<Contenido[]> {
  try {
    const { data, error } = await anon()
      .from('contenidos')
      .select(CAMPOS_PUBLICOS)
      .eq('estado', 'publicado')
      .eq('tipo', 'articulo')
      .order('publicado_en', { ascending: false });
    if (error || !data) return [];
    return data as unknown as Contenido[];
  } catch {
    return [];
  }
}

export async function publicadoPorSlug(slug: string, tipo: 'articulo' | 'guia' = 'articulo'): Promise<Contenido | null> {
  try {
    const { data, error } = await anon()
      .from('contenidos')
      .select(CAMPOS_PUBLICOS)
      .eq('estado', 'publicado')
      .eq('tipo', tipo)
      .eq('slug', slug)
      .maybeSingle();
    if (error || !data) return null;
    return data as unknown as Contenido;
  } catch {
    return null;
  }
}

export const fechaLarga = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' }) : '';

/** Datos estructurados (schema.org) del artículo y de sus preguntas frecuentes. */
export function datosEstructurados(c: Contenido, url: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: c.titulo,
      description: c.resumen,
      mainEntityOfPage: url,
      datePublished: c.publicado_en,
      dateModified: c.actualizado_en ?? c.publicado_en,
      author: { '@type': c.autor === 'Equipo Trol' ? 'Organization' : 'Person', name: c.autor },
      publisher: { '@type': 'Organization', name: 'El Trol Financiero', url: 'https://trol.mx' },
      inLanguage: 'es-MX',
    },
  ];
  const qs = preguntasDe(c);
  if (qs.length) {
    out.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: qs.map((q) => ({ '@type': 'Question', name: q.pregunta, acceptedAnswer: { '@type': 'Answer', text: q.respuesta } })),
    });
  }
  return out;
}
