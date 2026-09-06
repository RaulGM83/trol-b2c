// ============================================================================
// Vista compartida del resumen del cliente (perfil IMSS, semanas, salarios,
// fondos, escenarios, Modalidad 40, sub-oportunidades e historia laboral).
//
// La usa el tab "Resumen" del detalle de consulta y el tab "Resumen" de la
// calculadora (consultas y clientes). Es deliberadamente defensiva: los
// resúmenes viejos traen menos campos y `calculo_pensional` llega sin tipar.
// ============================================================================

import { ChevronLeft, Sparkles } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export type EscenarioPension = {
  edad?: number | null
  monto?: number | string | null
  semanas?: number | null
  salario_usado?: number | string | null
  etiqueta?: string | null
}

export type ModalidadRetroactiva = {
  aplica?: boolean | null
  pension_estimada?: number | string | null
  costo_retroactivo?: number | string | null
  actualizaciones_recargos?: number | string | null
  fecha?: string | null
}

export type ResumenClienteData = {
  perfil_imss?: {
    edad?: number | null
    ley_aplicable?: string | null
    situacion_laboral?: string | null
    primera_cotizacion?: string | null
    conserva_derechos?: boolean | null
    vencimiento_derechos?: string | null
    fecha_sisec?: string | null
    nss?: string | null
  } | null
  semanas?: {
    cotizadas?: number | null
    descontadas?: number | null
    recuperadas?: number | null
    netas?: number | null
  } | null
  salarios?: {
    ultimo?: number | null
    promedio_250?: number | null
  } | null
  fondos_retiro?: {
    rcv97?: number | null
    sar92?: number | null
    infonavit?: number | null
    total_al_retiro_ley73?: number | null
  } | null
  afore_actual?: {
    nombre?: string | null
    regimen?: string | null
    fecha_alta?: string | null
  } | null
  escenarios_pension?: {
    base?: EscenarioPension | null
    maximo?: EscenarioPension | null
  } | null
  modalidad_40?: {
    aplica?: boolean | null
    fecha_limite_inscripcion?: string | null
    horizonte?: string | null
    vencimiento_mod40?: string | null
    retroactiva_hoy?: ModalidadRetroactiva | null
    retroactiva_futuro?: ModalidadRetroactiva | null
  } | null
  sub_oportunidades?: {
    mod40_retroactiva_hoy?: boolean | null
    mod40_retroactiva_futura?: boolean | null
    credito_pension_con_capacidad?: boolean | null
    credito_pension_potencial?: boolean | null
    infonavit_rescate?: boolean | null
    infonavit_mejoravit_activo?: boolean | null
    infonavit_mejoravit_inactivo?: boolean | null
    afore?: boolean | null
    gestoria_pension_directa?: boolean | null
    seguros_inversiones?: boolean | null
    asesoria?: boolean | null
  } | null
  oportunidad_principal?: string | null
  historia_laboral?: Array<{
    desde?: string | null
    hasta?: string | null
    empleador?: string | null
  }> | null
  narrativa_cliente?: string | null
}

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

const mxnFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})

function formatMXN(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? toNum(n) : n
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  return mxnFormatter.format(v)
}

/** Montos que pueden venir como texto libre ("N/A", "Pendiente") o número. */
function formatMonto(v: number | string | null | undefined): string {
  if (typeof v === "string" && toNum(v) === null) return v.trim() || "—"
  return formatMXN(v)
}

function capitalize(s: string | null | undefined): string {
  if (!s) return "—"
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function hasAny(obj: unknown): boolean {
  if (!isPlainObject(obj)) return false
  return Object.values(obj).some((v) => v !== null && v !== undefined)
}

// ---------------------------------------------------------------------------
// Parsers tolerantes: el jsonb llega con números como texto ("105,303", "N/A").
// ---------------------------------------------------------------------------

function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v !== "string") return null
  const s = v.replace(/[$,\s]/g, "")
  if (!s || /^n\/?a$/i.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function toStr(v: unknown): string | null {
  const s =
    typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : null
  if (!s || /^n\/?a$/i.test(s)) return null
  return s
}

function toBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v
  const s = toStr(v)?.toLowerCase()
  if (!s) return null
  if (["sí", "si", "true", "1", "yes"].includes(s)) return true
  if (["no", "false", "0"].includes(s)) return false
  return null
}

