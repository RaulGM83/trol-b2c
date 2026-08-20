/**
 * Escenario resumido en PNG vertical, para mandar por WhatsApp.
 *
 * Es la versión de un vistazo: quién pone qué, qué genera el inmueble y, en grande, cuánto
 * recibe al vender. El detalle va en la propuesta PDF; esto es lo que se ve sin abrir nada.
 *
 * Dos bloques deliberadamente separados: "con qué se paga" y "quién más pone" son
 * aportaciones al proyecto, y "recibe al vender" es el resultado. NO suman entre sí — en
 * medio están el crédito, los intereses, la comisión de venta y el ISR — y por eso van
 * visualmente separados, para que nadie intente cuadrarlos de cabeza.
 *
 * GUARDARRAILES (Producto_Infonavit_Contexto.md §7): nada de costo del aliado, comisión del
 * desarrollador ni PnL interno. La plusvalía va marcada como supuesto en el pie.
 */
import { ImageResponse } from 'next/og';
import { t3, requireMiembro, type Any } from '@/lib/trol3/server';
import { LOGO_TROL_BLANCO, LOGO_TROL_RATIO } from '@/lib/marca/logo';
import { fuentesResumen } from '@/lib/marca/fuente';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DARK = '#26282B', LIME = '#D1F069', GRAY = '#8A8D91', CREAM = '#F4F4F2', LINEA = '#E4E4E1';
const W = 1080, H = 1350;

const mx = (n: Any) => {
  const v = Number(n);
  if (n == null || Number.isNaN(v)) return '—';
  return '$' + Math.round(Math.abs(v)).toLocaleString('es-MX');
};

function Fila({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontSize: 26, color: DARK }}>{k}</div>
        <div style={{ fontSize: 30, fontWeight: 700, color: DARK }}>{v}</div>
      </div>
      {sub ? <div style={{ fontSize: 19, color: GRAY, marginTop: 2 }}>{sub}</div> : null}
    </div>
  );
}

