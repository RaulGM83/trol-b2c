// Material Infonavit para que el aliado lo comparta con sus clientes (2-nov-2026, claude/116).
// Una página A4, hermana del material de pensión: la promesa, tres pasos y su liga + QR.
//
// Reglas del copy (claude/115): sin logo ni imagen del Infonavit, sin "oficial", sin prometer
// rendimientos, y el pie "Cifras estimadas. Sujeto a precalificación. Trol es una asesoría
// independiente." Nada de montos ni precios: eso sale de la precalificación de cada persona.
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { LOGO_TROL_BLANCO, LOGO_TROL_RATIO } from '@/lib/marca/logo';
import type { MaterialAliado } from '@/components/trol3/material-aliado-pdf';

Font.registerHyphenationCallback((palabra) => [palabra]);

const DARK = '#26282B', LIME = '#D1F069', GRAY = '#7B7F86', GRAY2 = '#4A4E55', LINE = '#E7E8EA', LIGHT = '#D9DBDE', MUTED = '#A9ADB3';

const s = StyleSheet.create({
  page: { padding: 0, fontFamily: 'Helvetica', color: DARK, fontSize: 10 },
  band: { backgroundColor: DARK, paddingHorizontal: 42, paddingTop: 34, paddingBottom: 38 },
  cobrand: { flexDirection: 'row', alignItems: 'center' },
  logo: { height: 46, width: 46 * LOGO_TROL_RATIO },
  sep: { width: 1, height: 52, backgroundColor: LIME, opacity: 0.7, marginHorizontal: 20 },
  cbLabel: { fontSize: 7.5, letterSpacing: 1.2, color: MUTED, textTransform: 'uppercase' },
  cbEmpresa: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#fff', marginTop: 2 },
  cbNombre: { fontSize: 9.5, color: MUTED, marginTop: 1 },
  h1: { fontSize: 31, lineHeight: 1.1, color: '#fff', marginTop: 30, maxWidth: 460 },
  h1lime: { color: LIME, fontFamily: 'Helvetica-Bold' },
  dek: { fontSize: 11, lineHeight: 1.5, color: LIGHT, marginTop: 10, maxWidth: 420 },
  body: { paddingHorizontal: 42, paddingTop: 36 },
  eyebrow: { fontSize: 7.5, letterSpacing: 1.4, color: GRAY, textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', marginBottom: 16 },
  paso: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24 },
  num: { width: 40, height: 40, borderRadius: 9, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  numT: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: DARK },
  pasoT: { fontSize: 14.5, fontFamily: 'Helvetica-Bold', color: DARK, marginBottom: 3 },
  pasoP: { fontSize: 10.6, lineHeight: 1.55, color: GRAY2, maxWidth: 410 },
  cta: { marginTop: 22, marginHorizontal: 42, borderTopWidth: 1, borderTopColor: LINE, paddingTop: 26, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ctaT: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: DARK, lineHeight: 1.25, maxWidth: 320 },
  ctaP: { fontSize: 10.2, lineHeight: 1.5, color: GRAY2, marginTop: 6, maxWidth: 320 },
  ctaLink: { fontSize: 10.8, fontFamily: 'Helvetica-Bold', color: DARK, marginTop: 8 },
  ctaFoot: { fontSize: 8.5, color: GRAY, marginTop: 2 },
  qrBox: { alignItems: 'center' },
  qr: { width: 112, height: 112, borderWidth: 1, borderColor: LINE, borderRadius: 8, padding: 6 },
  qrT: { fontSize: 7.5, letterSpacing: 1, color: GRAY, textTransform: 'uppercase', marginTop: 6 },
  pie: { marginHorizontal: 42, marginTop: 18, fontSize: 7.5, color: GRAY, lineHeight: 1.4 },
});

export const PASOS_INFONAVIT = [
  {
    t: 'Precalifica en minutos',
    p: 'Con tu NSS (o tu CURP) consultamos cuánto tienes en tu subcuenta de vivienda y cuánto te presta Infonavit hoy. Sin trámites y sin comprometer nada.',
  },
  {
    t: 'Elige un inmueble a precio preferencial',
    p: 'Te armamos una cotización con opciones reales —casa o departamento, cerca de donde vives o en zonas que se rentan bien— y te decimos cuánto pondrías al mes y cuánto recibirías si vendes a 18 o a 60 meses.',
  },
  {
    t: 'Se renta mientras sigues cotizando',
    p: 'Sin enganche. Tu Infonavit paga el inmueble, la renta ayuda con la mensualidad y Trol te acompaña en cada paso: documentos, formatos, avalúo y firma de escrituras. Si quieres, también administramos la renta.',
  },
];

export function materialAliadoInfonavitDoc(m: MaterialAliado) {
  return (
    <Document title="Trol Financiero · tu Infonavit puede ser una inversión" author="Trol Financiero">
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
            Tu saldo Infonavit puede convertirse en <Text style={s.h1lime}>un inmueble que se renta.</Text>
          </Text>
          <Text style={s.dek}>
            Si cotizas al IMSS, tu subcuenta de vivienda ya tiene un saldo trabajando a tasa de Infonavit. Nosotros te decimos cuánto te presta y te ayudamos a convertirlo en patrimonio, sin cobrarte un porcentaje de tu saldo: nos paga la constructora.
          </Text>
        </View>

        <View style={s.body}>
          <Text style={s.eyebrow}>Así funciona, en tres pasos</Text>
          {PASOS_INFONAVIT.map((n, i) => (
            <View key={n.t} style={s.paso} wrap={false}>
              <View style={s.num}><Text style={s.numT}>{`0${i + 1}`}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.pasoT}>{n.t}</Text>
                <Text style={s.pasoP}>{n.p}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={s.cta} wrap={false}>
          <View>
            <Text style={s.ctaT}>Averigua hoy cuánto te presta Infonavit.</Text>
            <Text style={s.ctaP}>
              {`Escanea el código o abre la liga y mándanos tu NSS por WhatsApp, o dáselo a ${m.nombre} para que te precalifique. En minutos tienes tu respuesta y tu cotización.`}
            </Text>
            <Text style={s.ctaLink}>{m.linkCorto}</Text>
            <Text style={s.ctaFoot}>trol.mx · Ciudad de México</Text>
          </View>
          <View style={s.qrBox}>
            <Image src={m.qr} style={s.qr} />
            <Text style={s.qrT}>Escanéame</Text>
          </View>
        </View>
        <Text style={s.pie}>Cifras estimadas. Sujeto a precalificación. Trol es una asesoría independiente, sin relación con Infonavit ni con el IMSS.</Text>
      </Page>
    </Document>
  );
}
