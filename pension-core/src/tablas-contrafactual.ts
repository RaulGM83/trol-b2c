// ============================================================================
// Tablas de parámetros del CONTRAFACTUAL Compara Afore (metodología v1.4)
// Separadas de tablas.ts porque tienen ciclo de verificación propio.
//
// VERIFICADO 19-jul-2026:
//   - CETES_92_97_MENSUAL: serie mensual real (FRED INTGSTMXM193N = réplica
//     IFS/IMF de Banxico SF43936; validada punto a punto vs INEGI dic-95/96).
//   - Cuota social: decretos DOF 21-dic-1995 (texto original, 5.5% SMG-DF),
//     DOF 26-may-2009 (tabla por bandas SM hasta 15 SM) y DOF 16-dic-2020
//     (tabla $10.75-$6.25 hasta 4.00 UMA; transitorio 3º: 4.01-7.09 UMA
//     desde 2023 con montos menores — esa banda queda aproximada).
//   - Cesantía patronal 2023-2030: tabla del transitorio 2º DOF 16-dic-2020,
//     confirmada celda por celda (CESANTIA97_PCT de tablas.ts es correcta).
//     Banda "1.00 SM" (no UMA) se queda en 3.150% fijo todos los años.
//   - Aportación estatal CEAV (0.225%): fracc. III del art. 168 DEROGADA;
//     el Estado la pagó solo hasta dic-2022; desde 2023 todo va vía cuota
//     social. La tasa post-2023 NO incluye el 0.225%.
//   - Mapa de series CONSAR: 'sb0' = SB de Pensiones (conservadora; recibe a
//     sb 55-59 en ago-24) y 'sb 1000' = SB Inicial (agresiva; sb 95-99 se
//     escinde de ella en ago-24). Verificado empíricamente: corr mensual
//     sb 95-99 vs sb 1000 = 0.9994 post-escisión; vol/retorno consistentes.
//
// Indexación de cuota social: los montos de cada decreto se actualizan por
// INPC trimestral; aquí se indexan con UMA del año como proxy de INPC (la
// UMA crece con INPC por ley desde 2016; antes SMG ≈ INPC). Error < 2%.
// ============================================================================

/** Tasa RCV base sobre SBC, jul-1997 → dic-2022 (retiro 2% + cesantía 4.5%:
 * patrón 3.150 + trabajador 1.125 + Estado 0.225). */
export const TASA_RCV_BASE = 0.065;

export const TASA_RETIRO = 0.02;
export const TASA_CESANTIA_TRABAJADOR = 0.01125;
/** Vigente solo hasta dic-2022 (fracc. III derogada; transitorio la mantuvo 2021-2022). */
export const TASA_CESANTIA_ESTADO_HASTA_2022 = 0.00225;

/** Cesantía patronal pre-reforma y banda "1.00 SM" post-reforma (fija). */
export const TASA_CESANTIA_PATRON_PRE2023 = 0.0315;

/**
 * Cortes superiores de banda (SBC en UMAs) para las 7 filas de CESANTIA97_PCT
 * (tablas.ts): A: 1.01SM-1.50 UMA, B: 1.51-2.00, C: 2.01-2.50, D: 2.51-3.00,
 * E: 3.01-3.50, F: 3.51-4.00, G: 4.01+. La banda "exactamente ≤1.00 SM" va
 * aparte con 3.150% fijo (comparar contra SALARIO_MINIMO, no contra UMA).
 * Fuente: transitorio 2º DOF 16-dic-2020 (verificado vs PwC nov-2022).
 */
export const CESANTIA97_BANDAS_UMA_SUP: number[] = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0];

/**
 * CETES 28 días — tasa anual (%) promedio mensual, may-1992 → jun-1997.
 * Fuente: FRED INTGSTMXM193N (IMF IFS, treasury bill rate MX = CETES 28d
 * promedio mensual de subastas, mismo dato que Banxico SF43936). Validada
 * contra INEGI "México Hoy": dic-95 = 48.62, dic-96 = 27.23 (exactos).
 */
