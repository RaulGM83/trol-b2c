/**
 * 276 · Cotización inicial Infonavit en PNG vertical para WhatsApp: dos plazos (18 y 60 meses),
 * cada uno con su inmueble, lo que pone al mes y lo que recibe al vender (el héroe, en verde).
 * Mismo estilo que el resumen de la asesoría (`../resumen/[id]`).
 *
 * GUARDARRAILES: sin costo del aliado, comisión ni PnL interno. Montos redondeados.
 * Renta y plusvalía como supuestos. OJO satori: divs con más de un hijo llevan display flex;
 * guion ASCII (el subset de Inter no trae U+2212).
 */
import { ImageResponse } from 'next/og';
import { requireMiembro } from '@/lib/trol3/server';
import { LOGO_TROL_BLANCO, LOGO_TROL_RATIO } from '@/lib/marca/logo';
import { fuentesResumen } from '@/lib/marca/fuente';
import { cargarCotizacionInicial } from '@/lib/infonavit/cotizacion-inicial-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DARK = '#26282B', LIME = '#D1F069', GRAY = '#8A8D91', CREAM = '#F4F4F2', LINEA = '#E4E4E1';
const W = 1080, H = 1350;
const miles = (n: number) => '$' + (Math.round(Math.abs(n) / 1000) * 1000).toLocaleString('es-MX');
const cientos = (n: number) => '$' + (Math.round(Math.abs(n) / 100) * 100).toLocaleString('es-MX');

function Etiqueta({ t }: { t: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'flex', width: 12, height: 12, backgroundColor: LIME }} />
      <div style={{ fontSize: 22, fontWeight: 700, color: GRAY, letterSpacing: 2.5, marginLeft: 12 }}>{t.toUpperCase()}</div>
    </div>
  );
}

export async function GET(_req: Request, { params }: { params: { persona: string } }) {
  await requireMiembro();
  const c = await cargarCotizacionInicial(params.persona);
  if (!c.ok) return new Response(c.motivo, { status: 422 });
  const { cot } = c;
  const logoW = Math.round(60 * LOGO_TROL_RATIO);

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', backgroundColor: '#fff', fontFamily: 'Inter' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: DARK, padding: '24px 56px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_TROL_BLANCO} width={logoW} height={60} alt="" />
          <div style={{ fontSize: 26, fontWeight: 700, color: LIME }}>{c.nombre}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', padding: '34px 56px 0' }}>
          <Etiqueta t="Tu ahorro, hoy" />
          <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 10 }}>
            <div style={{ fontSize: 58, fontWeight: 700, color: DARK }}>{miles(cot.saldo)}</div>
            <div style={{ fontSize: 23, color: GRAY, marginLeft: 16 }}>en tu subcuenta del Infonavit</div>
          </div>
          {cot.credito_max ? (
            <div style={{ fontSize: 24, color: DARK, marginTop: 6 }}>{`Tu crédito Infonavit llega a ${miles(cot.credito_max)}`}</div>
          ) : null}
          <div style={{ fontSize: 22, color: GRAY, marginTop: 14 }}>Úsalo para comprar un inmueble que se renta y véndelo cuando te convenga:</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', padding: '20px 56px', flexGrow: 1, justifyContent: 'space-around' }}>
          {cot.opciones.map((o) => (
            <div key={o.plazo} style={{ display: 'flex', flexDirection: 'column', backgroundColor: CREAM, borderRadius: 18, padding: '24px 30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: 24, fontWeight: 700, color: GRAY, letterSpacing: 1.5 }}>{`SI VENDES EN ${o.plazo} MESES`}</div>
                <div style={{ fontSize: 22, color: GRAY }}>{o.zona ?? ''}</div>
              </div>
              <div style={{ fontSize: 34, fontWeight: 700, color: DARK, marginTop: 6 }}>{o.desarrollo}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 20, color: GRAY }}>Pones al mes</div>
                  <div style={{ fontSize: 40, fontWeight: 700, color: DARK }}>{o.pone_al_mes > 0 ? cientos(o.pone_al_mes) : 'La renta lo cubre'}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', backgroundColor: DARK, borderRadius: 14, padding: '12px 22px' }}>
                  <div style={{ fontSize: 20, color: '#C9CCD0' }}>Al vender recibes</div>
                  <div style={{ fontSize: 54, fontWeight: 700, color: LIME }}>{miles(o.recibe_al_vender)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: DARK, padding: '22px 56px' }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: LIME }}>¿Lo vemos juntos en una llamada de 20 min?</div>
          <div style={{ fontSize: 21, color: '#C9CCD0', marginTop: 5 }}>Responde este mensaje y afinamos las cifras con tu caso.</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 56px', borderTop: `1px solid ${LINEA}` }}>
          <div style={{ fontSize: 17, color: GRAY, maxWidth: 860 }}>
            *Cifras iniciales con renta y plusvalía estimadas por zona: supuestos, no promesas. Recibes al vender = venta estimada menos crédito restante y comisión.
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: DARK }}>Vigencia 30 días</div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: fuentesResumen() },
  );
}
