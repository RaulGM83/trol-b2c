import type { Metadata } from 'next';
import Link from 'next/link';
import { guiasPublicadas } from '@/lib/blog/contenido';
import { Hero, Seccion, Preguntas, TarjetaGuia, CierreWhatsApp, JsonLd, botonLima, botonClaro, type Faq } from '@/components/sitio/Bloques';

// Pilar de pensiones. Las guías salen de trol3.contenidos (tipo guia, pilar
// pensiones) y aparecen solas al publicarse (ISR 5 min).
export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Tu pensión del IMSS: cuánto te toca y cómo mejorarla · El Trol Financiero',
  description:
    'Qué determina tu pensión del IMSS (ley, semanas, salario y edad), qué puedes mover hoy y guías claras de Ley 73, Ley 97, Modalidad 40 y AFORE.',
  alternates: { canonical: 'https://trol.mx/pensiones' },
};

const DATOS = [
  { t: 'Tu ley', d: 'Ley 73 si empezaste a cotizar antes del 1 de julio de 1997; Ley 97 si empezaste después. Cambia por completo cómo se calcula tu pensión.' },
  { t: 'Tus semanas', d: 'Las semanas cotizadas que el IMSS te reconoce. Definen si ya tienes derecho y, en Ley 73, cuánto sube tu pensión.' },
  { t: 'Tu salario', d: 'En Ley 73 cuenta el promedio de tus últimos cinco años cotizados. En Ley 97 cuenta lo que acumulaste en tu AFORE.' },
  { t: 'Tu edad', d: 'Puedes pensionarte desde los 60 años. Cada año que esperas hasta los 65 mejora el monto.' },
];

const PALANCAS = [
  { t: 'Edad de retiro', d: 'En Ley 73, a los 60 recibes 75% de tu pensión y sube 5 puntos por año hasta 100% a los 65.' },
  { t: 'Modalidad 40', d: 'Sigue existiendo, pero cambió el 21 de octubre de 2026: ya no se pagan periodos hacia atrás y el salario con el que puedes cotizar tiene un tope ligado a tu último salario.' },
  { t: 'Modalidad 10', d: 'Para quien trabaja por su cuenta: cotizas de forma voluntaria y sumas semanas con servicio médico.' },
  { t: 'Conservación de derechos', d: 'Si dejaste de cotizar, tus derechos no duran para siempre. Saber cuándo vencen evita perder la pensión.' },
  { t: 'Tu AFORE', d: 'En Ley 97 es tu pensión. En Ley 73 es dinero que puedes recuperar al pensionarte. En ambos casos conviene revisarla.' },
];

// Temas del primer lote de guías: se enlazan cuando su guía está publicada.
const TEMAS = [
  { slug: 'ley-73-o-ley-97', grupo: 'Entender', titulo: '¿Soy Ley 73 o Ley 97?', texto: 'Cómo saberlo y qué cambia en tu pensión.' },
  { slug: 'como-leer-tu-constancia-de-semanas', grupo: 'Entender', titulo: 'Cómo leer tu constancia de semanas', texto: 'Qué significa cada dato y qué errores buscar.' },
  { slug: 'pension-minima-garantizada', grupo: 'Entender', titulo: 'Pensión mínima garantizada', texto: 'Cuánto es y quién tiene derecho.' },
  { slug: 'modalidad-40-regla-nueva', grupo: 'Mejorar', titulo: 'Modalidad 40 con la regla nueva', texto: 'Qué cambió el 21 de octubre de 2026 y a quién le sigue conviniendo.' },
  { slug: 'edad-de-retiro-60-a-65', grupo: 'Mejorar', titulo: 'Retirarte a los 60, 63 o 65', texto: 'Cuánto cambia tu pensión con cada año.' },
  { slug: 'conservacion-de-derechos', grupo: 'Tramitar', titulo: 'Conservación de derechos', texto: 'Cuánto dura y cómo recuperarla si ya venció.' },
];

const FAQS: Faq[] = [
  { pregunta: '¿Cómo sé si soy Ley 73 o Ley 97?', respuesta: 'Por la fecha en que empezaste a cotizar al IMSS: antes del 1 de julio de 1997 eres Ley 73; a partir de esa fecha, Ley 97. Lo confirmamos con tu historial de semanas.' },
  { pregunta: '¿A qué edad me puedo pensionar?', respuesta: 'Desde los 60 años por cesantía en edad avanzada, si ya no trabajas y cumples las semanas. A los 65 es pensión por vejez.' },
  { pregunta: '¿Todavía sirve la Modalidad 40?', respuesta: 'Sí existe, pero desde el 21 de octubre de 2026 no se pueden pagar periodos hacia atrás y el salario con el que cotizas tiene un tope ligado a tu último salario. A algunas personas les sigue conviniendo; hay que hacer la cuenta con tus datos.' },
  { pregunta: '¿Qué necesito para saber cuánto me toca?', respuesta: 'Tu CURP. Con ella consultamos tu historial de semanas y salarios en el IMSS y armamos tu diagnóstico. Es gratis y llega a tu WhatsApp.' },
  { pregunta: '¿Cuánto cuesta el diagnóstico?', respuesta: 'El diagnóstico es gratis. Si después quieres una asesoría para ejecutar tu estrategia, te decimos antes qué incluye.' },
];

