// Propuesta Infonavit en dos formatos: `resumen` (1 página, la historia en 5 actos) y
// `extendido` (portada narrativa + detalle financiero). Spec: narrativa v2 del 28-ago-2026.
//
// GUARDARRAILES (Producto_Infonavit_Contexto.md §7) — este documento se le entrega al cliente:
//  · Nunca el costo del aliado, su comisión ni el PnL interno. (La nota "cómo cobramos" dice
//    que nos paga el desarrollador, sin montos: transparencia sin abrir el PnL.)
//  · Nunca opinión institucional sobre Infonavit.
//  · Nunca comparativos de inmuebles más baratos.
//  · Los supuestos van marcados como supuestos, y el contrafactual honesto va completo.
//  · Se habla sólo de lo que aplica: si no hay crédito, no se explica el crédito.
//  · La plusvalía NUNCA lleva cifra en la narrativa: la tasa va como nota al pie y los montos
//    solo en el detalle. No se promete renta inmediata: "se pone en renta".
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { calcularAsesoriaInfonavit } from '@trol/pension-core';
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
// Narrativa: redondeado a miles ("los números exactos van en el detalle").
const mxMiles = (n: Any) => {
  const v = Number(n);
  if (n == null || Number.isNaN(v)) return '—';
  return '$' + (Math.round(Math.abs(v) / 1000) * 1000).toLocaleString('es-MX');
};
const pc = (n: Any, d = 1) => (n == null || Number.isNaN(Number(n)) ? '—' : (Number(n) * 100).toFixed(d) + '%');
const anios = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', '.'));

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 46, paddingHorizontal: 0, fontSize: 9, color: DARK, fontFamily: 'Helvetica' },
  band: { backgroundColor: DARK, paddingHorizontal: 46, paddingVertical: 14 },
  bandChica: { backgroundColor: DARK, paddingHorizontal: 46, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  // Brandbook: nunca recolorear, rotar ni deformar. El ratio mantiene la proporción.
  logoBanda: { height: 34, width: 34 * LOGO_TROL_RATIO },
  logoChico: { height: 18, width: 18 * LOGO_TROL_RATIO },
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
  // ---- narrativa ----
  actoTxt: { fontSize: 10, lineHeight: 1.45 },
  numGrande: { fontSize: 24, fontWeight: 700, marginTop: 2, marginBottom: 2 },
  tarjetas: { flexDirection: 'row', gap: 8, marginTop: 2 },
  tarjeta: { backgroundColor: CREAM, padding: 10, flex: 1 },
  tarjetaOscura: { backgroundColor: DARK, padding: 10, flex: 1, justifyContent: 'center' },
  tarLbl: { fontSize: 7.6, fontWeight: 700, color: GRAY, letterSpacing: 0.6, marginBottom: 4 },
  tarNum: { fontSize: 16, fontWeight: 700 },
  tarSub: { fontSize: 8.2, color: GRAY, marginTop: 2, lineHeight: 1.3 },
  lado: { flexDirection: 'row', marginTop: 4, alignItems: 'flex-start' },
  ladoPunto: { width: 5, height: 5, backgroundColor: LIME, marginTop: 3, marginRight: 6 },
  ladoTxt: { fontSize: 8.6, lineHeight: 1.35, flex: 1 },
  tarTxt: { fontSize: 8.6, lineHeight: 1.35 },
  suma: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.6 },
  sumaLbl: { fontSize: 8.6, color: GRAY, flex: 1, paddingRight: 8 },
  sumaVal: { fontSize: 8.6, fontWeight: 700 },
  sumaTotal: { borderTopWidth: 0.7, borderTopColor: '#C9CCD0', marginTop: 2, paddingTop: 2.5 },
  cajaComparar: { backgroundColor: CREAM, padding: 12, marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 14 },
  pasos: { flexDirection: 'row', gap: 14, marginTop: 3, marginBottom: 6 },
  pasoNum: { fontSize: 13, fontWeight: 700, color: GRAY },
  pasoTxt: { fontSize: 8.6, lineHeight: 1.3 },
  mapa: { borderTopWidth: 0.8, borderTopColor: '#C9CCD0', marginTop: 10, paddingTop: 7 },
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

