// ============================================================================
// Serie INPC mensual — insumo de las actualizaciones del art. 17-A CFF.
//
// La fuente de verdad es `trol3.inpc_mensual` en Supabase: el servidor la lee y
// la pasa al motor como parámetro. Lo de aquí es el FALLBACK embebido, con la
// misma semilla (INEGI observado hasta 2026-03; de ahí en adelante proyección
// a ~0.327 % mensual), para que el motor calcule sin red y en cualquier
// contexto sin sesión.
//
// OJO: esta serie NO es la de `tablas.INPC`. Aquella es la del Excel de junio
// (arranca en 2021-12 y trae valores viejos para 2024-05 en adelante) y sigue
// alimentando `computeLey73`; tocarla movería los goldens de pensión. La de
// aquí es la que cuadra al centavo con las líneas de captura reales del IMSS.
// Ver `claude/21-lineas-captura-dia-a-dia-spec.md`.
//
// ACTUALIZAR: cada mes, cuando INEGI publica. Un upsert en `trol3.inpc_mensual`
// basta para producción; regenerar esto es opcional (solo mueve el fallback).
// ============================================================================

/** Un mes de la serie: índice y si es dato observado o proyección. */
export interface PuntoINPC {
  indice: number;
  proyectado: boolean;
}

/** Serie INPC por clave 'YYYY-MM'. Es la forma en que viaja a `jsonb`. */
export type SerieINPC = Record<string, PuntoINPC>;

/** Tasa mensual de la proyección (≈3.99 % anual), la misma que usa la tabla. */
export const INPC_TASA_PROYECCION_MENSUAL = 1.00327;

/** Primer mes proyectado de `INPC_INDICES`: de aquí en adelante no es INEGI. */
export const INPC_PRIMER_MES_PROYECTADO = '2026-04';

/** Fecha del corte con que se generó el fallback (para poder auditarlo). */
export const INPC_SEMILLA = '2026-08-24';

