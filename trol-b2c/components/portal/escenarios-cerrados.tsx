"use client"

// ============================================================================
// Los escenarios que el asesor ya cerró.
//
// Cerrar un escenario sin poder verlos después no sirve de nada: la promesa
// es que una asesoría queda auditable, y para eso tiene que estar a la vista
// quién presentó qué y con qué supuestos.
//
// Dos cosas que esta lista tiene que decir sin que nadie las pregunte:
//
//   · Un escenario cerrado trae los datos del día en que se cerró. Si después
//     llegó un SISEC nuevo, el escenario NO se actualiza — ése es el punto —
//     pero alguien podría leer un número viejo creyéndolo fresco.
//   · Si lo calculó un motor anterior al de hoy, sus números ya no son
//     comparables con los de la calculadora abierta al lado.
// ============================================================================

import { useEffect, useState } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { createClient } from "@/lib/supabase/client"

type Resumen = {
  etiqueta?: string
  pension_mensual?: number
  edad_retiro?: number
  fecha_tramite?: string
  destino_infonavit?: string
  en_pmg?: boolean
}

type Fila = {
  id: string
  tipo: string
  creado_en: string
  creado_por_nombre: string | null
  motor_version: string | null
  motor_actual: boolean | null
  resumen: Resumen | null
}

const TIPO_LABEL: Record<string, string> = {
  calc_ley73: "Ley 73",
  calc_ley97: "Ley 97",
  calc_mod40: "Mod 40",
}

const DESTINO_LABEL: Record<string, string> = {
  pension: "vivienda a la pensión",
  rescate: "vivienda rescatada",
  vivienda: "vivienda para su casa",
}

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
})

function fecha(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
}

export function EscenariosCerrados({
  personaId,
  consultaAliadoId,
  /** Cambia al cerrar uno nuevo para que la lista se refresque. */
  refrescar = 0,
}: {
  personaId?: string
  consultaAliadoId?: string
  refrescar?: number
}) {
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const supabase = createClient()
      let q = supabase
        .schema("trol3")
        .from("v_escenarios_cerrados")
        .select("id,tipo,creado_en,creado_por_nombre,motor_version,motor_actual,resumen")
        .order("creado_en", { ascending: false })
        .limit(20)
      q = personaId
        ? q.eq("persona_id", personaId)
        : q.eq("consulta_aliado_id", consultaAliadoId ?? "")
      const { data, error } = await q
      if (!vivo) return
      // Un fallo no se disfraza de lista vacía: son cosas distintas y el
      // asesor tiene que poder distinguirlas.
      if (error) setError(error.message)
      else setFilas((data ?? []) as Fila[])
    })()
    return () => {
      vivo = false
    }
  }, [personaId, consultaAliadoId, refrescar])

  if (error) {
    return (
      <Card>
        <CardContent className="pt-5 text-sm text-brick">
          No se pudieron leer los escenarios cerrados: {error}
        </CardContent>
      </Card>
    )
  }
  if (filas === null || filas.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Escenarios cerrados</CardTitle>
      </CardHeader>
      <CardContent className="pt-1">
        <ul className="divide-y divide-border/60">
          {filas.map((f) => {
            const r = f.resumen ?? {}
            return (
              <li key={f.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2 text-sm">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold">
                  {TIPO_LABEL[f.tipo] ?? f.tipo}
                </span>
                <span className="font-medium">{r.etiqueta ?? "Escenario"}</span>
                {r.pension_mensual !== undefined && (
                  <span className="tabular-nums font-semibold">
                    {mxn.format(r.pension_mensual)}/mes
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {r.edad_retiro !== undefined && `a los ${r.edad_retiro} · `}
                  {r.destino_infonavit && `${DESTINO_LABEL[r.destino_infonavit] ?? ""} · `}
                  {r.en_pmg && "en la mínima · "}
                  {fecha(f.creado_en)}
                  {f.creado_por_nombre && ` · ${f.creado_por_nombre}`}
                </span>
                {f.motor_actual === false && (
                  <span
                    className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900"
                    title={`Calculado con ${f.motor_version}. El motor cambió desde entonces, así que estos números no son comparables con los de hoy.`}
                  >
                    motor anterior
                  </span>
                )}
              </li>
            )
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          Cada escenario quedó congelado con los datos del día en que se cerró. Si
          después llegó información nueva, no se actualiza: eso es lo que permite
          saber qué se le presentó al cliente y con qué supuestos.
        </p>
      </CardContent>
    </Card>
  )
}