/** Todo lo que la narrativa y el detalle necesitan, derivado una sola vez. */
export function derivar(a: Any) {
  let r = (a.resultado ?? {}) as Any;
  const ent = (a.entrada ?? {}) as Any;
  const pal = ent.palancas ?? {};
  const sup = ent.supuestos ?? {};
  const inm = ent.inmueble ?? {};
  const h = Number(a.horizonte ?? r.veredicto?.mejor_horizonte);
  const aniosVenta = h / 12;
  // El corte de medición default es min(5 años, venta + 3). Una asesoría guardada con otro
  // corte (p. ej. las previas al 28-ago, con 10) se re-deriva con el motor sobre su entrada
  // congelada, para que el documento mida "el después" en el plazo correcto.
  const corteObjetivo = Math.min(5, aniosVenta + 3);
  let corte = Number(pal.corte_anios ?? 10);
  if (Math.abs(corte - corteObjetivo) > 1e-9 && (ent.titulares ?? []).length && ent.inmueble) {
    try {
      r = calcularAsesoriaInfonavit({ titulares: ent.titulares }, ent.inmueble, sup, { ...pal, corte_anios: corteObjetivo }) as Any;
      corte = corteObjetivo;
    } catch { /* si el motor no puede (datos viejos), se queda lo guardado */ }
  }
  const op = r.operacion ?? {};
  const tabla: Any[] = r.tabla ?? [];
  const fila = tabla.find((f) => Number(f.horizonte) === h) ?? tabla[tabla.length - 1];
  const det = fila?.bloques?.detalle ?? {};
  const hoy = a.created_at ? new Date(a.created_at) : new Date();
  return {
    r, ent, op, pal, sup, inm, tabla, h, fila, det, hoy,
    ssvTotal: Number(op.saldo_apl ?? 0) + Number(op.remanente ?? 0),
    efectivo: Number(fila?.efectivo ?? 0),
    flujo: Number(op.flujo_mensual ?? 0),
    credito: Number(op.credito ?? 0),
    isrAnual: aniosVenta > 0 ? Number(det.isr_devuelto ?? 0) / aniosVenta : 0,
    aportaciones: Number(fila?.aportaciones_aplicadas ?? 0),
    rescate: Number(fila?.bloques?.IV_rescate ?? 0) > 0,
    notCliente: Number(op.not_cliente ?? 0),
    sobreprecio: Number(op.sobreprecio ?? 0),
    corte,
    aniosDespues: Math.max(corte - aniosVenta, 0),
    ventajaCorte: Number(fila?.ventaja_corte ?? 0),
    ventajaVenta: Number(fila?.ventaja_venta ?? 0),
    rentaNeta: Number(op.renta_neta ?? 0),
    rentaBruta: Number(inm.renta ?? 0),
    mantGestion: Math.max(Number(inm.renta ?? 0) - Number(op.renta_neta ?? 0), 0),
    pmt: Number(op.pmt ?? 0),
    desarrollo: ent.proyecto?.desarrollo ?? '',
    zona: ent.proyecto?.zona ?? '',
    rentaEstimada: Boolean(ent.proyecto?.renta_estimada),
    conyugal: ((ent.titulares ?? []) as Any[]).filter((t) => Number(t?.salario_imss ?? 0) > 0).length > 1,
    mejorH: Number(a.horizonte ?? r.veredicto?.mejor_horizonte),
  };
}

function Banda({ a, d }: { a: Any; d: ReturnType<typeof derivar> }) {
  return (
    <View style={s.band}>
      <Image src={LOGO_TROL_BLANCO} style={s.logoBanda} />
      <Text style={s.bandTitle}>Tu ahorro de vivienda, puesto a trabajar</Text>
      <Text style={s.bandSub}>{a.clienteNombre ?? ''}{a.cotitularNombre ? ` y ${a.cotitularNombre}` : ''}</Text>
      <Text style={s.bandSub}>
        {d.conyugal ? 'Crédito conyugal Infonavit' : 'Propuesta Infonavit'}   |   {MESES[d.hoy.getMonth()]} {d.hoy.getFullYear()}
      </Text>
      <Text style={s.bandLime}>{d.desarrollo}{d.zona ? ` · ${d.zona}` : ''}</Text>
    </View>
  );
}