/** Índices mensuales (base 2018 = 100). Espejo de `trol3.inpc_mensual`. */
export const INPC_INDICES: Record<string, number> = {
  "2015-01": 85.7706, "2015-02": 85.7799, "2015-03": 86.0117, "2015-04": 86.2978, "2015-05": 86.0867, "2015-06": 86.3198, "2015-07": 86.4477, "2015-08": 86.6856, "2015-09": 86.9651, "2015-10": 87.4753, "2015-11": 87.7269, "2015-12": 88.2068,
  "2016-01": 88.7421, "2016-02": 89.7775, "2016-03": 89.91, "2016-04": 89.6253, "2016-05": 89.2257, "2016-06": 89.3243, "2016-07": 89.5567, "2016-08": 89.8088, "2016-09": 90.3577, "2016-10": 90.9059, "2016-11": 91.6168, "2016-12": 92.039,
  "2017-01": 93.6038, "2017-02": 94.1448, "2017-03": 94.7222, "2017-04": 94.8389, "2017-05": 94.7258, "2017-06": 94.9636, "2017-07": 95.3227, "2017-08": 95.7942, "2017-09": 96.0937, "2017-10": 96.6982, "2017-11": 97.6952, "2017-12": 98.2729,
  "2018-01": 98.795, "2018-02": 99.1714, "2018-03": 99.4922, "2018-04": 99.1548, "2018-05": 98.9942, "2018-06": 99.3764, "2018-07": 99.909, "2018-08": 100.492, "2018-09": 100.917, "2018-10": 101.44, "2018-11": 102.303, "2018-12": 103.02,
  "2019-01": 103.108, "2019-02": 103.079, "2019-03": 103.476, "2019-04": 103.531, "2019-05": 103.233, "2019-06": 103.299, "2019-07": 103.687, "2019-08": 103.67, "2019-09": 103.942, "2019-10": 104.503, "2019-11": 105.346, "2019-12": 105.934,
  "2020-01": 106.447, "2020-02": 106.889, "2020-03": 106.838, "2020-04": 105.755, "2020-05": 106.162, "2020-06": 106.743, "2020-07": 107.444, "2020-08": 107.867, "2020-09": 108.114, "2020-10": 108.774, "2020-11": 108.856, "2020-12": 109.271,
  "2021-01": 110.21, "2021-02": 110.907, "2021-03": 111.824, "2021-04": 112.19, "2021-05": 112.419, "2021-06": 113.018, "2021-07": 113.682, "2021-08": 113.899, "2021-09": 114.601, "2021-10": 115.561, "2021-11": 116.884, "2021-12": 117.308,
  "2022-01": 118.002, "2022-02": 118.981, "2022-03": 120.159, "2022-04": 120.809, "2022-05": 121.022, "2022-06": 122.044, "2022-07": 122.948, "2022-08": 123.803, "2022-09": 124.571, "2022-10": 125.276, "2022-11": 125.997, "2022-12": 126.478,
  "2023-01": 127.336, "2023-02": 128.046, "2023-03": 128.389, "2023-04": 128.363, "2023-05": 128.084, "2023-06": 128.214, "2023-07": 128.832, "2023-08": 129.545, "2023-09": 130.119, "2023-10": 130.609, "2023-11": 131.445, "2023-12": 132.373,
  "2024-01": 133.555, "2024-02": 133.681, "2024-03": 134.065, "2024-04": 134.336, "2024-05": 134.45, "2024-06": 135.218, "2024-07": 136.003, "2024-08": 136.679, "2024-09": 137.106, "2024-10": 137.652, "2024-11": 138.402, "2024-12": 137.339,
  "2025-01": 139.679, "2025-02": 139.929, "2025-03": 140.498, "2025-04": 140.628, "2025-05": 140.451, "2025-06": 141.085, "2025-07": 141.872, "2025-08": 142.29, "2025-09": 142.706, "2025-10": 143.124, "2025-11": 143.541, "2025-12": 143.042,
  "2026-01": 144.553, "2026-02": 144.962, "2026-03": 145.643, "2026-04": 146.12, "2026-05": 146.598, "2026-06": 147.078, "2026-07": 147.56, "2026-08": 148.043, "2026-09": 148.527, "2026-10": 149.014, "2026-11": 149.501, "2026-12": 149.991,
  "2027-01": 150.482, "2027-02": 150.974, "2027-03": 151.469, "2027-04": 151.965, "2027-05": 152.462, "2027-06": 152.961, "2027-07": 153.462, "2027-08": 153.964, "2027-09": 154.468, "2027-10": 154.974, "2027-11": 155.481, "2027-12": 155.99,
  "2028-01": 156.501, "2028-02": 157.013, "2028-03": 157.527, "2028-04": 158.043, "2028-05": 158.561, "2028-06": 159.08, "2028-07": 159.6, "2028-08": 160.123, "2028-09": 160.647, "2028-10": 161.173, "2028-11": 161.701, "2028-12": 162.23,
  "2029-01": 162.761, "2029-02": 163.294, "2029-03": 163.829, "2029-04": 164.365, "2029-05": 164.903, "2029-06": 165.443, "2029-07": 165.984, "2029-08": 166.528, "2029-09": 167.073, "2029-10": 167.62, "2029-11": 168.169, "2029-12": 168.719,
  "2030-01": 169.272, "2030-02": 169.826, "2030-03": 170.382, "2030-04": 170.939, "2030-05": 171.499, "2030-06": 172.061, "2030-07": 172.624, "2030-08": 173.189, "2030-09": 173.756, "2030-10": 174.325, "2030-11": 174.895, "2030-12": 175.468,
  "2031-01": 176.042, "2031-02": 176.619, "2031-03": 177.197, "2031-04": 177.777, "2031-05": 178.359, "2031-06": 178.943, "2031-07": 179.529, "2031-08": 180.117, "2031-09": 180.706, "2031-10": 181.298, "2031-11": 181.891, "2031-12": 182.487,
  "2032-01": 183.084, "2032-02": 183.684, "2032-03": 184.285, "2032-04": 184.888, "2032-05": 185.493, "2032-06": 186.101, "2032-07": 186.71, "2032-08": 187.321, "2032-09": 187.934, "2032-10": 188.55, "2032-11": 189.167, "2032-12": 189.786,
  "2033-01": 190.408, "2033-02": 191.031, "2033-03": 191.656, "2033-04": 192.284, "2033-05": 192.913, "2033-06": 193.545, "2033-07": 194.178, "2033-08": 194.814, "2033-09": 195.452, "2033-10": 196.092, "2033-11": 196.734, "2033-12": 197.378,
  "2034-01": 198.024, "2034-02": 198.672, "2034-03": 199.323, "2034-04": 199.975, "2034-05": 200.63, "2034-06": 201.287, "2034-07": 201.945, "2034-08": 202.607, "2034-09": 203.27, "2034-10": 203.935, "2034-11": 204.603, "2034-12": 205.273,
  "2035-01": 205.945, "2035-02": 206.619, "2035-03": 207.295, "2035-04": 207.974, "2035-05": 208.655, "2035-06": 209.338, "2035-07": 210.023, "2035-08": 210.711, "2035-09": 211.401, "2035-10": 212.093, "2035-11": 212.787, "2035-12": 213.484,};

