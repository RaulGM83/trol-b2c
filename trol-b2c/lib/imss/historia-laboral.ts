/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Normalizador de la historia laboral (IMSS) del cliente.
// Fuentes, en orden de preferencia:
//   1) clientes.calculo_pensional.historial  (campos en español)
//   2) clientes.json_belvo.employment_history_json.data.employment_history
//      (campos en inglés, se normalizan a los mismos nombres)
// ============================================================================

export interface EmpleoHistorial {
  empleador: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  salario_base: number | null
  registro_patronal: string | null
  entidad_federativa: string | null
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s.length ? s : null
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = typeof v === "string" ? parseFloat(v) : (v as number)
  return Number.isFinite(n) ? n : null
}

function fromSemilla(raw: unknown): EmpleoHistorial[] | null {
  if (!raw || typeof raw !== "object") return null
  const arr = (raw as Record<string, any>).historial
  if (!Array.isArray(arr) || arr.length === 0) return null
  return arr.map((e: any) => ({
    empleador: str(e?.empleador),
    fecha_inicio: str(e?.fecha_inicio),
    fecha_fin: str(e?.fecha_fin),
    salario_base: numOrNull(e?.salario_base),
    registro_patronal: str(e?.registro_patronal),
    entidad_federativa: str(e?.entidad_federativa),
  }))
}

function fromBelvo(raw: unknown): EmpleoHistorial[] | null {
  if (!raw || typeof raw !== "object") return null
  const arr = (raw as Record<string, any>)?.employment_history_json?.data
    ?.employment_history
  if (!Array.isArray(arr) || arr.length === 0) return null
  return arr.map((e: any) => ({
    empleador: str(e?.employer),
    fecha_inicio: str(e?.start_date),
    fecha_fin: str(e?.end_date),
    salario_base: numOrNull(e?.base_salary),
    registro_patronal: str(e?.registro_patronal),
    entidad_federativa: str(e?.entidad_federativa),
  }))
}

/**
 * Devuelve la historia laboral normalizada, ordenada por fecha_inicio
 * descendente (lo más reciente arriba). Array vacío si no hay datos.
 */
export function getHistoriaLaboral(cliente: {
  calculo_pensional?: unknown
  json_belvo?: unknown
}): EmpleoHistorial[] {
  const entries =
    fromSemilla(cliente.calculo_pensional) ??
    fromBelvo(cliente.json_belvo) ??
    []

  return [...entries].sort((a, b) => {
    const ta = a.fecha_inicio ? new Date(a.fecha_inicio).getTime() : NaN
    const tb = b.fecha_inicio ? new Date(b.fecha_inicio).getTime() : NaN
    const va = Number.isNaN(ta) ? -Infinity : ta
    const vb = Number.isNaN(tb) ? -Infinity : tb
    return vb - va
  })
}
