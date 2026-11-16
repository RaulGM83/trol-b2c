// Metadatos para redes (Open Graph y Twitter) de cada página del sitio. Sin esto
// las páginas heredan los de la app, que hablan del diagnóstico de pensión.
import type { Metadata } from 'next';

export function metaSitio(x: { titulo: string; descripcion: string; ruta: string; imagen?: string }): Metadata {
  const url = `https://trol.mx${x.ruta === '/' ? '' : x.ruta}`;
  const images = x.imagen ? [{ url: x.imagen }] : undefined;
  return {
    title: x.titulo,
    description: x.descripcion,
    alternates: { canonical: url },
    openGraph: { type: 'website', siteName: 'El Trol Financiero', locale: 'es_MX', url, title: x.titulo, description: x.descripcion, images },
    twitter: { card: x.imagen ? 'summary_large_image' : 'summary', title: x.titulo, description: x.descripcion, images: x.imagen ? [x.imagen] : undefined },
  };
}