/** El fallback embebido, ya como `SerieINPC`. */
export const INPC_MENSUAL: SerieINPC = Object.fromEntries(
  Object.entries(INPC_INDICES).map(([mes, indice]) => [
    mes,
    { indice, proyectado: mes >= INPC_PRIMER_MES_PROYECTADO },
  ]),
);

/** Clave 'YYYY-MM' de una fecha (UTC). */
export function claveINPC(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Filas de `trol3.inpc_mensual` (o de cualquier fuente) → `SerieINPC`. */
export function serieINPCDesdeFilas(
  filas: Array<{ mes: string | Date; indice: number | string; proyectado?: boolean | null }>,
): SerieINPC {
  const out: SerieINPC = {};
  for (const f of filas) {
    const mes = f.mes instanceof Date ? claveINPC(f.mes) : String(f.mes).slice(0, 7);
    // `indice` llega como string desde PostgREST cuando la columna es numeric.
    const indice = typeof f.indice === 'number' ? f.indice : Number(f.indice);
    if (!/^\d{4}-\d{2}$/.test(mes) || !Number.isFinite(indice)) continue;
    out[mes] = { indice, proyectado: !!f.proyectado };
  }
  return out;
}

export interface LecturaINPC extends PuntoINPC {
  /** El mes no estaba en la serie: el índice viene de extender la proyección. */
  faltante: boolean;
}

/**
 * INPC de un mes. Si falta, extiende geométricamente desde el último dato de la
 * serie (o clampea al primero, hacia atrás) y lo marca como `faltante` para que
 * quien llame pueda avisar. Nunca revienta ni devuelve 0: un INPC en 0 se
 * propaga como una actualización infinita.
 */
export function inpcDe(serie: SerieINPC, d: Date | string): LecturaINPC {
  const k = typeof d === 'string' ? d.slice(0, 7) : claveINPC(d);
  const hit = serie[k];
  if (hit) return { ...hit, faltante: false };

  const claves = Object.keys(serie).sort();
  if (claves.length === 0) return { indice: 1, proyectado: true, faltante: true };
  const primera = claves[0];
  const ultima = claves[claves.length - 1];
  if (k < primera) return { indice: serie[primera].indice, proyectado: true, faltante: true };

  const [uy, um] = ultima.split('-').map(Number);
  const [dy, dm] = k.split('-').map(Number);
  const delta = (dy - uy) * 12 + (dm - um);
  return {
    indice: serie[ultima].indice * Math.pow(INPC_TASA_PROYECCION_MENSUAL, Math.max(delta, 0)),
    proyectado: true,
    faltante: true,
  };
}

/** Recorta una serie a los meses de un tramo (para congelarla en un snapshot). */
export function recortarSerieINPC(serie: SerieINPC, meses: string[]): SerieINPC {
  const out: SerieINPC = {};
  for (const m of meses) if (serie[m]) out[m] = serie[m];
  return out;
}