function BandaChica({ a, t }: { a: Any; t: string }) {
  return (
    <View style={s.bandChica}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Image src={LOGO_TROL_BLANCO} style={s.logoChico} />
        <Text style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>{t}</Text>
      </View>
      <Text style={{ fontSize: 8.2, color: '#C9CCD0' }}>{a.clienteNombre ?? ''}</Text>
    </View>
  );
}

function Pie({ a }: { a: Any }) {
  return (
    <View style={s.foot} fixed>
      <Image src={LOGO_TROL_BLANCO} style={s.logoPie} />
      <Text style={{ fontSize: 7.5, color: '#C9CCD0' }}>
        Propuesta personalizada{a.miembro ? `  |  Preparada por ${a.miembro}` : ''}  |  Vigencia 30 días
      </Text>
    </View>
  );
}

/* ------------------------------- La historia (5 actos) ------------------------------- */

function PaginaNarrativa({ a, d, extendido }: { a: Any; d: ReturnType<typeof derivar>; extendido: boolean }) {
  const aprox = a.saldoSinConfirmar ? 'alrededor de ' : '';
  return (
    <Page size="LETTER" style={s.page}>
      <Banda a={a} d={d} />
      <View style={s.body}>
        <Sec t="Tu ahorro, hoy" />
        <Text style={s.numGrande}>{mxMiles(d.ssvTotal)}</Text>
        <Text style={s.actoTxt}>
          Eso tienes {aprox}ahorrado en tu Subcuenta de Vivienda del Infonavit. Es dinero tuyo, pero hoy está
          detenido: gana poco{d.rescate ? ' y, si te pensionas por la Ley del 73, una parte se usaría para financiar tu pensión en lugar de llegar a tu bolsillo' : ''}.
        </Text>

        <View style={{ height: 11 }} />
        <Sec t="La propuesta" />
        <Text style={s.actoTxt}>
          Usar ese ahorro como enganche de un inmueble en {d.desarrollo}{d.zona ? ` (${d.zona})` : ''} que se pone
          en renta. Tú no lo habitas: es una inversión, y tú decides cuándo venderla y cobrar.
        </Text>

        <View style={{ height: 11 }} />
        <Sec t="Así se vería" />
        <View style={s.tarjetas}>
          <View style={s.tarjeta}>
            <Text style={s.tarLbl}>PONES HOY</Text>
            <Text style={s.tarNum}>{d.notCliente > 0 ? mxMiles(d.notCliente) : '$0'}</Text>
            <Text style={s.tarSub}>{d.notCliente > 0 ? 'gastos notariales, una sola vez' : 'de tu bolsillo'}</Text>
            {d.sobreprecio > 0 ? <Text style={s.tarSub}>y recibes {mxMiles(d.sobreprecio)} en efectivo el día de la firma</Text> : null}
          </View>
          <View style={[s.tarjeta, { flex: 1.55 }]}>
            <Text style={s.tarLbl}>MIENTRAS ES TUYO</Text>
            {d.credito > 0 ? (
              <View>
                <View style={s.suma}><Text style={s.sumaLbl}>Renta{d.rentaEstimada ? ' estimada' : ''}, ya sin gastos</Text><Text style={s.sumaVal}>{mx(d.rentaNeta)}</Text></View>
                <View style={s.suma}><Text style={s.sumaLbl}>Pago del crédito</Text><Text style={s.sumaVal}>- {mx(d.pmt)}</Text></View>
                <View style={[s.suma, s.sumaTotal]}><Text style={[s.sumaLbl, { color: DARK, fontWeight: 700 }]}>{d.flujo >= 0 ? 'Te quedan, cada mes' : 'Completas, cada mes'}</Text><Text style={[s.sumaVal, d.flujo < 0 ? { color: RED } : {}]}>{mx(d.flujo, true)}</Text></View>
              </View>
            ) : (
              <Text style={[s.tarTxt, { marginTop: 2 }]}>Renta{d.rentaEstimada ? ' estimada' : ''}, ya sin gastos: <Text style={{ fontWeight: 700 }}>{mx(d.rentaNeta)} al mes</Text> a tu favor.</Text>
            )}
            <Text style={[s.tarLbl, { marginTop: 7, marginBottom: 0 }]}>Y POR DETRÁS, SIN QUE HAGAS NADA</Text>
            {d.aportaciones > 0 && d.credito > 0 ? (
              <View style={s.lado}>
                <View style={s.ladoPunto} />
                <Text style={s.ladoTxt}>Tu empleador sigue aportando a capital del crédito</Text>
              </View>
            ) : null}
            {d.credito > 0 ? (
              <View style={s.lado}>
                <View style={s.ladoPunto} />
                <Text style={s.ladoTxt}>Tienes beneficios fiscales: los intereses son deducibles</Text>
              </View>
            ) : null}
            <View style={s.lado}>
              <View style={s.ladoPunto} />
              <Text style={s.ladoTxt}>El inmueble gana valor con el tiempo*</Text>
            </View>
          </View>
          <View style={s.tarjetaOscura}>
            <Text style={[s.tarLbl, { color: '#C9CCD0' }]}>AL VENDER A {d.h} MESES</Text>
            <Text style={[s.tarNum, { color: LIME }]}>{mxMiles(d.efectivo)}</Text>
            <Text style={[s.tarSub, { color: '#C9CCD0' }]}>recibes, ya liquidado el crédito y pagados los costos de venta</Text>
          </View>
        </View>
        <Text style={[s.sup, { marginTop: 5 }]}>
          *La plusvalía se estimó en {pc(d.pal.plusvalia, 0)} anual: es un supuesto, no una promesa. Sus montos y qué
          pasa si resulta menor van en {extendido ? 'las siguientes páginas' : 'el documento extendido'}.
        </Text>

        <View style={{ height: 11 }} />
        <Sec t="¿Y si no haces nada?" />
        <View style={s.cajaComparar}>
          <Text style={[s.actoTxt, { flex: 1, fontSize: 9.2 }]}>
            La comparación no termina el día que vendes: contamos también lo que ese dinero te genera reinvertido
            los siguientes {anios(d.aniosDespues)} años, contra dejar tu saldo en Infonavit todo ese tiempo.
          </Text>
          <View>
            <Text style={{ fontSize: 18, fontWeight: 700, color: d.ventajaCorte >= 0 ? DARK : RED, textAlign: 'right' }}>{(d.ventajaCorte >= 0 ? '+' : '-') + mxMiles(d.ventajaCorte)}</Text>
            <Text style={{ fontSize: 7.8, color: GRAY, textAlign: 'right' }}>{d.ventajaCorte >= 0 ? 'a tu favor' : 'en tu contra'}, a {anios(d.corte)} años</Text>
          </View>
        </View>

        <View style={{ height: 11 }} />
        <Sec t="Qué sigue" />
        <View style={s.pasos}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}><Text style={s.pasoNum}>1</Text><Text style={s.pasoTxt}>Confirmamos tu saldo real y tu precalificación</Text></View>
          <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}><Text style={s.pasoNum}>2</Text><Text style={s.pasoTxt}>Apartas el inmueble</Text></View>
          <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}><Text style={s.pasoNum}>3</Text><Text style={s.pasoTxt}>Firmas y se pone en renta</Text></View>
        </View>
        <Text style={s.sup}>
          Los números de esta página están redondeados y usan renta{d.rentaEstimada ? ' estimada' : ''} y plusvalía
          estimadas: son escenarios, no promesas. El detalle exacto está en {extendido ? 'las siguientes páginas' : 'el documento extendido'}.
        </Text>

        {extendido ? (
          <View style={s.mapa}>
            <Text style={[s.sup, { color: DARK, fontWeight: 700 }]}>En las siguientes páginas</Text>
            <Text style={s.sup}>2 · La operación al detalle y qué recibirías según cuándo vendas   ·   3 · De dónde sale cada peso, qué pasa después de vender, los supuestos y cómo cobramos</Text>
          </View>
        ) : null}
      </View>
      <Pie a={a} />
    </Page>
  );
}

