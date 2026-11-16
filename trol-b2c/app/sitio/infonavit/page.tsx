import type { Metadata } from 'next';
import { metaSitio } from '@/lib/sitio/meta';
import { guiasPublicadas } from '@/lib/blog/contenido';
import { inmueblesSitio, fechaPrecios } from '@/lib/sitio/inmuebles';
import { Hero, Seccion, Preguntas, TarjetaGuia, TarjetaInmueble, CierreWhatsApp, JsonLd, botonLima, botonClaro, type Faq } from '@/components/sitio/Bloques';

// Pilar de Infonavit: el inmueble como activo para el retiro. Los inmuebles salen
// del catálogo (trol3.inmuebles_sitio) y las guías de trol3.contenidos.
export const revalidate = 300;

export const metadata: Metadata = metaSitio({
  titulo: 'Invierte con tu Infonavit: un inmueble para tu retiro · El Trol Financiero',
  descripcion:
    'Cómo usar tu saldo y tu crédito Infonavit para comprar un inmueble que se renta y complementa tu pensión. Requisitos, riesgos, inmuebles disponibles y guías.',
  ruta: '/infonavit',
});

const WA = '/i/sitio_inf';

const PASOS = [
  { t: 'Vemos cuánto te presta Infonavit', d: 'Con tu NSS consultamos tu saldo de vivienda y tu crédito. Te mandamos una cotización por WhatsApp, sin costo.' },
  { t: 'Eliges un inmueble', d: 'Proyectos nuevos, con el precio y la renta estimada a la vista. Se compra con tu saldo y tu crédito, sin poner enganche de tu bolsa.' },
  { t: 'Se renta y se paga', d: 'Tus aportaciones patronales abonan al crédito y la renta ayuda a pagarlo. Si quieres, administramos la renta por ti.' },
];

const SI = ['Estás cotizando con un patrón', 'Tienes $100,000 o más en tu saldo de vivienda', 'No tienes un crédito Infonavit vigente'];
const NO = ['No estás cotizando hoy: el crédito necesita una relación laboral vigente', 'Ya tienes un crédito Infonavit activo', 'Buscas sacar tu saldo en efectivo: esa opción no la manejamos'];

// Las cinco formas en que un inmueble ayuda al retiro. Cada una enlaza a su guía
// cuando está publicada; las de fondo legal o fiscal no salen sin revisión.
const ACTIVO = [
  { slug: 'renta-que-complementa-tu-pension', titulo: 'Renta que complementa tu pensión', texto: 'Un ingreso mensual aparte de lo que te pague el IMSS.' },
  { slug: 'apalancamiento-con-credito-infonavit', titulo: 'Apalancamiento', texto: 'Compras con el crédito, no con tu ahorro. Qué significa, cuánto cuesta y cuándo conviene.' },
  { slug: 'beneficios-fiscales-de-un-inmueble', titulo: 'Beneficios fiscales', texto: 'Qué se puede deducir y cómo se declara la renta.' },
  { slug: 'la-hipoteca-como-seguro-de-vida', titulo: 'La hipoteca como seguro de vida', texto: 'Qué pasa con el crédito y con el inmueble si faltas.' },
  { slug: 'sucesion-de-un-inmueble', titulo: 'Sucesión', texto: 'A quién le queda el inmueble y cómo dejarlo en orden.' },
  { slug: 'saldo-de-vivienda-en-ley-97', titulo: 'Tu saldo de vivienda si eres Ley 97', texto: 'Qué pasa con ese dinero al pensionarte si no lo usas.' },
  { slug: 'comprar-en-pareja-o-con-un-familiar', titulo: 'Comprar en pareja o con un familiar', texto: 'Cómo se suman dos créditos y dos saldos.' },
];

const RIESGOS = [
  { t: 'Si dejas de cotizar', d: 'El crédito sigue y se paga directo. Antes de decidir revisamos contigo qué harías en ese caso.' },
  { t: 'Si no se renta', d: 'Puede haber meses sin inquilino. La renta que mostramos es una estimación con base en la zona, no una garantía.' },
  { t: 'La plusvalía no está asegurada', d: 'El valor de un inmueble puede subir o no. Las cifras de cada cotización son iniciales y estimadas.' },
  { t: 'Tu saldo de vivienda cambia de lugar', d: 'Ese dinero se va al inmueble en lugar de que lo recibas al pensionarte. Por eso conviene verlo junto con tu pensión.' },
];

const FAQS: Faq[] = [
  { pregunta: '¿Cuánto cobra Trol?', respuesta: 'No cobramos ningún porcentaje de tu saldo: nos paga la constructora. Además pagamos los gastos notariales.' },
  { pregunta: '¿Necesito poner enganche?', respuesta: 'No. La compra se hace con tu saldo de vivienda y tu crédito Infonavit. Si con eso no alcanza, la opción es sumar a otra persona que cotice.' },
  { pregunta: '¿A nombre de quién queda el inmueble?', respuesta: 'A tu nombre, escriturado ante notario. Es un crédito Infonavit normal.' },
  { pregunta: '¿Afecta mi pensión?', respuesta: 'Usar el crédito no te quita semanas cotizadas. Lo que cambia es tu saldo de vivienda: se va al inmueble en lugar de que lo recibas al pensionarte.' },
  { pregunta: '¿Puedo comprar con mi pareja o un familiar?', respuesta: 'Sí. Se pueden sumar los créditos y los saldos de dos personas que cotizan para alcanzar un inmueble.' },
  { pregunta: '¿Me van a pedir mi contraseña de Mi Cuenta Infonavit?', respuesta: 'No. Nunca pedimos contraseñas ni depósitos para precalificarte. Trol es una asesoría independiente; no somos el Infonavit.' },
];

