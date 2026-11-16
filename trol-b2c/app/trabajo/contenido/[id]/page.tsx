import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMiembro, t3 } from '@/lib/trol3/server';
import { preguntasDe, rutaDe, type Contenido } from '@/lib/blog/contenido';
import { CuerpoContenido } from '@/components/sitio/CuerpoContenido';
import { ContenidoEditor } from '@/components/trol3/ContenidoEditor';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Contenido · Trol' };

export default async function ContenidoDetalle({ params }: { params: { id: string } }) {
  const m = await requireMiembro();
  const { data } = await t3().from('contenidos').select('*').eq('id', params.id).maybeSingle();
  if (!data) notFound();
  const c = { ...(data as Contenido), preguntas: preguntasDe(data as Contenido) };
  const admin = (m.roles ?? []).includes('admin');
  // Artículos en /blog; guías dentro de su pilar (/pensiones o /infonavit).
  const urlPublica = `https://trol.mx${rutaDe(c)}`;

  return (
    <div className="space-y-6">
      <Link href="/trabajo/contenido" className="text-sm text-muted underline">← Contenido del sitio</Link>
      <ContenidoEditor c={c} admin={admin} urlPublica={urlPublica} />
      <section>
        <h2 className="mb-2 font-bold">Vista previa</h2>
        <div className="overflow-hidden rounded-2xl border border-line bg-cream">
          <div className="bg-ink text-white">
            <div className="mx-auto max-w-3xl px-5 py-10">
              <h1 className="text-3xl font-extrabold leading-tight">{c.titulo}</h1>
            </div>
          </div>
          <CuerpoContenido c={c} />
        </div>
      </section>
    </div>
  );
}
