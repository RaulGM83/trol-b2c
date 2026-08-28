/**
 * La historia del ahorro en PNG vertical, para mandar por WhatsApp.
 *
 * Narrativa v2.1 (28-ago-2026): muy visual, poco texto, un número grande por bloque.
 * HOY (el ahorro detenido) → EL PLAN (enganche de un inmueble que se pone en renta) →
 * MIENTRAS ES TUYO (la renta con número; y por detrás, sin números: el empleador aporta a
 * capital, beneficios fiscales, el inmueble gana valor) → AL VENDER (lo que recibe ya
 * liquidado el crédito y pagados los costos de venta, y la ventaja contra no hacer nada).
 *
 * Los números salen de `derivar` (infonavit-pdf), que re-deriva el corte al default
 * min(5 años, venta + 3) aunque la asesoría guardada traiga otro.
 *
 * GUARDARRAILES (Producto_Infonavit_Contexto.md §7): nada de costo del aliado, comisión del
 * desarrollador ni PnL interno. La plusvalía va como supuesto, sin cifra de monto. No se
 * promete renta inmediata. Números de narrativa redondeados a miles.
 */
import { ImageResponse } from 'next/og';
import { t3, requireMiembro, type Any } from '@/lib/trol3/server';
import { LOGO_TROL_BLANCO, LOGO_TROL_RATIO } from '@/lib/marca/logo';
import { fuentesResumen } from '@/lib/marca/fuente';
import { derivar } from '@/components/trol3/infonavit-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    <div style={{ display: 'flex', alignItems: 'center', marginTop: 26 }}>
      <div style={{ display: 'flex', width: 12, height: 12, backgroundColor: LIME }} />
      <div style={{ fontSize: 22, fontWeight: 700, color: GRAY, letterSpacing: 2.5, marginLeft: 12 }}>{t.toUpperCase()}</div>
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

  const mini = { display: 'flex', flexDirection: 'column' as const, backgroundColor: CREAM, padding: '20px 22px', flexGrow: 1, flexBasis: 0 };
  const miniLbl = { fontSize: 19, fontWeight: 700, color: GRAY, letterSpacing: 1.5 };
  const miniTxt = { fontSize: 20, color: DARK, marginTop: 8, lineHeight: 1.25 };

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', backgroundColor: '#fff', fontFamily: 'Inter' }}>
        {/* ---- banda ---- */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: DARK, padding: '26px 56px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_TROL_BLANCO} width={logoW} height={60} alt="" />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <div style={{ fontSize: 26, fontWeight: 700, color: LIME }}>{clientes}</div>
            <div style={{ fontSize: 20, color: '#C9CCD0', marginTop: 4 }}>{d.desarrollo}{d.zona ? ` · ${d.zona}` : ''}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', padding: '0 56px 10px', flexGrow: 1 }}>
          {/* ---- HOY ---- */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Etiqueta t="Hoy" />
            <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 10 }}>
              <div style={{ fontSize: 64, fontWeight: 700, color: DARK }}>{mxMiles(d.ssvTotal)}</div>
              <div style={{ fontSize: 24, color: GRAY, marginLeft: 18 }}>tu ahorro Infonavit, detenido</div>
            </div>
          </div>

          {/* ---- EL PLAN ---- */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Etiqueta t="El plan" />
            <div style={{ fontSize: 30, fontWeight: 700, color: DARK, marginTop: 10, lineHeight: 1.2 }}>
              {`Usarlo de enganche: ${d.desarrollo}`}
            </div>
            <div style={{ fontSize: 22, color: GRAY, marginTop: 6 }}>
              Se pone en renta · no lo habitas · tú decides cuándo vender
            </div>
          </div>

          {/* ---- MIENTRAS ES TUYO ---- */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Etiqueta t="Mientras es tuyo" />
            <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 12 }}>
              <div style={{ fontSize: 40, fontWeight: 700, color: d.flujo >= 0 ? DARK : RED }}>{(d.flujo >= 0 ? '+' : '−') + mx(Math.abs(d.flujo))}</div>
              <div style={{ fontSize: 22, color: GRAY, marginLeft: 12 }}>
                {d.flujo >= 0 ? '/mes de renta a tu favor, ya pagado el crédito' : '/mes complementas de la retención'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 14 }}>
              {conCredito && d.aportaciones > 0 ? (
                <div style={mini}>
                  <div style={miniLbl}>TU EMPLEADOR</div>
                  <div style={miniTxt}>sigue aportando a capital del crédito</div>
                </div>
              ) : null}
              {conCredito ? (
                <div style={mini}>
                  <div style={miniLbl}>FISCAL</div>
                  <div style={miniTxt}>los intereses del crédito son deducibles</div>
                </div>
              ) : null}
              <div style={mini}>
                <div style={miniLbl}>PLUSVALÍA</div>
                <div style={miniTxt}>el inmueble completo gana valor*</div>
              </div>
            </div>
          </div>
        </div>

        {/* ---- AL VENDER ---- */}
        <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: DARK, padding: '30px 56px 26px' }}>
          <div style={{ fontSize: 26, color: '#C9CCD0' }}>{`Al vender a ${d.h} meses recibes`}</div>
          <div style={{ fontSize: 92, fontWeight: 700, color: LIME, lineHeight: 1.05, marginTop: 2 }}>{mxMiles(d.efectivo)}</div>
          <div style={{ fontSize: 21, color: '#9DA1A6', marginTop: 6 }}>ya liquidado el crédito y pagados los costos de venta</div>
          <div style={{ display: 'flex', height: 1, backgroundColor: '#43464A', marginTop: 22, marginBottom: 16 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 24, color: '#C9CCD0' }}>vs. no hacer nada, contando lo que reinviertes después</div>
            <div style={{ fontSize: 46, fontWeight: 700, color: d.ventajaCorte >= 0 ? '#fff' : RED }}>{(d.ventajaCorte >= 0 ? '+' : '−') + mxMiles(d.ventajaCorte)}</div>
          </div>
          <div style={{ fontSize: 19, color: '#9DA1A6', marginTop: 4 }}>{`medido a ${anios(d.corte)} años`}</div>
        </div>

        {/* ---- pie ---- */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 56px', borderTop: `1px solid ${LINEA}` }}>
          <div style={{ fontSize: 17, color: GRAY, maxWidth: 900 }}>
            {`*Escenarios con renta y plusvalía estimadas (${Math.round(Number(d.pal.plusvalia ?? 0) * 100)}% anual): supuestos, no promesas. El detalle completo va en la propuesta.`}
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: fuentesResumen() },
  );
}
