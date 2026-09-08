// Material para que el aliado referidor lo comparta con sus clientes (8-sep-2026).
// Una página A4: qué es Trol, los tres niveles de acompañamiento y su liga + QR.
//
// Sale personalizado por aliado (co-branding "En alianza con", brandbook p. 11:
// el logo de Trol va antes que el del partner, separados por una línea). Hoy el
// partner va como texto; si algún día hay logo, se pinta en el mismo lugar.
//
// Lo que NO lleva, a propósito: montos, promesas de pensión, precios. Es una
// puerta de entrada de alto nivel; los números los da el asesor con el expediente.
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { LOGO_TROL_BLANCO, LOGO_TROL_RATIO } from '@/lib/marca/logo';

Font.registerHyphenationCallback((palabra) => [palabra]);

const DARK = '#26282B', LIME = '#D1F069', GRAY = '#7B7F86', GRAY2 = '#4A4E55', LINE = '#E7E8EA', LIGHT = '#D9DBDE', MUTED = '#A9ADB3';

export interface MaterialAliado {
  nombre: string;
  empresa: string | null;
  link: string;
  linkCorto: string;
  qr: string; // data URL PNG
}

const s = StyleSheet.create({
  page: { padding: 0, fontFamily: 'Helvetica', color: DARK, fontSize: 10 },
  band: { backgroundColor: DARK, paddingHorizontal: 42, paddingTop: 34, paddingBottom: 38 },
  cobrand: { flexDirection: 'row', alignItems: 'center' },
  logo: { height: 46, width: 46 * LOGO_TROL_RATIO },
  sep: { width: 1, height: 52, backgroundColor: LIME, opacity: 0.7, marginHorizontal: 20 },
  cbLabel: { fontSize: 7.5, letterSpacing: 1.2, color: MUTED, textTransform: 'uppercase' },
  cbEmpresa: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#fff', marginTop: 2 },
  cbNombre: { fontSize: 9.5, color: MUTED, marginTop: 1 },
  h1: { fontSize: 31, lineHeight: 1.1, color: '#fff', marginTop: 30, maxWidth: 440 },
  h1lime: { color: LIME, fontFamily: 'Helvetica-Bold' },
  dek: { fontSize: 11, lineHeight: 1.5, color: LIGHT, marginTop: 10, maxWidth: 400 },
  body: { paddingHorizontal: 42, paddingTop: 36 },
  eyebrow: { fontSize: 7.5, letterSpacing: 1.4, color: GRAY, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', marginBottom: 16 },
  nivel: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24 },
  num: { width: 40, height: 40, borderRadius: 9, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  numT: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: DARK },
  nivelT: { fontSize: 14.5, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 3 },
  nivelP: { fontSize: 10.6, lineHeight: 1.55, color: GRAY2, maxWidth: 410 },
  cta: { marginTop: 22, marginHorizontal: 42, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 26, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ctaT: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: DARK, lineHeight: 1.25, maxWidth: 320 },
  ctaP: { fontSize: 10.2, lineHeight: 1.5, color: GRAY2, marginTop: 6, maxWidth: 320 },
  ctaLink: { fontSize: 10.8, fontFamily: 'Helvetica-Bold', color: DARK, marginTop: 8 },
  ctaFoot: { fontSize: 8.5, color: GRAY, marginTop: 2 },
  qrBox: { alignItems: 'center' },
  qr: { width: 112, height: 112, borderWidth: 1, borderColor: LINE, borderRadius: 8, padding: 6 },
  qrT: { fontSize: 7.5, letterSpacing: 1, color: GRAY, textTransform: 'uppercase', marginTop: 6 },
});

const NIVELES = [
  {
    t: 'Poner en orden',
    p: 'Con tu CURP obtenemos tu información oficial: semanas cotizadas, la ley que te aplica, la vigencia de tus derechos y lo que tienes en tu AFORE e Infonavit. Todo en un solo expediente, siempre a tu alcance.',
  },
  {
    t: 'Aprovechar las oportunidades de hoy',
    p: 'Detectamos lo que ya te corresponde y suele pasar desapercibido: pensionarte a tiempo y con retroactivo, mejorar tu pensión con Modalidad 40, recuperar derechos vencidos, rescatar tu saldo de Infonavit o acceder a crédito si ya eres pensionado.',
  },
  {
    t: 'Una estrategia para maximizar tu futuro',
    p: 'Comparamos escenarios con tus números reales —cuándo retirarte, cuánto recibirías por cada camino y qué ahorro conviene sumar— y lo convertimos en un plan con pasos concretos y fechas.',
  },
];

export function materialAliadoDoc(m: MaterialAliado) {
  return (
    <Document title="Trol Financiero · tu pensión en orden" author="Trol Financiero">
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <View style={s.cobrand}>
            <Image src={LOGO_TROL_BLANCO} style={s.logo} />
            <View style={s.sep} />
            <View>
              <Text style={s.cbLabel}>En alianza con</Text>
              <Text style={s.cbEmpresa}>{m.empresa || m.nombre}</Text>
              {m.empresa ? <Text style={s.cbNombre}>{m.nombre}</Text> : null}
            </View>
          </View>
          <Text style={s.h1}>
            Tu pensión del IMSS, <Text style={s.h1lime}>en orden y trabajando para ti.</Text>
          </Text>
          <Text style={s.dek}>
            Trol Financiero revisa tu historial oficial del IMSS y te dice, con claridad, dónde estás, qué te corresponde hoy y cómo llegar mejor al retiro.
          </Text>
        </View>

        <View style={s.body}>
          <Text style={s.eyebrow}>Te acompañamos en tres niveles</Text>
          {NIVELES.map((n, i) => (
            <View key={n.t} style={s.nivel} wrap={false}>
              <View style={s.num}><Text style={s.numT}>{`0${i + 1}`}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.nivelT}>{n.t}</Text>
                <Text style={s.nivelP}>{n.p}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={s.cta} wrap={false}>
          <View>
            <Text style={s.ctaT}>Empieza con un diagnóstico inicial sin costo.</Text>
            <Text style={s.ctaP}>
              Escanea el código o abre la liga, escríbenos por WhatsApp con tu CURP y en minutos tendrás tu primera revisión. Un asesor de Trol te acompaña desde ahí.
            </Text>
            <Text style={s.ctaLink}>{m.linkCorto}</Text>
            <Text style={s.ctaFoot}>trol.mx · Ciudad de México</Text>
          </View>
          <View style={s.qrBox}>
            <Image src={m.qr} style={s.qr} />
            <Text style={s.qrT}>Escanéame</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}
