/**
 * La historia del ahorro en PNG vertical, para mandar por WhatsApp.
 *
 * Narrativa v3 (29-ago-2026), espejo del resumen PDF: TU AHORRO ($ dormido) → LA PROPUESTA
 * (comprar un inmueble y SU PRECIO — el edificio solo se menciona aquí) → ASÍ SE VERÍA
 * (pones hoy / mientras es tuyo, con la renta como detalle, no como protagonista) →
 * QUÉ SIGUE (3 pasos) → AL VENDER (el héroe: lo que recibe) + CTA.
 *
 * Jerarquía de números deliberada: $ ahorro (grande) → $ precio (medio, en la frase) →
 * $ al vender (el más grande, en verde). Todo lo demás va chico.
 *
 * GUARDARRAILES (Producto_Infonavit_Contexto.md §7): nada de costo del aliado, comisión del
 * desarrollador ni PnL interno. Plusvalía como supuesto y sin monto. Sin promesa de renta
 * inmediata. Números de narrativa redondeados a miles. Comparación contra no hacer nada solo
 * si la ventaja supera el umbral.
 *
 * OJO satori: divs con más de un hijo llevan display flex; sin 'space-evenly'; guion ASCII
 * (el subset de Inter no trae U+2212). Validar cambios con el arnés test-png antes de pushear.
 */
import { ImageResponse } from 'next/og';
import { t3, requireMiembro, type Any } from '@/lib/trol3/server';
import { LOGO_TROL_BLANCO, LOGO_TROL_RATIO } from '@/lib/marca/logo';
import { fuentesResumen } from '@/lib/marca/fuente';
import { derivar } from '@/lib/infonavit/derivar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Debajo de este umbral la comparación contra no hacer nada se omite del PNG (decisión 28-ago).
const UMBRAL_VENTAJA = 70000;

const DARK = '#26282B', LIME = '#D1F069', GRAY = '#8A8D91', CREAM = '#F4F4F2', LINEA = '#E4E4E1', RED = '#B0532F';
const W = 1080, H = 1350;

const mxMiles = (n: Any) => {
  const v = Number(n);
  if (n == null || Number.isNaN(v)) return '—';
  return '$' + (Math.round(Math.abs(v) / 1000) * 1000).toLocaleString('es-MX');
};
const mx = (n: Any) => {
  const v = Number(n);
  if (n == null || Number.isNaN(v)) return '—';
  return '$' + Math.round(Math.abs(v)).toLocaleString('es-MX');
};
const anios = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function Etiqueta({ t }: { t: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <div style={{ display: 'flex', width: 12, height: 12, backgroundColor: LIME }} />
      <div style={{ fontSize: 22, fontWeight: 700, color: GRAY, letterSpacing: 2.5, marginLeft: 12 }}>{t.toUpperCase()}</div>
    </div>
  );
}