function Titulo({ t }: { t: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', marginTop: 20 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: GRAY, letterSpacing: 1.5 }}>{t.toUpperCase()}</div>
      <div style={{ display: 'flex', width: 46, height: 4, backgroundColor: LIME, marginTop: 7 }} />
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

  const r = (a.resultado ?? {}) as Any;
  const ent = (a.entrada ?? {}) as Any;
  const op = r.operacion ?? {};
  const inm = ent.inmueble ?? {};
  const pal = ent.palancas ?? {};
  const h = Number(a.horizonte ?? r.veredicto?.mejor_horizonte ?? 0);
  const fila = ((r.tabla ?? []) as Any[]).find((f) => Number(f.horizonte) === h) ?? ((r.tabla ?? []) as Any[]).slice(-1)[0];
  if (!fila) return new Response('Escenario incompleto', { status: 422 });

  const credito = Number(op.credito ?? 0);
  const remanente = Number(op.remanente ?? 0);
  const notCliente = Number(op.not_cliente ?? 0);
  const trolPone = inm.aliado_cubre_notariales ? Number(inm.notariales_adicionales ?? 0) : 0;
  const aportaciones = Number(fila.aportaciones_aplicadas ?? 0);
  const flujo = Number(fila.flujo_neto_acum ?? 0);
  const plusvalia = Number(fila.bloques?.detalle?.plusvalia_100 ?? 0);
  const recibe = Number(fila.efectivo ?? 0);
  // Lo que el esquema genera CONTRA no hacer nada, medido al corte: el efectivo de la venta
  // reinvertido (parte a bajar deudas, parte al rendimiento alterno) menos lo que su saldo
  // habría valido quieto en Infonavit al mismo corte.
  const ventajaCorte = Number(fila.ventaja_corte ?? 0);
  const corte = Number(pal.corte_anios ?? 10);
  const pctDeuda = Math.round(Number(pal.pct_deuda ?? 0) * 100);
  const tasaDeuda = Math.round(Number(pal.tasa_deuda ?? 0) * 100);
  const alterno = Math.round(Number(pal.alterno ?? 0) * 100);
  const logoW = Math.round(74 * LOGO_TROL_RATIO);

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', backgroundColor: '#fff', fontFamily: 'Inter' }}>
        {/* ---- banda ---- */}
        <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: DARK, padding: '32px 56px 28px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_TROL_BLANCO} width={logoW} height={74} alt="" />
          <div style={{ fontSize: 42, fontWeight: 700, color: '#fff', marginTop: 22, lineHeight: 1.15 }}>{inm && ent.proyecto?.desarrollo}</div>
          <div style={{ fontSize: 24, color: '#C9CCD0', marginTop: 6 }}>{ent.proyecto?.zona ?? ''}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: LIME, marginTop: 16 }}>{clientes}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', padding: '0 56px', flexGrow: 1 }}>
          {/* ---- precio ---- */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', backgroundColor: CREAM, padding: '16px 20px', marginTop: 24 }}>
            <div style={{ fontSize: 24, color: GRAY }}>Precio de escrituración</div>
            <div style={{ fontSize: 34, fontWeight: 700, color: DARK }}>{mx(inm.escrituracion)}</div>
          </div>

          {/* ---- con qué se paga ---- */}
          <Titulo t="Con qué se paga" />
          <Fila k="Su subcuenta de vivienda" v={mx(op.saldo_apl)}
            sub={remanente > 0 ? `Le quedan ${mx(remanente)} en su subcuenta` : undefined} />
          {credito > 0 ? <Fila k="Crédito Infonavit" v={mx(credito)} sub={`Retención de ${mx(op.pmt)} al mes`} /> : null}

          {/* ---- quién más pone ---- */}
          <Titulo t="Quién más pone" />
          {aportaciones > 0 ? <Fila k="Su empresa, aportación patronal" v={mx(aportaciones)} sub="Amortiza el crédito mientras usted cotiza" /> : null}
          {trolPone > 0 ? <Fila k="Trol, gastos notariales" v={mx(trolPone)} sub="Los cubrimos nosotros" /> : null}
          {notCliente > 0 ? <Fila k="Usted, gastos notariales al inicio" v={mx(notCliente)} sub="Una sola vez, de contado" /> : null}
          {flujo < 0 ? <Fila k={`Usted, en ${h} meses`} v={mx(flujo)} sub="Lo que la renta no alcanza a cubrir de la retención" /> : null}

          {/* ---- lo que genera ---- */}
          <Titulo t={`Lo que genera el inmueble en ${h} meses`} />
          {flujo > 0 ? <Fila k="Rentas ya netas de gastos y retención" v={mx(flujo)} /> : null}
          <Fila k="Plusvalía sobre el inmueble completo" v={mx(plusvalia)} />
        </div>

        {/* ---- lo que recibe ---- */}
        <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: DARK, padding: '26px 56px 24px' }}>
          <div style={{ fontSize: 26, color: '#C9CCD0' }}>{`Recibe al vender a ${h} meses`}</div>
          <div style={{ fontSize: 84, fontWeight: 700, color: LIME, lineHeight: 1.05, marginTop: 2 }}>{mx(recibe)}</div>
          <div style={{ fontSize: 20, color: '#9DA1A6', marginTop: 6 }}>
            Ya liquidado el crédito, con rentas y devolución de ISR
          </div>
          <div style={{ display: 'flex', height: 1, backgroundColor: '#43464A', marginTop: 20, marginBottom: 16 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div style={{ fontSize: 24, color: '#C9CCD0' }}>{`Generó contra dejarlo en Infonavit, a ${corte} años`}</div>
            <div style={{ fontSize: 46, fontWeight: 700, color: '#fff' }}>{(ventajaCorte >= 0 ? '+' : '−') + mx(ventajaCorte)}</div>
          </div>
          <div style={{ fontSize: 19, color: '#9DA1A6', marginTop: 6 }}>
            {`Reinvirtiendo el efectivo: ${pctDeuda}% a bajar deudas al ${tasaDeuda}% y el resto al ${alterno}% anual`}
          </div>
        </div>

        {/* ---- pie ---- */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 56px', borderTop: `1px solid ${LINEA}` }}>
          <div style={{ fontSize: 17, color: GRAY, maxWidth: 760 }}>
            {`Estimación con plusvalía de ${Math.round(Number(pal.plusvalia ?? 0) * 100)}% anual, que es un supuesto. El detalle completo va en la propuesta.`}
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: fuentesResumen() },
  );
}