function obj(v: unknown): Record<string, unknown> {
  return isPlainObject(v) ? v : {}
}

/** Suma ignorando nulos; devuelve null si no hay ningún sumando. */
function sumOrNull(...vals: Array<number | null>): number | null {
  const nums = vals.filter((v): v is number => v !== null)
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) : null
}

// ---------------------------------------------------------------------------
// Fallback: arma un resumen a partir de la semilla `calculo_pensional`.
// Sirve para clientes/consultas sin `resultado_resumen` y para rellenar huecos.
// ---------------------------------------------------------------------------

export function resumenDesdeCalculoPensional(
  raw: unknown
): ResumenClienteData | null {
  if (!isPlainObject(raw)) return null

  const diag = obj(raw.diagnostico)
  const perfil = obj(raw.perfil)
  const saldos = obj(raw.saldos)
  const meta = obj(raw.meta)
  const escenarios = obj(raw.escenarios)
  const semanasPerfil = obj(perfil.semanas)
  const fechasPerfil = obj(perfil.fechas)

  if (
    !hasAny(diag) &&
    !hasAny(perfil) &&
    !hasAny(saldos) &&
    !hasAny(escenarios)
  ) {
    return null
  }

  const ley = toStr(diag.ley) ?? toStr(perfil.ley) ?? toStr(meta.ley)

  const rcv97 = toNum(diag.rcv_97) ?? toNum(saldos.rcv97)
  const sar92 = toNum(diag.sar_92) ?? toNum(saldos.sar92)
  const infonavit = toNum(diag.infonavit_estimado) ?? toNum(saldos.infonavit)

  const estrategicos = Array.isArray(escenarios.estrategicos)
    ? escenarios.estrategicos.map(obj)
    : []
  const findEscenario = (needle: string) =>
    estrategicos.find((e) =>
      (toStr(e.escenario) ?? "").toLowerCase().includes(needle)
    )

  const escBase = findEscenario("base")
  const escMax = findEscenario("máximo") ?? findEscenario("maximo")

  const escenario = (
    e: Record<string, unknown> | undefined,
    montoFallback: unknown,
    edadFallback: unknown
  ): EscenarioPension | null => {
    const monto = toNum(e?.calculatedPension) ?? toNum(montoFallback)
    const edad = toNum(e?.retirementAge) ?? toNum(edadFallback)
    if (monto === null && edad === null) return null
    return {
      monto,
      edad,
      semanas: e ? toNum(e.contributedWeeks) : null,
      salario_usado: e ? toStr(e.salaryTypeUsed) : null,
    }
  }

  const base = escenario(escBase, diag.escenario_base, diag.edad_escenario_base)
  const maximo = escenario(
    escMax,
    diag.escenario_maximo,
    diag.edad_escenario_maximo
  )

  const retro = (
    e: unknown,
    pensionFallback: unknown,
    costoFallback: unknown,
    fechaFallback: unknown
  ): ModalidadRetroactiva | null => {
    const r = obj(e)
    const aplica = toBool(r.aplica)
    const pension = toNum(r.calculatedPension) ?? toNum(pensionFallback)
    const costo =
      toNum(r.costo_proyecto_retroactivo) ??
      toNum(r.desglose_retro_total) ??
      toNum(costoFallback)
    const recargos = sumOrNull(
      toNum(r.desglose_retro_actualizacion),
      toNum(r.desglose_retro_recargos)
    )
    const fecha = toStr(fechaFallback) ?? toStr(r.fecha_pension_objetivo)
    if (
      aplica === null &&
      pension === null &&
      costo === null &&
      recargos === null &&
      !fecha
    ) {
      return null
    }
    return {
      aplica,
      pension_estimada: pension,
      costo_retroactivo: costo,
      actualizaciones_recargos: recargos,
      fecha,
    }
  }

  const retroHoy = retro(
    escenarios.mod40_retro_hoy,
    diag.pension_mod40_retro_hoy,
    diag.costo_retroactivo_hoy,
    "Hoy"
  )
  const retroFuturo = retro(
    escenarios.mod40_retro_futuro,
    diag.pension_mod40_futuro,
    diag.costo_retroactivo_futuro,
    diag.mod40_futuro_fecha
  )

  const oportunidadInfonavit = toStr(diag.oportunidad_infonavit)
  // El motor legacy escribe "SOLUCIÓN HOGAR"; el producto se llama Rescate
  // Infonavit desde el 6-sep-2026. Se traduce al mostrarlo en vez de tocar el
  // dato, que sigue llegando así desde semillas ya generadas.
  const nombreProducto = (s: string | null) =>
    s == null ? null : s.replace(/soluci[oó]n\s+hogar/gi, "Rescate Infonavit")
  const oportunidadNorm = (oportunidadInfonavit ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
  const sinOportunidad =
    !oportunidadNorm || oportunidadNorm.includes("SIN OPORTUNIDAD")

  const mod40Hoy =
    toBool(obj(escenarios.mod40_retro_hoy).aplica) ??
    toBool(diag.mod40_retroactiva_hoy)
  const mod40Futuro = toBool(obj(escenarios.mod40_retro_futuro).aplica)

  const historial = Array.isArray(raw.historial) ? raw.historial.map(obj) : []
  const historia = historial.length
    ? historial.map((h) => ({
        desde: toStr(h.fecha_inicio),
        hasta: toStr(h.fecha_fin),
        empleador: toStr(h.empleador),
      }))
    : parseHistoriaLaboralLista(diag.historia_laboral_lista)

  return {
    perfil_imss: {
      // Edad SIEMPRE a hoy y con un decimal. `edad_al_momento_del_reporte` es
      // la del día en que se generó el cálculo y envejece mal: un reporte de
      // hace ocho meses mostraba al cliente más joven de lo que es. Sólo se usa
      // como respaldo cuando no hay fecha de nacimiento.
      edad: (() => {
        const fn = toStr(perfil.fecha_nacimiento)
        if (!fn) return toNum(diag.edad_al_momento_del_reporte)
        const anios = (Date.now() - new Date(fn).getTime()) / 86_400_000 / 365.25
        return Number.isFinite(anios) ? Math.trunc(anios * 10) / 10 : toNum(diag.edad_al_momento_del_reporte)
      })(),
      ley_aplicable: ley,
      situacion_laboral:
        toStr(diag.status_empleo) ?? toStr(perfil.status_empleo),
      primera_cotizacion:
        toStr(diag.primera_cotizacion) ?? toStr(fechasPerfil.primera_cotizacion),
      conserva_derechos:
        toBool(diag.conserva_derechos_ley_73) ?? toBool(perfil.conserva_derechos),
      vencimiento_derechos:
        toStr(diag.fecha_perdida_cons_der) ??
        toStr(fechasPerfil.fin_conservacion_derechos),
      fecha_sisec: toStr(diag.fecha_sisec) ?? toStr(meta.fecha_sisec),
      nss: toStr(diag.nss) ?? toStr(perfil.nss),
    },
    semanas: {
      cotizadas:
        toNum(semanasPerfil.cotizadas) ?? toNum(diag.semanas_cotizadas),
      descontadas:
        toNum(semanasPerfil.descontadas) ?? toNum(diag.semanas_descontadas),
      recuperadas:
        toNum(semanasPerfil.recuperadas) ?? toNum(diag.semanas_recuperadas),
      netas: toNum(semanasPerfil.netas),
    },
    salarios: {
      ultimo:
        toNum(diag.ultimo_salario) ?? toNum(perfil.salario_diario_registrado),
      promedio_250: toNum(perfil.salario_promedio_250),
    },
    // `total_al_retiro_ley73` NO es la suma de los tres saldos (el resumen lo
    // calcula con proyección propia), así que aquí se deja sin valor en vez de
    // inventar uno.
    fondos_retiro: { rcv97, sar92, infonavit, total_al_retiro_ley73: null },
    escenarios_pension: base || maximo ? { base, maximo } : null,
    modalidad_40: {
      aplica: toBool(diag.mod40) ?? toBool(perfil.aplica_mod40),
      fecha_limite_inscripcion: toStr(fechasPerfil.limite_inscripcion_mod40),
      vencimiento_mod40: toStr(diag.vencimiento_mod40),
      retroactiva_hoy: retroHoy,
      retroactiva_futuro: retroFuturo,
    },
    sub_oportunidades: {
      mod40_retroactiva_hoy: mod40Hoy,
      mod40_retroactiva_futura: mod40Futuro,
      // El producto se llama Rescate Infonavit. "SOLUCION HOGAR" es como lo
      // nombraba el motor legacy y sigue llegando así en semillas viejas, así
      // que la detección conserva el término aunque la etiqueta ya no.
      infonavit_rescate: sinOportunidad
        ? false
        : oportunidadNorm.includes("SOLUCION HOGAR") ||
          oportunidadNorm.includes("RESCATE INFONAVIT"),
      infonavit_mejoravit_activo: sinOportunidad
        ? false
        : oportunidadNorm.includes("MEJORAVIT ACTIVO"),
      infonavit_mejoravit_inactivo: sinOportunidad
        ? false
        : oportunidadNorm.includes("MEJORAVIT INACTIVO"),
    },
    oportunidad_principal: sinOportunidad ? null : nombreProducto(oportunidadInfonavit),
    historia_laboral: historia,
    narrativa_cliente: toStr(diag.asesoria_basica),
  }
}

/** "2025-07-05 - VIGENTE | EMPLEADOR" (una línea por empleo). */
function parseHistoriaLaboralLista(
  raw: unknown
): ResumenClienteData["historia_laboral"] {
  const texto = toStr(raw)
  if (!texto) return []
  return texto
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [fechas, ...resto] = line.split("|")
      const [desde, hasta] = (fechas ?? "").split(" - ")
      const hastaLimpio = (hasta ?? "").trim()
      return {
        desde: toStr(desde),
        hasta: /^vigente$/i.test(hastaLimpio) ? null : toStr(hastaLimpio),
        empleador: toStr(resto.join("|")),
      }
    })
}