export const CETES_92_97_MENSUAL: Record<string, number> = {
  '1992-05': 13.60, '1992-06': 15.03, '1992-07': 16.23, '1992-08': 16.49,
  '1992-09': 17.54, '1992-10': 19.39, '1992-11': 18.15, '1992-12': 16.88,
  '1993-01': 16.72, '1993-02': 17.74, '1993-03': 17.47, '1993-04': 16.17,
  '1993-05': 15.04, '1993-06': 15.50, '1993-07': 13.85, '1993-08': 13.68,
  '1993-09': 13.71, '1993-10': 13.13, '1993-11': 14.38, '1993-12': 11.78,
  '1994-01': 10.52, '1994-02': 9.45, '1994-03': 9.73, '1994-04': 15.79,
  '1994-05': 16.36, '1994-06': 16.18, '1994-07': 17.07, '1994-08': 14.46,
  '1994-09': 13.76, '1994-10': 13.60, '1994-11': 13.74, '1994-12': 18.51,
  '1995-01': 37.25, '1995-02': 41.69, '1995-03': 69.54, '1995-04': 74.75,
  '1995-05': 59.17, '1995-06': 47.25, '1995-07': 40.94, '1995-08': 35.14,
  '1995-09': 33.46, '1995-10': 40.29, '1995-11': 53.16, '1995-12': 48.62,
  '1996-01': 40.99, '1996-02': 38.58, '1996-03': 41.45, '1996-04': 35.21,
  '1996-05': 28.45, '1996-06': 27.81, '1996-07': 31.25, '1996-08': 26.51,
  '1996-09': 23.90, '1996-10': 25.75, '1996-11': 29.57, '1996-12': 27.23,
  '1997-01': 23.55, '1997-02': 19.80, '1997-03': 21.66, '1997-04': 21.35,
  '1997-05': 18.42, '1997-06': 20.17,
};

/** Tasa SAR-92: 2% del SBC a la subcuenta de retiro (may-1992 → jun-1997). */
export const TASA_SAR92 = 0.02;

// ----------------------------------------------------------------------------
// Cuota social — tres regímenes (montos nominales de cada decreto; se indexan
// por UMA del año / UMA del año del decreto).
// ----------------------------------------------------------------------------

/** 1997 → jun-2009: 5.5% del SMG-DF de jul-1997 = $1.45/día, TODOS los salarios. */
export const CS_1997_DIARIA = 1.45;
export const CS_1997_ANIO = 1997;

/** DOF 26-may-2009 → 2020: bandas en VECES SALARIO MÍNIMO, tope 15 SM.
 * [corte superior en SM, monto diario 2009]. */
export const CS_2009: Array<[number, number]> = [
  [1.0, 3.87077],
  [4.0, 3.70949],
  [7.0, 3.5482],
  [10.0, 3.38692],
  [15.0, 3.22564],
];
export const CS_2009_ANIO = 2009;

/** DOF 16-dic-2020, vigente 2021+: banda 1 = "1.00 SM" (vs salario mínimo);
 * resto en UMA. [corte superior en UMA, monto diario del decreto]. */
export const CS_2021: Array<[number, number]> = [
  [1.5, 10.0],
  [2.0, 9.25],
  [2.5, 8.5],
  [3.0, 7.75],
  [3.5, 7.0],
  [4.0, 6.25],
];
export const CS_2021_1SM = 10.75;
export const CS_2021_ANIO = 2021;
/** Transitorio 3º (desde 2023): CS para 4.01-7.09 UMA, montos menores.
 * [APROX — fuente secundaria: ~$2.45 a ~$1.00; usar promedio hasta leer el
 * transitorio en el DOF]. Impacto ínfimo: <0.5% de la aportación a esos salarios. */
export const CS_2023_4A7_APROX = 1.7;
export const CS_2023_4A7_TOPE_UMA = 7.09;

/** Tope de cotización: 25 UMAs de SBC. */
export const TOPE_SBC_UMA = 25;

/**
 * Mapa año de nacimiento → serie generacional en `siefore_precios`.
 * Nombres tal como vienen en el CSV de CONSAR (datos abiertos):
 *  - 'sb0'     = SB de Pensiones (conservadora). Recibe a 'sb 55-59' ago-24.
 *  - 'sb 1000' = SB Inicial (la más agresiva). 'sb 95-99' se escinde ago-24.
 * Verificación empírica 19-jul-2026: corr mensual sb 95-99 vs sb 1000 =
 * 0.9994 post-escisión (vs 0.74 con sb0); sb0 con retorno/vol de fondo de
 * pensiones (6.6%/4.4) y sb 1000 de fondo joven (9.1%/7.0 ≈ sb 90-94).
 */
