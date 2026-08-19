// Propuesta Infonavit de una página. Puerto de `generar_propuesta.py` a @react-pdf/renderer.
//
// GUARDARRAILES (Producto_Infonavit_Contexto.md §7) — este documento se le entrega al cliente:
//  · Nunca el costo del aliado, su comisión ni el PnL interno.
//  · Nunca opinión institucional sobre Infonavit.
//  · Nunca comparativos de inmuebles más baratos.
//  · Los supuestos van marcados como supuestos, y el contrafactual honesto va completo.
//  · Se habla sólo de lo que aplica: si no hay crédito, no se explica el crédito.
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { Any } from '@/lib/trol3/server';
import { LOGO_TROL_BLANCO, LOGO_TROL_RATIO } from '@/lib/marca/logo';

const DARK = '#26282B', LIME = '#D1F069', GRAY = '#8A8D91', CREAM = '#F4F4F2', RED = '#B0532F', NEG = '#D9A08C';
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

const mx = (n: Any, signed = false) => {
  const v = Number(n);
  if (n == null || Number.isNaN(v)) return '—';
  const t = '$' + Math.abs(Math.round(v)).toLocaleString('es-MX');
  return v < 0 ? `(${t})` : (signed && v > 0 ? '+' : '') + t;
};
const pc = (n: Any, d = 1) => (n == null || Number.isNaN(Number(n)) ? '—' : (Number(n) * 100).toFixed(d) + '%');

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 46, paddingHorizontal: 0, fontSize: 9, color: DARK, fontFamily: 'Helvetica' },
  band: { backgroundColor: DARK, paddingHorizontal: 46, paddingVertical: 14 },
  // Brandbook: nunca recolorear, rotar ni deformar. El ratio mantiene la proporción.
  logoBanda: { height: 34, width: 34 * LOGO_TROL_RATIO },
  logoPie: { height: 13, width: 13 * LOGO_TROL_RATIO },
  bandTitle: { fontSize: 13, fontWeight: 700, color: '#fff', marginTop: 10 },
  bandSub: { fontSize: 8.8, color: '#C9CCD0', marginTop: 3 },
  bandLime: { fontSize: 9.5, fontWeight: 700, color: LIME, marginTop: 5 },
  body: { paddingHorizontal: 46, paddingTop: 13 },
  secTitle: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 },
  secRule: { width: 30, height: 2, backgroundColor: LIME, marginBottom: 7 },
  two: { flexDirection: 'row', gap: 26 },
  col: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.2 },
  lbl: { color: GRAY, fontSize: 8.8, flex: 1, paddingRight: 8 },
  val: { fontWeight: 700, fontSize: 8.8 },
  thead: { flexDirection: 'row', backgroundColor: DARK, paddingVertical: 4, paddingHorizontal: 6 },
  th: { color: '#fff', fontSize: 8.4, fontWeight: 700 },
  tr: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6 },
  td: { fontSize: 8.8 },
  barTrack: { flexDirection: 'row', alignItems: 'center', height: 8, width: 120 },
  cajaOscura: { backgroundColor: DARK, paddingVertical: 7, paddingHorizontal: 10, marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cajaLime: { color: LIME, fontSize: 11, fontWeight: 700 },
  cajaNota: { color: '#fff', fontSize: 8.2 },
  sup: { color: GRAY, fontSize: 7.5, marginBottom: 2.5, lineHeight: 1.3 },
  foot: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, backgroundColor: DARK, paddingHorizontal: 46, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});

function Sec({ t }: { t: string }) {
  return <View><Text style={s.secTitle}>{t}</Text><View style={s.secRule} /></View>;
}
function Row({ l, v, fuerte }: { l: string; v: string; fuerte?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={[s.lbl, fuerte ? { color: DARK, fontWeight: 700 } : {}]}>{l}</Text>
      <Text style={s.val}>{v}</Text>
    </View>
  );
}

