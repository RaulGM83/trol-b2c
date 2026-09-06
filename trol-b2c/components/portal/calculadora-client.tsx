"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { createClient } from "@/lib/supabase/client"
import { computeLey73 } from "@trol/pension-core/ley73"
import { computeLey97 } from "@trol/pension-core/ley97"
import type { SerieINPC } from "@trol/pension-core/inpc"
import { computeProyectoMod40 } from "@trol/pension-core/mod40-proyecto"
import type { RegistroHistorialMod40 } from "@trol/pension-core/mod40-ventana"
import { AvisosMod40, FechaTramiteInput } from "@/components/trol3/FechaTramite"
import { isoFecha, parseFechaTramite } from "@/lib/viraal/prefill"
import { addDias, addMeses, DIAS_ANIO } from "@trol/pension-core/util"
import type { SemillaV2 } from "@trol/pension-core/semilla"
import { SALARIO_MINIMO, UMA } from "@trol/pension-core/tablas"
import type { Palancas } from "@trol/pension-core/types"
import type {
  PdfEscenarioData,
  PdfFila,
  PdfModo,
} from "@/lib/pdf/escenario-pdf"
import {
  ResumenCliente,
  type ResumenClienteData,
} from "@/components/resumen-cliente"
import {
  camposDe,
  PanelDatosAUtilizar,
  type DatosAUtilizar,
  type DestinoInfonavit,
  type Incluir,
  type VehiculoId,
} from "@/components/portal/datos-a-utilizar"

// ============================================================================
// Utilidades compartidas
// ============================================================================

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})
const fmt = (n: number | null | undefined) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : mxn.format(n)
const fmtFecha = (d: Date) =>
  new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric" }).format(d)

const ANIO = new Date().getFullYear()
const SAL_MIN = SALARIO_MINIMO[ANIO] ?? 315.04
const SAL_TOPE = (UMA[ANIO] ?? 117.35) * 25
const PCTS = [0, 0.25, 0.5, 0.75, 1] as const

// Cómo se nombra cada bolsa de dinero frente al cliente. El motor devuelve
// `fuentes` con ids; el nombre y la explicación son cosa de la pantalla.
const FUENTE_NOMBRE: Record<string, { titulo: string; sub?: string }> = {
  rcv: {
    titulo: "Ahorro para el retiro (RCV)",
    sub: "Lo que acumuló en su AFORE más lo que siga aportando",
  },
  infonavit: { titulo: "Subcuenta de vivienda (Infonavit)" },
  complemento_pmg: {
    titulo: "Complemento del gobierno",
    sub: "Lo que falta para llegar a la pensión mínima garantizada",
  },
  ahorro_voluntario: { titulo: "Ahorro voluntario en AFORE" },
  plan_corporativo: { titulo: "Plan de retiro de la empresa" },
  otros_planes: { titulo: "Otros planes (PPR, fondos, caja)" },
}

// Lo que hay que saber del renglón de vivienda según lo que se decidió hacer
// con ella. Es la única fuente cuyo comportamiento cambia con el escenario.
const SUB_INFONAVIT: Record<string, string> = {
  pension: "Compra la renta del IMSS: 0% real y paga el seguro de sobrevivencia",
  rescate: "Rescatada: 3% real, sin seguro de sobrevivencia y encima de la mínima",
  vivienda: "La destina a su casa",
}

const DESTINO_PDF: Record<string, string> = {
  pension: "A la pensión — 0% real, paga seguro de sobrevivencia",
  rescate: "Rescatada — 3% real, por encima de la mínima",
  vivienda: "La usa para su casa — fuera del cálculo",
}

const CAPA_TITULO: Record<string, string> = {
  cuenta_individual: "Cuenta individual · la topa la mínima garantizada",
  encima: "Ahorro que se suma encima · la mínima no lo toca",
}

/**
 * El desglose de la pensión, en el orden en que se cuenta la historia: primero
 * lo que va a la cuenta individual (y compite contra el piso), luego lo que se
 * suma encima. Un renglón por fuente, más los subtotales.
 *
 * Una fuente en cero se omite salvo que el asesor la haya apagado a propósito:
 * ahí sí se enseña, atenuada, porque su ausencia es parte del escenario.
 */
function filasFuentes(
  r: ReturnType<typeof computeLey97>,
  fmtMoneda: (n: number | null | undefined) => string,
): PdfFila[] {
  if (r.negativa || r.fuentes.length === 0) return []
  const filas: PdfFila[] = []
  for (const capa of ["cuenta_individual", "encima"] as const) {
    const enCapa = r.fuentes.filter(
      (f) => f.capa === capa && (f.pensionMensual > 0.005 || !f.incluida),
    )
    if (enCapa.length === 0) continue
    filas.push({ label: CAPA_TITULO[capa], value: "", tono: "grupo" })
    for (const f of enCapa) {
      const nombre = FUENTE_NOMBRE[f.id] ?? { titulo: f.id }
      const sub = !f.incluida
        ? "Fuera de este escenario"
        : f.absorbidaPorPmg
          ? // El dato importa poco sin la salida: si está absorbida, rescatarla
            // es exactamente lo que la despega del piso.
            "Se lo descuenta al complemento: no cambia la pensión. Rescatarla la pondría por encima del piso."
          : f.id === "infonavit"
            ? SUB_INFONAVIT[r.detalle.destinoInfonavit]
            : nombre.sub
      filas.push({
        label: nombre.titulo,
        sub,
        value: f.saldoAlRetiro === null ? "—" : fmtMoneda(f.saldoAlRetiro),
        value2: fmtMoneda(f.pensionMensual),
        tono: f.incluida ? undefined : "apagada",
      })
    }
    if (capa === "cuenta_individual") {
      filas.push({
        label: "Pensión de la cuenta individual",
        value: "",
        value2: fmtMoneda(r.pensionAforeInfonavit),
        tono: "suma",
      })
    }
  }
  filas.push({
    label: "Pensión mensual total",
    value: "",
    value2: fmtMoneda(r.pensionTotal),
    tono: "suma",
  })
  return filas
}

/** El pie que explica por qué un peso no rinde igual en todas las bolsas. */
const NOTA_FACTOR =
  "El RCV compra la renta vitalicia del IMSS, que reserva parte del saldo para el seguro de sobrevivencia (19%). La vivienda, el ahorro voluntario y los planes privados no pagan esa cobertura, así que por cada peso rinden más."


// Qué vehículos muestra cada calculadora. Ley 73 / Mod 40 sólo mueve dinero
// líquido (lo disponible en la AFORE y el Infonavit); Ley 97 proyecta los cinco.
const VEHICULOS_M40: VehiculoId[] = ["disponible", "infonavit"]
const VEHICULOS_97: VehiculoId[] = [
  "afore",
  "infonavit",
  "voluntario",
  "corporativo",
  "otros",
]

function edadActualDe(fechaNacimiento: string, en?: Date): number {
  const ref = en?.getTime() ?? Date.now()
  return (ref - new Date(fechaNacimiento).getTime()) / 86_400_000 / 365.25
}

/** Semanas que realmente se pueden recuperar: descontadas − ya recuperadas. */
function semanasRecuperables(perfil: SemillaV2["perfil"]): number {
  return Math.max(0, perfil.semanas.descontadas - perfil.semanas.recuperadas)
}

/**
 * Edades de retiro: la mínima es la edad ACTUAL (o 60 si aún no la cumple) y
 * después 10 escenarios más en cortes de medio año o año cerrado, sin tope.
 * Ej. con 62.3 años: 62.3 (retiro hoy), 62.5, 63, 63.5, 64, 64.5, 65, 65.5,
 * 66, 66.5, 67. El factor de edad Ley 73 aplica 1.0 de 65 en adelante (tabla
 * del Excel).
 */
function opcionesEdad(edadActual: number): number[] {
  const min = Math.max(60, Math.round(edadActual * 10) / 10)
  const out: number[] = [min]
  let e = Math.ceil(min * 2) / 2 // siguiente múltiplo de 0.5
  if (e === min) e += 0.5
  for (let i = 0; i < 10; i++, e += 0.5) out.push(Math.round(e * 10) / 10)
  return out
}

const PALANCAS_DEFAULT: Palancas = {
  edadRetiro: 60,
  pctTiempoCotizando: 1,
  salarioMod40: SAL_TOPE,
  recuperarSemanasDescontadas: false,
  recuperarSemanasMod40Retro: false,
  salarioCotizacionRetro: "MAXIMO",
  usaCreditoInfonavit: true,
  ahorroVoluntarioMensual: 0,
  ajusteSemanas: 0,
}

// ============================================================================
// Componente principal: 3 calculadoras independientes
// ============================================================================

type Branding = {
  colorPrimario: string
  colorAcento: string
  logoUrl: string | null
}

/**
 * Saldos reales capturados por el asesor y guardados en Supabase
 * (partner_transactions.saldos_corregidos / clientes.saldos_corregidos).
 */
export type SaldosCorregidos = DatosAUtilizar

/** Del jsonb guardado a los datos del panel, tirando lo que no es número. */
function datosDeSaldos(sc: SaldosCorregidos | null): DatosAUtilizar {
  if (!sc) return {}
  const d: DatosAUtilizar = {}
  for (const k of camposDe(["afore", "disponible", "infonavit", "voluntario", "corporativo", "otros"])) {
    const v = sc[k]
    // El índice es una unión de claves, así que TS estrecha el tipo del valor
    // a la intersección de todas: hay que decirle que es un número y ya.
    if (typeof v === "number" && Number.isFinite(v)) (d as Record<string, number>)[k] = v
  }
  return d
}

/** "Retiro 62 con Mod40" → "Retiro-62-con-Mod40" (para el nombre de archivo). */
function slugEscenario(nombre: string): string {
  return (
    nombre
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9 _-]/g, "")
      .trim()
      .replace(/\s+/g, "-") || "Escenario"
  )
}

/** Contexto compartido para la descarga de PDF en los 3 paneles. */
type PdfCtx = {
  curp: string
  clienteNombre: string
  branding: Branding
  numero: number
  onDescargado: () => void
}

const TROL_BRANDING: Branding = {
  colorPrimario: "#0f172a",
  colorAcento: "#a3e635",
  logoUrl: null,
}

