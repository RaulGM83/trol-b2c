// ============================================================================
// El Diagnóstico Avanzado en PDF.
//
// Es la exportación del documento que vive en trol3, no otro documento: si algo
// se ve mal aquí, se corrige allá y se vuelve a exportar. Por eso NADA se
// calcula en este archivo — sólo se acomoda lo que ya está guardado.
//
// Orden, y por qué:
//   1. Portada con quién lo hizo. Los reportes viejos no lo decían.
//   2. Con qué datos se hizo, con la capa de cada cifra. Es la sección que
//      previene el caso Eva: un saldo estimado presentado como dato firme.
//   3. Cómo funciona TU pensión. Enseñar y luego diagnosticar — el orden que
//      funcionaba en el docx de Cristian.
//   4. Lo que escribió el redactor, en secciones.
//   5. Lo que acordamos y lo que sigue. Lo que sólo puede salir de la sesión.
//
// GUARDARRAILES heredados del PDF de Infonavit (§7 del contexto de producto):
// nunca el costo del aliado, su comisión ni el PnL interno; nunca comparativos
// de inmuebles más baratos; los supuestos van marcados como supuestos. Aquí se
// cumplen por construcción: los hechos ya vienen en lista blanca desde el
// servidor y este archivo no tiene acceso a nada más.
//
// Mientras el documento no esté ENTREGADO, cada página lo dice. Un borrador que
// se imprime igual que el final acaba en manos del cliente.
// ============================================================================

import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { LOGO_TROL_BLANCO, LOGO_TROL_RATIO } from '@/lib/marca/logo';
import type { Capitulo } from '@/lib/diagnostico/educacion';
import { SECCIONES_NARRATIVA, TITULO_SECCION, type SeccionNarrativa } from '@/lib/diagnostico/secciones';

/* eslint-disable @typescript-eslint/no-explicit-any */

// react-pdf parte palabras largas y les mete un guion ("crédi-to"). Se apaga:
// en prosa se tolera, pero al lado de una cifra se lee como signo de menos.
//
// OJO, esto NO basta: cuando una frase se arma con varios hijos adyacentes de
// un mismo <Text> —texto suelto + {expresión}—, el motor junta los pedazos y
// puede meter el guion EN LA COSTURA, sin pasar por este callback. Así salía
// "tu subcuenta (-$343,374)" y "$8,100-, menos el pago": un menos inventado
// sobre dinero, en el documento de un cliente. Por eso, donde hay cifras, la
// frase se arma completa en JS y se pasa como UN solo hijo.
Font.registerHyphenationCallback((palabra) => [palabra]);

const DARK = '#26282B';
const LIME = '#D1F069';
const GRAY = '#8A8D91';
const CREAM = '#F4F4F2';
const BRICK = '#B0532F';
const LINE = '#E3E4E2';

const mx = (n: any) => {
  const v = Number(n);
  return n == null || Number.isNaN(v) ? '—' : '$' + Math.round(v).toLocaleString('es-MX');
};
const num = (n: any, d = 0) => {
  const v = Number(n);
  return n == null || Number.isNaN(v) ? '—' : v.toLocaleString('es-MX', { maximumFractionDigits: d });
};
const fecha = (s: any) => {
  if (!s) return '—';
  const d = new Date(String(s).length <= 10 ? String(s) + 'T00:00:00' : String(s));
  return Number.isNaN(d.getTime())
    ? String(s)
    : d.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
};

/** Cómo se le dice al cliente de dónde viene un número. */
const CAPA: Record<string, string> = {
  oficial: 'dato oficial',
  declarado: 'lo que nos comentaste',
  estimado: 'estimado por Trol',
  desconocido: 'sin confirmar',
};

