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

/** Qué entra al cálculo. Vive sólo en la sesión. */
export type Incluir = {
  afore?: boolean
  ahorroVoluntario?: boolean
  planCorporativo?: boolean
  otrosPlanes?: boolean
  /** Invertido en pantalla: el switch pregunta si lo usa para otra cosa. */
  infonavit?: boolean
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
  /** El switch pregunta lo contrario de "incluir" (caso Infonavit). */
  incluirInvertido?: boolean
  etiquetaIncluir?: string
}

const VEHICULOS: Record<VehiculoId, Vehiculo> = {
  afore: {
    id: "afore",
    etiqueta: "AFORE (RCV)",
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
    etiqueta: "Infonavit",
    rendimiento: "0% real",
    campo: "infonavit",
    incluir: "infonavit",
    incluirInvertido: true,
    etiquetaIncluir: "Lo usa o lo va a usar para otra cosa",
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
    etiqueta: "Otros planes de ahorro",
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
        Lo que se deje vacío se calcula con el estimado. Los interruptores son de
        este escenario y no se guardan.
      </p>

      <div className="flex flex-col gap-4 mt-3">
        {vehiculos.map((id, i) => {
          const v = VEHICULOS[id]
          const clave = v.incluir
          // Un vehículo entra por default. El Infonavit pregunta al revés:
          // el switch encendido significa "lo usa para otra cosa", o sea fuera.
          const dentro = clave ? (incluir?.[clave] ?? true) : true
          const switchEncendido = v.incluirInvertido ? !dentro : dentro

          return (
            <div key={id} className="flex flex-col gap-2">
              {i > 0 && <Separator className="mb-1" />}
              <div className="flex items-baseline justify-between gap-2">
                <Label className="text-xs font-medium">{v.etiqueta}</Label>
                {v.rendimiento && (
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground tabular-nums">
                    {v.rendimiento}
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

              {clave && onIncluir && (
                <InterruptorIncluir
                  etiqueta={v.etiquetaIncluir ?? "Incluir en el cálculo de pensión"}
                  checked={switchEncendido}
                  onChange={(on) => onIncluir(clave, v.incluirInvertido ? !on : on)}
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
