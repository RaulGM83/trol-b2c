import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { legalMdToHtml } from '@/lib/legal-md';

// Aviso de privacidad versionado en trol3.documentos_legales (lectura pública
// por la función trol3.legal_vigente). Publicar una versión nueva = insertar una
// fila con publicado = true y vigente_desde; esta página la toma sola (ISR 5 min).
// Versiones anteriores: /privacidad?v=<version>.
export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Aviso de Privacidad · El Trol Financiero',
  description: 'Aviso de Privacidad de El Trol Financiero, S.A.P.I. de C.V.',
  alternates: { canonical: 'https://trol.mx/privacidad' },
};

type Doc = {
  version: string;
  titulo: string;
  contenido_md: string;
  vigente_desde: string;
  versiones: { version: string; vigente_desde: string }[] | null;
};

async function cargar(version?: string): Promise<Doc | null> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await db
    .schema('trol3')
    .rpc('legal_vigente', { p_tipo: 'aviso_privacidad', p_version: version ?? null });
  if (error || !data) return null;
  return data as Doc;
}

const fecha = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

const PROSA =
  '[&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-extrabold ' +
  '[&_h3]:mt-6 [&_h3]:font-bold ' +
  '[&_p]:mt-3 [&_p]:leading-relaxed [&_strong]:font-semibold ' +
  '[&_a]:font-medium [&_a]:underline ' +
  '[&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm ' +
  '[&_th]:border [&_th]:border-line [&_th]:bg-cream [&_th]:px-3 [&_th]:py-2 [&_th]:text-left ' +
  '[&_td]:border [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_td]:align-top';

export default async function Privacidad({ searchParams }: { searchParams: { v?: string } }) {
  const doc = await cargar(searchParams.v);
  const vigente = searchParams.v ? await cargar() : doc;
  const esHistorica = !!doc && !!vigente && doc.version !== vigente.version;

  return (
    <>
      <section className="bg-ink text-white">
        <div className="mx-auto max-w-3xl px-5 py-12">
          <p className="text-sm text-white/70">El Trol Financiero, S.A.P.I. de C.V.</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-tight">Aviso de Privacidad</h1>
          {doc && (
            <p className="mt-3 text-sm text-white/70">
              {esHistorica ? 'Versión anterior, vigente desde el ' : 'Última actualización: '}
              {fecha(doc.vigente_desde)}
            </p>
          )}
        </div>
      </section>
      <article className="mx-auto max-w-3xl overflow-x-hidden px-5 py-10">
        {esHistorica && (
          <p className="mb-6 rounded-2xl bg-white p-4 text-sm">
            Estás viendo una versión anterior.{' '}
            <Link href="/privacidad" className="font-semibold underline">
              Ver la versión vigente
            </Link>
          </p>
        )}
        {doc ? (
          <div className={PROSA} dangerouslySetInnerHTML={{ __html: legalMdToHtml(doc.contenido_md) }} />
        ) : (
          <p>
            No pudimos cargar el aviso en este momento. Escríbenos a{' '}
            <a href="mailto:raul@trol.mx" className="underline">raul@trol.mx</a> y te lo enviamos.
          </p>
        )}
        {vigente?.versiones && vigente.versiones.length > 1 && (
          <div className="mt-12 border-t border-line pt-6 text-sm">
            <p className="font-semibold">Versiones anteriores</p>
            <ul className="mt-2 space-y-1">
              {vigente.versiones
                .filter((x) => x.version !== vigente.version)
                .map((x) => (
                  <li key={x.version}>
                    <Link href={`/privacidad?v=${encodeURIComponent(x.version)}`} className="underline">
                      Vigente desde el {fecha(x.vigente_desde)}
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </article>
    </>
  );
}
