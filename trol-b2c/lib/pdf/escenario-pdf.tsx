// ============================================================================
// PDF del escenario de la calculadora — generado en el navegador con
// @react-pdf/renderer. Un solo template con dos modos:
//   - "cliente": documento presentable con branding del aliado
//   - "asesor":  igual + secciones técnicas (soloAsesor) y sello de uso interno
// Este módulo se importa con import() dinámico desde calculadora-client.tsx
// para que react-pdf no entre al bundle inicial.
// ============================================================================

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  pdf,
} from "@react-pdf/renderer"

// ---------------------------------------------------------------------------
// Tipos del payload (los paneles de la calculadora arman esta estructura)
// ---------------------------------------------------------------------------

export type PdfModo = "cliente" | "asesor"

export type PdfStat = { label: string; value: string; destacado?: boolean }
export type PdfFila = { label: string; value: string }

export type PdfSeccion = {
  titulo: string
  /** Solo aparece en el PDF versión asesor. */
  soloAsesor?: boolean
  /** Stats en cuadrícula (3 por renglón). */
  stats?: PdfStat[]
  /** Filas etiqueta→valor (una por renglón, para desgloses tipo cascada). */
  filas?: PdfFila[]
  nota?: string
}

export type PdfTabla = {
  titulo: string
  columnas: string[]
  filas: string[][]
  resaltada?: number
}

export type PdfEscenarioData = {
  /** "Calculadora Ley 73" | "Calculadora Ley 97" | "Mod40 Retroactivo" */
  calculadora: string
  clienteNombre: string
  hero: { etiqueta: string; valor: string; sub?: string; negativa?: boolean }
  /** "Escenario elegido": las palancas que movió el asesor. */
  palancas: PdfFila[]
  secciones: PdfSeccion[]
  tabla?: PdfTabla
  /** Datos del cliente (referencia), espejo de la tarjeta de la calculadora. */
  datosCliente: PdfFila[]
  advertencias?: string[]
}

export type PdfEscenarioInput = PdfEscenarioData & {
  modo: PdfModo
  curp: string
  nombreEscenario: string
  /** Nombre final del archivo, ej. CURP_Retiro-62.pdf */
  fileName: string
  branding: {
    colorPrimario: string
    colorAcento: string
    logoUrl: string | null
  }
}

// ---------------------------------------------------------------------------
// Estilos
// ---------------------------------------------------------------------------

const GRIS = "#64748b"
const GRIS_CLARO = "#e2e8f0"
const AMBAR_BG = "#fef3c7"
const AMBAR_TX = "#92400e"

const s = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 46,
    paddingHorizontal: 36,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#0f172a",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  headerTitulo: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  headerSub: { fontSize: 8, color: "#cbd5e1", marginTop: 2 },
  logo: { height: 26, maxWidth: 110, objectFit: "contain" },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  metaTexto: { fontSize: 8, color: GRIS },
  hero: {
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  heroEtiqueta: {
    fontSize: 7.5,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  heroValor: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    marginTop: 2,
  },
  heroSub: { fontSize: 8.5, color: "#cbd5e1", marginTop: 3 },
  card: {
    borderWidth: 1,
    borderColor: GRIS_CLARO,
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  cardTitulo: { fontSize: 10, fontFamily: "Helvetica-Bold", marginBottom: 6 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap" },
  stat: { width: "33.33%", paddingRight: 8, marginBottom: 6 },
  statLabel: { fontSize: 7.5, color: GRIS, marginBottom: 1.5 },
  statValue: { fontSize: 10 },
  fila: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2.5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f1f5f9",
  },
  filaLabel: { fontSize: 8.5, color: GRIS, flexShrink: 1, paddingRight: 8 },
  filaValor: { fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  nota: { fontSize: 7.5, color: GRIS, marginTop: 5, lineHeight: 1.4 },
  advertencia: {
    backgroundColor: AMBAR_BG,
    color: AMBAR_TX,
    borderRadius: 4,
    padding: 8,
    fontSize: 8,
    marginBottom: 6,
    lineHeight: 1.4,
  },
  tablaHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: GRIS_CLARO,
    paddingBottom: 3,
    marginBottom: 1,
  },
  tablaHeaderCelda: { fontSize: 7.5, color: GRIS, fontFamily: "Helvetica-Bold" },
  tablaFila: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f1f5f9",
  },
  tablaCelda: { fontSize: 8.5 },
  footer: {
    position: "absolute",
    left: 36,
    right: 36,
    bottom: 18,
    borderTopWidth: 0.5,
    borderTopColor: GRIS_CLARO,
    paddingTop: 5,
  },
  footerTexto: { fontSize: 6.8, color: GRIS, lineHeight: 1.35 },
  selloAsesor: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: AMBAR_TX,
    backgroundColor: AMBAR_BG,
    borderRadius: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
})

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

