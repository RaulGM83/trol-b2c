import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { Any } from '@/lib/trol3/server';

const mx = (n: Any) => (n == null || n === '' || isNaN(Number(n)) ? '—' : '$' + Math.round(Number(n)).toLocaleString('es-MX'));
const pc = (n: Any) => (n == null || isNaN(Number(n)) ? '—' : (Number(n) * 100).toFixed(1) + '%');
const BANDA: Record<string, { t: string; c: string }> = {
  verde: { t: 'VERDE · automático', c: '#0D6B55' },
  ambar: { t: 'ÁMBAR · comité mayoría', c: '#96620F' },
  naranja: { t: 'NARANJA · unánime + aportación', c: '#B8560F' },
  rojo: { t: 'ROJO · no autorizar', c: '#A72F26' },
};

const s = StyleSheet.create({
  page: { padding: 34, fontSize: 9.5, color: '#0F1D33', fontFamily: 'Helvetica' },
  eyebrow: { fontSize: 8, letterSpacing: 2, color: '#5A6B84' },
  h1: { fontSize: 18, fontWeight: 700, marginTop: 3, marginBottom: 2 },
  sub: { fontSize: 9, color: '#5A6B84', marginBottom: 12 },
  band: { alignSelf: 'flex-start', color: '#fff', paddingVertical: 4, paddingHorizontal: 9, borderRadius: 3, fontSize: 10, fontWeight: 700, marginBottom: 12 },
  secTitle: { fontSize: 8, letterSpacing: 1.5, color: '#5A6B84', textTransform: 'uppercase', marginTop: 12, marginBottom: 5, borderBottomWidth: 1, borderBottomColor: '#2255A0', paddingBottom: 3 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5, borderBottomWidth: 0.5, borderBottomColor: '#E3E9F2' },
  rowLbl: { color: '#0F1D33' },
  rowVal: { fontWeight: 700 },
  total: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, marginTop: 4, borderTopWidth: 1.5, borderTopColor: '#2255A0' },
  totalLbl: { fontSize: 11, fontWeight: 700 },
  totalVal: { fontSize: 12, fontWeight: 700 },
  two: { flexDirection: 'row', gap: 26 },
  col: { flex: 1 },
  nota: { marginTop: 12, padding: 8, backgroundColor: '#E9F0FA', borderRadius: 3, fontSize: 9 },
  cliente: { fontSize: 9.5, marginBottom: 10, color: '#0F1D33' },
  escWrap: { flexDirection: 'row', gap: 16, marginBottom: 12, alignItems: 'center' },
  escLbl: { fontSize: 8, letterSpacing: 1.2, color: '#5A6B84', textTransform: 'uppercase' },
  escOn: { fontSize: 11, fontWeight: 700, color: '#2255A0', textDecoration: 'underline' },
  escOff: { fontSize: 11, color: '#8A9AB2' },
  foot: { position: 'absolute', bottom: 26, left: 34, right: 34, fontSize: 7.5, color: '#8A9AB2', borderTopWidth: 0.5, borderTopColor: '#C3CDDC', paddingTop: 6 },
});

function Line({ l, v, val }: { l: string; v?: string; val?: Any }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLbl}>{l}</Text>
      <Text style={s.rowVal}>{v ?? mx(val)}</Text>
    </View>
  );
}