export default async function PilarPensiones() {
  const guias = await guiasPublicadas('pensiones');
  const publicadas = new Map(guias.map((g) => [g.slug, g]));
  const extras = guias.filter((g) => !TEMAS.some((t) => t.slug === g.slug));
  return (
    <>
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'WebPage', name: 'Tu pensión del IMSS', url: 'https://trol.mx/pensiones', inLanguage: 'es-MX', publisher: { '@type': 'Organization', name: 'El Trol Financiero', url: 'https://trol.mx' } }} />
      <Hero
        kicker="Pensiones"
        titulo={<>Tu pensión depende de <span className="text-lime">cuatro datos</span></>}
        texto="Tu ley, tus semanas, tu salario y tu edad. Con tu CURP los consultamos en el IMSS y te decimos cuánto te toca y cómo mejorarlo."
      >
        <a href="/i/sitio_pen" className={botonLima}>Recibe tu diagnóstico gratis</a>
        <a href="/calcula" className={botonClaro}>Calcula tu pensión</a>
      </Hero>

      <Seccion titulo="Qué determina tu pensión">
        <div className="grid gap-4 sm:grid-cols-2">
          {DATOS.map((x) => (
            <div key={x.t} className="rounded-2xl border border-line bg-white p-6">
              <h3 className="font-bold">{x.t}</h3>
              <p className="mt-2 text-sm text-muted">{x.d}</p>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion blanco titulo="Qué sí puedes mover hoy" intro="No todo está escrito. Estas son las decisiones que cambian el monto.">
        <ul className="grid gap-3 sm:grid-cols-2">
          {PALANCAS.map((x) => (
            <li key={x.t} className="rounded-xl bg-cream p-4">
              <p className="font-bold">{x.t}</p>
              <p className="mt-1 text-sm text-muted">{x.d}</p>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm">
          ¿Quieres ver tus números? <Link href="/calcula" className="font-semibold underline">Usa la calculadora</Link> o pide tu diagnóstico con tus datos reales.
        </p>
      </Seccion>

      <Seccion titulo="Guías" intro="Una pregunta por página, contestada al grano.">
        {(['Entender', 'Mejorar', 'Tramitar'] as const).map((g) => (
          <div key={g} className="mb-8">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{g}</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              {TEMAS.filter((t) => t.grupo === g).map((t) => {
                const pub = publicadas.get(t.slug);
                return <TarjetaGuia key={t.slug} href={pub ? `/pensiones/${t.slug}` : undefined} titulo={pub?.titulo ?? t.titulo} texto={pub?.resumen || t.texto} pronto={!pub} />;
              })}
            </div>
          </div>
        ))}
        {extras.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-3">
            {extras.map((g) => <TarjetaGuia key={g.slug} href={`/pensiones/${g.slug}`} titulo={g.titulo} texto={g.resumen} />)}
          </div>
        )}
        <p className="mt-2 text-sm">Lo más reciente, incluido el Informe Trol, está en el <Link href="/blog" className="font-semibold underline">blog</Link>.</p>
      </Seccion>

      <Seccion blanco titulo="Cómo te acompañamos">
        <ol className="grid gap-4 sm:grid-cols-3">
          {[
            ['Diagnóstico gratis', 'Con tu CURP traemos tu historial del IMSS y te decimos dónde estás parado.'],
            ['Asesoría con un experto', 'Revisamos contigo los escenarios y elegimos la mejor estrategia para tu caso.'],
            ['Acompañamiento', 'Te guiamos en cada trámite hasta que tu pensión quede en orden.'],
          ].map(([t, d], i) => (
            <li key={t} className="rounded-2xl border border-line p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink font-extrabold text-lime">{i + 1}</span>
              <p className="mt-3 font-bold">{t}</p>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm"><Link href="/asesorias" className="font-semibold underline">Ver qué incluye la asesoría</Link></p>
      </Seccion>

      <Seccion titulo="Preguntas frecuentes">
        <Preguntas items={FAQS} />
      </Seccion>

      <CierreWhatsApp titulo="Un día te vas a pensionar. Hablemos hoy." boton="Empezar por WhatsApp" href="/i/sitio_pen" />
    </>
  );
}
