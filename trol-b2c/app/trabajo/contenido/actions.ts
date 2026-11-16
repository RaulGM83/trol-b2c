'use server';
// 313 · Contenido del sitio. Guardar lo puede cualquier miembro mientras sea borrador;
// publicar, despublicar o tocar lo publicado sólo un administrador (lo impone el
// candado tg_contenidos_candado en la base; aquí sólo se traduce el error).
import { revalidatePath } from 'next/cache';
import { t3, requireMiembro, type Any } from '@/lib/trol3/server';

const ok = (extra: Record<string, unknown> = {}) => ({ ok: true as const, ...extra });
const fail = (e: unknown) => {
  const m = e instanceof Error ? e.message : String((e as Any)?.message ?? e);
  if (/contenido_publicado|solo_borrador/.test(m)) return { ok: false as const, error: 'Sólo un administrador publica o cambia contenido publicado.' };
  if (/contenidos_slug_key|duplicate key/.test(m)) return { ok: false as const, error: 'Ya existe otro contenido con esa dirección (slug).' };
  if (/contenidos_slug_check/.test(m)) return { ok: false as const, error: 'La dirección (slug) sólo lleva minúsculas, números y guiones.' };
  return { ok: false as const, error: m };
};

function refrescar(slug?: string | null) {
  revalidatePath('/trabajo/contenido');
  revalidatePath('/sitio/blog');
  if (slug) revalidatePath(`/sitio/blog/${slug}`);
}

export type CamposContenido = {
  titulo: string;
  resumen: string;
  cuerpo_md: string;
  autor: string;
  slug: string;
  codigo_atribucion: string;
  actualizado_en: string; // AAAA-MM-DD o vacío
  preguntas: { pregunta: string; respuesta: string }[];
};

export async function guardarContenido(id: string, campos: CamposContenido) {
  await requireMiembro();
  if (!campos.titulo.trim()) return fail('El título no puede quedar vacío.');
  if (!campos.slug.trim()) return fail('Falta la dirección (slug).');
  const cambio = {
    titulo: campos.titulo.trim(),
    resumen: campos.resumen.trim(),
    cuerpo_md: campos.cuerpo_md,
    autor: campos.autor.trim() || 'Equipo Trol',
    slug: campos.slug.trim().toLowerCase(),
    codigo_atribucion: campos.codigo_atribucion.trim() || null,
    actualizado_en: campos.actualizado_en ? `${campos.actualizado_en}T12:00:00-06:00` : null,
    preguntas: (campos.preguntas ?? []).filter((q) => q.pregunta.trim() && q.respuesta.trim()).map((q) => ({ pregunta: q.pregunta.trim(), respuesta: q.respuesta.trim() })),
  };
  const { data, error } = await t3().from('contenidos').update(cambio).eq('id', id).select('slug');
  if (error) return fail(error);
  if (!data?.length) return fail('No se guardó: no existe o no tienes permiso.');
  refrescar(data[0].slug as string);
  return ok();
}

export async function cambiarEstadoContenido(id: string, estado: 'publicado' | 'borrador') {
  const m = await requireMiembro();
  if (!(m.roles ?? []).includes('admin')) return fail('Sólo un administrador publica.');
  const { data, error } = await t3().from('contenidos').update({ estado }).eq('id', id).select('slug');
  if (error) return fail(error);
  if (!data?.length) return fail('No se cambió: no existe o no tienes permiso.');
  refrescar(data[0].slug as string);
  return ok();
}