/* ---------------------------------- El detalle ---------------------------------- */

function SecOperacion({ d }: { d: ReturnType<typeof derivar> }) {
  const { op } = d;
  const hayCredito = d.credito > 0;
  return (
    <View>
      <Sec t="Cómo se arma la compra" />
      <Text style={{ fontSize: 8.8, marginBottom: 4, lineHeight: 1.4 }}>
        El inmueble se escritura en {mx(op.esc)}. Nadie te pide dinero para comprarlo: se paga con tu ahorro
        {hayCredito ? ' y un crédito Infonavit que la renta va pagando' : ''}.
      </Text>
      <View style={s.two}>
        <View style={s.col}>
          <View style={s.suma}><Text style={s.sumaLbl}>Tu Subcuenta de Vivienda, como enganche</Text><Text style={s.sumaVal}>{mx(op.saldo_apl)}</Text></View>
          {hayCredito
            ? <View style={s.suma}><Text style={s.sumaLbl}>Crédito Infonavit (trae {mx(op.not_credito)} de gastos del crédito incluidos)</Text><Text style={s.sumaVal}>+ {mx(op.credito)}</Text></View>
            : <View style={s.suma}><Text style={s.sumaLbl}>Crédito Infonavit</Text><Text style={s.sumaVal}>no hace falta</Text></View>}
          <View style={[s.suma, s.sumaTotal]}><Text style={[s.sumaLbl, { color: DARK, fontWeight: 700 }]}>Valor de escrituración</Text><Text style={s.sumaVal}>{mx(op.esc)}</Text></View>
          {d.sobreprecio > 0 ? (
            <Text style={[s.sup, { marginTop: 4 }]}>
              Se escritura por arriba del precio de venta y la diferencia — {mx(d.sobreprecio)} — se te entrega en
              efectivo el día de la firma.
            </Text>
          ) : null}
          {Number(op.remanente ?? 0) > 0 ? (
            <Text style={[s.sup, { marginTop: 4 }]}>En tu subcuenta quedan {mx(op.remanente)}, que siguen siendo tuyos.</Text>
          ) : null}
          <Text style={[s.sup, { marginTop: 4 }]}>
            Gastos de una sola vez: {hayCredito ? `los ${mx(op.not_credito)} del crédito van dentro del crédito, no salen de tu bolsa. ` : ''}
            {d.notCliente > 0 ? `Los notariales adicionales — ${mx(d.notCliente)} — sí son a tu cargo, de contado al inicio.` : 'Los notariales adicionales los cubre Trol.'}
          </Text>
        </View>
        <View style={s.col}>
          <View style={s.suma}><Text style={s.sumaLbl}>Renta{d.rentaEstimada ? ' estimada' : ''} del inmueble</Text><Text style={s.sumaVal}>{mx(d.rentaBruta)}</Text></View>
          {d.mantGestion > 0 ? <View style={s.suma}><Text style={s.sumaLbl}>Mantenimiento y gestión de la renta</Text><Text style={s.sumaVal}>- {mx(d.mantGestion)}</Text></View> : null}
          {hayCredito ? <View style={s.suma}><Text style={s.sumaLbl}>Pago del crédito (la retención normal de Infonavit)</Text><Text style={s.sumaVal}>- {mx(d.pmt)}</Text></View> : null}
          <View style={[s.suma, s.sumaTotal]}><Text style={[s.sumaLbl, { color: DARK, fontWeight: 700 }]}>{d.flujo >= 0 ? 'Te quedan, cada mes' : 'Completas de tu bolsa, cada mes'}</Text><Text style={[s.sumaVal, d.flujo < 0 ? { color: RED } : {}]}>{mx(d.flujo, true)}</Text></View>
          {hayCredito && d.aportaciones > 0 ? (
            <Text style={[s.sup, { marginTop: 4 }]}>
              Además, mientras sigas cotizando, la aportación de vivienda de tu empleador (5% de tu salario) abona
              directo a capital del crédito — por eso se liquida más rápido de lo que parece.
            </Text>
          ) : null}
          <Text style={[s.sup, { marginTop: 4 }]}>
            El inmueble es tuyo desde la firma: está escriturado a tu nombre y tú decides cuándo venderlo.
          </Text>
        </View>
      </View>
    </View>
  );
}

