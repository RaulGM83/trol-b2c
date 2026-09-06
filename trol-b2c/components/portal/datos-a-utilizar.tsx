"use client"

// ============================================================================
// "Datos a utilizar" — el panel donde el asesor dice con qué dinero se calcula.
//
// Sustituye a "Corregir saldos estimados", que sólo dejaba tocar dos números y
// trataba todo el ahorro como si viviera en la AFORE. El dinero de una persona
// está en cinco lugares distintos y cada uno se comporta distinto:
//
//   AFORE (RCV + voluntario)     3% real   entra a la cuenta individual
//   Plan de retiro de la empresa 2% real   fuera de la AFORE, se retira aparte
//   Otros planes (PPR, fondos)   1% real   fuera de todo, líquido
//   Infonavit                    0% real   y muchas veces va a la casa, no al retiro
//
// Cada vehículo tiene su saldo de hoy, su aportación mensual donde aplica, y
// un interruptor de incluir o no. El interruptor es de la sesión: es una
// pregunta de escenario ("¿y si no cuento el Infonavit?"), no un dato del
// cliente, así que no se guarda. Los montos sí se guardan.
// ============================================================================

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

/** Lo que viaja a Supabase: montos, nada de interruptores. */
export type DatosAUtilizar = {
  rcv97?: number
  disponible_afore?: number
  infonavit?: number
  ahorro_voluntario?: number
  ahorro_voluntario_mensual?: number
  plan_corporativo?: number
  plan_corporativo_mensual?: number
  otros_planes?: number
  otros_planes_mensual?: number
  /** Devuelto por la RPC; no se manda. */
  actualizado_at?: string
}

/**
 * Qué hace el cliente con su subcuenta de vivienda. No es un sí/no: son tres
 * caminos distintos y cada uno cambia el rendimiento, el castigo actuarial y
 * la capa en que cae ese dinero.
 */
export type DestinoInfonavit = "pension" | "rescate" | "vivienda"

/** Qué entra al cálculo. Vive sólo en la sesión. */
export type Incluir = {
  afore?: boolean
  ahorroVoluntario?: boolean
  planCorporativo?: boolean
  otrosPlanes?: boolean
}

export type VehiculoId =
  | "afore"
  | "disponible"
  | "infonavit"
  | "voluntario"
  | "corporativo"
  | "otros"

type Vehiculo = {
  id: VehiculoId
  etiqueta: string
  nota?: string
  /** Rendimiento real anual hacia adelante, para mostrarlo junto al monto. */
  rendimiento?: string
  campo: keyof DatosAUtilizar
  campoMensual?: keyof DatosAUtilizar
  /** Clave del interruptor; sin ella, el vehículo no se puede excluir. */
  incluir?: keyof Incluir
  etiquetaIncluir?: string
}

const VEHICULOS: Record<VehiculoId, Vehiculo> = {
  afore: {
    id: "afore",
    etiqueta: "Ahorro para el retiro (RCV)",
    rendimiento: "3% real",
    campo: "rcv97",
    incluir: "afore",
  },
  disponible: {
    id: "disponible",
    etiqueta: "Disponible en AFORE",
    nota: "Mientras no haya dato real, se estima como SAR 92 + 30% del RCV 97.",
    campo: "disponible_afore",
  },
  infonavit: {
    id: "infonavit",
    etiqueta: "Subcuenta de vivienda (Infonavit)",
    // El rendimiento no es fijo: depende del destino, así que lo pone el
    // selector y no la ficha.
    campo: "infonavit",
  },
  voluntario: {
    id: "voluntario",
    etiqueta: "Ahorro voluntario en AFORE",
    rendimiento: "3% real",
    campo: "ahorro_voluntario",
    campoMensual: "ahorro_voluntario_mensual",
    incluir: "ahorroVoluntario",
  },
  corporativo: {
    id: "corporativo",
    etiqueta: "Plan de retiro de la empresa",
    nota: "Fuera de la AFORE: plan corporativo, caja de ahorro de la empresa.",
    rendimiento: "2% real",
    campo: "plan_corporativo",
    campoMensual: "plan_corporativo_mensual",
    incluir: "planCorporativo",
  },
  otros: {
    id: "otros",
    etiqueta: "Otros planes (PPR, fondos, caja)",
    nota: "PPR de aseguradora, fondos de inversión, caja de ahorro propia.",
    rendimiento: "1% real",
    campo: "otros_planes",
    campoMensual: "otros_planes_mensual",
    incluir: "otrosPlanes",
  },
}

