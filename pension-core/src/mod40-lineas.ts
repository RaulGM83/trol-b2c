// ============================================================================
// Líneas de captura Mod 40 con precisión DIARIA.
//
// El motor viejo cobraba meses completos: mover la fecha de trámite una semana
// no movía un peso. El IMSS no funciona así — cuenta días cotizados y actualiza
// y recarga con precisión diaria. En el caso base del Excel validado, una
// semana son $2,265 y cruzar de mes son $20,242.
//
// Implementación de referencia: `Calculadora_lineas_IMSS.xlsx` (Raúl), validada
// contra líneas de captura REALES del IMSS. Esta función la reproduce al
// centavo — ver los seis goldens de `__tests__/mod40-lineas.test.ts`.
//
// El tramo se topa a 5 años (art. 219 LSS) conservando los meses más recientes.
// El Excel de referencia no topa: los goldens que lo reproducen corren con
// `mesesMax: null`, y el default del motor es 60 (decisión de Raúl, 24-ago).
//
// Las tres piezas del cobro:
//   · retro          — la cuota Mod 40 del periodo, prorrateada por días.
//   · actualizaciones — art. 17-A CFF: INPC del mes de trámite / INPC del mes.
//   · recargos        — art. 21 CFF: 1.47 % mensual sobre (retro + actualiz.).
//
// Spec: `claude/21-lineas-captura-dia-a-dia-spec.md`.
// ============================================================================

import { INPC_MENSUAL, claveINPC, inpcDe, type SerieINPC } from './inpc';
import { UMA } from './tablas';
import { DIAS_MES, diasDelMes, diasEntre, inicioMes, lookupAprox, mesAnterior, porAnio } from './util';

/**
 * Cuota Mod 40 por año (reforma 2020, art. 218 LSS transitorio). VLOOKUP TRUE:
 * se busca el mayor año <= al del mes cobrado.
 */
export const CUOTA_MOD40_POR_ANIO: Array<[anio: number, cuota: number]> = [
  [2020, 0.1008],
  [2023, 0.1117],
  [2024, 0.1226],
  [2025, 0.1335],
  [2026, 0.1444],
  [2027, 0.1553],
  [2028, 0.1662],
  [2029, 0.1771],
  [2030, 0.188],
];

/** Recargos por mora: 1.47 % mensual (CFF), constante en el motor. */
export const TASA_RECARGOS_MENSUAL = 0.0147;

/**
 * Tope del retroactivo: 5 años (art. 219 LSS). Es el DEFAULT de `mesesMax`.
 *
 * El Excel de referencia no topa —sus casos cobran 62 y 63 meses— y por eso los
 * goldens que validan la mecánica diaria corren con `mesesMax: null`. Pero lo
 * que el IMSS deja cubrir son 5 años (decisión de Raúl, 24-ago-2026), así que
 * el motor topa por defecto y avisa de lo que se quedó fuera.
 */
export const MESES_MAX_ART219 = 60;

export interface EntradaLineasCaptura {
  /** Última cotización, con DÍA exacto: de aquí arranca el periodo a cubrir. */
  ultimaCotizacion: Date;
  /** Fecha de inicio de trámite, con DÍA exacto: el ancla de todo el cobro. */
  fechaTramite: Date;
  /** UMAs a las que se paga (25 = tope). */
  umas: number;
  /**
   * SDI diario del tramo. Si se omite, `UMA(año de la última cotización) × umas`
   * — el anclaje al año de la baja es deliberado y está validado contra el
   * Excel; no es la UMA de cada año del tramo.
   */
  sdi?: number;
  /**
   * SDI diario del mes que se está cobrando. Gana sobre `sdi`. Existe para la
   * Ley 73 con `salarioCotizacionRetro: 'MINIMO'`, donde el salario del tramo
   * no es plano sino el mayor entre el mínimo del año y el registrado.
   */
  sdiPorMes?: (mes: Date) => number;
  /** Serie INPC. Default: el fallback embebido de `inpc.ts`. */
  serieINPC?: SerieINPC;
  /**
   * Tope de meses a cobrar. Default `MESES_MAX_ART219` (60 = 5 años).
   * `null` desactiva el tope: sólo lo usan los goldens que reproducen el Excel
   * de referencia, que cobra 62 y 63 meses.
   *
   * Al truncar se conservan los meses MÁS RECIENTES: el retro se paga hacia
   * atrás desde el trámite, así que lo que se cae es la cola vieja.
   */
  mesesMax?: number | null;
}