function SecPlazos({ d }: { d: ReturnType<typeof derivar> }) {
  return (
    <View>
      <Sec t="Qué recibiría al vender, según cuándo venda" />
      <View style={s.thead}>
        <Text style={[s.th, { width: 130 }]}> </Text>
        <Text style={[s.th, { width: 115 }]}>Efectivo al vender</Text>
        <Text style={[s.th, { width: 130 }]}>vs. dejarlo donde está</Text>
        <Text style={s.th}>Plusvalía que lo empata</Text>
      </View>
      {d.tabla.map((f, i) => (
        <View key={f.horizonte} style={[s.tr, i % 2 === 0 ? { backgroundColor: CREAM } : {}]}>
          <Text style={[s.td, { width: 130, fontWeight: 700 }]}>A {f.horizonte} meses{Number(f.horizonte) === d.h ? '  — elegido' : ''}</Text>
          <Text style={[s.td, { width: 115 }]}>{mx(f.efectivo)}</Text>
          <Text style={[s.td, { width: 130, color: Number(f.ventaja_venta) >= 0 ? DARK : RED }]}>{mx(f.ventaja_venta, true)}</Text>
          <Text style={[s.td, { color: GRAY }]}>{pc(f.plusvalia_equilibrio)} anual</Text>
        </View>
      ))}
      <Text style={[s.sup, { marginTop: 5 }]}>
        Supuesto base: plusvalía de {pc(d.pal.plusvalia, 0)} anual. La última columna es la plusvalía mínima que
        necesitaría cada plazo para quedar a mano.
      </Text>
    </View>
  );
}