/** Los campos que un panel dado puede escribir — y por tanto también borrar. */
export function camposDe(vehiculos: VehiculoId[]): (keyof DatosAUtilizar)[] {
  return vehiculos.flatMap((id) => {
    const v = VEHICULOS[id]
    return v.campoMensual ? [v.campo, v.campoMensual] : [v.campo]
  })
}

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})

function fmtFechaCorta(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
}

export function PanelDatosAUtilizar({
  vehiculos,
  estimados,
  valores,
  onValor,
  incluir,
  onIncluir,
  destinoInfonavit = "pension",
  onDestinoInfonavit,
  onGuardar,
  guardando = false,
  guardadoAt = null,
  titulo = "Datos a utilizar",
  abierto,
}: {
  vehiculos: VehiculoId[]
  /** Lo que el motor usaría si el asesor no captura nada. */
  estimados: Partial<Record<keyof DatosAUtilizar, number>>
  valores: DatosAUtilizar
  onValor: (campo: keyof DatosAUtilizar, v: number | undefined) => void
  incluir?: Incluir
  onIncluir?: (clave: keyof Incluir, v: boolean) => void
  /** Destino de la subcuenta de vivienda. Sólo si el panel la muestra. */
  destinoInfonavit?: DestinoInfonavit
  onDestinoInfonavit?: (d: DestinoInfonavit) => void
  /** Sin esta prop el panel no muestra botón de guardar (modo sólo escenario). */
  onGuardar?: () => void
  guardando?: boolean
  guardadoAt?: string | null
  titulo?: string
  abierto?: boolean
}) {
  const hayCapturado = camposDe(vehiculos).some((c) => valores[c] !== undefined)

  return (
    <details className="flex flex-col gap-2" open={abierto ?? hayCapturado}>
      <summary className="text-sm font-medium cursor-pointer select-none">{titulo}</summary>
      <p className="text-xs text-muted-foreground mt-1">
        Las fuentes de recursos con las que se calcula la pensión. Lo que se deje
        vacío se estima. Los interruptores son de este escenario y no se guardan.
      </p>

      <div className="flex flex-col gap-4 mt-3">
        {vehiculos.map((id, i) => {
          const v = VEHICULOS[id]
          const clave = v.incluir
          const esInfonavit = id === "infonavit"
          // Todos preguntan lo mismo: ¿este dinero entra al cálculo? La
          // vivienda es la excepción, porque no es sí/no sino tres destinos.
          const dentro = esInfonavit
            ? destinoInfonavit !== "vivienda"
            : clave
              ? (incluir?.[clave] ?? true)
              : true
          const rendimiento = esInfonavit
            ? DESTINO_INFONAVIT[destinoInfonavit].rendimiento
            : v.rendimiento

          return (
            <div key={id} className="flex flex-col gap-2">
              {i > 0 && <Separator className="mb-1" />}
              <div className="flex items-baseline justify-between gap-2">
                <Label className="text-xs font-medium">{v.etiqueta}</Label>
                {rendimiento && (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground tabular-nums">
                    {rendimiento}
                  </span>
                )}
              </div>

              <MontoInput
                etiqueta="Saldo actual"
                estimado={estimados[v.campo]}
                value={valores[v.campo] as number | undefined}
                disabled={!dentro}
                onChange={(n) => onValor(v.campo, n)}
              />

              {v.campoMensual && (
                <MontoInput
                  etiqueta="Aportación mensual"
                  estimado={estimados[v.campoMensual] ?? 0}
                  value={valores[v.campoMensual] as number | undefined}
                  disabled={!dentro}
                  onChange={(n) => onValor(v.campoMensual!, n)}
                />
              )}

              {v.nota && <p className="text-xs text-muted-foreground">{v.nota}</p>}

              {esInfonavit && onDestinoInfonavit && (
                <SelectorDestino valor={destinoInfonavit} onChange={onDestinoInfonavit} />
              )}

              {!esInfonavit && clave && onIncluir && (
                <InterruptorIncluir
                  etiqueta={v.etiquetaIncluir ?? "Incluir en el cálculo de pensión"}
                  checked={dentro}
                  onChange={(on) => onIncluir(clave, on)}
                />
              )}
            </div>
          )
        })}
      </div>

      {onGuardar && (
        <div className="flex flex-col gap-1 mt-4">
          <Button
            type="button"
            size="sm"
            onClick={onGuardar}
            disabled={guardando || !hayCapturado}
          >
            {guardando ? "Guardando…" : "Guardar datos"}
          </Button>
          <p className="text-xs text-muted-foreground">
            {guardadoAt
              ? `Guardados el ${fmtFechaCorta(guardadoAt)} — se precargan al volver a abrir.`
              : "Se guardan en el expediente y se precargan la próxima vez."}
          </p>
        </div>
      )}
    </details>
  )
}