function Punto({ texto, color, negrita }: { texto: string; color?: string; negrita?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', marginTop: 9 }}>
      <div style={{ display: 'flex', width: 9, height: 9, backgroundColor: LIME, marginTop: 8, marginRight: 12, flexShrink: 0 }} />
      <div style={{ fontSize: 20, color: color ?? DARK, lineHeight: 1.3, fontWeight: negrita ? 700 : 400 }}>{texto}</div>
    </div>
  );
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireMiembro();
  const db = t3();
  const { data: a } = await db.from('infonavit_asesorias').select('*').eq('id', params.id).maybeSingle();
  if (!a) return new Response('No encontrado', { status: 404 });

  const ids = [a.persona_id, a.cotitular_persona_id].filter(Boolean) as string[];
  const { data: pers } = await db.from('personas').select('id,nombre,apellidos').in('id', ids);
  const nombre = (id: string | null) => {
    const p = ((pers ?? []) as Any[]).find((x) => x.id === id);
    return p ? [p.nombre, p.apellidos].filter(Boolean).join(' ') : null;
  };
  const clientes = [nombre(a.persona_id), nombre(a.cotitular_persona_id)].filter(Boolean).join(' y ');

  const d = derivar(a);
  if (!d.fila) return new Response('Escenario incompleto', { status: 422 });
  const conCredito = d.credito > 0;
  const logoW = Math.round(60 * LOGO_TROL_RATIO);

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', backgroundColor: '#fff', fontFamily: 'Inter' }}>
        {/* ---- banda: solo quién (el inmueble vive en La Propuesta) ---- */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: DARK, padding: '24px 56px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_TROL_BLANCO} width={logoW} height={60} alt="" />
          <div style={{ fontSize: 26, fontWeight: 700, color: LIME }}>{clientes}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-around', padding: '0 56px 8px', flexGrow: 1 }}>
          {/* ---- TU AHORRO, HOY ---- */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Etiqueta t="Tu ahorro, hoy" />
            <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 10 }}>
              <div style={{ fontSize: 58, fontWeight: 700, color: DARK }}>{mxMiles(d.ssvTotal)}</div>
              <div style={{ fontSize: 23, color: GRAY, marginLeft: 16 }}>detenidos en tu subcuenta del Infonavit</div>
            </div>
          </div>

          {/* ---- LA PROPUESTA ---- */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Etiqueta t="La propuesta" />
            <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: CREAM, padding: '20px 26px', marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline' }}>
                <div style={{ fontSize: 28, color: DARK }}>Comprar un inmueble de</div>
                <div style={{ fontSize: 38, fontWeight: 700, color: DARK, marginLeft: 12 }}>{mxMiles(d.op.esc)}</div>
              </div>
              <div style={{ fontSize: 27, color: DARK, marginTop: 2 }}>usando tu ahorro como enganche.</div>
              <div style={{ fontSize: 20, color: GRAY, marginTop: 8 }}>
                {`${d.desarrollo}${d.zona ? ` · ${d.zona}` : ''} — se pone en renta, tú decides cuándo vender`}
              </div>
            </div>
          </div>

          {/* ---- ASÍ SE VERÍA ---- */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Etiqueta t="Así se vería" />
            <div style={{ display: 'flex', gap: 14, marginTop: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: CREAM, padding: '22px 26px', flexGrow: 1, flexBasis: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 700, color: GRAY, letterSpacing: 1.5 }}>PONES HOY</div>
                <div style={{ fontSize: 40, fontWeight: 700, color: DARK, marginTop: 6 }}>{d.notCliente > 0 ? mxMiles(d.notCliente) : '$0'}</div>
                <div style={{ fontSize: 19, color: GRAY, marginTop: 2 }}>{d.notCliente > 0 ? 'gastos notariales, una sola vez' : 'de tu bolsillo'}</div>
                <div style={{ display: 'flex', width: 30, height: 2, backgroundColor: '#C9CCD0', marginTop: 14, marginBottom: 10 }} />
                <div style={{ fontSize: 19, color: DARK, lineHeight: 1.35 }}>
                  {conCredito
                    ? `La compra la pagan tu subcuenta (${mxMiles(d.op.saldo_apl)}) y un crédito Infonavit (${mxMiles(d.credito)})`
                    : `La compra la paga tu subcuenta (${mxMiles(d.op.saldo_apl)})`}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: CREAM, padding: '22px 26px', flexGrow: 1.35, flexBasis: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 700, color: GRAY, letterSpacing: 1.5 }}>MIENTRAS ES TUYO</div>
                {conCredito ? (
                  <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ fontSize: 19, color: GRAY }}>Renta, ya sin gastos</div>
                      <div style={{ fontSize: 19, fontWeight: 700, color: DARK }}>{mx(d.rentaNeta)}</div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                      <div style={{ fontSize: 19, color: GRAY }}>Pago del crédito</div>
                      <div style={{ fontSize: 19, fontWeight: 700, color: DARK }}>{`- ${mx(d.pmt)}`}</div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTop: '1px solid #C9CCD0' }}>
                      <div style={{ fontSize: 19, fontWeight: 700, color: DARK }}>{d.flujo >= 0 ? 'Te quedan al mes' : 'Completas al mes'}</div>
                      <div style={{ fontSize: 19, fontWeight: 700, color: d.flujo >= 0 ? DARK : RED }}>{`${d.flujo >= 0 ? '+' : '-'}${mx(Math.abs(d.flujo))}`}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                    <div style={{ fontSize: 19, color: GRAY }}>Renta a tu favor, ya sin gastos</div>
                    <div style={{ fontSize: 19, fontWeight: 700, color: DARK }}>{`+${mx(d.rentaNeta)}`}</div>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', marginTop: 4 }}>
                  {conCredito && d.aportaciones > 0 ? <Punto texto="Tu empleador sigue abonando a capital" /> : null}
                  {conCredito ? <Punto texto="Los intereses son deducibles de ISR" /> : null}
                  <Punto texto="El inmueble gana valor con el tiempo*" />
                </div>
              </div>
            </div>
          </div>

          {/* ---- QUÉ SIGUE ---- */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Etiqueta t="Qué sigue" />
            <div style={{ display: 'flex', gap: 14, marginTop: 14 }}>
              {[
                ['1', 'Confirmar tu saldo y apartar'],
                ['2', 'Reunir documentos'],
                ['3', 'Firmar y poner en renta'],
              ].map(([n, t]) => (
                <div key={n} style={{ display: 'flex', alignItems: 'center', backgroundColor: CREAM, padding: '14px 20px', flexGrow: 1, flexBasis: 0 }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: '#B5BB9B', marginRight: 14 }}>{n}</div>
                  <div style={{ fontSize: 19, color: DARK, lineHeight: 1.25 }}>{t}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ---- AL VENDER: el héroe ---- */}
        <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: DARK, padding: '28px 56px 24px' }}>
          <div style={{ fontSize: 26, color: '#C9CCD0' }}>{`Al vender a ${d.h} meses recibes`}</div>
          <div style={{ fontSize: 92, fontWeight: 700, color: LIME, lineHeight: 1.05, marginTop: 2 }}>{mxMiles(d.recibeDia)}</div>
          <div style={{ fontSize: 21, color: '#9DA1A6', marginTop: 6 }}>
            {`venta estimada (${mxMiles(d.ventaEstimada)}) menos crédito restante y comisión — en tu mano ese día`}
          </div>
          {d.ventajaCorte >= UMBRAL_VENTAJA ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', height: 1, backgroundColor: '#43464A', marginTop: 20, marginBottom: 14 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: 24, color: '#C9CCD0' }}>vs. no hacer nada, contando lo que reinviertes después</div>
                <div style={{ fontSize: 46, fontWeight: 700, color: '#fff' }}>{'+' + mxMiles(d.ventajaCorte)}</div>
              </div>
              <div style={{ fontSize: 19, color: '#9DA1A6', marginTop: 4 }}>{`medido a ${anios(d.corte)} años`}</div>
            </div>
          ) : null}
          <div style={{ fontSize: 26, fontWeight: 700, color: LIME, marginTop: 18 }}>
            ¿Listo para liberar tu saldo Infonavit atorado?
          </div>
          <div style={{ fontSize: 21, color: '#C9CCD0', marginTop: 5 }}>
            Responde este mensaje: te ayudamos con tus dudas.
          </div>
        </div>

        {/* ---- pie ---- */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 56px', borderTop: `1px solid ${LINEA}` }}>
          <div style={{ fontSize: 17, color: GRAY, maxWidth: 860 }}>
            {`*Escenarios con renta y plusvalía estimadas (${Math.round(Number(d.pal.plusvalia ?? 0) * 100)}% anual): supuestos, no promesas. El detalle completo va en la propuesta.`}
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: DARK }}>Vigencia 30 días</div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: fuentesResumen() },
  );
}
