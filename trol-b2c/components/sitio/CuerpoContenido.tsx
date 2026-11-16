// Cuerpo de un artículo o guía de trol3.contenidos: fecha y autor visibles,
// texto en Markdown, preguntas frecuentes y el botón a WhatsApp con su código.
// Lo usan la página pública y la vista previa de /trabajo/contenido.
import { mdToHtml } from '@/lib/blog/md';
import { fechaLarga, preguntasDe, type Contenido } from '@/lib/blog/contenido';

export const PROSA =
  '[&_h1]:mt-8 [&_h1]:text-2xl [&_h1]:font-extrabold ' +
  '[&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-extrabold ' +
  '[&_h3]:mt-6 [&_h3]:font-bold [&_h4]:mt-5 [&_h4]:font-semibold ' +
  '[&_p]:mt-3 [&_p]:leading-relaxed [&_strong]:font-semibold ' +
  '[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1 ' +
  '[&_a]:font-medium [&_a]:underline ' +
  '[&_code]:rounded [&_code]:bg-cream [&_code]:px-1 [&_code]:text-sm ' +
  '[&_hr]:my-8 [&_hr]:border-line ' +
  '[&_blockquote]:my-5 [&_blockquote]:rounded-2xl [&_blockquote]:bg-cream [&_blockquote]:p-5 [&_blockquote]:text-sm ' +
  '[&_table]:my-5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm ' +
  '[&_th]:border [&_th]:border-line [&_th]:bg-cream [&_th]:px-3 [&_th]:py-2 [&_th]:text-left ' +
  '[&_td]:border [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_td]:align-top';

const CTA: Record<string, { titulo: string; texto: string; boton: string; codigo: string }> = {
  pensiones: {
    titulo: '¿Quieres saber cómo aplica en tu caso?',
    texto: 'Tu diagnóstico con tus datos del IMSS es gratis y llega a tu WhatsApp.',
    boton: 'Recibe tu diagnóstico gratis',
    codigo: 'blog',
  },
  infonavit: {
    titulo: '¿Cuánto te presta Infonavit y qué puedes comprar?',
    texto: 'Te armamos tu cotización por WhatsApp, sin costo.',
    boton: 'Pide tu cotización',
    codigo: 'sitio_inf',
  },
};

export function CuerpoContenido({ c }: { c: Contenido }) {
  const qs = preguntasDe(c);
  const cta = CTA[c.pilar] ?? CTA.pensiones;
  const publicado = fechaLarga(c.publicado_en);
  const actualizado = fechaLarga(c.actualizado_en);
  return (
    <article className="mx-auto max-w-3xl overflow-x-hidden px-5 py-10">
      <p className="text-sm text-muted">
        Por{' '}
        {/^Raúl Gallego/i.test(c.autor) ? (
          <a href="/equipo/raul-gallego-muller" className="font-semibold text-ink underline">{c.autor}</a>
        ) : (
          <span className="font-semibold text-ink">{c.autor}</span>
        )}
        {publicado ? <> · Publicado el {publicado}</> : null}
        {actualizado && actualizado !== publicado ? <> · Actualizado el {actualizado}</> : null}
      </p>
      {c.resumen ? <p className="mt-4 text-lg leading-relaxed">{c.resumen}</p> : null}
      <div className={PROSA} dangerouslySetInnerHTML={{ __html: mdToHtml(c.cuerpo_md) }} />
      {qs.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-extrabold">Preguntas frecuentes</h2>
          <div className="mt-3 divide-y divide-line rounded-2xl border border-line bg-white">
            {qs.map((q, i) => (
              <div key={i} className="p-5">
                <h3 className="font-bold">{q.pregunta}</h3>
                <div className={PROSA} dangerouslySetInnerHTML={{ __html: mdToHtml(q.respuesta) }} />
              </div>
            ))}
          </div>
        </section>
      )}
      <div className="mt-12 rounded-2xl bg-ink p-6 text-center text-white">
        <h2 className="text-xl font-extrabold">{cta.titulo}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-white/70">{cta.texto}</p>
        <a
          href={`/i/${c.codigo_atribucion || cta.codigo}${c.pilar === 'infonavit' ? '?l=inf' : ''}`}
          className="mt-4 inline-block rounded-full bg-lime px-6 py-3 font-semibold text-ink hover:opacity-90"
        >
          {cta.boton}
        </a>
      </div>
    </article>
  );
}
