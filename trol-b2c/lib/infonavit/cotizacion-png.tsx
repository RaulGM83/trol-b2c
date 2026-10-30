/**
 * 276/281 · Cotización inicial Infonavit en PNG (equipo y brokers; con `alianza` sale co-branded) vertical para WhatsApp: dos plazos (18 y 60 meses),
 * cada uno con su inmueble, lo que pone al mes y lo que recibe al vender (el héroe, en verde).
 * Mismo estilo que el resumen de la asesoría (`../resumen/[id]`). v2 (Raúl, 30-oct): sin monto de crédito,
 * nombre comercial del inmueble, "pones al mes" = crédito − renta, y bloque "Nosotros".
 *
 * GUARDARRAILES: sin costo del aliado, comisión ni PnL interno. Montos redondeados.
 * Renta y plusvalía como supuestos. OJO satori: divs con más de un hijo llevan display flex;
 * guion ASCII (el subset de Inter no trae U+2212).
 */
import { ImageResponse } from 'next/og';
import { LOGO_TROL_BLANCO, LOGO_TROL_RATIO } from '@/lib/marca/logo';
import { fuentesResumen } from '@/lib/marca/fuente';
import type { CotizacionInicial } from '@/lib/infonavit/cotizacion-inicial';


const DARK = '#26282B', LIME = '#D1F069', GRAY = '#8A8D91', CREAM = '#F4F4F2', LINEA = '#E4E4E1';
const W = 1080, H = 1350;
const miles = (n: number) => '$' + (Math.round(Math.abs(n) / 1000) * 1000).toLocaleString('es-MX');
const cientos = (n: number) => '$' + (Math.round(Math.abs(n) / 100) * 100).toLocaleString('es-MX');

const NOSOTROS: [string, string][] = [
  ['No cobramos % de tu saldo', 'nos paga la constructora'],
  ['Pagamos gastos notariales', 'no pones nada extra hoy'],
  ['Administramos la renta', 'si quieres que lo hagamos'],
  ['Lo vendemos cuando decidas', 'si quieres que lo hagamos'],
];

function Etiqueta({ t }: { t: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'flex', width: 12, height: 12, backgroundColor: LIME }} />
      <div style={{ fontSize: 22, fontWeight: 700, color: GRAY, letterSpacing: 2.5, marginLeft: 12 }}>{t.toUpperCase()}</div>
    </div>
  );
}

/** Pinta la cotización. `alianza` = nombre del broker/aliado ("En alianza con …"). */
export function imagenCotizacion(c: { nombre: string; cot: CotizacionInicial }, opts: { alianza?: string | null } = {}) {
  const { cot } = c;
  const logoW = Math.round(60 * LOGO_TROL_RATIO);
  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', backgroundColor: '#fff', fontFamily: 'Inter' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: DARK, padding: '24px 56px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_TROL_BLANCO} width={logoW} height={60} alt="" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: LIME }}>{c.nombre}</div>
            <div style={{ fontSize: 18, color: '#C9CCD0', marginTop: 2 }}>{opts.alianza ? `Cotización personalizada · en alianza con ${opts.alianza}` : 'Cotización personalizada con tus datos'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', padding: '30px 56px 0' }}>
          <Etiqueta t="Tu ahorro, hoy" />
          <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 8 }}>
            <div style={{ fontSize: 58, fontWeight: 700, color: DARK }}>{miles(cot.saldo)}</div>
            <div style={{ fontSize: 23, color: GRAY, marginLeft: 16 }}>en tu subcuenta del Infonavit</div>
          </div>
          <div style={{ fontSize: 23, color: DARK, marginTop: 10, lineHeight: 1.3 }}>
            Aprovéchalo para comprar un inmueble a precio preferencial en un proyecto con potencial de plusvalía:
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'space-around', padding: '8px 56px 12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {cot.opciones.map((o) => (
            <div key={o.plazo} style={{ display: 'flex', flexDirection: 'column', backgroundColor: CREAM, borderRadius: 18, padding: '20px 28px', marginBottom: 18 }}>
              <div style={{ fontSize: 32, fontWeight: 700, color: DARK, lineHeight: 1.15 }}>{o.nombre}</div>
              {o.ubicacion ? <div style={{ fontSize: 21, color: GRAY, marginTop: 4 }}>{o.ubicacion}</div> : null}
              <div style={{ display: 'flex', alignSelf: 'flex-start', fontSize: 18, fontWeight: 700, color: DARK, backgroundColor: LIME, borderRadius: 6, padding: '4px 10px', letterSpacing: 1.2, marginTop: 12 }}>{`SI VENDES EN ${o.plazo} MESES`}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 19, color: GRAY }}>Pones al mes</div>
                  <div style={{ fontSize: 38, fontWeight: 700, color: DARK }}>{o.pone_al_mes > 0 ? cientos(o.pone_al_mes) : '$0'}</div>
                  <div style={{ fontSize: 16, color: GRAY }}>{o.pone_al_mes > 0 ? 'crédito menos renta' : 'la renta cubre el crédito'}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', backgroundColor: DARK, borderRadius: 14, padding: '10px 22px' }}>
                  <div style={{ fontSize: 19, color: '#C9CCD0' }}>Al vender recibes</div>
                  <div style={{ fontSize: 50, fontWeight: 700, color: LIME }}>{miles(o.recibe_al_vender)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Etiqueta t="Nosotros" />
          <div style={{ display: 'flex', flexWrap: 'wrap', marginTop: 10 }}>
            {NOSOTROS.map(([t, d]) => (
              <div key={t} style={{ display: 'flex', alignItems: 'flex-start', width: '50%', marginBottom: 16 }}>
                <div style={{ display: 'flex', width: 10, height: 10, backgroundColor: LIME, marginTop: 9, marginRight: 12, flexShrink: 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 23, fontWeight: 700, color: DARK }}>{t}</div>
                  <div style={{ fontSize: 18, color: GRAY }}>{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: DARK, padding: '20px 56px' }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: LIME }}>¿Te la explico en una llamada de 20 min?</div>
          <div style={{ fontSize: 21, color: '#C9CCD0', marginTop: 5 }}>Dime qué día y hora te acomodan. Puede mejorar si sumas a otra persona al crédito.</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 56px', borderTop: `1px solid ${LINEA}` }}>
          <div style={{ fontSize: 15, color: GRAY, width: 820 }}>
            *Cifras iniciales: asume que sigues cotizando con tu salario actual; renta y plusvalía estimadas por zona (supuestos, no promesas). Al vender recibes la venta estimada menos el crédito restante y la comisión.
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: DARK, width: 160, textAlign: 'right' }}>Vigencia 30 días</div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: fuentesResumen() },
  );
}