export function CalculadoraClient({
  consultaId,
  clienteNombre,
  semilla,
  branding = TROL_BRANDING,
  backHref,
  backLabel = "← Volver a la consulta",
  fechaSisec = null,
  calculoGeneradoAt = null,
  mod40Aplica = true,
  historialLaboral = null,
  limiteInscripcionMod40 = null,
  resumen = null,
  calculoPensional = null,
  saldosCorregidos = null,
  guardarScope = null,
  serieINPC,
}: {
  consultaId: string
  clienteNombre: string
  semilla: SemillaV2
  branding?: Branding
  backHref?: string
  backLabel?: string
  fechaSisec?: string | null
  calculoGeneradoAt?: string | null
  mod40Aplica?: boolean
  /** Historia laboral: clasifica la última baja y su ventana (art. 219 / 220 LSS). */
  historialLaboral?: RegistroHistorialMod40[] | null
  /** `limite_inscripcion_mod40` del expediente: manda sobre el cálculo local. */
  limiteInscripcionMod40?: string | null
  /**
   * Serie INPC de `trol3.inpc_mensual`, bajada en el servidor. Este panel
   * recalcula en el navegador; sin la prop cae al fallback embebido.
   */
  serieINPC?: SerieINPC
  /** Resumen del cliente para el tab "Resumen" (consultas). */
  resumen?: ResumenClienteData | null
  /** Semilla cruda; respalda los campos que falten en el resumen. */
  calculoPensional?: unknown
  /** Saldos reales guardados por el asesor (precargan los overrides). */
  saldosCorregidos?: SaldosCorregidos | null
  /** Dónde guarda el botón de saldos ('consulta' | 'cliente'); null lo oculta. */
  guardarScope?: "consulta" | "cliente" | "consulta_aliado" | null
}) {
  const { perfil } = semilla
  const tabDefault = perfil.ley === "Ley97" ? "c97" : "c73"
  const back = backHref ?? `/consultas/${consultaId}`

  // Los datos a utilizar viven aquí arriba: lo que el asesor corrige en la
  // pestaña de Mod 40 tiene que verse igual en la de Ley 97, y guardarse una
  // sola vez. Los interruptores de incluir/excluir NO viven aquí: son de cada
  // escenario y se pierden al salir, a propósito.
  const [datos, setDatos] = useState<DatosAUtilizar>(() =>
    datosDeSaldos(saldosCorregidos),
  )
  const [guardando, setGuardando] = useState(false)
  const [guardadoAt, setGuardadoAt] = useState<string | null>(
    saldosCorregidos?.actualizado_at ?? null,
  )
  const setValor = (campo: keyof DatosAUtilizar, v: number | undefined) =>
    setDatos((d) => ({ ...d, [campo]: v }))

  /**
   * Guarda los campos del panel que llama. `campos` acota el alcance: un panel
   * que sólo muestra dos vehículos no puede borrar los otros siete, y los que
   * quedaron vacíos en ese panel sí se borran — vaciar una casilla es una
   * decisión, no un olvido.
   */
  async function guardarDatos(campos: (keyof DatosAUtilizar)[]) {
    if (!guardarScope) return
    const payload: Record<string, number> = {}
    const borrar: string[] = []
    for (const c of campos) {
      const v = datos[c]
      if (typeof v === "number" && Number.isFinite(v)) payload[c] = v
      else borrar.push(c)
    }
    if (Object.keys(payload).length === 0 && borrar.length === 0) return

    setGuardando(true)
    const supabase = createClient()
    const { error } =
      guardarScope === "consulta_aliado"
        ? await supabase.schema("trol3").rpc("guardar_saldos_consulta_aliado", {
            p_consulta: consultaId,
            p_datos: payload,
            p_borrar: borrar,
          })
        : await supabase.rpc("guardar_saldos_corregidos", {
            p_id: consultaId,
            p_scope: guardarScope,
            p_datos: payload,
            p_borrar: borrar,
          })
    setGuardando(false)
    if (error) {
      toast.error(`No se pudieron guardar los datos: ${error.message}`)
      return
    }
    setGuardadoAt(new Date().toISOString())
    toast.success("Datos guardados")
  }

  // Consecutivo del default "Escenario N" para los PDFs (compartido entre tabs)
  const [numEscenario, setNumEscenario] = useState(1)
  const pdfCtx: PdfCtx = {
    curp: perfil.curp,
    clienteNombre,
    branding,
    numero: numEscenario,
    onDescargado: () => setNumEscenario((n) => n + 1),
  }

  const brandStyle = {
    "--brand-primary": branding.colorPrimario,
    "--brand-accent": branding.colorAcento,
  } as React.CSSProperties

  return (
    <div className="flex flex-col gap-4 w-full" style={brandStyle}>
      <div className="flex flex-col gap-1">
        <Link
          href={back}
          className="text-sm text-muted-foreground hover:underline w-fit"
        >
          {backLabel}
        </Link>
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            {branding.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt="Logo aliado"
                className="h-8 w-auto object-contain"
              />
            )}
            <h1 className="font-heading font-bold text-2xl">
              Calculadora de pensión · {clienteNombre}
            </h1>
          </div>
          <span className="inline-flex items-center rounded-full bg-[var(--brand-primary)] text-[var(--brand-accent)] px-3 py-1 text-xs font-semibold tracking-wide">
            Perfil: {perfil.ley === "Ley73" ? "Ley 73" : "Ley 97"} ·{" "}
            {perfil.semanas.cotizadas.toLocaleString("es-MX")} semanas
          </span>
        </div>
        {(fechaSisec || calculoGeneradoAt) && (
          <div className="flex flex-col gap-0.5">
            {fechaSisec && (
              <span className="text-sm text-muted-foreground">
                Datos del IMSS al {fechaSisec}
              </span>
            )}
            {calculoGeneradoAt && (
              <span className="text-xs text-muted-foreground/70">
                Cálculo generado el {calculoGeneradoAt}
              </span>
            )}
          </div>
        )}
      </div>

      <Tabs defaultValue={tabDefault} className="flex-col w-full">
        <TabsList className="!h-8 p-0.5 w-fit">
          <TabsTrigger value="c73" className="!px-3 !py-1 text-sm">
            Calculadora 73{perfil.ley === "Ley73" ? " ★" : ""}
          </TabsTrigger>
          <TabsTrigger value="c97" className="!px-3 !py-1 text-sm">
            Calculadora 97{perfil.ley === "Ley97" ? " ★" : ""}
          </TabsTrigger>
          {mod40Aplica && (
            <TabsTrigger value="m40" className="!px-3 !py-1 text-sm">
              Mod40 Retroactivo
            </TabsTrigger>
          )}
          <TabsTrigger value="resumen" className="!px-3 !py-1 text-sm">
            Resumen
          </TabsTrigger>
        </TabsList>

        <TabsContent value="c73" className="mt-3 w-full">
          <Calc73Panel semilla={semilla} pdfCtx={pdfCtx} />
        </TabsContent>
        <TabsContent value="c97" className="mt-3 w-full">
          <Calc97Panel
            semilla={semilla}
            datos={datos}
            setValor={setValor}
            onGuardar={guardarScope ? guardarDatos : undefined}
            guardando={guardando}
            guardadoAt={guardadoAt}
            pdfCtx={pdfCtx}
          />
        </TabsContent>
        {mod40Aplica && (
          <TabsContent value="m40" className="mt-3 w-full">
            <Mod40Panel
              semilla={semilla}
              datos={datos}
              setValor={setValor}
              onGuardar={guardarScope ? guardarDatos : undefined}
              guardando={guardando}
              guardadoAt={guardadoAt}
              historialLaboral={historialLaboral}
              limiteInscripcionMod40={limiteInscripcionMod40}
              serieINPC={serieINPC}
              pdfCtx={pdfCtx}
            />
          </TabsContent>
        )}
        <TabsContent value="resumen" className="mt-3 w-full">
          <ResumenCliente
            resumen={resumen}
            calculoPensional={calculoPensional}
          />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        Estimaciones con base en el historial IMSS del cliente y parámetros vigentes
        ({ANIO}). No constituyen una resolución del IMSS ni una promesa de pensión.
      </p>
    </div>
  )
}

// ============================================================================
// Calculadora Ley 73
// ============================================================================