/**
 * NOTA (fix 19-jul, dry-run 1): las series encadenadas de CONSAR llegan a
 * 1997 solo en 4 generaciones; 'sb 70-74', 'sb 80-84' y 'sb0' arrancan en
 * 2007. Pre-2007 todas las generaciones eran EL MISMO fondo (CAGRs 97-05
 * idénticos entre series), así que se encadena con la serie hermana que sí
 * tiene historia completa (empalme por nivel). Sin esto, las aportaciones
 * pre-2007 de esas generaciones quedaban sin precio y se descartaban.
 */
export function serieGeneracional(anioNacimiento: number): { serie: string; encadenaCon?: { serie: string; hasta: string } } {
  if (anioNacimiento <= 1959) return { serie: 'sb0', encadenaCon: { serie: 'sb 55-59', hasta: '2024-08' } };
  if (anioNacimiento <= 1964) return { serie: 'sb 60-64' };
  if (anioNacimiento <= 1969) return { serie: 'sb 65-69' };
  if (anioNacimiento <= 1974) return { serie: 'sb 70-74', encadenaCon: { serie: 'sb 75-79', hasta: '2006-12' } };
  if (anioNacimiento <= 1979) return { serie: 'sb 75-79' };
  if (anioNacimiento <= 1984) return { serie: 'sb 80-84', encadenaCon: { serie: 'sb 85-89', hasta: '2006-12' } };
  if (anioNacimiento <= 1989) return { serie: 'sb 85-89' };
  if (anioNacimiento <= 1994) return { serie: 'sb 90-94' };
  if (anioNacimiento <= 1999) return { serie: 'sb 95-99', encadenaCon: { serie: 'sb 1000', hasta: '2024-08' } };
  return { serie: 'sb 1000' };
}

/**
 * Curva de crecimiento salarial anual — MEDIANA del crecimiento anualizado
 * observado entre pares consecutivos de eventos salariales (reentry /
 * salary_modification, mismo trabajador y patrón) en los SISEC de la propia
 * base de El Trol (~28,000 pares, corte 19-jul-2026; n≥326/año desde 1984).
 * Uso: deflactar salarios finales hacia atrás cuando el empleo solo trae el
 * salario final (fallback 'empleos_deflactados').
 * La historia que cuenta valida la serie: hiperinflación 80s, convergencia
 * 90s (18.6% en 1992), moderación 2000s, estancamiento real 2009-2016
 * (0-1.5%) y era de recuperación del salario mínimo 2021-2024 (8-13%).
 */
export const CURVA_SALARIAL_ANUAL: Record<number, number> = {
  1985: 1.2808, 1986: 0.7243, 1987: 1.2918, 1988: 0.689, 1989: 0.2487,
  1990: 0.2851, 1991: 0.2238, 1992: 0.1858, 1993: 0.1272, 1994: 0.1186,
  1995: 0.1527, 1996: 0.204, 1997: 0.1865, 1998: 0.1678, 1999: 0.1327,
  2000: 0.1363, 2001: 0.1021, 2002: 0.0686, 2003: 0.0612, 2004: 0.0374,
  2005: 0.0419, 2006: 0.037, 2007: 0.0314, 2008: 0.0131, 2009: 0.0,
  2010: 0.0032, 2011: 0.0145, 2012: 0.0067, 2013: 0.002, 2014: 0.0083,
  2015: 0.0147, 2016: 0.0062, 2017: 0.0306, 2018: 0.0229, 2019: 0.048,
  2020: 0.0451, 2021: 0.0806, 2022: 0.1185, 2023: 0.1292, 2024: 0.1171,
  2025: 0.067, 2026: 0.067, // 2026 provisional (n chico a mitad de año): repite 2025
};

/** Inicio del SAR-92 y del RCV-97. */
export const MES_INICIO_SAR92 = '1992-05';
export const MES_INICIO_RCV97 = '1997-07';

/** Historia propia mínima (meses) para que una AFORE pueda definir canastas. */
export const MESES_MINIMOS_CANASTA = 15 * 12;