function SecFuentes({ d }: { d: ReturnType<typeof derivar> }) {
  const { det, inm, fila } = d;
  // Las fuentes suman EXACTAMENTE la ventaja a la venta: intereses e ISR van por separado.
  const fuentesTodas: [string, number][] = [
    [`Plusvalía sobre el inmueble completo (${mx(inm.escrituracion)}, no sólo su saldo)`, Number(det.plusvalia_100 ?? 0) + Number(det.descuento ?? 0)],
    ['Rentas netas acumuladas', Number(det.renta_acum ?? 0)],
    ['Devolución de ISR por los intereses reales del crédito', Number(det.isr_devuelto ?? 0)],
    ['Saldo que se consumiría financiando su pensión y aquí se rescata', Number(fila?.bloques?.IV_rescate ?? 0)],
    ['Intereses del crédito', Number(det.intereses ?? 0)],
    ['Comisión de venta y gastos notariales', Number(det.comision_venta ?? 0) + Number(det.notariales_credito ?? 0) + Number(det.notariales_cliente ?? 0)],
    ['Lo que su saldo habría ganado de todos modos donde está', Number(det.oportunidad_saldo ?? 0) + Number(det.aportaciones_netas ?? 0)],
  ];
  const fuentes = fuentesTodas.filter(([, v]) => Math.abs(v) > 1);
  const maxAbs = Math.max(...fuentes.map(([, v]) => Math.abs(v)), 1);
  return (
    <View>
      <Sec t={`De dónde sale el valor en el plazo elegido (${d.h} meses)`} />
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
        <Text style={s.cajaLime}>RECIBE AL VENDER A {d.h} MESES:  {mx(d.efectivo)}</Text>
        <Text style={s.cajaNota}>ya liquidado el crédito, con rentas y devolución de ISR</Text>
      </View>
      <View style={{ marginTop: 6, flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 9.5, fontWeight: 700 }}>VENTAJA AL VENDER, FRENTE A DEJAR EL SALDO DONDE ESTÁ</Text>
        <Text style={{ fontSize: 9.5, fontWeight: 700, color: d.ventajaVenta >= 0 ? DARK : RED }}>{mx(d.ventajaVenta, true)}</Text>
      </View>
    </View>
  );
}