export function infonavitDoc(a: Any) {
  const r = (a.resultado ?? {}) as Any;
  const ent = (a.entrada ?? {}) as Any;
  const op = r.operacion ?? {};
  const pal = ent.palancas ?? {};
  const sup = ent.supuestos ?? {};
  const tabla: Any[] = r.tabla ?? [];
  const mejorH = r.veredicto?.mejor_horizonte;
  const mejor = tabla.find((f) => f.horizonte === mejorH) ?? tabla[tabla.length - 1];
  const det = mejor?.bloques?.detalle ?? {};
  const hayCredito = Number(op.credito ?? 0) > 0;
  const conyugal = (ent.titulares ?? []).filter((t: Any) => Number(t?.salario_imss ?? 0) > 0).length > 1;
  const hoy = a.created_at ? new Date(a.created_at) : new Date();
  const inm = ent.inmueble ?? {};
  const rentaNeta = Number(op.renta_neta ?? 0);
  const flujo = Number(op.flujo_mensual ?? 0);
  const corte = Number(pal.corte_anios ?? 10);

  // Las fuentes suman EXACTAMENTE la ventaja a la venta: intereses e ISR van por
  // separado (el Excel los contaba dos veces, sueltos y dentro del bloque II).
  const fuentesTodas: [string, number][] = [
    [`Plusvalía sobre el inmueble completo (${mx(inm.escrituracion)}, no sólo su saldo)`, Number(det.plusvalia_100 ?? 0) + Number(det.descuento ?? 0)],
    ['Rentas netas acumuladas', Number(det.renta_acum ?? 0)],
    ['Devolución de ISR por los intereses reales del crédito', Number(det.isr_devuelto ?? 0)],
    ['Saldo que se consumiría financiando su pensión y aquí se rescata', Number(mejor?.bloques?.IV_rescate ?? 0)],
    ['Intereses del crédito', Number(det.intereses ?? 0)],
    ['Comisión de venta y gastos notariales', Number(det.comision_venta ?? 0) + Number(det.notariales_credito ?? 0) + Number(det.notariales_cliente ?? 0)],
    ['Lo que su saldo habría ganado de todos modos donde está', Number(det.oportunidad_saldo ?? 0) + Number(det.aportaciones_netas ?? 0)],
  ];
  // "Hablar sólo de lo que aplica": las fuentes en cero no se mencionan.
  const fuentes = fuentesTodas.filter(([, v]) => Math.abs(v) > 1);
  const maxAbs = Math.max(...fuentes.map(([, v]) => Math.abs(v)), 1);

  return (
    <Document title={`Propuesta Infonavit · ${a.clienteNombre ?? ''}`}>
      <Page size="LETTER" style={s.page}>
        <View style={s.band}>
          <Image src={LOGO_TROL_BLANCO} style={s.logoBanda} />
          <Text style={s.bandTitle}>Propuesta de inversión con tu Subcuenta de Vivienda</Text>
          <Text style={s.bandSub}>{a.clienteNombre ?? ''}{a.cotitularNombre ? ` y ${a.cotitularNombre}` : ''}</Text>
          <Text style={s.bandSub}>
            {conyugal ? 'Crédito conyugal Infonavit' : 'Crédito Infonavit'}   |   {MESES[hoy.getMonth()]} {hoy.getFullYear()}
          </Text>
          <Text style={s.bandLime}>{ent.proyecto?.desarrollo ?? ''}{ent.proyecto?.zona ? ` · ${ent.proyecto.zona}` : ''}</Text>
        </View>

        <View style={s.body}>
          <Sec t="La operación" />
          <View style={s.two}>
            <View style={s.col}>
              <Row l="Saldo de vivienda que entra como enganche" v={mx(op.saldo_apl)} />
              <Row l="Valor de escrituración del inmueble" v={mx(inm.escrituracion)} />
              {hayCredito
                ? <Row l={`Crédito Infonavit (incluye ${mx(op.not_credito)} de gastos)`} v={mx(op.credito)} />
                : <Row l="Crédito Infonavit requerido" v="Ninguno: su saldo alcanza" />}
              <Row l="Notariales adicionales a su cargo, una sola vez"
                v={Number(op.not_cliente ?? 0) > 0 ? mx(op.not_cliente) : 'Los cubre Trol'} />
              {Number(op.remanente ?? 0) > 0 && <Row l="Saldo que se queda en su subcuenta" v={mx(op.remanente)} />}
            </View>
            <View style={s.col}>
              {hayCredito && <Row l="Retención mensual del crédito" v={mx(op.pmt)} />}
              <Row l={`Renta${ent.proyecto?.renta_estimada ? ' estimada' : ''}, neta de mantenimiento y gestión`} v={mx(rentaNeta)} />
              <View style={{ borderTopWidth: 0.7, borderTopColor: '#C9CCD0', marginVertical: 3 }} />
              {flujo < 0
                ? <Row fuerte l="Aporta de su bolsillo cada mes, mientras se renta" v={mx(-flujo)} />
                : <Row fuerte l="La renta cubre la retención y deja a su favor" v={`${mx(flujo)} /mes`} />}
            </View>
          </View>

          <View style={{ height: 10 }} />
          <Sec t="Qué recibiría al vender, según cuándo venda" />
          <View style={s.thead}>
            <Text style={[s.th, { width: 130 }]}> </Text>
            <Text style={[s.th, { width: 115 }]}>Efectivo al vender</Text>
            <Text style={[s.th, { width: 130 }]}>vs. dejarlo donde está</Text>
            <Text style={s.th}>Plusvalía que lo empata</Text>
          </View>
          {tabla.map((f, i) => (
            <View key={f.horizonte} style={[s.tr, i % 2 === 0 ? { backgroundColor: CREAM } : {}]}>
              <Text style={[s.td, { width: 130, fontWeight: 700 }]}>A {f.horizonte} meses</Text>
              <Text style={[s.td, { width: 115 }]}>{mx(f.efectivo)}</Text>
              <Text style={[s.td, { width: 130, color: Number(f.ventaja_venta) >= 0 ? DARK : RED }]}>{mx(f.ventaja_venta, true)}</Text>
              <Text style={[s.td, { color: GRAY }]}>{pc(f.plusvalia_equilibrio)} anual</Text>
            </View>
          ))}
          <Text style={[s.sup, { marginTop: 5 }]}>
            Supuesto base: plusvalía de {pc(pal.plusvalia, 0)} anual. La última columna es la plusvalía mínima que
            necesitaría cada plazo para quedar a mano.
          </Text>

          <View style={{ height: 8 }} />
          <Sec t={`De dónde sale el valor en el plazo recomendado (${mejorH} meses)`} />
          {fuentes.map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 2 }}>
              <Text style={{ fontSize: 8.6, flex: 1, paddingRight: 8 }}>{k}</Text>
              <View style={s.barTrack}>
                <View style={{ width: 60, alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'flex-end' }}>
                  {v < 0 && <View style={{ width: (Math.abs(v) / maxAbs) * 60, height: 7, backgroundColor: NEG }} />}
                </View>
                <View style={{ width: 60 }}>
                  {v >= 0 && <View style={{ width: (v / maxAbs) * 60, height: 7, backgroundColor: LIME }} />}
                </View>
              </View>
              <Text style={{ fontSize: 8.6, fontWeight: 700, width: 78, textAlign: 'right' }}>{mx(v, true)}</Text>
            </View>
          ))}
          <View style={s.cajaOscura}>
            <Text style={s.cajaLime}>RECIBE AL VENDER A {mejorH} MESES:  {mx(mejor?.efectivo)}</Text>
            <Text style={s.cajaNota}>ya liquidado el crédito, con rentas y devolución de ISR</Text>
          </View>
          <View style={{ marginTop: 6, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 9.5, fontWeight: 700 }}>VENTAJA AL VENDER, FRENTE A DEJAR EL SALDO DONDE ESTÁ</Text>
            <Text style={{ fontSize: 9.5, fontWeight: 700 }}>{mx(mejor?.ventaja_venta, true)}</Text>
          </View>

          <View style={{ height: 9 }} />
          <Sec t="Y después de vender: su dinero por fin trabaja para usted" />
          <Text style={{ fontSize: 8.8, marginBottom: 3 }}>
            Hoy su saldo crece a alrededor de {pc(sup.r_ssv ?? 0.04, 0)} anual. Vendiendo, el efectivo puede
            invertirse a su alternativa realista ({pc(pal.alterno, 0)} anual) o bajar deudas caras.
          </Text>
          <Text style={{ fontSize: 8.8 }}>
            Medido a {corte} años: vender a {mejorH} meses y reinvertir llega a {mx(Number(mejor?.ventaja_corte ?? 0) + Number(r.contrafactual_corte ?? 0))},
            contra {mx(r.contrafactual_corte)} si no hace nada.
          </Text>
          <View style={s.cajaOscura}>
            <Text style={s.cajaLime}>VENTAJA TOTAL A {corte} AÑOS:  {mx(mejor?.ventaja_corte, true)}</Text>
            <Text style={s.cajaNota}>patrimonio del esquema contra no hacer nada, al mismo corte</Text>
          </View>

          <View style={{ height: 9 }} />
          <Sec t="Supuestos base de esta propuesta" />
          <Text style={s.sup}>
            Plusvalía de {pc(pal.plusvalia, 0)} anual y renta de {mx(inm.renta)} mensuales ({mx(rentaNeta)} netos)
            {ent.proyecto?.renta_estimada ? ', estimados por nosotros y no observados en el mercado' : ''}.
          </Text>
          <Text style={s.sup}>
            Rendimiento de la Subcuenta de Vivienda: alrededor de {pc(sup.r_ssv ?? 0.04, 0)} anual proyectado. Venta libre
            de ISR bajo la exención de casa habitación, a confirmar con su contador.
          </Text>
          <Text style={s.sup}>
            Del efectivo de la venta se asume que un {pc(pal.pct_deuda, 0)} baja deudas con tasa promedio de
            {' '}{pc(pal.tasa_deuda, 0)} anual y el resto se invierte a {pc(pal.alterno, 0)}.
          </Text>
          <Text style={s.sup}>
            La devolución de ISR depende de su ingreso declarado y del tope de deducciones personales. Cifras en pesos
            corrientes; no son garantía de rendimiento.
          </Text>
          {a.saldoSinConfirmar ? (
            <Text style={[s.sup, { color: DARK }]}>
              El saldo de vivienda usado en esta propuesta es una estimación nuestra a partir de su historial de
              salarios. Para formalizar necesitamos el saldo real de su cuenta.
            </Text>
          ) : null}
        </View>

        <View style={s.foot} fixed>
          <Image src={LOGO_TROL_BLANCO} style={s.logoPie} />
          <Text style={{ fontSize: 7.5, color: '#C9CCD0' }}>
            Propuesta personalizada{a.miembro ? `  |  Preparada por ${a.miembro}` : ''}  |  Vigencia 30 días
          </Text>
        </View>
      </Page>
    </Document>
  );
}