/**
 * Los tres destinos de la subcuenta de vivienda, con lo que cambia cada uno.
 *
 * Dentro de la cuenta individual ese dinero está en el peor lugar posible:
 * rinde 0% real, paga un seguro de sobrevivencia que el cliente no eligió, y
 * si cae en la mínima garantizada no le suma nada. Rescatarlo arregla las tres
 * cosas — por eso el selector dice qué gana, no sólo qué opción es.
 */
const DESTINO_INFONAVIT: Record<
  DestinoInfonavit,
  { titulo: string; detalle: string; rendimiento: string }
> = {
  pension: {
    titulo: "A la pensión",
    detalle:
      "Se queda en su cuenta individual y compra la renta del IMSS. Rinde 0% real, paga el seguro de sobrevivencia, y si cae en la mínima garantizada no le suma nada.",
    rendimiento: "0% real",
  },
  rescate: {
    titulo: "Rescatarlo",
    detalle:
      "Sale de la cuenta individual y se invierte al 3% real, igual que la AFORE. No paga el seguro de sobrevivencia y va por encima de la mínima garantizada, así que siempre suma.",
    rendimiento: "3% real",
  },
  vivienda: {
    titulo: "Lo usa para su casa",
    detalle:
      "Lo destina a una vivienda o ya tiene un crédito vigente. No entra al cálculo de la pensión.",
    rendimiento: "",
  },
}

function SelectorDestino({
  valor,
  onChange,
}: {
  valor: DestinoInfonavit
  onChange: (d: DestinoInfonavit) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">¿Qué hace con este saldo?</Label>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(DESTINO_INFONAVIT) as DestinoInfonavit[]).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={valor === d}
            onClick={() => onChange(d)}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              valor === d
                ? "bg-[var(--brand-primary)] text-white"
                : "border border-border bg-background hover:bg-muted"
            }`}
          >
            {DESTINO_INFONAVIT[d].titulo}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{DESTINO_INFONAVIT[valor].detalle}</p>
    </div>
  )
}

function MontoInput({
  etiqueta,
  estimado,
  value,
  disabled = false,
  onChange,
}: {
  etiqueta: string
  estimado: number | undefined
  value: number | undefined
  disabled?: boolean
  onChange: (v: number | undefined) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{etiqueta}</Label>
      <Input
        type="number"
        min={0}
        disabled={disabled}
        placeholder={
          estimado === undefined ? "Sin estimado" : `Estimado: ${mxn.format(estimado)}`
        }
        value={value ?? ""}
        onChange={(e) =>
          onChange(e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)))
        }
      />
    </div>
  )
}

function InterruptorIncluir({
  etiqueta,
  checked,
  onChange,
}: {
  etiqueta: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={etiqueta}
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