function SecDespues({ d }: { d: ReturnType<typeof derivar> }) {
  const { sup, pal, r } = d;
  return (
    <View>
      <Sec t="Y después de vender: su dinero por fin trabaja para usted" />
      <Text style={{ fontSize: 8.8, marginBottom: 3 }}>
        Hoy su saldo crece a alrededor de {pc(sup.r_ssv ?? 0.04, 0)} anual. Vendiendo, el efectivo puede
        invertirse a su alternativa realista ({pc(pal.alterno, 0)} anual) o bajar deudas caras.
      </Text>
      <Text style={{ fontSize: 8.8 }}>
        Medido a {anios(d.corte)} años: vender a {d.h} meses y reinvertir llega a {mx(d.ventajaCorte + Number(r.contrafactual_corte ?? 0))},
        contra {mx(r.contrafactual_corte)} si no hace nada.
      </Text>
      <View style={s.cajaOscura}>
        <Text style={s.cajaLime}>VENTAJA TOTAL A {anios(d.corte)} AÑOS:  {mx(d.ventajaCorte, true)}</Text>
        <Text style={s.cajaNota}>patrimonio del esquema contra no hacer nada, al mismo corte</Text>
      </View>
    </View>
  );
}

function SecSupuestos({ a, d, comoCobramos }: { a: Any; d: ReturnType<typeof derivar>; comoCobramos: boolean }) {
  const { sup, pal, inm } = d;
  return (
    <View>
      <Sec t="Supuestos base de esta propuesta" />
      <Text style={s.sup}>
        Plusvalía de {pc(pal.plusvalia, 0)} anual y renta de {mx(inm.renta)} mensuales ({mx(d.rentaNeta)} netos)
        {d.rentaEstimada ? ', estimados por nosotros y no observados en el mercado' : ''}.
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
      {comoCobramos ? (
        <View style={{ marginTop: 8 }}>
          <Sec t="Cómo cobramos" />
          <Text style={[s.sup, { color: DARK, fontSize: 8.2 }]}>
            Este servicio no le cuesta: no cobramos honorarios ni tomamos nada de su saldo. Nuestra ganancia nos la
            paga el desarrollador del inmueble. Los gastos que sí son suyos — notariales y los del crédito — aparecen
            siempre desglosados en esta propuesta.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/* ----------------------------------- Documentos ----------------------------------- */

export function infonavitDoc(a: Any, modo: 'resumen' | 'extendido' = 'resumen') {
  const d = derivar(a);
  if (modo === 'resumen') {
    return (
      <Document title={`Propuesta Infonavit · ${a.clienteNombre ?? ''}`}>
        <PaginaNarrativa a={a} d={d} extendido={false} />
      </Document>
    );
  }
  return (
    <Document title={`Propuesta Infonavit (extendida) · ${a.clienteNombre ?? ''}`}>
      <PaginaNarrativa a={a} d={d} extendido />
      <Page size="LETTER" style={s.page}>
        <BandaChica a={a} t="2 · La operación al detalle" />
        <View style={s.body}>
          <SecOperacion d={d} />
          <View style={{ height: 12 }} />
          <SecPlazos d={d} />
        </View>
        <Pie a={a} />
      </Page>
      <Page size="LETTER" style={s.page}>
        <BandaChica a={a} t="3 · De dónde sale cada peso, y los supuestos" />
        <View style={s.body}>
          <SecFuentes d={d} />
          <View style={{ height: 12 }} />
          <SecDespues d={d} />
          <View style={{ height: 12 }} />
          <SecSupuestos a={a} d={d} comoCobramos />
        </View>
        <Pie a={a} />
      </Page>
    </Document>
  );
}