function Calc73Panel({
  semilla,
  pdfCtx,
}: {
  semilla: SemillaV2
  pdfCtx: PdfCtx
}) {
  const { perfil, saldos, salario_60m } = semilla
  const edadActual = edadActualDe(perfil.fecha_nacimiento)
  const edades = useMemo(() => opcionesEdad(edadActual), [edadActual])

  const [palancas, setPalancas] = useState<Palancas>({
    ...PALANCAS_DEFAULT,
    edadRetiro: edades[0],
    recuperarSemanasDescontadas: semanasRecuperables(perfil) > 0,
    recuperarSemanasMod40Retro: true,
  })
  const set = <K extends keyof Palancas>(k: K, v: Palancas[K]) =>
    setPalancas((p) => ({ ...p, [k]: v }))

  // Fecha de arranque del plan: el día en que se inscribe a Mod 40/10. NO es la
  // del retiro (esa la fija la edad) y aquí no hay piso de 60 como en la
  // pestaña Mod 40: inscribirse a los 58 y seguir cotizando es justo lo que
  // esta pestaña modela. Moverla pasa semanas del tramo futuro al retroactivo
  // sin cambiar el total, y con eso las dos pestañas cobran la misma línea.
  const hoyIso = useMemo(() => isoFecha(new Date()), [])
  const [fechaTramiteIso, setFechaTramiteIso] = useState(hoyIso)
  const fechaTramite = useMemo(
    () => parseFechaTramite(fechaTramiteIso) ?? parseFechaTramite(hoyIso) ?? new Date(),
    [fechaTramiteIso, hoyIso],
  )

  const entrada = useMemo(
    () => ({ perfil, saldos, salario_60m, palancas, fechaTramite }),
    [perfil, saldos, salario_60m, palancas, fechaTramite],
  )
  const r = useMemo(() => computeLey73(entrada), [entrada])

  // Referencia "sin estrategia": misma edad, 0% cotización, sin recuperaciones
  const sinEstrategia = useMemo(
    () =>
      computeLey73({
        ...entrada,
        palancas: {
          ...palancas,
          pctTiempoCotizando: 0,
          recuperarSemanasDescontadas: false,
          recuperarSemanasMod40Retro: false,
        },
      }),
    [entrada, palancas],
  )

  // Barrido pensión/costo por edad con las palancas actuales
  const barrido = useMemo(
    () =>
      edades.map((edad) => {
        const res = computeLey73({
          ...entrada,
          palancas: { ...palancas, edadRetiro: edad },
        })
        return { edad, pension: res.pensionMensual, costo: res.costoTotal }
      }),
    [edades, entrada, palancas],
  )

  const d = r.detalle
  const deltaSin =
    r.pensionMensual !== null && sinEstrategia.pensionMensual !== null
      ? r.pensionMensual - sinEstrategia.pensionMensual
      : null

  const buildPdf = (): PdfEscenarioData => ({
    calculadora: "Calculadora Ley 73",
    clienteNombre: pdfCtx.clienteNombre,
    hero: {
      etiqueta: "Pensión mensual estimada",
      valor: r.negativa ? "Negativa de pensión" : fmt(r.pensionMensual),
      sub: `Retiro estimado: ${fmtFecha(d.fechaRetiro)} · ${Math.round(d.semanasRetiro).toLocaleString("es-MX")} semanas al retiro`,
      negativa: r.negativa,
    },
    palancas: [
      { label: "Fecha de inicio del plan", value: isoFecha(d.fechaTramite) },
      { label: "Edad de retiro", value: `${palancas.edadRetiro} años` },
      {
        label: "Cotización futura",
        value: `${palancas.pctTiempoCotizando * 100}% del tiempo`,
      },
      ...(palancas.pctTiempoCotizando > 0
        ? [
            {
              label: "Salario de cotización Mod40",
              value: `${fmt(palancas.salarioMod40)} diarios`,
            },
          ]
        : []),
      ...(semanasRecuperables(perfil) > 0
        ? [
            {
              label: `Recuperar ${semanasRecuperables(perfil)} semanas descontadas`,
              value: palancas.recuperarSemanasDescontadas ? "Sí" : "No",
            },
          ]
        : []),
      ...(r.aplicaRetroHoy
        ? [
            {
              label: "Mod40 retroactivo",
              value: palancas.recuperarSemanasMod40Retro
                ? `Sí (salario ${palancas.salarioCotizacionRetro === "MINIMO" ? "mínimo" : "máximo"})`
                : "No",
            },
          ]
        : []),
      ...((palancas.ajusteSemanas ?? 0) !== 0
        ? [
            {
              label: "Ajuste de semanas",
              value: `${(palancas.ajusteSemanas ?? 0) > 0 ? "+" : ""}${palancas.ajusteSemanas}`,
            },
          ]
        : []),
    ],
    secciones: [
      {
        titulo: "Resultado del escenario",
        stats: [
          {
            label: "Pensión mensual",
            value: r.negativa ? "Negativa" : fmt(r.pensionMensual),
            destacado: true,
          },
          {
            label: "Sin estrategia",
            value: sinEstrategia.negativa
              ? "Negativa"
              : fmt(sinEstrategia.pensionMensual),
          },
          ...(deltaSin !== null
            ? [
                {
                  label: "Mejora mensual",
                  value: `${deltaSin >= 0 ? "+" : ""}${fmt(deltaSin)}`,
                },
              ]
            : []),
          { label: "Salario prom. 250 semanas", value: fmt(d.salarioCot250) },
        ],
      },
      ...(r.retroactivoAlPensionarse
        ? [
            {
              titulo: "Retroactivo al pensionarse (tope 12 meses)",
              stats: [
                {
                  label: "Derecho adquirido",
                  value: fmtFecha(r.retroactivoAlPensionarse.fechaDerechos),
                },
                {
                  label: "Meses de retroactivo",
                  value: `${r.retroactivoAlPensionarse.meses}`,
                },
                {
                  label: "Retroactivo estimado",
                  value: fmt(r.retroactivoAlPensionarse.monto),
                  destacado: true,
                },
              ],
              nota: "Si el cliente presenta su solicitud en la fecha de retiro elegida sin volver a cotizar, el IMSS le paga la pensión desde que adquirió el derecho, topado a 12 meses.",
            },
          ]
        : []),
      ...(r.retro || r.costoEstrategiaFutura > 0
        ? [
            {
              titulo: "Costo de la estrategia",
              stats: [
                ...(r.retro
                  ? [
                      {
                        label: `Retroactivo (${r.retro.meses} meses)`,
                        value: fmt(r.retro.cuotaBase),
                      },
                      { label: "Actualizaciones", value: fmt(r.retro.actualizaciones) },
                      { label: "Recargos", value: fmt(r.retro.recargos) },
                    ]
                  : []),
                { label: "Cotización futura", value: fmt(r.costoEstrategiaFutura) },
                {
                  label: "Costo mensual inicial",
                  value: fmt(r.costoMensualPrimerMes),
                },
                { label: "Costo total", value: fmt(r.costoTotal), destacado: true },
              ],
            },
          ]
        : []),
      {
        titulo: "¿Cómo se calculó?",
        soloAsesor: true,
        stats: [
          { label: "Cuantía básica (anual)", value: fmt(d.cuantiaBasica) },
          { label: "Incrementos (anual)", value: fmt(d.incrementos) },
          { label: "Asignaciones 15%", value: fmt(d.asignaciones) },
          { label: "Ajuste por edad", value: `× ${d.ajusteEdad.toFixed(2)}` },
          { label: "Factor salarial", value: d.factorSalarial.toFixed(2) },
          {
            label: "PMG / Tope 25 UMA",
            value: `${fmt(d.pensionMinima)} / ${fmt(d.pensionMaxima)}`,
          },
        ],
      },
    ],
    tabla: {
      titulo: "Pensión por edad de retiro (con las palancas del escenario)",
      columnas: ["Edad", "Pensión mensual", "Costo total estrategia"],
      filas: barrido.map((b) => [
        `${b.edad}`,
        b.pension === null ? "Negativa" : fmt(b.pension),
        fmt(b.costo),
      ]),
      resaltada: barrido.findIndex((b) => b.edad === palancas.edadRetiro),
    },
    datosCliente: filasDatosCliente(semilla),
    advertencias: [
      ...(perfil.ley === "Ley97"
        ? [
            "Este cliente es Ley 97: la proyección de Ley 73 solo aplica si el IMSS le reconoce semanas cotizadas antes del 1 de julio de 1997.",
          ]
        : []),
      ...(d.advertenciaConservacion
        ? [
            "Revisar conservación de derechos: el cliente no conserva derechos y el retiro es en menos de un año.",
          ]
        : []),
    ],
  })

  return (
    <PanelLayout
      referencia={<DatosCliente semilla={semilla} />}
      palancas={
        <>
          <FechaTramiteInput
            id="l73-fecha-tramite"
            value={fechaTramiteIso}
            min={hoyIso}
            max={isoFecha(d.fechaRetiro)}
            onChange={setFechaTramiteIso}
            etiqueta="Fecha de inicio del plan"
            hint={
              r.aplicaRetroHoy
                ? "El día que se inscribe a Modalidad 40/10. La línea de captura cubre de la baja hasta aquí; de ahí al retiro se cotiza mes a mes. Moverla no cambia las semanas al retiro, cambia de qué lado se pagan."
                : "El día que arranca la cotización. De ahí al retiro se paga mes a mes."
            }
          />
          {fechaTramiteIso !== hoyIso && (
            <button
              type="button"
              onClick={() => setFechaTramiteIso(hoyIso)}
              className="-mt-1 w-fit text-xs font-semibold underline"
            >
              Volver a hoy
            </button>
          )}
          <SelectorEdad
            edades={edades}
            value={palancas.edadRetiro}
            onChange={(v) => set("edadRetiro", v)}
          />
          <SelectorPct
            value={palancas.pctTiempoCotizando}
            onChange={(v) => set("pctTiempoCotizando", v)}
          />
          <SliderSalario
            label="Salario de cotización Mod40 (diario)"
            value={palancas.salarioMod40}
            onChange={(v) => set("salarioMod40", v)}
          />
          <AjusteSemanas
            id="ajuste73"
            value={palancas.ajusteSemanas ?? 0}
            onChange={(v) => set("ajusteSemanas", v)}
          />
          {semanasRecuperables(perfil) > 0 && (
            <Toggle
              label={`Recuperar ${semanasRecuperables(perfil)} semanas descontadas`}
              checked={palancas.recuperarSemanasDescontadas}
              onChange={(v) => set("recuperarSemanasDescontadas", v)}
            />
          )}
          {r.aplicaRetroHoy && (
            <div className="flex flex-col gap-2 rounded-md border p-3">
              <Toggle
                label={`Mod40 retroactivo: recuperar ~${Math.floor(r.semanasRecuperablesRetro)} semanas`}
                checked={palancas.recuperarSemanasMod40Retro}
                onChange={(v) => set("recuperarSemanasMod40Retro", v)}
              />
              {palancas.recuperarSemanasMod40Retro && (
                <div className="grid grid-cols-2 gap-1">
                  {(["MINIMO", "MAXIMO"] as const).map((m) => (
                    <Button
                      key={m}
                      type="button"
                      size="sm"
                      variant={palancas.salarioCotizacionRetro === m ? "default" : "outline"}
                      onClick={() => set("salarioCotizacionRetro", m)}
                    >
                      {m === "MINIMO" ? "Salario mínimo" : "Salario máximo"}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          )}
          <DescargarEscenario pdfCtx={pdfCtx} idSuffix="73" buildPayload={buildPdf} />
        </>
      }
    >
      {perfil.ley === "Ley97" && (
        <div className="rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400 text-amber-950 font-bold text-sm"
          >
            !
          </span>
          <div className="flex flex-col gap-1">
            <p className="font-heading font-bold text-base text-amber-900">
              Aviso: este cliente es Ley 97
            </p>
            <p className="text-sm text-amber-900 leading-snug">
              Esta proyección de Ley 73 solo le aplica a un cliente Ley 97 si el
              IMSS le reconoce semanas cotizadas antes del 1 de julio de 1997.
              Esto ocurre cuando la persona sí cotizó pero tiene inconsistencias
              en su cuenta, y requiere una gestión para corregirlas.
            </p>
          </div>
        </div>
      )}

      <HeroPension
        pension={r.pensionMensual}
        negativa={r.negativa}
        etiquetaDelta="vs sin estrategia"
        referencia={sinEstrategia.pensionMensual}
        delta={deltaSin}
        stats={[
          { label: "Retiro estimado", value: fmtFecha(d.fechaRetiro) },
          {
            label: "Semanas al retiro",
            value: Math.round(d.semanasRetiro).toLocaleString("es-MX"),
          },
          { label: "Salario prom. 250 sem.", value: fmt(d.salarioCot250) },
        ]}
        advertencia={
          d.advertenciaConservacion
            ? "Revisar conservación de derechos: el cliente no conserva derechos y el retiro es en menos de un año."
            : null
        }
      />

      {/* La conservación de derechos (art. 150/151) es un requisito aparte de
          las semanas. Hasta hoy la calculadora del asesor no la miraba —esa
          lógica solo vivía en pension-core, que es lo que ve el cliente en /mi—
          y las dos pantallas podían contradecirse. */}
      {r.status === "negativa_sin_reactivacion" && (
        <Card className="border-2 border-amber-300 bg-amber-50">
          <CardContent className="pt-6 flex flex-col gap-2">
            <p className="font-heading font-bold text-base text-amber-900">
              La negativa es por conservación de derechos, no por semanas
            </p>
            <p className="text-sm text-amber-900 leading-snug">
              Tiene{" "}
              {(r.razon?.semanasAlRetiro ?? 0).toLocaleString("es-MX")} semanas
              al retiro —le bastan— pero lleva {r.razon?.gapMeses} meses sin
              cotizar
              {r.razon?.finConservacion
                ? ` y su conservación venció el ${r.razon.finConservacion}`
                : ""}
              . Para pensionarse tiene que reingresar al régimen
              {(r.razon?.semanasParaReactivar ?? 0) > 0
                ? ` y cotizar ${r.razon?.semanasParaReactivar} semanas más (art. 151 LSS)`
                : " (art. 151 LSS, fracc. I: el reconocimiento es inmediato al reinscribirse)"}
              .
            </p>
            {r.pensionSiReactiva !== null && (
              <p className="text-sm text-amber-900">
                Si reactiva, con este escenario le corresponderían{" "}
                <b className="tabular-nums">{fmt(r.pensionSiReactiva)}</b> al mes.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {r.retroactivoAlPensionarse && (
        <Card className="border-2 border-[var(--brand-accent)]/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Retroactivo al pensionarse (tope 12 meses)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Stat
                label="Derecho adquirido"
                value={fmtFecha(r.retroactivoAlPensionarse.fechaDerechos)}
              />
              <Stat
                label="Meses de retroactivo"
                value={`${r.retroactivoAlPensionarse.meses}`}
              />
              <Stat
                label="Retroactivo estimado"
                value={fmt(r.retroactivoAlPensionarse.monto)}
                destacado
              />
            </div>
            <p className="text-xs text-muted-foreground leading-snug">
              Si el cliente presenta su solicitud en la fecha de retiro elegida
              sin volver a cotizar, el IMSS le paga la pensión desde que
              adquirió el derecho (cumplir 60 años con más de 500 semanas y
              estar dado de baja), topado a 12 meses.
            </p>
          </CardContent>
        </Card>
      )}

      {!r.negativa && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">¿Cómo se calculó?</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="Cuantía básica (anual)" value={fmt(d.cuantiaBasica)} />
            <Stat label="Incrementos (anual)" value={fmt(d.incrementos)} />
            <Stat label="Asignaciones 15%" value={fmt(d.asignaciones)} />
            <Stat label="Ajuste por edad" value={`× ${d.ajusteEdad.toFixed(2)}`} />
            <Stat label="Pensión mínima (PMG)" value={fmt(d.pensionMinima)} />
            <Stat label="Tope (25 UMA)" value={fmt(d.pensionMaxima)} />
          </CardContent>
        </Card>
      )}

      {(r.retro || r.costoEstrategiaFutura > 0) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Costo de la estrategia</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {r.retro && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat
                  label={`Retroactivo (${r.retro.meses} meses)`}
                  value={fmt(r.retro.cuotaBase)}
                />
                <Stat label="Actualizaciones" value={fmt(r.retro.actualizaciones)} />
                <Stat label="Recargos" value={fmt(r.retro.recargos)} />
                <Stat label="Subtotal retro" value={fmt(r.retro.total)} />
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Cotización futura" value={fmt(r.costoEstrategiaFutura)} />
              <Stat label="Costo mensual inicial" value={fmt(r.costoMensualPrimerMes)} />
              <Stat
                label="Modalidad inicial"
                value={r.modalidadPrimerMes ? `Mod ${r.modalidadPrimerMes}` : "—"}
              />
              <Stat label="Costo total" value={fmt(r.costoTotal)} destacado />
            </div>
          </CardContent>
        </Card>
      )}

      <TablaBarrido
        titulo="Pensión por edad de retiro (con las palancas actuales)"
        columnas={["Edad", "Pensión mensual", "Costo total estrategia"]}
        filas={barrido.map((b) => [
          `${b.edad}`,
          b.pension === null ? "Negativa" : fmt(b.pension),
          fmt(b.costo),
        ])}
        resaltada={barrido.findIndex((b) => b.edad === palancas.edadRetiro)}
      />
    </PanelLayout>
  )
}

// ============================================================================
// Calculadora Ley 97
// ============================================================================

function Calc97Panel({
  semilla,
  datos,
  setValor,
  onGuardar,
  guardando = false,
  guardadoAt = null,
  pdfCtx,
}: {
  semilla: SemillaV2
  datos: DatosAUtilizar
  setValor: (campo: keyof DatosAUtilizar, v: number | undefined) => void
  onGuardar?: (campos: (keyof DatosAUtilizar)[]) => void
  guardando?: boolean
  guardadoAt?: string | null
  pdfCtx: PdfCtx
}) {
  const { perfil, saldos, salario_60m } = semilla
  const edadActual = edadActualDe(perfil.fecha_nacimiento)
  const edades = useMemo(() => opcionesEdad(edadActual), [edadActual])

  const [palancas, setPalancas] = useState<Palancas>({
    ...PALANCAS_DEFAULT,
    edadRetiro: edades[0],
    recuperarSemanasDescontadas: semanasRecuperables(perfil) > 0,
  })
  const set = <K extends keyof Palancas>(k: K, v: Palancas[K]) =>
    setPalancas((p) => ({ ...p, [k]: v }))

  // Qué dinero entra al cálculo. Sólo de la sesión: es una pregunta de
  // escenario, no un dato del cliente.
  const [incluir, setIncluir] = useState<Incluir>({})
  const setIncluirClave = (k: keyof Incluir, v: boolean) =>
    setIncluir((i) => ({ ...i, [k]: v }))
  // La vivienda no es un sí/no: son tres destinos. Arranca en "a la pensión"
  // —es lo que pasa si nadie hace nada— y el asesor decide desde ahí.
  const [destinoInfonavit, setDestinoInfonavit] = useState<DestinoInfonavit>("pension")

  // Las palancas que ve el motor: las del escenario más los datos capturados.
  // Los montos no viven en `palancas` porque se comparten con la pestaña de
  // Mod 40 y se guardan; sólo se inyectan al momento de calcular.
  const palancasConDatos = useMemo<Palancas>(
    () => ({
      ...palancas,
      // Los tres destinos de la vivienda viajan al motor como dos banderas.
      usaCreditoInfonavit: destinoInfonavit === "vivienda",
      rescatarInfonavit: destinoInfonavit === "rescate",
      ahorroVoluntarioMensual: datos.ahorro_voluntario_mensual ?? 0,
      planCorporativoMensual: datos.plan_corporativo_mensual ?? 0,
      otrosPlanesMensual: datos.otros_planes_mensual ?? 0,
      incluir,
      overrides: {
        ...palancas.overrides,
        rcv97: datos.rcv97,
        infonavit: datos.infonavit,
        ahorroVoluntario: datos.ahorro_voluntario,
        planCorporativo: datos.plan_corporativo,
        otrosPlanes: datos.otros_planes,
      },
    }),
    [palancas, datos, incluir, destinoInfonavit],
  )

  const entrada = useMemo(
    () => ({ perfil, saldos, salario_60m, palancas: palancasConDatos }),
    [perfil, saldos, salario_60m, palancasConDatos],
  )
  const r = useMemo(() => computeLey97(entrada), [entrada])
  const d = r.detalle
  // Cliente en el piso: su cuenta individual no alcanza la mínima garantizada
  // y el gobierno completa. Lo calcula el motor, que es quien sabe cuánto
  // pone cada fuente.
  const enPMG = d.enPmg

  const barrido = useMemo(
    () =>
      edades.map((edad) => {
        const res = computeLey97({
          ...entrada,
          palancas: { ...palancasConDatos, edadRetiro: edad },
        })
        return {
          edad,
          // Pensión total (incluye Infonavit, ahorro voluntario y planes
          // privados) para que los datos capturados se vean también aquí.
          pension: res.pensionTotal,
          saldo: res.detalle.saldoAforeProyectado,
        }
      }),
    [edades, entrada, palancasConDatos],
  )

  const buildPdf = (): PdfEscenarioData => ({
    calculadora: "Calculadora Ley 97",
    clienteNombre: pdfCtx.clienteNombre,
    hero: {
      etiqueta: "Pensión mensual total estimada",
      valor: r.negativa ? "Negativa de pensión" : fmt(r.pensionTotal),
      sub: `Retiro estimado: ${fmtFecha(d.fechaRetiro)} · ${Math.round(d.semanasRetiro).toLocaleString("es-MX")} semanas al retiro`,
      negativa: r.negativa,
    },
    palancas: [
      { label: "Edad de retiro", value: `${palancas.edadRetiro} años` },
      {
        label: "Cotización futura",
        value: `${palancas.pctTiempoCotizando * 100}% del tiempo`,
      },
      ...(palancas.pctTiempoCotizando > 0
        ? [
            {
              label: "Salario de cotización futuro",
              value: `${fmt(palancas.salarioMod40)} diarios`,
            },
          ]
        : []),
      { label: "Subcuenta de vivienda", value: DESTINO_PDF[destinoInfonavit] },
      ...filasPdfVehiculo("AFORE (RCV)", datos.rcv97, undefined, incluir.afore),
      ...filasPdfVehiculo(
        "Subcuenta de vivienda",
        datos.infonavit,
        undefined,
        destinoInfonavit !== "vivienda",
      ),
      ...filasPdfVehiculo(
        "Ahorro voluntario",
        datos.ahorro_voluntario,
        datos.ahorro_voluntario_mensual,
        incluir.ahorroVoluntario,
      ),
      ...filasPdfVehiculo(
        "Plan de retiro de la empresa",
        datos.plan_corporativo,
        datos.plan_corporativo_mensual,
        incluir.planCorporativo,
      ),
      ...filasPdfVehiculo(
        "Otros planes de ahorro",
        datos.otros_planes,
        datos.otros_planes_mensual,
        incluir.otrosPlanes,
      ),
    ],
    secciones: [
      {
        titulo: "De dónde sale su pensión",
        filas: [
          { label: "Concepto", value: "Saldo al retiro", value2: "Al mes" },
          ...filasFuentes(r, fmt),
        ],
        nota: enPMG
          ? `Su cuenta individual no alcanza la pensión mínima garantizada (${fmt(d.pmg)}), así que el gobierno completa la diferencia. Mientras eso pase, cada peso de la subcuenta de vivienda le quita un peso al complemento y la pensión no se mueve; el ahorro que va encima sí la sube. ${NOTA_FACTOR}`
          : NOTA_FACTOR,
      },
      {
        titulo: "Detalle técnico",
        soloAsesor: true,
        stats: [
          { label: "URV (renta vitalicia)", value: d.urv.toFixed(2) },
          { label: "PMG aplicable", value: fmt(d.pmg) },
          { label: "Semanas mínimas PMG", value: `${d.semanasMinimasPMG}` },
          { label: "Aportaciones futuras al RCV", value: fmt(d.aportacionesFuturas) },
          {
            label: "Complemento del gobierno",
            value: enPMG ? fmt(d.complementoPmg) : "no aplica",
          },
        ],
      },
    ],
    tabla: {
      titulo: "Pensión por edad de retiro (con las palancas del escenario)",
      columnas: [
        "Edad",
        "Pensión mensual total",
        "Saldo AFORE al retiro",
      ],
      filas: barrido.map((b) => [
        `${b.edad}`,
        b.pension === null ? "Negativa" : fmt(b.pension),
        fmt(b.saldo),
      ]),
      resaltada: barrido.findIndex((b) => b.edad === palancas.edadRetiro),
    },
    datosCliente: filasDatosCliente(semilla),
    advertencias: r.negativa
      ? [
          `No alcanza las ${d.semanasMinimasPMG} semanas mínimas para pensión en el año de retiro.`,
        ]
      : [],
  })

  return (
    <PanelLayout
      referencia={<DatosCliente semilla={semilla} />}
      palancas={
        <>
          <SelectorEdad
            edades={edades}
            value={palancas.edadRetiro}
            onChange={(v) => set("edadRetiro", v)}
          />
          <SelectorPct
            value={palancas.pctTiempoCotizando}
            onChange={(v) => set("pctTiempoCotizando", v)}
          />
          <SliderSalario
            label="Salario de cotización futuro (diario)"
            value={palancas.salarioMod40}
            onChange={(v) => set("salarioMod40", v)}
          />
          {semanasRecuperables(perfil) > 0 && (
            <Toggle
              label={`Recuperar ${semanasRecuperables(perfil)} semanas descontadas`}
              checked={palancas.recuperarSemanasDescontadas}
              onChange={(v) => set("recuperarSemanasDescontadas", v)}
            />
          )}
          <Separator />
          <PanelDatosAUtilizar
            vehiculos={VEHICULOS_97}
            estimados={{
              rcv97: saldos.rcv97,
              infonavit: saldos.infonavit,
              ahorro_voluntario: saldos.ahorro_voluntario,
            }}
            valores={datos}
            onValor={setValor}
            incluir={incluir}
            onIncluir={setIncluirClave}
            destinoInfonavit={destinoInfonavit}
            onDestinoInfonavit={setDestinoInfonavit}
            onGuardar={onGuardar ? () => onGuardar(camposDe(VEHICULOS_97)) : undefined}
            guardando={guardando}
            guardadoAt={guardadoAt}
          />
          <DescargarEscenario pdfCtx={pdfCtx} idSuffix="97" buildPayload={buildPdf} />
        </>
      }
    >
      <HeroPension
        pension={r.pensionTotal}
        negativa={r.negativa}
        etiquetaDelta="pensión de la cuenta individual"
        referencia={r.pensionAforeInfonavit}
        delta={null}
        stats={[
          { label: "Retiro estimado", value: fmtFecha(d.fechaRetiro) },
          {
            label: "Semanas al retiro",
            value: Math.round(d.semanasRetiro).toLocaleString("es-MX"),
          },
          { label: "Saldo AFORE al retiro", value: fmt(d.saldoAforeProyectado) },
        ]}
        advertencia={
          r.negativa
            ? `No alcanza las ${d.semanasMinimasPMG} semanas mínimas para pensión en el año de retiro.`
            : null
        }
      />

      {enPMG && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">
            Está en la pensión mínima garantizada ({fmt(d.pmg)} al mes).
          </p>
          <p className="mt-1">
            Su cuenta individual no alcanza ese piso y el gobierno completa la
            diferencia. Mientras siga aquí, cada peso de la subcuenta de
            vivienda le quita un peso al complemento: la pensión no se mueve. Lo
            que sí la sube es el ahorro que va <b>encima</b> —voluntario, plan
            de la empresa, otros planes— o juntar lo suficiente para rebasar el
            piso por cuenta propia.
          </p>
        </div>
      )}

      <TablaFuentes r={r} enPMG={enPMG} pmg={d.pmg} />

      <Card>
        <CardContent className="pt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat label="Saldo AFORE al retiro" value={fmt(d.saldoAforeProyectado)} />
          <Stat label="Aportaciones futuras" value={fmt(d.aportacionesFuturas)} />
          <Stat label="URV (renta vitalicia)" value={d.urv.toFixed(2)} />
          <Stat label="PMG aplicable" value={fmt(d.pmg)} />
        </CardContent>
      </Card>

      <TablaBarrido
        titulo="Pensión por edad de retiro (con las palancas actuales)"
        columnas={["Edad", "Pensión mensual total", "Saldo AFORE al retiro"]}
        filas={barrido.map((b) => [
          `${b.edad}`,
          b.pension === null ? "Negativa" : fmt(b.pension),
          fmt(b.saldo),
        ])}
        resaltada={barrido.findIndex((b) => b.edad === palancas.edadRetiro)}
      />
    </PanelLayout>
  )
}

// ============================================================================
// Mod40 Retroactivo (proyecto)
// ============================================================================

function Mod40Panel({
  semilla,
  datos,
  setValor,
  onGuardar,
  guardando = false,
  guardadoAt = null,
  historialLaboral = null,
  limiteInscripcionMod40 = null,
  serieINPC,
  pdfCtx,
}: {
  semilla: SemillaV2
  datos: DatosAUtilizar
  setValor: (campo: keyof DatosAUtilizar, v: number | undefined) => void
  onGuardar?: (campos: (keyof DatosAUtilizar)[]) => void
  guardando?: boolean
  guardadoAt?: string | null
  historialLaboral?: RegistroHistorialMod40[] | null
  limiteInscripcionMod40?: string | null
  serieINPC?: SerieINPC
  pdfCtx: PdfCtx
}) {
  const { perfil, saldos, salario_60m } = semilla
  // Fecha de inicio de trámite: el ancla de todo el proyecto (ventana, meses de
  // retroactivo, UMA del año y edad). El trámite ES el de la pensión, así que
  // no puede ser antes de cumplir 60 ni antes de hoy: fecha y edad son la misma
  // variable con dos vistas, y mover cualquiera de las dos mueve la otra.
  const hoyIso = useMemo(() => isoFecha(new Date()), [])
  const fnac = useMemo(
    () => new Date(`${perfil.fecha_nacimiento.slice(0, 10)}T00:00:00.000Z`),
    [perfil.fecha_nacimiento],
  )
  const fecha60Iso = useMemo(() => isoFecha(addMeses(fnac, 60 * 12)), [fnac])
  const minIso = fecha60Iso > hoyIso ? fecha60Iso : hoyIso
  const [fechaTramiteIso, setFechaTramiteIso] = useState(minIso)
  const fechaTramite = useMemo(
    () => parseFechaTramite(fechaTramiteIso) ?? parseFechaTramite(minIso) ?? new Date(),
    [fechaTramiteIso, minIso],
  )
  const edadActual = edadActualDe(perfil.fecha_nacimiento, fechaTramite)
  // La lista de edades se ancla en la fecha MÍNIMA, no en la elegida: si se
  // recalculara con la fecha, el slider se movería solo al mover el calendario.
  const edadMinima = useMemo(
    () => edadActualDe(perfil.fecha_nacimiento, parseFechaTramite(minIso) ?? new Date()),
    [perfil.fecha_nacimiento, minIso],
  )
  const edades = useMemo(() => opcionesEdad(edadMinima), [edadMinima])
  /** Elegir una edad = ponerse en la fecha en que la cumple. */
  const fechaDeEdad = (e: number) => {
    const iso = isoFecha(addDias(fnac, e * DIAS_ANIO))
    return iso < minIso ? minIso : iso
  }
  // Etiqueta de la fecha en el escalón de la lista: el slider refleja la fecha,
  // no manda por su cuenta.
  const edadEnLista = edades.reduce((a, b) => (b <= edadActual + 0.05 ? b : a), edades[0])
  const [umas, setUmas] = useState(25)
  const [recuperarDesc, setRecuperarDesc] = useState(semanasRecuperables(perfil) > 0)
  const [semanasExtra, setSemanasExtra] = useState(0)
  // Los montos vienen de arriba: son los mismos que ve la pestaña de Ley 97.
  const overrides = useMemo<Palancas["overrides"]>(
    () => ({
      disponibleAfore: datos.disponible_afore,
      infonavit: datos.infonavit,
    }),
    [datos.disponible_afore, datos.infonavit],
  )

  const r = useMemo(
    () =>
      computeProyectoMod40({
        perfil,
        saldos,
        salario_60m,
        umasProyecto: umas,
        semanasExtra,
        fechaTramite,
        historial: historialLaboral,
        limiteInscripcionMod40,
        serieINPC,
        palancas: {
          // `edadRetiro` ya no viaja: el motor la deriva de la fecha.
          ...PALANCAS_DEFAULT,
          recuperarSemanasDescontadas: recuperarDesc,
          overrides,
        },
      }),
    [
      perfil,
      saldos,
      salario_60m,
      umas,
      recuperarDesc,
      semanasExtra,
      overrides,
      fechaTramite,
      historialLaboral,
      limiteInscripcionMod40,
      serieINPC,
    ],
  )

  if (!r) {
    return (
      <Card>
        <CardContent className="pt-6 flex flex-col gap-2">
          <h2 className="font-semibold">Modalidad 40 retroactiva no aplica hoy</h2>
          <p className="text-sm text-muted-foreground">
            {!perfil.aplica_mod40
              ? "El perfil no califica para Modalidad 40 (validación del diagnóstico)."
              : "El cliente está cotizando actualmente: no hay periodo descubierto que pagar de forma retroactiva."}
          </p>
        </CardContent>
      </Card>
    )
  }

  const buildPdf = (): PdfEscenarioData => ({
    calculadora: "Mod40 Retroactivo",
    clienteNombre: pdfCtx.clienteNombre,
    hero: {
      etiqueta: `Pensión con proyecto (×${r.multiplicadorPension.toFixed(1)} vs sin proyecto)`,
      valor: `${fmt(r.conProyecto.pensionMensual)} /mes`,
      sub: `Sin proyecto: ${fmt(r.sinProyecto.pensionMensual)} /mes · Edad de pensión: ${r.edadProyecto.toFixed(1)} años · Trámite: ${isoFecha(r.fechaTramite)}`,
    },
    palancas: [
      // La fecha va primero: es la que da contexto a todo lo de abajo y la que
      // queda congelada en el escenario.
      { label: "Fecha de trámite y de pensión", value: isoFecha(r.fechaTramite) },
      {
        label: "Edad a esa fecha",
        value: `${r.edadProyecto.toFixed(1)} años`,
      },
      {
        label: "UMAs del proyecto",
        value: `${umas} UMA (${fmt((UMA[ANIO] ?? 117.35) * umas)}/día)`,
      },
      ...(semanasRecuperables(perfil) > 0
        ? [
            {
              label: `Recuperar ${semanasRecuperables(perfil)} semanas descontadas`,
              value: recuperarDesc ? "Sí" : "No",
            },
          ]
        : []),
      ...(semanasExtra !== 0
        ? [
            {
              label: "Ajuste de semanas",
              value: `${semanasExtra > 0 ? "+" : ""}${semanasExtra}`,
            },
          ]
        : []),
      ...(overrides?.disponibleAfore !== undefined
        ? [
            {
              label: "Disponible AFORE (dato real)",
              value: fmt(overrides.disponibleAfore),
            },
          ]
        : []),
      ...(overrides?.infonavit !== undefined
        ? [
            {
              label: "Saldo Infonavit (dato real)",
              value: fmt(overrides.infonavit),
            },
          ]
        : []),
    ],
    secciones: [
      {
        titulo: "Comparativo sin / con proyecto",
        stats: [
          {
            label: "Pensión sin proyecto",
            value: fmt(r.sinProyecto.pensionMensual),
          },
          {
            label: "Pensión con proyecto",
            value: fmt(r.conProyecto.pensionMensual),
            destacado: true,
          },
          { label: "Multiplicador", value: `× ${r.multiplicadorPension.toFixed(1)}` },
          {
            label: "Valor total sin proyecto",
            value: fmt(r.sinProyecto.valorTotal),
          },
          {
            label: "Valor total con proyecto",
            value: fmt(r.conProyecto.valorTotal),
            destacado: true,
          },
          {
            label: "Multiplicador de valor",
            value: `× ${r.multiplicadorValor.toFixed(1)}`,
          },
        ],
      },
      {
        titulo: `Pago al IMSS (${r.pagoImss.meses} meses retroactivos)`,
        stats: [
          { label: "Cuotas retroactivas", value: fmt(r.pagoImss.cuotaBase) },
          {
            label: "Actualizaciones (INPC)",
            value: fmt(r.pagoImss.actualizaciones),
          },
          { label: "Recargos (1.47%/mes)", value: fmt(r.pagoImss.recargos) },
          { label: "Total IMSS", value: fmt(r.pagoImss.total), destacado: true },
        ],
      },
      {
        titulo: "Costos del proyecto",
        stats: [
          { label: "Gestorías", value: fmt(r.costos.gestorias) },
          {
            label: "Gastos administrativos",
            value: fmt(r.costos.gastosAdministrativos),
          },
          {
            label: "Comisión de apertura (3%)",
            value: fmt(r.costos.comisionApertura),
          },
          {
            label: `Financiamiento (${r.financiamiento.meses}m @ ${(r.financiamiento.tasa * 100).toFixed(1)}%)`,
            value: fmt(r.financiamiento.interes),
          },
          { label: "Total a pagar", value: fmt(r.totalAPagar), destacado: true },
        ],
      },
      {
        titulo: "Flujo de efectivo: ¿pone dinero o le sobra?",
        filas: [
          { label: "Total a pagar del proyecto", value: `− ${fmt(r.totalAPagar)}` },
          {
            label: "Crédito DXN (9 meses de pensión)",
            value: `+ ${fmt(r.creditoDxn.credito)}`,
          },
          {
            label: `Retroactivo de pensión (${r.financiamiento.meses} meses)`,
            value: `+ ${fmt(r.creditoDxn.retroactivo)}`,
          },
          {
            label: "= Efectivo neto a pagar",
            value: `− ${fmt(r.efectivo.efectivoNetoAPagar)}`,
          },
          {
            label: "Saldos disponibles hoy (Disponible AFORE + Infonavit)",
            value: `+ ${fmt(r.efectivo.saldosDisponibles)}`,
          },
          {
            label: "Retiro 2% recuperado con el retroactivo",
            value: `+ ${fmt(r.efectivo.retiro97Recuperado)}`,
          },
          {
            label:
              r.efectivo.resultado >= 0
                ? "RESULTADO: le sobra (efectivo al retiro)"
                : "RESULTADO: debe poner de su bolsa",
            value: fmt(Math.abs(r.efectivo.resultado)),
          },
        ],
      },
      {
        titulo: "Detalle técnico",
        soloAsesor: true,
        stats: [
          {
            label: "Valor pensión sin (vitalicio)",
            value: fmt(r.sinProyecto.valorPension),
          },
          {
            label: "Valor pensión con (vitalicio)",
            value: fmt(r.conProyecto.valorPension),
          },
          { label: "Efectivo neto", value: fmt(r.creditoDxn.efectivoNeto) },
          {
            label: "Disponible AFORE usado",
            value: fmt(
              overrides?.disponibleAfore ?? saldos.sar92 + saldos.rcv97 * 0.3,
            ),
          },
          {
            label: "Infonavit usado",
            value: fmt(overrides?.infonavit ?? saldos.infonavit),
          },
        ],
      },
    ],
    datosCliente: filasDatosCliente(semilla),
    advertencias: [
      ...(perfil.ley === "Ley97"
        ? [
            "El proyecto Mod40 retroactivo usa la fórmula de pensión Ley 73. El perfil de este cliente es Ley 97: usar solo como referencia.",
          ]
        : []),
      // Los avisos de la ventana viajan al escenario: quien lea el PDF tiene
      // que ver a qué fecha se calculó y si esa fecha todavía procede.
      ...r.avisos,
    ],
  })

  return (
    <PanelLayout
      referencia={<DatosCliente semilla={semilla} />}
      palancas={
        <>
          {perfil.ley === "Ley97" && (
            <p className="text-xs rounded-md bg-amber-50 text-amber-800 border border-amber-200 px-3 py-2">
              El proyecto Mod40 retroactivo usa la fórmula de pensión Ley 73. El
              perfil de este cliente es Ley 97: usar solo como referencia.
            </p>
          )}
          <FechaTramiteInput
            id="m40-fecha-tramite"
            value={fechaTramiteIso}
            min={minIso}
            onChange={setFechaTramiteIso}
            hint={`Es también la fecha de pensión: a esa fecha tendría ${r.edadProyecto.toFixed(1)} años. Todo el proyecto se calcula ahí — ventana, meses de retroactivo, UMA y semanas.`}
          />
          {fechaTramiteIso !== minIso && (
            <button
              type="button"
              onClick={() => setFechaTramiteIso(minIso)}
              className="-mt-1 w-fit text-xs font-semibold underline"
            >
              {minIso === hoyIso ? "Volver a hoy" : `Volver a la fecha más temprana (${minIso})`}
            </button>
          )}
          <SelectorEdad
            edades={edades}
            value={edadEnLista}
            onChange={(e) => setFechaTramiteIso(fechaDeEdad(e))}
            label="Edad a la que se pensiona"
          />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>UMAs del proyecto</Label>
              <span className="font-semibold tabular-nums">
                {umas} UMA ({fmt((UMA[ANIO] ?? 117.35) * umas)}/día)
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={25}
              step={1}
              value={umas}
              onChange={(e) => setUmas(Number(e.target.value))}
              className="w-full accent-ink"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>5</span>
              <span>25 (tope)</span>
            </div>
          </div>
          {semanasRecuperables(perfil) > 0 && (
            <Toggle
              label={`Recuperar ${semanasRecuperables(perfil)} semanas descontadas`}
              checked={recuperarDesc}
              onChange={setRecuperarDesc}
            />
          )}
          <AjusteSemanas
            id="semextra"
            value={semanasExtra}
            onChange={setSemanasExtra}
          />
          <Separator />
          <PanelDatosAUtilizar
            vehiculos={VEHICULOS_M40}
            estimados={{
              disponible_afore: saldos.sar92 + saldos.rcv97 * 0.3,
              infonavit: saldos.infonavit,
            }}
            valores={datos}
            onValor={setValor}
            onGuardar={
              onGuardar ? () => onGuardar(camposDe(VEHICULOS_M40)) : undefined
            }
            guardando={guardando}
            guardadoAt={guardadoAt}
          />
          <DescargarEscenario pdfCtx={pdfCtx} idSuffix="m40" buildPayload={buildPdf} />
        </>
      }
    >
      <AvisosMod40 ventana={r.ventana} avisos={r.avisos} />

      {/* Comparativo principal */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-5 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground uppercase">Sin proyecto</span>
            <span className="font-heading font-bold text-2xl tabular-nums">
              {fmt(r.sinProyecto.pensionMensual)} <span className="text-sm font-normal">/mes</span>
            </span>
            <Separator className="my-2" />
            <Stat label="Valor de la pensión (vitalicio)" value={fmt(r.sinProyecto.valorPension)} />
            <Stat label="Valor total (pensión + saldos)" value={fmt(r.sinProyecto.valorTotal)} />
          </CardContent>
        </Card>
        <Card className="border-0 bg-[var(--brand-primary)] text-white">
          <CardContent className="pt-5 flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-widest text-[var(--brand-accent)]">
              Con proyecto (×{r.multiplicadorPension.toFixed(1)})
            </span>
            <span className="font-heading font-bold text-2xl tabular-nums">
              {fmt(r.conProyecto.pensionMensual)} <span className="text-sm font-normal">/mes</span>
            </span>
            <Separator className="my-2 bg-white/15" />
            <div className="flex flex-col">
              <span className="text-xs text-slate-400">Valor de la pensión (vitalicio)</span>
              <span className="tabular-nums font-medium">{fmt(r.conProyecto.valorPension)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-xs text-slate-400">Valor total (pensión + saldos)</span>
              <span className="tabular-nums font-medium">
                {fmt(r.conProyecto.valorTotal)} (×{r.multiplicadorValor.toFixed(1)})
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Pago al IMSS ({r.pagoImss.meses} meses retroactivos)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat label="Cuotas retroactivas" value={fmt(r.pagoImss.cuotaBase)} />
          <Stat label="Actualizaciones (INPC)" value={fmt(r.pagoImss.actualizaciones)} />
          <Stat label="Recargos (1.47%/mes)" value={fmt(r.pagoImss.recargos)} />
          <Stat label="Total IMSS" value={fmt(r.pagoImss.total)} destacado />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Costos del proyecto</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <Stat label="Gestorías" value={fmt(r.costos.gestorias)} />
          <Stat label="Gastos administrativos" value={fmt(r.costos.gastosAdministrativos)} />
          <Stat label="Comisión de apertura (3%)" value={fmt(r.costos.comisionApertura)} />
          <Stat
            label={`Financiamiento (${r.financiamiento.meses}m @ ${(r.financiamiento.tasa * 100).toFixed(1)}%)`}
            value={fmt(r.financiamiento.interes)}
          />
          <Stat label="Total a pagar" value={fmt(r.totalAPagar)} destacado />
        </CardContent>
      </Card>

      {/* Sección propia: flujo de efectivo del proyecto */}
      <Card className="border-2 border-[var(--brand-primary)]/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Flujo de efectivo: ¿pone dinero o le sobra?
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col text-sm">
          <FilaFlujo label="Total a pagar del proyecto" valor={-r.totalAPagar} />
          <FilaFlujo
            label="Crédito DXN (9 meses de pensión)"
            valor={r.creditoDxn.credito}
          />
          <FilaFlujo
            label={`Retroactivo de pensión (${r.financiamiento.meses} meses)`}
            valor={r.creditoDxn.retroactivo}
          />
          <FilaFlujo
            label="= Efectivo neto a pagar"
            valor={-r.efectivo.efectivoNetoAPagar}
            subtotal
          />
          <FilaFlujo
            label="Saldos disponibles hoy (Disponible AFORE + Infonavit)"
            valor={r.efectivo.saldosDisponibles}
          />
          <FilaFlujo
            label="Retiro 2% recuperado con el retroactivo"
            valor={r.efectivo.retiro97Recuperado}
          />
          <div
            className={`flex justify-between items-baseline gap-2 mt-2 pt-3 border-t-2 ${
              r.efectivo.resultado >= 0 ? "border-[var(--brand-accent)]" : "border-red-300"
            }`}
          >
            <span className="font-semibold">
              {r.efectivo.resultado >= 0
                ? "Le sobra (efectivo al retiro)"
                : "Debe poner de su bolsa"}
            </span>
            <span
              className={`font-heading font-bold text-2xl tabular-nums ${
                r.efectivo.resultado >= 0 ? "text-green-700" : "text-red-700"
              }`}
            >
              {fmt(Math.abs(r.efectivo.resultado))}
            </span>
          </div>
        </CardContent>
      </Card>
    </PanelLayout>
  )
}

function FilaFlujo({
  label,
  valor,
  subtotal = false,
}: {
  label: string
  valor: number
  subtotal?: boolean
}) {
  return (
    <div
      className={`flex justify-between gap-2 py-1 ${
        subtotal ? "border-t font-semibold" : ""
      }`}
    >
      <span className={subtotal ? "" : "text-muted-foreground"}>{label}</span>
      <span
        className={`tabular-nums ${
          valor < 0 ? "text-red-600" : "text-green-700"
        } ${subtotal ? "font-semibold" : ""}`}
      >
        {valor < 0 ? "−" : "+"}
        {fmt(Math.abs(valor))}
      </span>
    </div>
  )
}

// ============================================================================
// Bloques de UI compartidos
// ============================================================================

function PanelLayout({
  palancas,
  referencia,
  children,
}: {
  palancas: React.ReactNode
  referencia?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 items-start">
      <div className="flex flex-col gap-3 lg:sticky lg:top-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Escenario</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">{palancas}</CardContent>
        </Card>
        {referencia}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  )
}

const fmtFechaCorta = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es-MX", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(iso))
    : "—"

/**
 * Datos del cliente como referencia para la asesoría (espejo de la hoja
 * "Resumen Asesor"). Plegado por default para no estorbar en la zona de trabajo.
 */
function DatosCliente({ semilla }: { semilla: SemillaV2 }) {
  const { perfil, saldos } = semilla
  const edadActual = edadActualDe(perfil.fecha_nacimiento)
  const Fila = ({ k, v, alerta = false }: { k: string; v: string; alerta?: boolean }) => (
    <div className="flex justify-between gap-2 py-0.5">
      <span className="text-muted-foreground">{k}</span>
      <span className={`text-right tabular-nums ${alerta ? "font-semibold text-amber-600" : "font-medium"}`}>
        {v}
      </span>
    </div>
  )
  return (
    <Card>
      <CardContent className="pt-4">
        <details>
          <summary className="text-sm font-semibold cursor-pointer select-none">
            Datos del cliente (referencia)
          </summary>
          <div className="flex flex-col gap-3 mt-3 text-xs">
            <div>
              <p className="font-semibold text-muted-foreground uppercase mb-1">Perfil</p>
              <Fila k="Edad actual" v={`${edadActual.toFixed(1)} años`} />
              <Fila k="Ley aplicable" v={perfil.ley === "Ley73" ? "Ley 73" : "Ley 97"} />
              <Fila k="Sexo" v={perfil.sexo === "H" ? "Hombre" : "Mujer"} />
              <Fila
                k="Status laboral"
                v={perfil.status_empleo === "empleado" ? "Cotizando" : "Sin cotizar"}
              />
              <Fila k="Gap sin cotizar" v={`${perfil.gap_meses.toFixed(1)} meses`} />
            </div>
            <div>
              <p className="font-semibold text-muted-foreground uppercase mb-1">Semanas</p>
              <Fila k="Cotizadas" v={perfil.semanas.cotizadas.toLocaleString("es-MX")} />
              <Fila k="Descontadas" v={perfil.semanas.descontadas.toLocaleString("es-MX")} />
              <Fila k="Recuperadas" v={perfil.semanas.recuperadas.toLocaleString("es-MX")} />
              <Fila k="Netas para cálculo" v={perfil.semanas.netas.toLocaleString("es-MX")} />
            </div>
            <div>
              <p className="font-semibold text-muted-foreground uppercase mb-1">
                Derechos y Mod40
              </p>
              <Fila
                k="Conserva derechos"
                v={perfil.conserva_derechos ? "Sí" : "No"}
                alerta={!perfil.conserva_derechos}
              />
              <Fila
                k="Vigentes hasta"
                v={fmtFechaCorta(perfil.fechas.fin_conservacion_derechos)}
              />
              <Fila k="Aplica Mod40" v={perfil.aplica_mod40 ? "Sí" : "No"} />
              <Fila
                k="Límite inscripción M40"
                v={fmtFechaCorta(perfil.fechas.limite_inscripcion_mod40)}
              />
              <Fila
                k="Última cotización"
                v={fmtFechaCorta(perfil.fechas.ultima_cotizacion_valida)}
              />
              <Fila
                k="Primera cotización"
                v={fmtFechaCorta(perfil.fechas.primera_cotizacion)}
              />
            </div>
            <div>
              <p className="font-semibold text-muted-foreground uppercase mb-1">Salarios</p>
              <Fila k="Último salario diario" v={fmt(perfil.salario_diario_registrado)} />
              <Fila k="Promedio 250 semanas" v={fmt(perfil.salario_promedio_250)} />
              <Fila
                k="Ratio salario/UMA"
                v={perfil.ratio_historico_salario_uma.toFixed(2)}
              />
            </div>
            <div>
              <p className="font-semibold text-muted-foreground uppercase mb-1">
                Saldos estimados
              </p>
              <Fila
                k="Disponible AFORE (SAR92 + 30% RCV)"
                v={fmt(saldos.sar92 + saldos.rcv97 * 0.3)}
              />
              <Fila k="AFORE total (RCV97, Ley 97)" v={fmt(saldos.rcv97)} />
              <Fila k="Infonavit" v={fmt(saldos.infonavit)} />
              <Fila
                k="Crédito Infonavit vigente"
                v={saldos.credito_infonavit_vigente ? "Sí" : "No"}
                alerta={saldos.credito_infonavit_vigente}
              />
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  )
}

// Paleta default: navy #0f172a + lima verde #a3e635 (Trol). Cuando el aliado
// dueño de la consulta tiene branding propio, --brand-primary/--brand-accent
// vienen sobreescritas en el contenedor raíz vía CSS variables.

function HeroPension({
  pension,
  negativa,
  referencia,
  delta,
  etiquetaDelta,
  stats,
  advertencia,
}: {
  pension: number | null
  negativa: boolean | undefined
  referencia: number | null
  delta: number | null
  etiquetaDelta: string
  stats: Array<{ label: string; value: string }>
  advertencia: string | null
}) {
  return (
    <Card className="border-0 bg-[var(--brand-primary)] text-white overflow-hidden">
      <CardContent className="pt-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-xs font-semibold uppercase tracking-widest text-[var(--brand-accent)]">
              Pensión mensual estimada
            </span>
            {negativa ? (
              <span className="font-heading font-bold text-3xl text-amber-400">
                Negativa de pensión
              </span>
            ) : (
              <span className="font-heading font-bold text-4xl tabular-nums">
                {fmt(pension)}
              </span>
            )}
          </div>
          {referencia !== null && !negativa && (
            <div className="flex flex-col items-end">
              <span className="text-xs text-slate-300">
                {etiquetaDelta}: {fmt(referencia)}
              </span>
              {delta !== null && (
                <span
                  className={`font-semibold tabular-nums ${delta >= 0 ? "text-[var(--brand-accent)]" : "text-red-300"}`}
                >
                  {delta >= 0 ? "+" : ""}
                  {fmt(delta)} /mes
                </span>
              )}
            </div>
          )}
        </div>
        <Separator className="bg-white/15" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col">
              <span className="text-xs text-slate-400">{s.label}</span>
              <span className="tabular-nums font-medium text-white">{s.value}</span>
            </div>
          ))}
        </div>
        {advertencia && (
          <p className="text-xs rounded-md bg-amber-400/10 text-amber-200 border border-amber-300/30 px-3 py-2">
            {advertencia}
          </p>
        )}
      </CardContent>
    </Card>
  )
}


function TablaBarrido({
  titulo,
  columnas,
  filas,
  resaltada,
}: {
  titulo: string
  columnas: string[]
  filas: string[][]
  resaltada: number
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b">
              {columnas.map((c) => (
                <th key={c} className="py-1.5 pr-3 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, i) => (
              <tr
                key={fila[0]}
                className={`border-b last:border-0 tabular-nums ${
                  i === resaltada ? "bg-[var(--brand-accent)]/25 font-semibold" : ""
                }`}
              >
                {fila.map((celda, j) => (
                  <td key={j} className="py-1.5 pr-3">
                    {celda}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

function SelectorEdad({
  edades,
  value,
  onChange,
  label = "Edad de retiro",
}: {
  edades: number[]
  value: number
  onChange: (v: number) => void
  label?: string
}) {
  const idx = Math.max(0, edades.indexOf(value))
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="font-semibold tabular-nums">{value} años</span>
      </div>
      <input
        type="range"
        min={0}
        max={edades.length - 1}
        step={1}
        value={idx}
        onChange={(e) => onChange(edades[Number(e.target.value)])}
        className="w-full accent-ink"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{edades[0]}</span>
        <span>{edades[edades.length - 1]}</span>
      </div>
    </div>
  )
}

function SelectorPct({
  value,
  onChange,
}: {
  value: Palancas["pctTiempoCotizando"]
  onChange: (v: Palancas["pctTiempoCotizando"]) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>¿Qué % del tiempo va a cotizar?</Label>
      <div className="grid grid-cols-5 gap-1">
        {PCTS.map((p) => (
          <Button
            key={p}
            type="button"
            size="sm"
            variant={value === p ? "default" : "outline"}
            className="!px-0"
            onClick={() => onChange(p)}
          >
            {p * 100}%
          </Button>
        ))}
      </div>
    </div>
  )
}

function SliderSalario({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <span className="font-semibold tabular-nums">{fmt(value)}</span>
      </div>
      <input
        type="range"
        min={SAL_MIN}
        max={SAL_TOPE}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-ink"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <button type="button" className="hover:underline" onClick={() => onChange(SAL_MIN)}>
          Mínimo ({fmt(SAL_MIN)})
        </button>
        <button type="button" className="hover:underline" onClick={() => onChange(SAL_TOPE)}>
          Tope 25 UMA ({fmt(SAL_TOPE)})
        </button>
      </div>
    </div>
  )
}

/** Un renglón de PDF por vehículo, sólo si el asesor lo capturó. */
function filasPdfVehiculo(
  etiqueta: string,
  saldo: number | undefined,
  mensual: number | undefined,
  dentro: boolean | undefined,
): PdfFila[] {
  if (saldo === undefined && !mensual) return []
  const partes = [
    saldo !== undefined ? fmt(saldo) : null,
    mensual ? `${fmt(mensual)}/mes` : null,
    (dentro ?? true) ? null : "no incluido",
  ].filter(Boolean)
  return [{ label: etiqueta, value: partes.join(" · ") }]
}

/**
 * De dónde sale cada peso de la pensión.
 *
 * La sustituye a dos tarjetas que se leían por separado —una de saldos y otra
 * de pensiones— y entre las dos no se podía contestar la pregunta que siempre
 * hace el cliente: "¿y esto de dónde sale?". Aquí cada renglón es una bolsa de
 * dinero, con lo que tendrá al retiro y lo que pone al mes, y los renglones
 * suman el total que se ve arriba.
 */
function TablaFuentes({
  r,
  enPMG,
  pmg,
}: {
  r: ReturnType<typeof computeLey97>
  enPMG: boolean
  pmg: number
}) {
  const filas = filasFuentes(r, fmt)
  if (filas.length === 0) return null
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">De dónde sale su pensión</CardTitle>
      </CardHeader>
      <CardContent className="pt-1">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left font-normal pb-1">Concepto</th>
                <th className="text-right font-normal pb-1 w-32">Saldo al retiro</th>
                <th className="text-right font-normal pb-1 w-28">Al mes</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) =>
                f.tono === "grupo" ? (
                  <tr key={`g${i}`}>
                    <td
                      colSpan={3}
                      className="pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {f.label}
                    </td>
                  </tr>
                ) : (
                  <tr
                    key={`f${i}`}
                    className={`border-t ${f.tono === "suma" ? "border-foreground/25" : "border-border/50"} ${
                      f.tono === "apagada" ? "opacity-45" : ""
                    }`}
                  >
                    <td className="py-1.5 pr-3">
                      <span className={f.tono === "suma" ? "font-semibold" : ""}>
                        {f.label}
                      </span>
                      {f.sub && (
                        <span className="block text-xs text-muted-foreground">{f.sub}</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{f.value}</td>
                    <td
                      className={`py-1.5 text-right tabular-nums ${
                        f.tono === "suma" ? "font-bold" : ""
                      }`}
                    >
                      {f.value2}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {enPMG && (
            <>
              El piso de la mínima garantizada es {fmt(pmg)} al mes.{" "}
            </>
          )}
          {NOTA_FACTOR}
        </p>
      </CardContent>
    </Card>
  )
}

function Stat({
  label,
  value,
  destacado = false,
}: {
  label: string
  value: string
  destacado?: boolean
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${destacado ? "font-bold text-green-700" : "font-medium"}`}>
        {value}
      </span>
    </div>
  )
}

function AjusteSemanas({
  id,
  value,
  onChange,
}: {
  id: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Ajuste de semanas (+ / −)</Label>
      <Input
        id={id}
        type="number"
        step={1}
        value={value}
        onChange={(e) => {
          const n = Math.trunc(Number(e.target.value))
          onChange(Number.isFinite(n) ? n : 0)
        }}
      />
      <p className="text-xs text-muted-foreground leading-snug">
        Positivas: semanas por recuperar o reconocer. Negativas: riesgo de que
        el IMSS no reconozca algún periodo.
      </p>
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-[var(--brand-primary)]" : "bg-secondary"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
            checked ? "translate-x-[18px]" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  )
}

/** Filas de "Datos del cliente" para el PDF (espejo de la tarjeta de referencia). */
function filasDatosCliente(semilla: SemillaV2): PdfFila[] {
  const { perfil, saldos } = semilla
  const edadActual = edadActualDe(perfil.fecha_nacimiento)
  return [
    { label: "Edad actual", value: `${edadActual.toFixed(1)} años` },
    { label: "Ley aplicable", value: perfil.ley === "Ley73" ? "Ley 73" : "Ley 97" },
    {
      label: "Status laboral",
      value: perfil.status_empleo === "empleado" ? "Cotizando" : "Sin cotizar",
    },
    {
      label: "Semanas cotizadas",
      value: perfil.semanas.cotizadas.toLocaleString("es-MX"),
    },
    {
      label: "Semanas descontadas",
      value: perfil.semanas.descontadas.toLocaleString("es-MX"),
    },
    {
      label: "Semanas netas",
      value: perfil.semanas.netas.toLocaleString("es-MX"),
    },
    { label: "Conserva derechos", value: perfil.conserva_derechos ? "Sí" : "No" },
    {
      label: "Última cotización",
      value: fmtFechaCorta(perfil.fechas.ultima_cotizacion_valida),
    },
    { label: "Último salario diario", value: fmt(perfil.salario_diario_registrado) },
    {
      label: "Disponible AFORE (est.)",
      value: fmt(saldos.sar92 + saldos.rcv97 * 0.3),
    },
    { label: "AFORE total (RCV97)", value: fmt(saldos.rcv97) },
    { label: "Infonavit (est.)", value: fmt(saldos.infonavit) },
  ]
}

/** Input de nombre + botones "PDF cliente"/"PDF asesor" al pie de las palancas. */
function DescargarEscenario({
  pdfCtx,
  idSuffix,
  buildPayload,
}: {
  pdfCtx: PdfCtx
  idSuffix: string
  buildPayload: () => PdfEscenarioData
}) {
  const [nombre, setNombre] = useState("")
  const [generando, setGenerando] = useState<PdfModo | null>(null)
  const nombreEfectivo = nombre.trim() || `Escenario ${pdfCtx.numero}`

  async function descargar(modo: PdfModo) {
    setGenerando(modo)
    try {
      // Import dinámico: react-pdf solo se carga cuando se usa
      const { descargarPdfEscenario } = await import("@/lib/pdf/escenario-pdf")
      await descargarPdfEscenario({
        ...buildPayload(),
        modo,
        curp: pdfCtx.curp,
        nombreEscenario: nombreEfectivo,
        fileName: `${pdfCtx.curp}_${slugEscenario(nombreEfectivo)}${modo === "asesor" ? "_asesor" : ""}.pdf`,
        branding: {
          colorPrimario: pdfCtx.branding.colorPrimario,
          colorAcento: pdfCtx.branding.colorAcento,
          logoUrl: pdfCtx.branding.logoUrl,
        },
      })
      pdfCtx.onDescargado()
      setNombre("")
      toast.success("PDF del escenario descargado")
    } catch (e) {
      console.error(e)
      toast.error("No se pudo generar el PDF del escenario")
    } finally {
      setGenerando(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Separator />
      <Label htmlFor={`pdf-nombre-${idSuffix}`}>Descargar escenario en PDF</Label>
      <Input
        id={`pdf-nombre-${idSuffix}`}
        placeholder={`Escenario ${pdfCtx.numero}`}
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-1">
        <Button
          type="button"
          size="sm"
          disabled={generando !== null}
          onClick={() => descargar("cliente")}
        >
          {generando === "cliente" ? "Generando…" : "PDF cliente"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={generando !== null}
          onClick={() => descargar("asesor")}
        >
          {generando === "asesor" ? "Generando…" : "PDF asesor"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground break-all">
        {pdfCtx.curp}_{slugEscenario(nombreEfectivo)}.pdf
      </p>
    </div>
  )
}