export interface MesLineaCaptura {
  /** 'YYYY-MM' del mes cobrado. */
  mes: string;
  /** Días naturales del mes (28/29/30/31). */
  dias: number;
  /** Fracción del mes que se cobra: 1 salvo el primero y el último. */
  prorrateo: number;
  /** SDI diario aplicado a ESE mes (distinto del global sólo con `sdiPorMes`). */
  sdi: number;
  /** Cuota Mod 40 del año del mes. */
  cuota: number;
  inpc: number;
  /** El INPC de ese mes es proyección, no dato del INEGI. */
  inpcProyectado: boolean;
  retro: number;
  actualizacion: number;
  recargo: number;
  total: number;
}

export interface LineasCapturaMod40 {
  /** Meses que se están cobrando (ya topados). */
  meses: number;
  /** Meses que van del mes de la baja al del trámite, antes del tope. */
  mesesDelPeriodo: number;
  /** Meses viejos que el tope dejó fuera (`mesesDelPeriodo − meses`). */
  mesesFueraDelTope: number;
  /** El tope recortó el tramo. */
  topado: boolean;
  /** SDI base del tramo. Con `sdiPorMes` cada mes trae el suyo en `detalle`. */
  sdi: number;
  /** Primer día del mes de la última cotización (c10 del Excel). */
  desde: Date;
  /** Primer día del mes de la fecha de trámite (c11 del Excel). */
  hasta: Date;
  retro: number;
  actualizaciones: number;
  recargos: number;
  total: number;
  /** Desglose mes a mes, del mes del trámite hacia atrás. */
  detalle: MesLineaCaptura[];
  /** Algún mes del tramo usa INPC proyectado. */
  usaInpcProyectado: boolean;
  /** Algún mes no estaba en la serie y se extendió la proyección. */
  faltanMesesINPC: boolean;
  /** Nunca bloquean: se muestran junto al número. */
  avisos: string[];
}

/** Meses entre dos primeros-de-mes, ambos inclusive (el `n` del Excel). */
function mesesInclusive(desde: Date, hasta: Date): number {
  const d =
    (hasta.getUTCFullYear() - desde.getUTCFullYear()) * 12 +
    (hasta.getUTCMonth() - desde.getUTCMonth()) +
    1;
  return Math.max(0, d);
}

/**
 * Calcula la línea de captura del Mod 40 retroactivo con precisión diaria.
 *
 * El periodo va del mes de la última cotización al mes del trámite, ambos
 * inclusive. Los dos extremos se cobran PARCIALES:
 *  · el mes del trámite, por los días ya transcurridos (`DAY(fechaTramite)`);
 *  · el mes de la baja, por los días posteriores a ella.
 * Así salen las líneas reales del IMSS (confirmado por Raúl, 24-ago-2026).
 *
 * Una baja el último día del mes deja prorrateo 0 en ese mes: no queda ningún
 * día por cubrir y no se cobra. Es un caso real, no un borde a evitar.
 *
 * El tramo se topa a `mesesMax` (60 por defecto, art. 219) conservando los
 * meses MÁS RECIENTES. Cuando el tope muerde, el último mes cobrado ya no es el
 * de la baja, así que no se prorratea, y sale un aviso con cuántos meses
 * quedaron fuera.
 */
