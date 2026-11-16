import Link from 'next/link';
import { requireMiembro, t3, fmtFecha, type Any } from '@/lib/trol3/server';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Contenido del sitio · Trol' };

const TIPO: Record<string, string> = { articulo: 'Artículo', guia: 'Guía' };
const PILAR: Record<string, string> = { pensiones: 'Pensiones', infonavit: 'Infonavit', marca: 'Marca' };

export default async function ContenidoLista() {
  await requireMiembro();
  const { data } = await t3()
    .from('contenidos')
    .select('id,tipo,pilar,slug,titulo,autor,estado,publicado_en,updated_at,requiere_revision_legal,codigo_atribucion')
    .order('estado', { ascending: true })
    .order('updated_at', { ascending: false });
  const filas = (data ?? []) as Any[];
  const borradores = filas.filter((f) => f.estado === 'borrador');
  const publicados = filas.filter((f) => f.estado === 'publicado');

  const Tabla = ({ items, vacio }: { items: Any[]; vacio: string }) =>
    items.length === 0 ? (
      <p className="rounded-2xl border border-line bg-white p-5 text-sm text-muted">{vacio}</p>
    ) : (
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-cream text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2">Título</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Pilar</th>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2">Autor</th>
              <th className="px-3 py-2">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {items.map((f) => (
              <tr key={f.id} className="border-t border-line">
                <td className="px-3 py-2">
                  <Link href={`/trabajo/contenido/${f.id}`} className="font-semibold underline">{f.titulo}</Link>
                  {f.requiere_revision_legal ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Revisión de fondo</span> : null}
                  <div className="text-xs text-muted">/{f.slug}</div>
                </td>
                <td className="px-3 py-2">{TIPO[f.tipo] ?? f.tipo}</td>
                <td className="px-3 py-2">{PILAR[f.pilar] ?? f.pilar}</td>
                <td className="px-3 py-2 text-xs">{f.codigo_atribucion ?? <span className="text-muted">—</span>}</td>
                <td className="px-3 py-2">{f.autor}</td>
                <td className="px-3 py-2 text-xs">{fmtFecha(f.estado === 'publicado' ? f.publicado_en : f.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Contenido del sitio</h1>
        <p className="mt-1 text-sm text-muted">
          Artículos y guías de trol.mx. Los borradores llegan del proyecto de Campañas y redes; aquí se revisan y se publican. Lo publicado aparece en el sitio en unos minutos, sin despliegue.
        </p>
      </div>
      <section>
        <h2 className="mb-2 font-bold">Por revisar ({borradores.length})</h2>
        <Tabla items={borradores} vacio="No hay borradores por revisar." />
      </section>
      <section>
        <h2 className="mb-2 font-bold">Publicado ({publicados.length})</h2>
        <Tabla items={publicados} vacio="Todavía no hay contenido publicado desde aquí. Los artículos anteriores del blog siguen en el sitio." />
      </section>
    </div>
  );
}