const s = StyleSheet.create({
  page: { paddingTop: 0, paddingBottom: 48, fontSize: 9.4, color: DARK, fontFamily: 'Helvetica' },
  band: { backgroundColor: DARK, paddingHorizontal: 46, paddingVertical: 18 },
  bandChica: {
    backgroundColor: DARK,
    paddingHorizontal: 46,
    paddingVertical: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoBanda: { height: 34, width: 34 * LOGO_TROL_RATIO },
  logoChico: { height: 16, width: 16 * LOGO_TROL_RATIO },
  pieMarca: { fontSize: 7.6, color: DARK, fontFamily: 'Helvetica-Bold' },
  h1: { fontSize: 19, fontFamily: 'Helvetica-Bold', color: '#fff', marginTop: 14 },
  sub: { fontSize: 9.6, color: '#C9CCD0', marginTop: 5 },
  subLime: { fontSize: 9.6, fontFamily: 'Helvetica-Bold', color: LIME, marginTop: 6 },
  aviso: {
    backgroundColor: BRICK,
    paddingHorizontal: 46,
    paddingVertical: 5,
  },
  avisoTxt: { color: '#fff', fontSize: 8.4, fontFamily: 'Helvetica-Bold' },
  body: { paddingHorizontal: 46, paddingTop: 16 },
  secTitle: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', marginBottom: 3 },
  secRule: { width: 30, height: 2, backgroundColor: LIME, marginBottom: 8 },
  sec: { marginBottom: 17 },
  p: { fontSize: 9.4, lineHeight: 1.55, marginBottom: 6, textAlign: 'justify' },
  subT: { fontSize: 9.6, fontFamily: 'Helvetica-Bold', marginTop: 7, marginBottom: 3 },
  li: { flexDirection: 'row', marginBottom: 4 },
  bullet: { width: 12, fontSize: 9.4, color: LIME, fontFamily: 'Helvetica-Bold' },
  liTxt: { flex: 1, fontSize: 9.4, lineHeight: 1.5, textAlign: 'justify' },
  nota: { fontSize: 7.8, color: GRAY, marginTop: 6, lineHeight: 1.4 },

  // Tablas
  thead: { flexDirection: 'row', backgroundColor: DARK, paddingVertical: 4, paddingHorizontal: 6 },
  th: { color: '#fff', fontSize: 8.2, fontFamily: 'Helvetica-Bold' },
  tr: { flexDirection: 'row', paddingVertical: 3.6, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: LINE },
  trAlt: { backgroundColor: CREAM },
  td: { fontSize: 8.4 },
  tdB: { fontSize: 8.4, fontFamily: 'Helvetica-Bold' },

  // Cifra grande
  kpis: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  kpi: { flex: 1, backgroundColor: CREAM, padding: 9, borderLeftWidth: 2, borderLeftColor: LIME },
  kpiLbl: { fontSize: 7.6, color: GRAY, textTransform: 'uppercase' },
  kpiVal: { fontSize: 14, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  kpiSub: { fontSize: 7.6, color: GRAY, marginTop: 2 },

  foot: {
    position: 'absolute',
    bottom: 16,
    left: 46,
    right: 46,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: LINE,
    paddingTop: 6,
  },
  footTxt: { fontSize: 7.4, color: GRAY },
});

const Sec = ({ titulo, children }: { titulo: string; children: any }) => (
  <View style={s.sec}>
    <View wrap={false} minPresenceAhead={40}>
      <Text style={s.secTitle}>{titulo}</Text>
      <View style={s.secRule} />
    </View>
    {children}
  </View>
);

/** Un párrafo del redactor puede traer saltos de línea; se respetan. */
const Parrafos = ({ texto }: { texto: string }) => (
  <>
    {texto
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p, i) => (
        <Text key={i} style={s.p}>
          {p}
        </Text>
      ))}
  </>
);

const Lista = ({ items }: { items: string[] }) => (
  <>
    {items.map((t, i) => (
      <View key={i} style={s.li}>
        <Text style={s.bullet}>—</Text>
        <Text style={s.liTxt}>{t}</Text>
      </View>
    ))}
  </>
);

const Pie = ({ cliente }: { cliente: string }) => (
  <View style={s.foot} fixed>
    <Text style={s.pieMarca}>El Trol financiero</Text>
    <Text style={s.footTxt}>Diagnóstico Avanzado · {cliente}</Text>
    <Text style={s.footTxt} render={({ pageNumber, totalPages }) => `${pageNumber} de ${totalPages}`} />
  </View>
);

const Aviso = () => (
  <View style={s.aviso} fixed>
    <Text style={s.avisoTxt}>BORRADOR — documento en revisión, no entregar al cliente</Text>
  </View>
);

// ---------------------------------------------------------------------------

export type DiagnosticoPdfInput = {
  cliente: string;
  curp?: string | null;
  asesor?: string | null;
  estado: 'borrador' | 'revisado' | 'entregado';
  fecha: string;
  hechos: any;
  narrativa: Record<string, string>;
  acuerdos?: string | null;
  tareas: { titulo: string; responsable: string | null; vence_el: string | null }[];
  capitulos: Capitulo[];
};