// ---------------------------------------------------------------------------
// Merge: el resumen manda; la semilla sólo rellena huecos.
// ---------------------------------------------------------------------------

function deepFill(base: unknown, fallback: unknown): unknown {
  if (base === null || base === undefined) return fallback ?? null
  if (isPlainObject(base) && isPlainObject(fallback)) {
    const out: Record<string, unknown> = { ...base }
    for (const key of Object.keys(fallback)) {
      out[key] = deepFill(base[key], fallback[key])
    }
    return out
  }
  if (Array.isArray(base) && base.length === 0 && Array.isArray(fallback)) {
    return fallback
  }
  return base
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function ResumenCliente({
  resumen,
  calculoPensional,
  className = "flex flex-col gap-4 w-full",
}: {
  resumen?: ResumenClienteData | null
  /** Semilla `calculo_pensional` usada como respaldo de los campos faltantes. */
  calculoPensional?: unknown
  className?: string
}) {
  const fallback = calculoPensional
    ? resumenDesdeCalculoPensional(calculoPensional)
    : null

  const data = (
    fallback ? deepFill(resumen ?? {}, fallback) : (resumen ?? null)
  ) as ResumenClienteData | null

  if (!data || !hasAny(data)) {
    return (
      <Card className={className}>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Todavía no hay un resumen del cliente para esta consulta.
        </CardContent>
      </Card>
    )
  }

  const perfil = data.perfil_imss
  const semanas = data.semanas
  const salarios = data.salarios
  const fondos = data.fondos_retiro
  const escenarios = data.escenarios_pension
  const mod40 = data.modalidad_40
  const subs = data.sub_oportunidades
  const afore = data.afore_actual
  const historia = (data.historia_laboral ?? []).filter(Boolean)

  return (
    <div className={className}>
      {data.oportunidad_principal && (
        <Card className="border-green-500/60 bg-green-50/40 dark:bg-green-500/5">
          <CardContent className="flex flex-col gap-2 py-6">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-green-700 dark:text-green-400">
              <Sparkles className="size-4" />
              Oportunidad principal detectada
            </div>
            <h2 className="font-heading font-bold text-2xl leading-tight">
              {data.oportunidad_principal}
            </h2>
            <p className="text-sm text-muted-foreground">
              Conversa con tu cliente sobre esta vía como primer paso.
            </p>
          </CardContent>
        </Card>
      )}

      {hasAny(perfil) && (
        <Card>
          <CardHeader>
            <CardTitle>Perfil</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {perfil?.edad !== null && perfil?.edad !== undefined && (
                <Stat label="Edad" value={`${perfil.edad} años`} />
              )}
              {perfil?.ley_aplicable && (
                <Stat label="Ley IMSS" value={perfil.ley_aplicable} />
              )}
              {perfil?.situacion_laboral && (
                <Stat
                  label="Situación"
                  value={capitalize(perfil.situacion_laboral)}
                />
              )}
              {perfil?.conserva_derechos !== null &&
                perfil?.conserva_derechos !== undefined && (
                  <Stat
                    label="Conserva derechos"
                    value={
                      <span
                        className={
                          perfil.conserva_derechos
                            ? "text-green-600 dark:text-green-400"
                            : "text-red-600 dark:text-red-400"
                        }
                      >
                        {perfil.conserva_derechos ? "Sí ✓" : "No ✗"}
                        {!perfil.conserva_derechos &&
                          perfil.vencimiento_derechos && (
                            <span className="block text-xs text-muted-foreground font-normal mt-0.5">
                              venció {perfil.vencimiento_derechos}
                            </span>
                          )}
                      </span>
                    }
                  />
                )}
            </div>
            {perfil?.primera_cotizacion && (
              <p className="text-xs text-muted-foreground">
                Primera cotización: {perfil.primera_cotizacion}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {afore?.nombre && (
        <Card>
          <CardHeader>
            <CardTitle>AFORE identificada</CardTitle>
          </CardHeader>
          <CardContent>
            {!afore.regimen && !afore.fecha_alta ? (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  Administradora
                </span>
                <span className="text-lg font-semibold">{afore.nombre}</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">
                    Administradora
                  </span>
                  <span className="text-lg font-semibold">{afore.nombre}</span>
                </div>
                {afore.regimen && <Stat label="Régimen" value={afore.regimen} />}
                {afore.fecha_alta && (
                  <Stat label="Fecha de alta" value={afore.fecha_alta} />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(hasAny(semanas) || hasAny(salarios)) && (
        <Card>
          <CardHeader>
            <CardTitle>Semanas y salarios</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {hasAny(semanas) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <Stat label="Cotizadas" value={semanas?.cotizadas ?? "—"} />
                <Stat label="Descontadas" value={semanas?.descontadas ?? "—"} />
                <Stat label="Recuperadas" value={semanas?.recuperadas ?? "—"} />
                <Stat
                  label="Netas"
                  value={
                    <span className="text-green-700 dark:text-green-400 font-bold">
                      {semanas?.netas ?? "—"}
                    </span>
                  }
                  highlight
                />
              </div>
            )}
            {hasAny(salarios) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
                {salarios?.ultimo !== null && salarios?.ultimo !== undefined && (
                  <Stat
                    label="Último salario"
                    value={formatMXN(salarios.ultimo)}
                  />
                )}
                {salarios?.promedio_250 !== null &&
                  salarios?.promedio_250 !== undefined && (
                    <Stat
                      label="Salario promedio 250 semanas"
                      value={formatMXN(salarios.promedio_250)}
                    />
                  )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {hasAny(fondos) && (
        <Card>
          <CardHeader>
            <CardTitle>Saldos y fondos de retiro</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {fondos?.rcv97 !== null && fondos?.rcv97 !== undefined && (
                <Stat label="RCV 97" value={formatMXN(fondos.rcv97)} />
              )}
              {fondos?.sar92 !== null && fondos?.sar92 !== undefined && (
                <Stat label="SAR 92" value={formatMXN(fondos.sar92)} />
              )}
              {fondos?.infonavit !== null && fondos?.infonavit !== undefined && (
                <Stat label="Infonavit" value={formatMXN(fondos.infonavit)} />
              )}
            </div>
            {perfil?.ley_aplicable === "Ley73" &&
              fondos?.total_al_retiro_ley73 !== null &&
              fondos?.total_al_retiro_ley73 !== undefined && (
                <div className="flex flex-col gap-1 rounded-xl bg-green-50 dark:bg-green-500/10 px-4 py-3 border border-green-500/30">
                  <span className="text-xs text-green-700 dark:text-green-400 uppercase tracking-wide font-medium">
                    Total al retiro Ley 73
                  </span>
                  <span className="text-2xl font-bold text-green-700 dark:text-green-400">
                    {formatMXN(fondos.total_al_retiro_ley73)}
                  </span>
                </div>
              )}
          </CardContent>
        </Card>
      )}

      {escenarios && (escenarios.base || escenarios.maximo) && (
        <Card>
          <CardHeader>
            <CardTitle>Escenarios de pensión</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {escenarios.base && (
                <EscenarioCard
                  title="Escenario base"
                  subtitle="Si sigues como vas"
                  escenario={escenarios.base}
                />
              )}
              {escenarios.maximo && (
                <EscenarioCard
                  title="Escenario máximo"
                  subtitle="Con estrategia Trol"
                  escenario={escenarios.maximo}
                  highlight
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {hasAny(mod40) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle>Modalidad 40</CardTitle>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                  mod40?.aplica === true
                    ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                Aplica MOD40: {mod40?.aplica === true ? "SÍ" : "NO"}
              </span>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {mod40?.aplica === true &&
              (mod40.fecha_limite_inscripcion ||
                mod40.horizonte ||
                mod40.vencimiento_mod40) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {mod40.fecha_limite_inscripcion && (
                    <Stat
                      label="Fecha límite inscripción"
                      value={mod40.fecha_limite_inscripcion}
                    />
                  )}
                  {mod40.horizonte && (
                    <Stat label="Horizonte" value={mod40.horizonte} />
                  )}
                  {mod40.vencimiento_mod40 && (
                    <Stat
                      label="Vencimiento Mod40"
                      value={mod40.vencimiento_mod40}
                    />
                  )}
                </div>
              )}

            <div className="overflow-x-auto -mx-6 sm:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-6 sm:px-3 py-2 font-medium"></th>
                    <th className="px-3 py-2 font-medium">Pensión estimada</th>
                    <th className="px-3 py-2 font-medium">Costo retroactivo</th>
                    <th className="px-3 py-2 font-medium">
                      Actualizaciones y recargos
                    </th>
                    <th className="px-3 py-2 font-medium">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  <ModRetroRow
                    label="Retroactiva hoy"
                    data={mod40?.retroactiva_hoy ?? null}
                  />
                  <ModRetroRow
                    label="Retroactiva futuro"
                    data={mod40?.retroactiva_futuro ?? null}
                  />
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {hasAny(subs) && (
        <Card>
          <CardHeader>
            <CardTitle>Sub-oportunidades</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-2">
              <SubOp
                value={subs?.mod40_retroactiva_hoy}
                label="Mod40 retroactiva hoy"
              />
              <SubOp
                value={subs?.mod40_retroactiva_futura}
                label="Mod40 retroactiva futura"
              />
              <SubOp
                value={subs?.credito_pension_con_capacidad}
                label="Crédito pensión con capacidad"
              />
              <SubOp
                value={subs?.credito_pension_potencial}
                label="Crédito pensión potencial"
              />
              <SubOp
                value={subs?.infonavit_rescate}
                label="Rescate Infonavit"
              />
              <SubOp
                value={subs?.infonavit_mejoravit_activo}
                label="Infonavit Mejoravit activo"
              />
              <SubOp
                value={subs?.infonavit_mejoravit_inactivo}
                label="Infonavit Mejoravit inactivo"
              />
              <SubOp value={subs?.afore} label="AFORE" />
              <SubOp
                value={subs?.gestoria_pension_directa}
                label="Gestoría y pensión directa"
              />
              <SubOp
                value={subs?.seguros_inversiones}
                label="Seguros e inversiones"
              />
              <SubOp value={subs?.asesoria} label="Asesoría" />
            </div>
          </CardContent>
        </Card>
      )}

      {historia.length > 0 && (
        <Card>
          <CardContent className="py-2">
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer list-none py-4 -my-4">
                <span className="font-heading font-medium">
                  Historia laboral
                </span>
                <span className="flex items-center gap-2 text-sm text-muted-foreground">
                  {historia.length} empleos registrados
                  <ChevronLeft className="size-4 -rotate-90 transition-transform group-open:rotate-90" />
                </span>
              </summary>
              <ul className="flex flex-col gap-2 pt-4 mt-2 border-t">
                {historia.map((h, i) => (
                  <li key={i} className="flex items-baseline gap-4 text-sm py-1">
                    <span className="text-muted-foreground font-mono text-xs shrink-0 whitespace-nowrap">
                      {h?.desde ?? "—"} → {h?.hasta || "Vigente"}
                    </span>
                    <span className="font-medium flex-1 min-w-0 break-words whitespace-normal">
                      {h?.empleador ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </CardContent>
        </Card>
      )}

      {data.narrativa_cliente && (
        <Card>
          <CardHeader>
            <CardTitle>Diagnóstico personalizado</CardTitle>
            <CardDescription>Mensaje al cliente</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed">
              {data.narrativa_cliente}
            </div>
            <p className="text-xs italic text-muted-foreground pt-2 border-t">
              Este es el contexto que entregamos al cliente final en su PDF
              Diagnóstico.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string
  value: React.ReactNode
  highlight?: boolean
}) {
  return (
    <div
      className={`flex flex-col gap-1 ${
        highlight ? "rounded-xl bg-green-50 dark:bg-green-500/10 px-3 py-2" : ""
      }`}
    >
      <span className="text-xs text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span className="text-base font-medium">{value}</span>
    </div>
  )
}

function EscenarioCard({
  title,
  subtitle,
  escenario,
  highlight,
}: {
  title: string
  subtitle: string
  escenario: EscenarioPension
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-2xl p-5 flex flex-col gap-3 ${
        highlight
          ? "bg-zinc-900 text-zinc-100 dark:bg-zinc-950 dark:border dark:border-green-500/40"
          : "bg-secondary/40"
      }`}
    >
      <div>
        <div
          className={`text-xs font-medium uppercase tracking-wide ${
            highlight ? "text-green-400" : "text-muted-foreground"
          }`}
        >
          {title}
        </div>
        <div
          className={`text-sm ${
            highlight ? "text-zinc-300" : "text-muted-foreground"
          }`}
        >
          {subtitle}
        </div>
      </div>
      {typeof escenario.monto === "number" ? (
        <div
          className={`font-heading font-bold text-3xl ${
            highlight ? "text-green-400" : ""
          }`}
        >
          {formatMXN(escenario.monto)}
        </div>
      ) : typeof escenario.monto === "string" ? (
        <div className="text-lg font-semibold text-amber-700 dark:text-amber-400">
          {escenario.monto}
        </div>
      ) : (
        <div className="text-muted-foreground">—</div>
      )}
      <div
        className={`flex flex-col gap-1 text-xs ${
          highlight ? "text-zinc-300" : "text-muted-foreground"
        }`}
      >
        {escenario.edad !== null && escenario.edad !== undefined && (
          <div>
            <span className="opacity-70">Edad: </span>
            <span className="font-medium">{escenario.edad} años</span>
          </div>
        )}
        {escenario.semanas !== null && escenario.semanas !== undefined && (
          <div>
            <span className="opacity-70">Semanas: </span>
            <span className="font-medium">{escenario.semanas}</span>
          </div>
        )}
        {escenario.salario_usado !== null &&
          escenario.salario_usado !== undefined && (
            <div>
              <span className="opacity-70">Salario usado: </span>
              <span className="font-medium">
                {typeof escenario.salario_usado === "string"
                  ? escenario.salario_usado
                  : formatMXN(escenario.salario_usado)}
              </span>
            </div>
          )}
        {escenario.etiqueta && (
          <div className="pt-1">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                highlight
                  ? "bg-green-500/20 text-green-300"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {escenario.etiqueta}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function ModRetroRow({
  label,
  data,
}: {
  label: string
  data: ModalidadRetroactiva | null
}) {
  const d = data ?? {}
  return (
    <tr className="border-b last:border-0">
      <td className="px-6 sm:px-3 py-3 font-medium">{label}</td>
      <td className="px-3 py-3">{formatMonto(d.pension_estimada)}</td>
      <td className="px-3 py-3">{formatMonto(d.costo_retroactivo)}</td>
      <td className="px-3 py-3">{formatMonto(d.actualizaciones_recargos)}</td>
      <td className="px-3 py-3 text-muted-foreground">{d.fecha ?? "—"}</td>
    </tr>
  )
}

function SubOp({
  value,
  label,
}: {
  value: boolean | null | undefined
  label: string
}) {
  const active = value === true
  return (
    <div className="flex items-center gap-2 text-sm py-1">
      <span
        className={`inline-flex items-center justify-center size-5 rounded-full text-xs font-bold ${
          active
            ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400"
            : "bg-secondary text-muted-foreground"
        }`}
      >
        {active ? "✓" : "—"}
      </span>
      <span className={active ? "" : "text-muted-foreground"}>{label}</span>
    </div>
  )
}