export function lineasCapturaMod40(e: EntradaLineasCaptura): LineasCapturaMod40 {
  const serie = e.serieINPC ?? INPC_MENSUAL;
  const ultimaCot = e.ultimaCotizacion;
  const fechaTramite = e.fechaTramite;
  const desde = inicioMes(ultimaCot); // c10
  const hasta = inicioMes(fechaTramite); // c11
  const sdi = e.sdi ?? porAnio(UMA, ultimaCot.getUTCFullYear()) * e.umas;

  const nTotal = mesesInclusive(desde, hasta);
  // `undefined` → tope del art. 219; `null` → sin tope (sólo los goldens del
  // Excel). Ojo con el `??`: un `mesesMax: 0` explícito tiene que respetarse.
  const tope = e.mesesMax === undefined ? MESES_MAX_ART219 : e.mesesMax;
  const n = tope === null ? nTotal : Math.min(nTotal, Math.max(0, tope));
  const fueraDelTope = nTotal - n;

  const avisos: string[] = [];
  const lecturaFin = inpcDe(serie, hasta);
  const inpcFin = lecturaFin.indice;
  let usaInpcProyectado = lecturaFin.proyectado;
  let faltanMesesINPC = lecturaFin.faltante;

  const diasUltimaCot = diasDelMes(ultimaCot);
  const detalle: MesLineaCaptura[] = [];
  let retro = 0;
  let actualizaciones = 0;
  let recargos = 0;
  let g = hasta;

  for (let i = 1; i <= n; i++) {
    const dias = diasDelMes(g);
    // Prorrateo de los extremos. El del mes de la baja se compara contra
    // `nTotal`, no contra `n`: si el tope cortó antes, el último mes que se
    // cobra NO es el de la baja y va completo.
    const esMesDeLaBaja = i === nTotal;
    const prorrateo =
      i === 1
        ? fechaTramite.getUTCDate() / dias
        : esMesDeLaBaja
          ? (diasUltimaCot - ultimaCot.getUTCDate()) / diasUltimaCot
          : 1;
    const sdiMes = e.sdiPorMes ? e.sdiPorMes(g) : sdi;
    const cuota = lookupAprox(g.getUTCFullYear(), CUOTA_MOD40_POR_ANIO)[1];
    const lectura = inpcDe(serie, g);
    usaInpcProyectado = usaInpcProyectado || lectura.proyectado;
    faltanMesesINPC = faltanMesesINPC || lectura.faltante;

    const r = cuota * (sdiMes * dias) * prorrateo;
    const a = (inpcFin / lectura.indice - 1) * r;
    // Recargos por los días corridos entre ese mes y el mes del trámite,
    // convertidos a meses con el divisor de 30.4375 del Excel.
    const c = (r + a) * TASA_RECARGOS_MENSUAL * (diasEntre(g, hasta) / DIAS_MES);

    retro += r;
    actualizaciones += a;
    recargos += c;
    detalle.push({
      mes: claveINPC(g),
      dias,
      prorrateo,
      sdi: sdiMes,
      cuota,
      inpc: lectura.indice,
      inpcProyectado: lectura.proyectado,
      retro: r,
      actualizacion: a,
      recargo: c,
      total: r + a + c,
    });
    g = mesAnterior(g);
  }

  if (usaInpcProyectado) {
    avisos.push(
      'Las actualizaciones se estimaron con INPC proyectado: la línea real del IMSS puede variar.',
    );
  }
  if (faltanMesesINPC) {
    avisos.push(
      'Faltan meses de INPC en la serie y se extendió la proyección: revisa que la tabla esté al día.',
    );
  }
  if (fueraDelTope > 0) {
    avisos.push(
      `Solo se cubren los últimos ${n} meses; ${fueraDelTope} ${fueraDelTope === 1 ? 'mes anterior queda' : 'meses anteriores quedan'} fuera.`,
    );
  }

  return {
    meses: n,
    mesesDelPeriodo: nTotal,
    mesesFueraDelTope: fueraDelTope,
    topado: fueraDelTope > 0,
    sdi,
    desde,
    hasta,
    retro,
    actualizaciones,
    recargos,
    total: retro + actualizaciones + recargos,
    detalle,
    usaInpcProyectado,
    faltanMesesINPC,
    avisos,
  };
}

/** Los meses del tramo, para congelar sólo ese pedazo de la serie INPC. */
export function mesesDelTramo(l: LineasCapturaMod40): string[] {
  return l.detalle.map((d) => d.mes);
}