export default async function PilarInfonavit() {
  const [guias, inmuebles] = await Promise.all([guiasPublicadas('infonavit'), inmueblesSitio()]);
  const publicadas = new Map(guias.map((g) => [g.slug, g]));
  const extras = guias.filter((g) => !ACTIVO.some((t) => t.slug === g.slug));
  const alDia = fechaPrecios(inmuebles);
  return (
    <>
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'WebPage', name: 'Invierte con tu Infonavit', url: 'https://trol.mx/infonavit', inLanguage: 'es-MX', publisher: { '@type': 'Organization', name: 'El Trol Financiero', url: 'https://trol.mx' } }} />
      <Hero
        kicker="Infonavit"
        titulo={<>Tu Infonavit puede ser <span className="text-lime">un activo para tu retiro</span></>}
        texto="Tu saldo de vivienda es dinero tuyo que hoy no trabaja. Con tu crédito puede convertirse en un inmueble que se renta y complementa tu pensión."
      >
        <a href={WA} className={botonLima}>Cotiza con tu saldo</a>
        <a href="#inmuebles" className={botonClaro}>Ver inmuebles</a>
      </Hero>

      <Seccion titulo="Cómo funciona">
        <ol className="grid gap-4 sm:grid-cols-3">
          {PASOS.map((x, i) => (
            <li key={x.t} className="rounded-2xl border border-line bg-white p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink font-extrabold text-lime">{i + 1}</span>
              <p className="mt-3 font-bold">{x.t}</p>
              <p className="mt-1 text-sm text-muted">{x.d}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 max-w-2xl text-sm text-muted">Trol no cobra porcentaje de tu saldo: nos paga la constructora, y pagamos los gastos notariales.</p>
      </Seccion>

      <Seccion blanco titulo="Para quién sí y para quién no">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-cream p-6">
            <h3 className="font-bold">Es para ti si</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">{SI.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
          <div className="rounded-2xl border border-line p-6">
            <h3 className="font-bold">Hoy no aplica si</h3>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">{NO.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        </div>
        <p className="mt-6 max-w-2xl text-sm text-muted">Si tu crédito solo no alcanza para un inmueble, se puede sumar a otra persona que cotice: tu pareja, un hijo o una hija.</p>
      </Seccion>

      <Seccion titulo="Un inmueble como activo de retiro" intro="Las formas en que una propiedad trabaja para ti, explicadas una por una.">
        <div className="grid gap-4 sm:grid-cols-3">
          {ACTIVO.map((t) => {
            const pub = publicadas.get(t.slug);
            return <TarjetaGuia key={t.slug} href={pub ? `/infonavit/${t.slug}` : undefined} titulo={pub?.titulo ?? t.titulo} texto={pub?.resumen || t.texto} pronto={!pub} />;
          })}
          {extras.map((g) => <TarjetaGuia key={g.slug} href={`/infonavit/${g.slug}`} titulo={g.titulo} texto={g.resumen} />)}
        </div>
      </Seccion>

      <section id="inmuebles" className="border-y border-line bg-white">
        <div className="mx-auto max-w-5xl px-5 py-14">
          <h2 className="text-2xl font-extrabold sm:text-3xl">Inmuebles</h2>
          <p className="mt-3 max-w-2xl text-muted">
            {alDia ? <>Precios al {alDia}. </> : null}Trol paga los gastos notariales. La renta es una estimación con base en la zona, no una garantía, y el rendimiento es bruto estimado: antes de gastos, impuestos y meses sin renta.
          </p>
          {inmuebles.length === 0 ? (
            <p className="mt-8 rounded-2xl bg-cream p-6 text-sm">Estamos actualizando el catálogo. Escríbenos y te mandamos las opciones de hoy.</p>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2">{inmuebles.map((i) => <TarjetaInmueble key={i.clave} i={i} />)}</div>
          )}
        </div>
      </section>

      <Seccion titulo="Los riesgos, dichos de frente" intro="Una inversión que no te explica sus riesgos no es una asesoría.">
        <div className="grid gap-4 sm:grid-cols-2">
          {RIESGOS.map((x) => (
            <div key={x.t} className="rounded-2xl border border-line bg-white p-6">
              <h3 className="font-bold">{x.t}</h3>
              <p className="mt-2 text-sm text-muted">{x.d}</p>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion blanco titulo="Preguntas frecuentes">
        <Preguntas items={FAQS} />
      </Seccion>

      <CierreWhatsApp titulo="¿Cuánto te presta Infonavit y qué puedes comprar?" texto="Te armamos tu cotización por WhatsApp, sin costo y sin pedirte contraseñas." boton="Cotiza con tu saldo" href={WA} />
    </>
  );
}