export function viraalDoc(a: Any) {
  const r = (a.resultado ?? {}) as Record<string, Any>;
  const i = (a.inputs ?? {}) as Record<string, Any>;
  const banda = BANDA[a.banda ?? ''] ?? { t: (a.banda ?? '—').toUpperCase(), c: '#5A6B84' };
  const c = (a.cliente ?? {}) as Record<string, Any>;
  const esBase = (a.nivel ?? '') === 'Nivel 1';
  const fecha = new Date(a.created_at).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
  return (
    <Document title={`Viraal · Autorización ${a.id}`}>
      <Page size="A4" style={s.page}>
        <Text style={s.eyebrow}>VIRAAL · MESA DE AUTORIZACIÓN</Text>
        <Text style={s.h1}>Escenario autorizado</Text>
        <Text style={s.sub}>{fecha}{a.miembro ? ` · autorizó ${a.miembro}` : ''} · folio {a.id}</Text>

        <Text style={s.cliente}>{[c.nombre, c.apellidos].filter(Boolean).join(' ') || '(sin nombre)'}{c.curp ? `   ·   CURP ${c.curp}` : ''}{c.nss ? `   ·   NSS ${c.nss}` : ''}</Text>

        <View style={s.escWrap}>
          <Text style={s.escLbl}>Escenario que rige:</Text>
          <Text style={esBase ? s.escOn : s.escOff}>BASE (con política)</Text>
          <Text style={!esBase ? s.escOn : s.escOff}>ESTRESADO (fuera de política)</Text>
        </View>

        <Text style={[s.band, { backgroundColor: banda.c }]}>{banda.t}{a.nivel ? `  —  ${a.nivel} · ${a.escenario ?? ''}` : ''}</Text>

        <View style={s.two}>
          <View style={s.col}>
            <Text style={s.secTitle}>Números del caso</Text>
            <Line l="Crédito Finsus" val={r.credito} />
            <Line l="Financiamiento" val={r.finCli} />
            <Line l="Total a pagar del proyecto" val={r.precio} />
            <Line l="Crédito DXN" val={r.dxnBruto} />
            <Line l="Retroactivo" val={r.retro} />
            <Line l="Afore + Infonavit (líquido)" val={r.saldos} />
            <Line l="Recursos del cliente" val={r.recursos} />
            <Line l={Number(r.brecha) >= 0 ? 'Le sobra' : 'Le falta'} val={Math.abs(Number(r.brecha ?? 0))} />
          </View>
          <View style={s.col}>
            <Text style={s.secTitle}>Margen de Viraal</Text>
            <Line l="Ingreso total" val={r.ingreso} />
            <Line l="Costo total" val={r.costo} />
            <View style={s.total}><Text style={s.totalLbl}>Margen</Text><Text style={s.totalVal}>{mx(r.margen)}</Text></View>
            <Line l="Margen sobre costo" v={pc(a.margen_costo)} />
            <Line l="Margen sobre crédito Finsus" v={pc(a.margen_credito)} />
            <Line l="Aporta el proyecto" val={r.margenProy} />
            <Line l="Aporta el DXN (spread)" val={r.margenDxn} />
          </View>
        </View>

        <Text style={s.secTitle}>Parámetros usados</Text>
        <View style={s.two}>
          <View style={s.col}>
            <Line l="Línea de captura IMSS" val={i.imss} />
            <Line l="Gestorías al cliente" val={i.gest} />
            <Line l="Gastos admin. %" v={(i.pAdmin ?? '—') + '%'} />
            <Line l="Comisión apertura %" v={(i.pApert ?? '—') + '%'} />
            <Line l="Tasa al cliente %/mes" v={(i.tasaCli ?? '—') + '%'} />
            <Line l="Plazo de fondeo (meses)" v={String(i.plazo ?? '—')} />
            <Line l="Aportación día 1" val={i.aporta} />
          </View>
          <View style={s.col}>
            <Line l="Pensión mensual estimada" val={i.pension} />
            <Line l="DXN meses (base/estres.)" v={`${i.mDxnB ?? '—'} / ${i.mDxnE ?? '—'}`} />
            <Line l="Comisión Viraal % (base/estres.)" v={`${i.comB ?? '—'} / ${i.comE ?? '—'}`} />
            <Line l="Costo al canal % (base/estres.)" v={`${i.canB ?? '—'} / ${i.canE ?? '—'}`} />
            <Line l="Retroactivo meses (base/estres.)" v={`${i.mRetroB ?? '—'} / ${i.mRetroE ?? '—'}`} />
            <Line l="Comisión asesor % s/IMSS" v={(i.pAsesor ?? '—') + '%'} />
            <Line l="Tasa de fondeo %/mes" v={(i.tasaFon ?? '—') + '%'} />
          </View>
        </View>

        {a.nota ? <Text style={s.nota}>Nota: {a.nota}</Text> : null}

        <Text style={s.foot}>Estimaciones internas de la Mesa de autorización Viraal. No constituyen resolución del IMSS ni promesa de pensión. Documento generado por Trol para control interno.</Text>
      </Page>
    </Document>
  );
}