function EscenarioDoc({
  input,
  logoDataUrl,
  fechaGeneracion,
}: {
  input: PdfEscenarioInput
  logoDataUrl: string | null
  fechaGeneracion: string
}) {
  const { branding, modo } = input
  const primario = branding.colorPrimario
  const acento = branding.colorAcento
  const secciones = input.secciones.filter(
    (sec) => modo === "asesor" || !sec.soloAsesor,
  )

  return (
    <Document
      title={`${input.calculadora} · ${input.nombreEscenario}`}
      author="Portal Control Financiero"
    >
      <Page size="A4" style={s.page}>
        {/* Header con branding */}
        <View style={[s.header, { backgroundColor: primario }]}>
          <View>
            <Text style={s.headerTitulo}>
              {input.calculadora} · {input.nombreEscenario}
            </Text>
            <Text style={s.headerSub}>
              {input.clienteNombre} · CURP {input.curp}
            </Text>
          </View>
          {logoDataUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={logoDataUrl} style={s.logo} />
          ) : null}
        </View>

        <View style={s.metaRow}>
          <Text style={s.metaTexto}>Generado el {fechaGeneracion}</Text>
          <Text style={s.metaTexto}>
            Simulación con parámetros vigentes — no es una resolución del IMSS
          </Text>
        </View>

        {modo === "asesor" ? (
          <Text style={s.selloAsesor}>
            VERSIÓN ASESOR — DOCUMENTO DE TRABAJO INTERNO
          </Text>
        ) : null}

        {/* Hero */}
        <View style={[s.hero, { backgroundColor: primario }]}>
          <Text style={[s.heroEtiqueta, { color: acento }]}>
            {input.hero.etiqueta}
          </Text>
          <Text
            style={[
              s.heroValor,
              input.hero.negativa ? { color: "#fbbf24", fontSize: 16 } : {},
            ]}
          >
            {input.hero.valor}
          </Text>
          {input.hero.sub ? <Text style={s.heroSub}>{input.hero.sub}</Text> : null}
        </View>

        {/* Advertencias */}
        {(input.advertencias ?? []).map((a) => (
          <Text key={a} style={s.advertencia}>
            {a}
          </Text>
        ))}

        {/* Escenario elegido (palancas) */}
        <View style={s.card}>
          <Text style={s.cardTitulo}>Escenario elegido</Text>
          {input.palancas.map((f) => (
            <View key={f.label} style={s.fila}>
              <Text style={s.filaLabel}>{f.label}</Text>
              <Text style={s.filaValor}>{f.value}</Text>
            </View>
          ))}
        </View>

        {/* Secciones */}
        {secciones.map((sec) => (
          <View key={sec.titulo} style={s.card} wrap={false}>
            <Text style={s.cardTitulo}>
              {sec.titulo}
              {sec.soloAsesor ? "  (interno)" : ""}
            </Text>
            {sec.stats ? (
              <View style={s.statsGrid}>
                {sec.stats.map((st) => (
                  <View key={st.label} style={s.stat}>
                    <Text style={s.statLabel}>{st.label}</Text>
                    <Text
                      style={[
                        s.statValue,
                        st.destacado
                          ? { fontFamily: "Helvetica-Bold", color: primario }
                          : {},
                      ]}
                    >
                      {st.value}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            {sec.filas
              ? sec.filas.map((f) => (
                  <View key={f.label} style={s.fila}>
                    <Text style={s.filaLabel}>{f.label}</Text>
                    <Text style={s.filaValor}>{f.value}</Text>
                  </View>
                ))
              : null}
            {sec.nota ? <Text style={s.nota}>{sec.nota}</Text> : null}
          </View>
        ))}

        {/* Tabla (barrido por edad) */}
        {input.tabla ? (
          <View style={s.card} wrap={false}>
            <Text style={s.cardTitulo}>{input.tabla.titulo}</Text>
            <View style={s.tablaHeader}>
              {input.tabla.columnas.map((c) => (
                <Text
                  key={c}
                  style={[
                    s.tablaHeaderCelda,
                    { width: `${100 / input.tabla!.columnas.length}%` },
                  ]}
                >
                  {c}
                </Text>
              ))}
            </View>
            {input.tabla.filas.map((fila, i) => (
              <View
                key={fila[0]}
                style={[
                  s.tablaFila,
                  i === input.tabla!.resaltada
                    ? { backgroundColor: `${acento}55` }
                    : {},
                ]}
              >
                {fila.map((celda, j) => (
                  <Text
                    key={j}
                    style={[
                      s.tablaCelda,
                      { width: `${100 / input.tabla!.columnas.length}%` },
                      i === input.tabla!.resaltada
                        ? { fontFamily: "Helvetica-Bold" }
                        : {},
                    ]}
                  >
                    {celda}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {/* Datos del cliente (referencia) */}
        <View style={s.card} wrap={false}>
          <Text style={s.cardTitulo}>Datos del cliente (referencia)</Text>
          <View style={s.statsGrid}>
            {input.datosCliente.map((f) => (
              <View key={f.label} style={s.stat}>
                <Text style={s.statLabel}>{f.label}</Text>
                <Text style={s.statValue}>{f.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Footer fijo */}
        <View style={s.footer} fixed>
          <Text style={s.footerTexto}>
            Estimaciones con base en el historial IMSS del cliente y parámetros
            vigentes al momento de generar este documento. No constituyen una
            resolución del IMSS ni una promesa de pensión. Los montos definitivos
            dependen de la resolución oficial del IMSS.
          </Text>
          <Text
            style={[s.footerTexto, { marginTop: 2 }]}
            render={({ pageNumber, totalPages }) =>
              `${input.curp} · ${input.nombreEscenario} · página ${pageNumber} de ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  )
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/** Baja el logo del aliado como data URL (evita problemas de CORS al renderizar). */
async function cargarLogo(url: string | null): Promise<string | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string | null>((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : null)
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

/** Genera el PDF del escenario y dispara la descarga en el navegador. */
export async function descargarPdfEscenario(input: PdfEscenarioInput): Promise<void> {
  const logoDataUrl = await cargarLogo(input.branding.logoUrl)
  const fechaGeneracion = new Intl.DateTimeFormat("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date())

  const blob = await pdf(
    <EscenarioDoc
      input={input}
      logoDataUrl={logoDataUrl}
      fechaGeneracion={fechaGeneracion}
    />,
  ).toBlob()

  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = input.fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