export function diagnosticoDoc(d: DiagnosticoPdfInput) {
  const h = d.hechos ?? {};
  const borrador = d.estado !== 'entregado';
  const esc: any[] = Array.isArray(h.escenarios) ? h.escenarios : [];
  const principal = esc[0] ?? null;
  const hl = h.historia_laboral ?? null;
  const planes: any[] = h.plan_vivienda?.planes ?? [];

  /** Una cifra del expediente con su procedencia. */
  const dato = (x: any, money = false) => {
    const v = x && typeof x === 'object' && 'valor' in x ? x.valor : x;
    const capa = x && typeof x === 'object' && 'capa' in x ? String(x.capa) : null;
    const txt =
      v === null || v === undefined || v === ''
        ? '—'
        : typeof v === 'boolean'
          ? v
            ? 'Sí'
            : 'No'
          : money
            ? mx(v)
            : typeof v === 'number'
              ? num(v, 1)
              : /^\d{4}-\d{2}-\d{2}/.test(String(v))
                ? fecha(v)
                : String(v);
    return { txt, capa: capa ? (CAPA[capa] ?? capa) : '' };
  };

  const tieneValor = (x: any) => {
    const v = x && typeof x === 'object' && 'valor' in x ? x.valor : x;
    return v !== null && v !== undefined && v !== '';
  };

  const filaDato = (label: string, x: any, money = false, i = 0) => {
    const { txt, capa } = dato(x, money);
    return (
      <View key={label} style={[s.tr, i % 2 ? s.trAlt : {}] as any}>
        <Text style={[s.td, { flex: 2.2 }] as any}>{label}</Text>
        <Text style={[s.tdB, { flex: 1.3, textAlign: 'right' }] as any}>{txt}</Text>
        <Text style={[s.td, { flex: 1.4, textAlign: 'right', color: GRAY }] as any}>{capa}</Text>
      </View>
    );
  };

  const datos: [string, any, boolean][] = [
    ['Edad', h.cliente?.edad, false],
    ['Régimen de pensión', LEY_LABEL[h.cliente?.ley] ?? h.cliente?.ley, false],
    ['¿Cotiza actualmente?', h.cliente?.status_empleo, false],
    ['Semanas cotizadas', h.imss?.semanas_cotizadas, false],
    ['Semanas descontadas', h.imss?.semanas_descontadas, false],
    ['Primera cotización', h.imss?.primera_cotizacion, false],
    ['Última cotización', h.imss?.ultima_cotizacion, false],
    ['Salario diario registrado', h.imss?.salario_diario, true],
    ['Salario promedio (250 semanas)', h.imss?.salario_promedio_250, true],
    ['Saldo AFORE (RCV)', h.saldos?.afore_rcv97, true],
    ['Saldo subcuenta de vivienda', h.saldos?.infonavit, true],
    ['¿Crédito Infonavit vigente?', h.saldos?.credito_infonavit_vigente, false],
  ];
  // Sólo lo que aplica: en Ley 97 la conservación de derechos no existe.
  if (h.cliente?.ley === 'Ley73') {
    datos.splice(4, 0, ['Conserva derechos', h.imss?.conserva_derechos, false]);
    datos.splice(5, 0, ['Vigencia de derechos hasta', h.imss?.fin_conservacion, false]);
  }

  const seccionesConTexto = SECCIONES_NARRATIVA.filter((k) => (d.narrativa?.[k] ?? '').trim());

  return (
    <Document title={`Diagnóstico Avanzado · ${d.cliente}`} author="El Trol financiero">
      {/* -------- Portada y datos utilizados -------- */}
      <Page size="LETTER" style={s.page}>
        <View style={s.band}>
          <Image style={s.logoBanda} src={LOGO_TROL_BLANCO} />
          <Text style={s.h1}>Diagnóstico Avanzado</Text>
          <Text style={s.sub}>{d.cliente}</Text>
          <Text style={s.sub}>
            {fecha(d.fecha)}
            {d.asesor ? ` · preparado por ${d.asesor}` : ''}
            {d.curp ? ` · CURP ${d.curp}` : ''}
          </Text>
          <Text style={s.subLime}>
            Este documento recoge lo que revisamos juntos en tu asesoría.
          </Text>
        </View>
        {borrador ? <Aviso /> : null}

        <View style={s.body}>
          <Sec titulo="Con qué datos se hizo">
            <Text style={s.p}>
              Cada cifra dice de dónde viene. Los datos oficiales salen de tu reporte del IMSS; los
              que nos comentaste los tomamos de la sesión, y los estimados son cálculos nuestros
              mientras llega el dato firme. Si alguno no coincide con lo que sabes, dínoslo: lo
              corregimos y el diagnóstico se rehace.
            </Text>
            <View style={s.thead} minPresenceAhead={44}>
              <Text style={[s.th, { flex: 2.2 }] as any}>Dato</Text>
              <Text style={[s.th, { flex: 1.3, textAlign: 'right' }] as any}>Valor</Text>
              <Text style={[s.th, { flex: 1.4, textAlign: 'right' }] as any}>Fuente</Text>
            </View>
            {datos.filter(([, v]) => tieneValor(v)).map(([l, v, m], i) => filaDato(l, v, m, i))}
            {h.procedencia?.imss_sisec ? (
              <Text style={s.nota}>
                Información del IMSS consultada el {fecha(h.procedencia.imss_sisec)}.
              </Text>
            ) : null}
          </Sec>

          {d.narrativa?.resumen_perfil ? (
            <Sec titulo="Tu situación hoy">
              <Parrafos texto={d.narrativa.resumen_perfil} />
            </Sec>
          ) : null}
        </View>
        <Pie cliente={d.cliente} />
      </Page>

      {/* -------- Cómo funciona tu pensión -------- */}
      {d.capitulos.length ? (
        <Page size="LETTER" style={s.page}>
          <View style={s.bandChica}>
            <Image style={s.logoChico} src={LOGO_TROL_BLANCO} />
            <Text style={{ color: '#fff', fontSize: 8.6 }}>Diagnóstico Avanzado · {d.cliente}</Text>
          </View>
          {borrador ? <Aviso /> : null}
          <View style={s.body}>
            {d.capitulos.map((c) => (
              <Sec key={c.titulo} titulo={c.titulo}>
                {c.bloques.map((b, i) => (
                  <View key={i}>
                    {b.titulo ? <Text style={s.subT}>{b.titulo}</Text> : null}
                    {(b.parrafos ?? []).map((p, j) => (
                      <Text key={j} style={s.p}>
                        {p}
                      </Text>
                    ))}
                    {b.lista?.length ? <Lista items={b.lista} /> : null}
                  </View>
                ))}
                {c.nota ? <Text style={s.nota}>{c.nota}</Text> : null}
              </Sec>
            ))}
          </View>
          <Pie cliente={d.cliente} />
        </Page>
      ) : null}

      {/* -------- Escenario, narrativa, acuerdos y pendientes -------- */}
      <Page size="LETTER" style={s.page}>
        <View style={s.bandChica}>
          <Image style={s.logoChico} src={LOGO_TROL_BLANCO} />
          <Text style={{ color: '#fff', fontSize: 8.6 }}>Diagnóstico Avanzado · {d.cliente}</Text>
        </View>
        {borrador ? <Aviso /> : null}

        <View style={s.body}>
          {principal && principal.pension_mensual == null ? (
            <Sec titulo="El escenario que revisamos">
              <Text style={s.p}>
                Los números de este escenario no están al día en el documento. Antes de entregarlo,
                usa &quot;Refrescar con los datos de hoy&quot; en el expediente.
              </Text>
            </Sec>
          ) : null}

          {principal && principal.pension_mensual != null ? (
            <Sec titulo="El escenario que revisamos">
              {/* Las dos leyes se resumen con cifras distintas: en Ley 73 lo que
                  manda es el salario promedio y el castigo por edad; en Ley 97,
                  de qué bolsas sale la pensión. Un solo juego de tarjetas para
                  las dos dejaría media tabla en guiones. */}
              <View style={s.kpis}>
                <View style={s.kpi}>
                  <Text style={s.kpiLbl}>Pensión estimada</Text>
                  <Text style={s.kpiVal}>{mx(principal.pension_mensual)}</Text>
                  <Text style={s.kpiSub}>
                    {'al mes' +
                      (principal.edad_retiro ? `, retirándote a los ${num(principal.edad_retiro, 1)}` : '')}
                  </Text>
                </View>
                {principal.ley === 'Ley73' ? (
                  <>
                    <View style={s.kpi}>
                      <Text style={s.kpiLbl}>Salario promedio</Text>
                      <Text style={s.kpiVal}>{mx(principal.salario_promedio_250)}</Text>
                      <Text style={s.kpiSub}>diario, últimas 250 semanas</Text>
                    </View>
                    <View style={s.kpi}>
                      <Text style={s.kpiLbl}>Por tu edad recibes</Text>
                      <Text style={s.kpiVal}>
                        {principal.ajuste_por_edad ? `${Math.round(principal.ajuste_por_edad * 100)}%` : '—'}
                      </Text>
                      <Text style={s.kpiSub}>
                        {principal.ajuste_por_edad && principal.ajuste_por_edad < 1
                          ? 'del cálculo; el 100% llega a los 64.5'
                          : 'del cálculo, sin penalización'}
                      </Text>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={s.kpi}>
                      <Text style={s.kpiLbl}>De tu cuenta individual</Text>
                      <Text style={s.kpiVal}>{mx(principal.pension_cuenta_individual)}</Text>
                      <Text style={s.kpiSub}>
                        {principal.en_pmg ? 'en pensión mínima garantizada' : 'por encima de la mínima'}
                      </Text>
                    </View>
                    <View style={s.kpi}>
                      <Text style={s.kpiLbl}>Tu subcuenta de vivienda</Text>
                      <Text style={s.kpiVal}>
                        {principal.destino_infonavit === 'rescate'
                          ? 'Rescatada'
                          : principal.destino_infonavit === 'vivienda'
                            ? 'Para tu casa'
                            : principal.destino_infonavit === 'pension'
                              ? 'A la pensión'
                              : '—'}
                      </Text>
                      <Text style={s.kpiSub}>lo que decidimos juntos</Text>
                    </View>
                  </>
                )}
              </View>

              {principal.ley === 'Ley73' && principal.costo_estrategia ? (
                <Text style={s.p}>
                  Llegar a esa pensión implica cotizar bajo la estrategia que revisamos: un costo
                  estimado de {mx(principal.costo_estrategia)} en total, empezando en{' '}
                  {mx(principal.costo_mensual_primer_mes)} el primer mes. Es lo que tú le pagas al
                  IMSS, y sube cada año con la inflación.
                </Text>
              ) : null}

              {Array.isArray(principal.fuentes) && principal.fuentes.length ? (
                <>
                  <View style={s.thead} minPresenceAhead={44}>
                    <Text style={[s.th, { flex: 2 }] as any}>De dónde sale</Text>
                    <Text style={[s.th, { flex: 1.2, textAlign: 'right' }] as any}>Saldo al retiro</Text>
                    <Text style={[s.th, { flex: 1.2, textAlign: 'right' }] as any}>Pensión mensual</Text>
                  </View>
                  {principal.fuentes
                    .filter((f: any) => f.incluida !== false)
                    .map((f: any, i: number) => (
                      <View key={i} style={[s.tr, i % 2 ? s.trAlt : {}] as any}>
                        <Text style={[s.td, { flex: 2 }] as any}>
                          {FUENTE[f.fuente] ?? f.fuente}
                          {f.absorbida_por_pmg ? ' (absorbida por la pensión mínima)' : ''}
                        </Text>
                        <Text style={[s.td, { flex: 1.2, textAlign: 'right' }] as any}>{mx(f.saldo_al_retiro)}</Text>
                        <Text style={[s.tdB, { flex: 1.2, textAlign: 'right' }] as any}>
                          {f.absorbida_por_pmg ? '—' : mx(f.aporta_al_mes)}
                        </Text>
                      </View>
                    ))}
                </>
              ) : null}
              <Text style={s.nota}>
                Todas las cifras están en pesos de hoy, para que puedas compararlas con lo que
                gastas hoy. Es un escenario cerrado el {fecha(principal.cerrado_en)}: si tus datos
                cambian, cambia el resultado.
              </Text>
            </Sec>
          ) : null}

          {seccionesConTexto
            .filter((k) => k !== 'resumen_perfil')
            .map((k) => (
              <Sec key={k} titulo={TITULO_SECCION[k as SeccionNarrativa]}>
                <Parrafos texto={d.narrativa[k]} />
              </Sec>
            ))}

          {planes.length ? (
            <Sec titulo="El plan de vivienda">
              <Text style={s.p}>
                Comprar el inmueble no compite con tu pensión: es el primer tiempo de la misma
                estrategia. Se compra con tu subcuenta de vivienda, se pone en renta —tú no lo
                habitas—, y al vender ese dinero queda líquido para tu retiro.
              </Text>
              {planes.map((p: any, i: number) => (
                <View key={i} style={{ marginBottom: 10 }}>
                  <Text style={s.subT}>
                    {(p.desarrollo ?? 'Inmueble') +
                      (p.zona ? ` · ${p.zona}` : '') +
                      (p.plazo_meses ? ` · a ${num(p.plazo_meses)} meses` : '')}
                  </Text>

                  {/* Los tres tiempos, en el mismo orden y con el mismo lenguaje
                      que la propuesta de Infonavit: lo que pones, lo que pasa
                      mientras es tuyo, y lo que recibes al final. Dos documentos
                      del mismo plan no pueden contarlo de dos maneras. */}
                  <View style={s.kpis}>
                    <View style={s.kpi}>
                      <Text style={s.kpiLbl}>Pones hoy</Text>
                      <Text style={s.kpiVal}>{mx(p.pone_hoy?.de_su_bolsillo ?? 0)}</Text>
                      <Text style={s.kpiSub}>
                        {Number(p.pone_hoy?.de_su_bolsillo ?? 0) > 0
                          ? 'gastos notariales, una sola vez'
                          : 'de tu bolsillo'}
                      </Text>
                      {p.pone_hoy?.lo_paga_su_subcuenta ? (
                        <Text style={s.kpiSub}>
                          {`La compra la pagan tu subcuenta (${mx(p.pone_hoy.lo_paga_su_subcuenta)})` +
                            (p.pone_hoy?.lo_paga_el_credito
                              ? ` y el crédito Infonavit (${mx(p.pone_hoy.lo_paga_el_credito)})`
                              : '')}
                        </Text>
                      ) : null}
                    </View>

                    <View style={s.kpi}>
                      <Text style={s.kpiLbl}>Mientras es tuyo</Text>
                      <Text style={s.kpiVal}>
                        {p.mientras_es_suyo?.le_queda_cada_mes == null
                          ? '—'
                          : mx(p.mientras_es_suyo.le_queda_cada_mes)}
                      </Text>
                      <Text style={s.kpiSub}>
                        {Number(p.mientras_es_suyo?.le_queda_cada_mes ?? 0) >= 0
                          ? 'te quedan cada mes'
                          : 'completas cada mes'}
                      </Text>
                      {p.mientras_es_suyo?.renta_neta_mensual ? (
                        <Text style={s.kpiSub}>
                          {`Renta${p.mientras_es_suyo?.renta_es_estimada ? ' estimada' : ''} ya sin gastos ` +
                            mx(p.mientras_es_suyo.renta_neta_mensual) +
                            (p.mientras_es_suyo?.pago_del_credito
                              ? `, menos el pago del crédito ${mx(p.mientras_es_suyo.pago_del_credito)}`
                              : '')}
                        </Text>
                      ) : null}
                    </View>

                    <View style={s.kpi}>
                      <Text style={s.kpiLbl}>Al vender</Text>
                      <Text style={s.kpiVal}>{mx(p.al_vender?.recibe)}</Text>
                      <Text style={s.kpiSub}>recibes ese día, líquido</Text>
                      {p.al_vender?.ventaja_contra_no_hacerlo ? (
                        <Text style={s.kpiSub}>
                          {`${mx(p.al_vender.ventaja_contra_no_hacerlo)} a tu favor contra no hacer nada` +
                            (p.al_vender?.medida_a_anios
                              ? `, a ${num(p.al_vender.medida_a_anios)} años`
                              : '')}
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  {p.mientras_es_suyo?.su_patron_sigue_aportando_al_credito ? (
                    <View style={s.li}>
                      <Text style={s.bullet}>—</Text>
                      <Text style={s.liTxt}>
                        Y por detrás, sin que hagas nada: tu patrón sigue aportando a capital del
                        crédito, los intereses son deducibles y el inmueble gana valor con el tiempo.
                      </Text>
                    </View>
                  ) : null}
                  {p.cotitular ? (
                    <Text style={s.nota}>
                      Plan a nombre de dos titulares, junto con {p.cotitular}. Por eso sus montos no
                      cuadran con los saldos de tu escenario de pensión: los recursos son de los dos.
                    </Text>
                  ) : null}
                  <Text style={s.nota}>
                    La renta y la plusvalía son supuestos, no promesas. El detalle completo está en
                    la propuesta de Infonavit que revisamos contigo.
                  </Text>
                </View>
              ))}
            </Sec>
          ) : null}

          {hl && hl.sin_detalle === false ? (
            <Sec titulo="Tu historia laboral">
              <Text style={s.p}>
                {num(hl.periodos_totales)} periodos con {num(hl.patrones_distintos)} patrones desde{' '}
                {fecha(hl.primera_alta)}
                {hl.sigue_cotizando_con
                  ? `, y hoy sigues cotizando con ${hl.sigue_cotizando_con}`
                  : hl.ultima_baja
                    ? `, con última baja el ${fecha(hl.ultima_baja)}`
                    : ''}
                .
              </Text>
              {(() => {
                const filas = (hl.periodos ?? []) as any[];
                const fila = (p: any, i: number) => (
                  <View key={i} style={[s.tr, i % 2 ? s.trAlt : {}] as any}>
                    <Text style={[s.td, { flex: 2.6 }] as any}>{p.empleador ?? '—'}</Text>
                    <Text style={[s.td, { flex: 1 }] as any}>{p.desde ?? '—'}</Text>
                    <Text style={[s.td, { flex: 1 }] as any}>{p.hasta ?? '—'}</Text>
                    <Text style={[s.td, { flex: 1, textAlign: 'right' }] as any}>
                      {mx(p.salario_base_diario)}
                    </Text>
                  </View>
                );
                return (
                  <>
                    <View wrap={false}>
                      <View style={s.thead}>
                        <Text style={[s.th, { flex: 2.6 }] as any}>Patrón</Text>
                        <Text style={[s.th, { flex: 1 }] as any}>Desde</Text>
                        <Text style={[s.th, { flex: 1 }] as any}>Hasta</Text>
                        <Text style={[s.th, { flex: 1, textAlign: 'right' }] as any}>Salario base</Text>
                      </View>
                      {filas.slice(0, 1).map(fila)}
                    </View>
                    {filas.slice(1).map((p, i) => fila(p, i + 1))}
                  </>
                );
              })()}
              {hl.truncado ? <Text style={s.nota}>Se listan los más recientes de {num(hl.periodos_totales)} periodos.</Text> : null}
            </Sec>
          ) : null}

          {d.acuerdos?.trim() ? (
            <Sec titulo="Lo que acordamos">
              <Parrafos texto={d.acuerdos} />
            </Sec>
          ) : null}

          {d.tareas.length ? (
            <Sec titulo="Lo que sigue">
              {d.tareas.map((t, i) => (
                <View key={i} style={s.li}>
                  <Text style={s.bullet}>—</Text>
                  <Text style={s.liTxt}>
                    {t.titulo}
                    {t.responsable ? ` · ${t.responsable}` : ''}
                    {t.vence_el ? ` · para el ${fecha(t.vence_el)}` : ''}
                  </Text>
                </View>
              ))}
            </Sec>
          ) : null}

          <Sec titulo="Estamos para ayudarte">
            <Text style={s.p}>
              Este diagnóstico no termina aquí. Cualquier duda sobre lo que leíste, o cualquier dato
              que quieras corregir, escríbenos por WhatsApp y lo revisamos contigo.
            </Text>
            <Text style={s.nota}>
              El Trol financiero · Las cifras de este documento son estimaciones basadas en la
              información disponible a la fecha de arriba y en la normatividad vigente. No
              constituyen una resolución del IMSS ni una garantía de monto.
            </Text>
          </Sec>
        </View>
        <Pie cliente={d.cliente} />
      </Page>
    </Document>
  );
}

const LEY_LABEL: Record<string, string> = { Ley73: 'Ley 73', Ley97: 'Ley 97' };

const FUENTE: Record<string, string> = {
  rcv: 'Ahorro para el retiro del IMSS (RCV)',
  infonavit: 'Subcuenta de vivienda Infonavit',
  ahorro_voluntario: 'Tu ahorro voluntario en la AFORE',
  plan_corporativo: 'Plan de retiro de tu empresa',
  otros_planes: 'Otros planes de ahorro',
  complemento_pmg: 'Complemento del gobierno (pensión mínima)',
};
