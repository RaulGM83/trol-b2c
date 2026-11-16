import type { Metadata } from 'next';
import { PaginaGuia, metadataGuia } from '@/components/sitio/PaginaGuia';

export const revalidate = 300;

export function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  return metadataGuia('pensiones', params.slug);
}

export default function Guia({ params }: { params: { slug: string } }) {
  return <PaginaGuia pilar="pensiones" slug={params.slug} />;
}
