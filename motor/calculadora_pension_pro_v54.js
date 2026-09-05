// ==========================================================================
// CALCULADORA DE PENSIÓN PRO - VERSIÓN COMPLETA v5.4
// NUEVO v5.4 — ALINEACIÓN CON MOTOR CONTRAFACTUAL v1.8 (21-jul-2026)
//   1) F2 — RETIROS POR DESEMPLEO: cuando hay semanas descontadas (SISEC),
//      se reconstruyen los retiros en los DESEMPLEOS REALES de la historia:
//      monto = max(Modalidad A: 30 días del SBC reciente topado a 10 SM;
//                  Modalidad B: min(90 días del SBC prom. últimas 250 sem,
//                                   11.5% del saldo RCV en esa fecha)),
//      cooldown de 5 años entre retiros, colocados del desempleo más reciente
//      hacia atrás sin sobre-explicar las semanas descontadas observadas
//      (residuo → el desempleo más antiguo). Cada retiro QUITA su fracción
//      del saldo RCV EN SU FECHA → el rendimiento perdido queda capturado.
//      Igual que reconstruirRetirosDesempleo() del motor v1.8.
//   2) CASTIGO PLANO TEMPORAL 10% sobre RCV97 y SAR92 estimados (mismo ajuste
//      conservador del motor v1.8; se retirará en ambos lados a la vez cuando
//      haya muestra real de saldos declarados). CASTIGO_PLANO_V54.
//   3) payload.saldos_motor (override) NO se toca: esos saldos ya vienen del
//      batch v1.8 CON F2+castigo aplicados — no se re-aplican (sin doble
//      descuento). Trazabilidad en user_data.retiros_desempleo / castigo_plano.
//   Infonavit NO se castiga (no es parte del motor contrafactual).
// ==========================================================================
// v5.3 — MOTOR DE RENDIMIENTOS GENERACIONAL (precios reales CONSAR)
//   Calibrado contra el motor contrafactual v1.6 (Compara Afore, 19-jul-2026)
//   y validado contra saldo real de estado de cuenta. Cambios:
//   1) RENDIMIENTOS POR GENERACIÓN: reemplaza los tramos planos (10%/9.3%/7.0%)
//      por la MEDIANA anual del sistema de la SIEFORE generacional del cliente
//      (tabla RENDIMIENTO_GENERACIONAL_NETO, derivada de precios de bolsa
//      CONSAR — netos de comisión — con corte 2026-06; 2026 anualizado ene-jun).
//      La generación sale del año de nacimiento (CURP). Años sin dato: serie
//      encadenada (misma regla del motor contrafactual) y como último recurso
//      los tramos v5.0. Futuro (>2026): 3% REAL, igual que v5.1 (pesos de hoy).
//   2) TASA RCV COMPLETA: se agregan cesantía OBRERA (1.125%) y ESTATAL
//      (0.225%, derogada desde 2023) que faltaban (v5.2 usaba solo 2%+3.15%),
//      y la cesantía PATRONAL 2023-2030 ahora usa las bandas por UMA
//      (EMPLOYER_QUOTA_HISTORY) también en el HISTÓRICO, no solo a futuro.
//   3) CUOTA SOCIAL DOF-EXACTA: 1997-2008 universal ($1.45/día de 1997
//      indexado); 2009-2020 bandas por veces SM (DOF 26-may-2009);
//      2021+ bandas por UMA con monto especial 1 SM; 2023+ extendida a
//      ≤7.09 UMA (~$1.7 indexado). Reemplaza la aproximación 0.063*UMA.
//   4) INTERPOLACIÓN SALARIAL EN EL DAILY MAP DE EVENTOS: dentro de cada
//      empleo sin salary_modification, el salario se interpola geométricamente
//      del salario de ALTA al de BAJA (o al salario actual del historial para
//      el empleo activo). Con salary_modification se mantienen los escalones
//      exactos. Antes: plano entre evento y evento.
//   5) OVERRIDE OPCIONAL payload.saldos_motor = { rcv97, sar92 }: si el flujo
//      ya trae los saldos del motor contrafactual (calculo_pensional.
//      contrafactual), se usan directo y NO se re-estiman (máxima precisión).
//   6) Fixes menores: UMA 2021 = 89.62 (oficial; decía 89.52), UMA 2025 =
//      113.14 (decía 113.13), y en Ley 97 umaActual = UMA del año en curso
//      (usaba 2025 fijo).
//   Nada del resto de la calculadora (URV, PMG, Mod 40, retroactivos,
//   conservación de derechos, escenarios) se modificó.
// ==========================================================================
// NUEVO v5.2 — FIX ÚLTIMO SALARIO REGISTRADO: el salario del empleo ACTIVO
//   (end_date null) manda sobre eventos de baja de otros patrones con fecha
//   posterior; múltiples patrones activos se acumulan topados a 25 UMA.
// INCLUYE: CORRECCIÓN DE ACUMULACIÓN FUTURA LEY 97 EN VALOR PRESENTE
// INCLUYE: ACTUALIZACIÓN Y RECARGOS PARA MODALIDAD 40 RETROACTIVA
// INCLUYE: VALIDACIÓN ESTRICTA EDAD MÍNIMA (60 AÑOS) EN RETROACTIVO FUTURO
// INCLUYE: PROYECCIÓN DE SALDOS (INFONAVIT, SAR92, RCV97) Y DESGLOSE PLANO
// INCLUYE: LÓGICA DINÁMICA DE COSTOS MOD 10 / MOD 40 REGLA DE 5 AÑOS
// INCLUYE: ALINEACIÓN ESTRICTA DE ESQUEMA JSON PARA TODOS LOS ESCENARIOS
// INCLUYE: ESTIMACIÓN DE COSTO DE PROYECTO RETROACTIVO (30%)
// INCLUYE: VARIABLE DE GAP EN AÑOS EN USER_DATA
// INCLUYE: REEMPLAZO DE ESCENARIO MÁXIMO POR RETROACTIVO FUTURO CUANDO APLICA
// INCLUYE: EDAD DINAMICA EN ESCENARIO BASE
// INCLUYE: BLOQUEO RETROACTIVO POR MOD40 VENCIDA COMO ÚLTIMO TRABAJO
// INCLUYE: SALARIO PROMEDIO DE LAS ÚLTIMAS 250 SEMANAS ACTUALES EN USER_DATA
// INCLUYE: RESOLUCIÓN ROBUSTA DE NOMBRE EN USER_DATA (multi-source fallback)
// ==========================================================================
// NUEVO v5.0 — MOTOR DE RENDIMIENTOS CALIBRADO CON DATOS CONSAR/DOF/INFONAVIT
// NUEVO v5.1 — RESULTADOS EN PESOS DE HOY (VALOR PRESENTE) + URV ACTUARIAL
// ==========================================================================
const MINIMUM_WAGE_HISTORY = {
    2026: 315.04, 2025: 278.80, 2024: 248.93, 2023: 207.44, 2022: 172.87,
    2021: 141.7, 2020: 123.22, 2019: 102.68, 2018: 88.36,
    2017: 80.04, 2016: 73.04, 2015: 70.1, 2014: 67.29,
    2013: 64.76, 2012: 62.33, 2011: 59.82, 2010: 57.46,
    2009: 54.8, 2008: 52.59, 2007: 50.57, 2006: 48.67,
    2005: 46.8, 2004: 45.24, 2003: 43.65, 2002: 42.15,
    2001: 40.35, 2000: 37.9, 1999: 34.45, 1998: 30.2,
    1997: 26.45, 1996: 22.6, 1995: 18.3, 1994: 15.27,
    1993: 14.27, 1992: 13.33, 1991: 11.90, 1990: 10.08,
    1989: 9.16, 1988: 8.00, 1987: 6.47, 1986: 2.06
};
const UMA_HISTORY = {
    2026: 117.35, 2025: 113.14, 2024: 108.57, 2023: 103.74, 2022: 96.22,
    2021: 89.62, 2020: 86.88, 2019: 84.49, 2018: 80.6,
    2017: 75.49, 2016: 73.04, 2015: 70.65, 2014: 69.20,
    2013: 66.42, 2012: 64.00, 2011: 61.60, 2010: 59.43,
    2009: 56.99, 2008: 54.94, 2007: 51.64, 2006: 49.75,
    2005: 47.76, 2004: 46.41, 2003: 44.01, 2002: 42.35,
    2001: 40.12, 2000: 38.20, 1999: 35.07, 1998: 31.01,
    1997: 26.26
};
const INPC_HISTORY = {
    "2020-01": 106.447, "2020-02": 106.889, "2020-03": 106.838, "2020-04": 105.755, "2020-05": 106.162, "2020-06": 106.743, "2020-07": 107.444, "2020-08": 107.867, "2020-09": 108.114, "2020-10": 108.774, "2020-11": 108.856, "2020-12": 109.271,
    "2021-01": 110.210, "2021-02": 110.907, "2021-03": 111.824, "2021-04": 112.190, "2021-05": 112.419, "2021-06": 113.018, "2021-07": 113.687, "2021-08": 113.899, "2021-09": 114.601, "2021-10": 115.561, "2021-11": 116.884, "2021-12": 117.308,
    "2022-01": 118.002, "2022-02": 118.984, "2022-03": 120.158, "2022-04": 120.805, "2022-05": 121.020, "2022-06": 122.044, "2022-07": 122.948, "2022-08": 123.803, "2022-09": 124.570, "2022-10": 125.276, "2022-11": 125.997, "2022-12": 126.478,
    "2023-01": 127.336, "2023-02": 128.046, "2023-03": 128.389, "2023-04": 128.363, "2023-05": 128.084, "2023-06": 128.214, "2023-07": 128.830, "2023-08": 129.176, "2023-09": 129.752, "2023-10": 130.251, "2023-11": 131.082, "2023-12": 131.815,
    "2024-01": 132.986, "2024-02": 133.109, "2024-03": 133.493, "2024-04": 133.763, "2024-05": 133.511, "2024-06": 134.020, "2024-07": 135.426, "2024-08": 135.440, "2024-09": 135.510, "2024-10": 136.250, "2024-11": 137.050, "2024-12": 137.890,
    "2025-01": 138.900, "2025-02": 139.600, "2025-03": 140.200, "2025-04": 140.700, "2025-05": 141.100, "2025-06": 141.600, "2025-07": 142.200, "2025-08": 142.800, "2025-09": 143.400, "2025-10": 144.000, "2025-11": 144.600, "2025-12": 145.200
};
const PMG_DATA = {
    2029: 12200, 2028: 11800, 2027: 11200, 2026: 10635,
    2025: 9412, 2024: 8758, 2023: 7639, 2022: 6863,
    2021: 6040, 2020: 5417, 2019: 4643, 2018: 4187,
    2017: 4050, 2016: 3820, 2015: 3791, 2014: 3715,
    2013: 3724
};
const PMG_TABLE_FULL = [
    { min: 1.00, max: 1.99, ages: [2622, 2660, 2697, 2734, 2772, 2809], inc: 90 },
    { min: 2.00, max: 2.99, ages: [3409, 3457, 3506, 3555, 3604, 3652], inc: 126 },
    { min: 3.00, max: 3.99, ages: [4195, 4266, 4315, 4375, 4435, 4495], inc: 150 },
    { min: 4.00, max: 4.99, ages: [4982, 5053, 5124, 5196, 5267, 5338], inc: 180 },
    { min: 5.00, max: 99.9, ages: [5769, 5851, 5933, 6016, 6098, 6181], inc: 210 }
];
const EMPLOYER_QUOTA_HISTORY = [
    { min: 1.00, max: 1.50, rates: [3.281,3.413,3.544,3.676,3.807,3.939,4.070,4.202] },
    { min: 1.51, max: 2.00, rates: [3.575,4.000,4.426,4.851,5.276,5.701,6.126,6.552] },
    { min: 2.01, max: 2.50, rates: [3.751,4.353,4.954,5.556,6.157,6.759,7.360,7.962] },
    { min: 2.51, max: 3.00, rates: [3.869,4.588,5.307,6.026,6.745,7.464,8.183,8.902] },
    { min: 3.01, max: 3.50, rates: [3.953,4.756,5.559,6.361,7.164,7.967,8.770,9.573] },
    { min: 3.51, max: 4.00, rates: [4.016,4.882,5.747,6.613,7.479,8.345,9.211,10.077] },
    { min: 4.01, max: Infinity, rates: [4.241,5.331,6.422,7.513,8.603,9.694,10.784,11.875] }
];
const MODALITY_10_RATES = [
    { cap: 249, rate: 22.66, inc: 0.43 }, { cap: 271, rate: 21.93, inc: 0.60 },
    { cap: 326, rate: 20.81, inc: 0.72 }, { cap: 380, rate: 20.22, inc: 0.80 },
    { cap: 434, rate: 19.78, inc: 0.87 }, { cap: 543, rate: 19.43, inc: 1.09 },
    { cap: 651, rate: 18.90, inc: 1.09 }, { cap: 760, rate: 18.52, inc: 1.09 },
    { cap: 977, rate: 18.02, inc: 1.09 }, { cap: 1086, rate: 17.84, inc: 1.09 },
    { cap: 1411, rate: 17.47, inc: 1.09 }, { cap: 1846, rate: 17.18, inc: 1.09 },
    { cap: 2280, rate: 17.01, inc: 1.09 }, { cap: Infinity, rate: 16.89, inc: 1.09 }
];
// ==========================================================================
// TABLAS Y SUPUESTOS DE RENDIMIENTO (CONSAR / DOF / INFONAVIT / INEGI)
// ==========================================================================
const INFLACION_ANUAL = {
    1992: 0.1194, 1993: 0.0801, 1994: 0.0705, 1995: 0.5197, 1996: 0.2770, 1997: 0.1572,
    1998: 0.1861, 1999: 0.1232, 2000: 0.0896, 2001: 0.0440, 2002: 0.0570, 2003: 0.0398,
    2004: 0.0519, 2005: 0.0333, 2006: 0.0405, 2007: 0.0376, 2008: 0.0653, 2009: 0.0357,
    2010: 0.0440, 2011: 0.0382, 2012: 0.0357, 2013: 0.0397, 2014: 0.0408, 2015: 0.0213,
    2016: 0.0336, 2017: 0.0677, 2018: 0.0483, 2019: 0.0283, 2020: 0.0315, 2021: 0.0736,
    2022: 0.0782, 2023: 0.0466, 2024: 0.0421, 2025: 0.0369
};
const INFONAVIT_RENDIMIENTO = {
    2018: 0.0638, 2019: 0.0732, 2020: 0.0600, 2021: 0.0736,
    2022: 0.0782, 2023: 0.0633, 2024: 0.0698, 2025: 0.0500
};
// ==========================================================================
// NUEVO v5.3 — RENDIMIENTO NETO ANUAL POR SIEFORE GENERACIONAL
// Mediana del sistema (10 AFOREs) del retorno anual dic/dic del precio de
// bolsa CONSAR (ya neto de comisiones), por serie generacional. Derivada de
// la base siefore_precios del proyecto Compara Afore (660k precios oficiales,
// corte 2026-06). 1997 = jul-dic anualizado. 2026 = ene-jun anualizado.
// Pre-2008 las series comparten la historia de las SIEFOREs básicas (por eso
// los valores coinciden). Años sin dato en una serie → serie encadenada
// (SERIE_ENCADENA_V53, mismas reglas del motor contrafactual) → tramos v5.0.
// ==========================================================================
const RENDIMIENTO_GENERACIONAL_NETO = {
    "sb0":      { 2008: 0.0404, 2009: 0.0822, 2010: 0.0859, 2011: 0.0692, 2012: 0.1103, 2013: -0.0020, 2014: 0.0729, 2015: 0.0059, 2016: 0.0335, 2017: 0.0594, 2018: 0.0690, 2019: 0.0729, 2020: 0.0827, 2021: 0.0396, 2022: 0.0399, 2023: 0.0760, 2024: 0.0632, 2025: 0.1403, 2026: 0.0817 },
    "sb 55-59": { 1997: 0.2195, 1998: 0.2554, 1999: 0.2752, 2000: 0.1718, 2001: 0.1783, 2002: 0.1104, 2003: 0.1078, 2004: 0.0702, 2005: 0.1110, 2006: 0.1143, 2007: 0.0540, 2008: 0.0403, 2009: 0.0821, 2010: 0.0859, 2011: 0.0691, 2012: 0.1102, 2013: -0.0021, 2014: 0.0729, 2015: 0.0098, 2016: 0.0408, 2017: 0.0672, 2018: 0.0370, 2019: 0.1141, 2020: 0.1163, 2021: 0.0354, 2022: 0.0073, 2023: 0.0734, 2024: 0.0447 },
    "sb 60-64": { 1997: 0.2195, 1998: 0.2554, 1999: 0.2752, 2000: 0.1718, 2001: 0.1783, 2002: 0.1104, 2003: 0.1078, 2004: 0.0702, 2005: 0.1182, 2006: 0.1367, 2007: 0.0491, 2008: -0.0100, 2009: 0.1033, 2010: 0.1152, 2011: 0.0581, 2012: 0.1298, 2013: 0.0199, 2014: 0.0889, 2015: 0.0169, 2016: 0.0304, 2017: 0.0819, 2018: 0.0022, 2019: 0.1416, 2020: 0.1239, 2021: 0.0585, 2022: -0.0203, 2023: 0.0737, 2024: 0.0690, 2025: 0.1485, 2026: 0.0889 },
    "sb 65-69": { 1997: 0.2195, 1998: 0.2554, 1999: 0.2752, 2000: 0.1718, 2001: 0.1783, 2002: 0.1104, 2003: 0.1078, 2004: 0.0702, 2005: 0.1182, 2006: 0.1367, 2007: 0.0491, 2008: -0.0100, 2009: 0.1033, 2010: 0.1152, 2011: 0.0581, 2012: 0.1298, 2013: 0.0199, 2014: 0.0889, 2015: 0.0169, 2016: 0.0304, 2017: 0.0819, 2018: 0.0022, 2019: 0.1386, 2020: 0.1300, 2021: 0.0623, 2022: -0.0326, 2023: 0.0836, 2024: 0.0877, 2025: 0.1523, 2026: 0.1047 },
    "sb 70-74": { 2008: -0.0148, 2009: 0.1112, 2010: 0.1202, 2011: 0.0583, 2012: 0.1363, 2013: 0.0233, 2014: 0.0902, 2015: 0.0181, 2016: 0.0289, 2017: 0.0833, 2018: -0.0003, 2019: 0.1418, 2020: 0.1317, 2021: 0.0686, 2022: -0.0374, 2023: 0.0808, 2024: 0.0916, 2025: 0.1591, 2026: 0.1162 },
    "sb 75-79": { 1997: 0.2195, 1998: 0.2554, 1999: 0.2752, 2000: 0.1718, 2001: 0.1783, 2002: 0.1104, 2003: 0.1078, 2004: 0.0702, 2005: 0.1182, 2006: 0.1367, 2007: 0.0491, 2008: -0.0161, 2009: 0.1167, 2010: 0.1264, 2011: 0.0597, 2012: 0.1434, 2013: 0.0234, 2014: 0.0914, 2015: 0.0191, 2016: 0.0279, 2017: 0.0847, 2018: -0.0030, 2019: 0.1466, 2020: 0.1352, 2021: 0.0734, 2022: -0.0482, 2023: 0.0856, 2024: 0.0930, 2025: 0.1659, 2026: 0.1194 },
    "sb 80-84": { 2008: -0.0283, 2009: 0.1237, 2010: 0.1383, 2011: 0.0519, 2012: 0.1619, 2013: 0.0284, 2014: 0.0933, 2015: 0.0225, 2016: 0.0322, 2017: 0.0861, 2018: -0.0083, 2019: 0.1476, 2020: 0.1407, 2021: 0.0852, 2022: -0.0609, 2023: 0.0905, 2024: 0.0960, 2025: 0.1702, 2026: 0.1256 },
    "sb 85-89": { 1997: 0.2195, 1998: 0.2554, 1999: 0.2752, 2000: 0.1718, 2001: 0.1783, 2002: 0.1104, 2003: 0.1078, 2004: 0.0702, 2005: 0.1182, 2006: 0.1367, 2007: 0.0491, 2008: -0.0315, 2009: 0.1277, 2010: 0.1424, 2011: 0.0510, 2012: 0.1692, 2013: 0.0294, 2014: 0.0951, 2015: 0.0241, 2016: 0.0347, 2017: 0.0874, 2018: -0.0110, 2019: 0.1543, 2020: 0.1475, 2021: 0.0834, 2022: -0.0634, 2023: 0.0899, 2024: 0.0961, 2025: 0.1738, 2026: 0.1319 },
    "sb 90-94": { 1997: 0.2195, 1998: 0.2554, 1999: 0.2752, 2000: 0.1718, 2001: 0.1783, 2002: 0.1104, 2003: 0.1078, 2004: 0.0702, 2005: 0.1182, 2006: 0.1367, 2007: 0.0491, 2008: -0.0315, 2009: 0.1277, 2010: 0.1424, 2011: 0.0510, 2012: 0.1692, 2013: 0.0294, 2014: 0.0951, 2015: 0.0241, 2016: 0.0347, 2017: 0.0874, 2018: -0.0110, 2019: 0.1500, 2020: 0.1452, 2021: 0.0897, 2022: -0.0635, 2023: 0.0899, 2024: 0.0965, 2025: 0.1755, 2026: 0.1321 },
    "sb 95-99": { 2025: 0.1755, 2026: 0.1284 },
    "sb 1000":  { 1997: 0.2195, 1998: 0.2554, 1999: 0.2752, 2000: 0.1718, 2001: 0.1783, 2002: 0.1104, 2003: 0.1078, 2004: 0.0702, 2005: 0.1182, 2006: 0.1367, 2007: 0.0491, 2008: -0.0315, 2009: 0.1277, 2010: 0.1424, 2011: 0.0510, 2012: 0.1692, 2013: 0.0294, 2014: 0.0951, 2015: 0.0241, 2016: 0.0347, 2017: 0.0874, 2018: -0.0110, 2019: 0.1500, 2020: 0.1349, 2021: 0.0847, 2022: -0.0621, 2023: 0.0911, 2024: 0.0931, 2025: 0.1761, 2026: 0.1299 }
};
// Serie encadenada para años sin dato propio (mismas reglas del motor contrafactual)
const SERIE_ENCADENA_V53 = {
    "sb0": "sb 55-59",
    "sb 70-74": "sb 75-79",
    "sb 80-84": "sb 85-89",
    "sb 95-99": "sb 1000"
};
const ULTIMO_ANIO_PRECIOS = 2026; // corte de la tabla generacional (precios a jun-2026)
// Serie generacional por año de nacimiento (CONSAR)
function getSerieGeneracionalPorAnio(anioNacimiento) {
    if (anioNacimiento <= 1959) return "sb0";
    if (anioNacimiento <= 1964) return "sb 60-64";
    if (anioNacimiento <= 1969) return "sb 65-69";
    if (anioNacimiento <= 1974) return "sb 70-74";
    if (anioNacimiento <= 1979) return "sb 75-79";
    if (anioNacimiento <= 1984) return "sb 80-84";
    if (anioNacimiento <= 1989) return "sb 85-89";
    if (anioNacimiento <= 1994) return "sb 90-94";
    if (anioNacimiento <= 1999) return "sb 95-99";
    return "sb 1000";
}
const SUPUESTOS_RENDIMIENTO = {
    sar92_en_concentradora: false,
    inflacion_futura: 0.04,
    rendimiento_futuro_siefore: 0.03,
    // 0% REAL hacia adelante (regla de negocio, Raul 5-sep-2026): el Infonavit
    // ajusta el saldo en linea con la inflacion (~4% nominal), asi que en pesos
    // de hoy no gana nada. Antes se le asumia 1% de premio real.
    premio_infonavit_futuro: 0
};
// ==========================================================================
// v5.4 — PARÁMETROS F2 (retiros por desempleo) + CASTIGO PLANO
// Espejo de las constantes del motor contrafactual v1.8 (pension-core).
// CASTIGO_PLANO_V54: ajuste conservador temporal sobre RCV97 y SAR92
// ESTIMADOS (los saldos_motor ya lo traen). Quitar aquí y en el motor A LA VEZ.
// ==========================================================================
const CASTIGO_PLANO_V54 = 0.10;
const RETIRO_TOPE_PCT = 0.115;      // 11.5% del saldo RCV (tope Modalidad B)
const RETIRO_DIAS_A = 30;           // Modalidad A: 30 días del SBC reciente
const RETIRO_DIAS_B = 90;           // Modalidad B: 90 días del SBC prom. 250 sem
const RETIRO_TOPE_SM_A = 10;        // Modalidad A topada a 10 salarios mínimos
const RETIRO_COOLDOWN_MESES = 60;   // 5 años entre retiros (desde la fecha del retiro)
const RETIRO_MIN_GAP_MESES = 2;     // desempleo mínimo para calificar (≈46 días)
const RETIRO_VENTANA_SBC_MESES = 58;// ≈250 semanas para el salario promedio
// v5.0 (se conserva como FALLBACK cuando la tabla generacional no tiene el
// año/serie): tasas nominales netas por tramo derivadas de anclas CONSAR.
function getRendimientoSieforeNeto(year) {
    if (year <= 2006) return 0.100;
    if (year <= 2012) return 0.093;
    if (year <= 2025) return 0.070;
    return SUPUESTOS_RENDIMIENTO.rendimiento_futuro_siefore;
}
// v5.3: rendimiento neto por año para la GENERACIÓN del cliente.
// Futuro (> corte de precios): tasa REAL (resultados en pesos de hoy, v5.1).
function getRendimientoSieforeNetoGen(year, serie) {
    if (year > ULTIMO_ANIO_PRECIOS) return SUPUESTOS_RENDIMIENTO.rendimiento_futuro_siefore;
    const propia = RENDIMIENTO_GENERACIONAL_NETO[serie];
    if (propia && propia[year] !== undefined) return propia[year];
    const enc = SERIE_ENCADENA_V53[serie];
    const encadenada = enc ? RENDIMIENTO_GENERACIONAL_NETO[enc] : null;
    if (encadenada && encadenada[year] !== undefined) return encadenada[year];
    return getRendimientoSieforeNeto(year);
}
function getInflacionAnualSupuesta(year) {
    if (INFLACION_ANUAL[year] !== undefined) return INFLACION_ANUAL[year];
    return SUPUESTOS_RENDIMIENTO.inflacion_futura;
}
function getRendimientoSar92Banxico(year) {
    return (1 + getInflacionAnualSupuesta(year)) * 1.02 - 1;
}
function getRendimientoInfonavit(year) {
    if (INFONAVIT_RENDIMIENTO[year] !== undefined) return INFONAVIT_RENDIMIENTO[year];
    if (year <= 2017) return getInflacionAnualSupuesta(year);
    return SUPUESTOS_RENDIMIENTO.premio_infonavit_futuro;
}
// v5.3: tasa RCV COMPLETA por año y salario (retiro 2% + cesantía patronal +
// cesantía obrera 1.125% + estatal 0.225% hasta 2022; desde 2023 la patronal
// sube por bandas de UMA — DOF 16-dic-2020 — y la estatal queda derogada).
function getTasaRcvTotal(year, dailySalary) {
    if (year < 2023) return 0.02 + 0.0315 + 0.01125 + 0.00225; // 6.5% clásico
    const sm = getExtendedMinWage(year);
    let patronal = null;
    if (dailySalary <= sm * 1.001) {
        patronal = 0.0315; // 1 SM: cuota fija
    } else {
        const uma = getExtendedUma(year);
        const veces = uma > 0 ? dailySalary / uma : 0;
        for (const row of EMPLOYER_QUOTA_HISTORY) {
            if (veces >= row.min && veces <= row.max) {
                const idx = Math.min(Math.max(year - 2023, 0), row.rates.length - 1);
                patronal = row.rates[idx] / 100;
                break;
            }
        }
        if (patronal === null) {
            const last = EMPLOYER_QUOTA_HISTORY[EMPLOYER_QUOTA_HISTORY.length - 1];
            patronal = last.rates[Math.min(Math.max(year - 2023, 0), last.rates.length - 1)] / 100;
        }
    }
    return 0.02 + patronal + 0.01125;
}
// ==========================================================================
// TABLA URV (Unidad de Renta Vitalicia) por EDAD y SEXO (v5.1, sin cambios)
// ==========================================================================
const URV_TABLE = {
    60: { H: 13.0321, M: 14.3459 }, 61: { H: 12.8142, M: 14.1125 },
    62: { H: 12.5923, M: 13.8718 }, 63: { H: 12.3665, M: 13.6239 },
    64: { H: 12.1370, M: 13.3688 }, 65: { H: 11.9039, M: 13.1064 },
    66: { H: 11.6674, M: 12.8368 }, 67: { H: 11.4275, M: 12.5600 },
    68: { H: 11.1845, M: 12.2762 }, 69: { H: 10.9384, M: 11.9855 },
    70: { H: 10.6897, M: 11.6880 }, 71: { H: 10.4385, M: 11.3841 },
    72: { H: 10.1848, M: 11.0738 }, 73: { H: 9.9291,  M: 10.7576 },
    74: { H: 9.6717,  M: 10.4358 }, 75: { H: 9.4128,  M: 10.1087 },
    76: { H: 9.1526,  M: 9.7768  }, 77: { H: 8.8915,  M: 9.4407  },
    78: { H: 8.6298,  M: 9.1009  }, 79: { H: 8.3678,  M: 8.7579  },
    80: { H: 8.1059,  M: 8.4126  }, 81: { H: 7.8443,  M: 8.0656  },
    82: { H: 7.5835,  M: 7.7177  }, 83: { H: 7.3238,  M: 7.3697  },
    84: { H: 7.0656,  M: 7.0226  }, 85: { H: 6.8093,  M: 6.6772  },
    86: { H: 6.5552,  M: 6.3345  }, 87: { H: 6.3038,  M: 5.9956  },
    88: { H: 6.0553,  M: 5.6613  }, 89: { H: 5.8102,  M: 5.3329  },
    90: { H: 5.5688,  M: 5.0113  }
};
function getURV(age, sexo) {
    const a = Math.max(60, Math.min(90, Math.floor(age)));
    const row = URV_TABLE[a] || URV_TABLE[60];
    const s = (String(sexo).toUpperCase() === 'M') ? 'M' : 'H';
    return row[s];
}
function factorCapitalizacion(fechaInicio, fechaFin, rateFn) {
    if (!fechaInicio || !fechaFin || fechaFin <= fechaInicio) return 1;
    let factor = 1;
    let cursor = new Date(fechaInicio);
    while (cursor < fechaFin) {
        const y = cursor.getFullYear();
        const finAno = new Date(y + 1, 0, 1);
        const tramoFin = (finAno < fechaFin) ? finAno : fechaFin;
        const dias = (tramoFin - cursor) / (1000 * 60 * 60 * 24);
        factor *= Math.pow(1 + rateFn(y), dias / 365.25);
        cursor = finAno;
    }
    return factor;
}
function makeFactorHasta(rateFn, fechaFin) {
    const cache = {};
    return (d) => {
        if (d >= fechaFin) return 1;
        const y = d.getFullYear();
        if (cache[y] === undefined) {
            cache[y] = factorCapitalizacion(new Date(y, 0, 1), fechaFin, rateFn);
        }
        const diasTranscurridos = (d - new Date(y, 0, 1)) / (1000 * 60 * 60 * 24);
        return cache[y] / Math.pow(1 + rateFn(y), diasTranscurridos / 365.25);
    };
}
const UMA_VALUE = UMA_HISTORY[2026];
const MINIMUM_WAGE_2026 = MINIMUM_WAGE_HISTORY[2026];
const MAXIMUM_CONTRIBUTION_WAGE = 25 * UMA_VALUE;
const MAX_PENSION = UMA_VALUE * 25 * 30.1;
// =========================================
// 2. HELPER FUNCTIONS
// =========================================
function parseDate(str) {
    if (!str) return null;
    const parts = str.split('T')[0].split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}
function formatDate(date) {
    if (!date) return null;
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    const year = d.getFullYear();
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return [year, month, day].join('-');
}
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}
function diffDays(date1, date2) {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round(Math.abs((date1 - date2) / oneDay));
}
function getMaxYear(historyObj) {
    return Math.max(...Object.keys(historyObj).map(Number));
}
function getExtendedUma(year) {
    const maxY = getMaxYear(UMA_HISTORY);
    if (year <= maxY) return UMA_HISTORY[year] || 0;
    let val = UMA_HISTORY[maxY];
    for (let y = maxY + 1; y <= year; y++) {
        val *= 1.04;
    }
    return parseFloat(val.toFixed(2));
}
function getExtendedMinWage(year) {
    const maxY = getMaxYear(MINIMUM_WAGE_HISTORY);
    if (year <= maxY) return MINIMUM_WAGE_HISTORY[year];
    let val = MINIMUM_WAGE_HISTORY[maxY];
    for (let y = maxY + 1; y <= year; y++) {
        val *= 1.04;
    }
    return parseFloat(val.toFixed(2));
}
function getINPC(year, month) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (INPC_HISTORY[key]) return INPC_HISTORY[key];
    const keys = Object.keys(INPC_HISTORY).sort();
    const lastKey = keys[keys.length - 1];
    const lastVal = INPC_HISTORY[lastKey];
    const [lastYear, lastMonth] = lastKey.split('-').map(Number);
    const targetDate = new Date(year, month - 1, 1);
    const lastDate = new Date(lastYear, lastMonth - 1, 1);
    const diffMonths = (targetDate.getFullYear() - lastDate.getFullYear()) * 12 + (targetDate.getMonth() - lastDate.getMonth());
    if (diffMonths <= 0) {
        return INPC_HISTORY[keys[0]];
    }
    const monthlyRate = Math.pow(1.04, 1/12) - 1;
    return lastVal * Math.pow(1 + monthlyRate, diffMonths);
}
function getMod40Rate(year) {
    if (year <= 2022) return 10.075;
    if (year === 2023) return 11.166;
    if (year === 2024) return 12.256;
    if (year === 2025) return 13.347;
    if (year === 2026) return 14.438;
    if (year === 2027) return 15.528;
    if (year === 2028) return 16.619;
    if (year === 2029) return 17.709;
    return 18.800;
}
// Costo total del proyecto retroactivo Mod 40
// Brackets de fee del despacho sobre el saldo IMSS, mas gestorias fijas
function calculateProjectCost(saldoIMSS) {
    let feePct;
    if (saldoIMSS <= 375000) feePct = 0.35;
    else if (saldoIMSS <= 750000) feePct = 0.30;
    else if (saldoIMSS <= 1000000) feePct = 0.25;
    else feePct = 0.20;
    const GESTORIAS_FIJAS = 80000;
    const fee = saldoIMSS * feePct;
    const total = saldoIMSS + fee + GESTORIAS_FIJAS;
    return {
        costo_imss: Math.round(saldoIMSS),
        costo_despacho_pct: feePct,
        costo_despacho: Math.round(fee),
        costo_gestorias: GESTORIAS_FIJAS,
        total_project_cost: Math.round(total)
    };
}
// =========================================
// 3. CLASES DE CÁLCULO
// =========================================
class Ley73PensionCalculator {
    constructor(age, SalMin250, SalCot250, SemCot, year_last_contribution) {
        this.age = age;
        this.SalMin250 = SalMin250;
        this.SalCot250 = SalCot250;
        this.SemCot = SemCot;
        this.year_last_contribution = year_last_contribution;
    }
    getFactor(ratio, table) {
        for (let i = 0; i < table.length; i++) {
            const [low, up, val] = table[i];
            if ((ratio >= low && ratio < up) || (i === table.length - 1 && ratio === up)) {
                return val;
            }
        }
        return 0;
    }
    calculatePension() {
        if (this.SemCot < 500) {
            return {
                retirementAge: this.age,
                salMin250: this.SalMin250,
                salCot250: this.SalCot250,
                contributedWeeks: this.SemCot,
                result: "Negativa de Pensión (Ley73 - <500 semanas)",
                calculatedPension: 0
            };
        }
        const ratio = this.SalMin250 > 0 ? (this.SalCot250 / this.SalMin250) : 0;
        const tableBasic = [
            [0, 1.00, 0.8000], [1.00, 1.25, 0.7711], [1.25, 1.50, 0.5818],
            [1.50, 1.75, 0.4923], [1.75, 2.00, 0.4267], [2.00, 2.25, 0.3765],
            [2.25, 2.50, 0.3368], [2.50, 2.75, 0.3048], [2.75, 3.00, 0.2783],
            [3.00, 3.25, 0.2560], [3.25, 3.50, 0.2370], [3.50, 3.75, 0.2207],
            [3.75, 4.00, 0.2065], [4.00, 4.25, 0.1939], [4.25, 4.50, 0.1829],
            [4.50, 4.75, 0.1730], [4.75, 5.00, 0.1641], [5.00, 5.25, 0.1561],
            [5.25, 5.50, 0.1488], [5.50, 5.75, 0.1422], [5.75, 6.00, 0.1362],
            [6.00, Infinity, 0.1300]
        ];
        const fBasic = this.getFactor(ratio, tableBasic);
        const basicAmt = this.SalCot250 * 1.11 * 365 * fBasic;
        const tableInc = [
            [0, 1.00, 0.0056], [1.00, 1.25, 0.0081], [1.25, 1.50, 0.0118],
            [1.50, 1.75, 0.0143], [1.75, 2.00, 0.0162], [2.00, 2.25, 0.0176],
            [2.25, 2.50, 0.0187], [2.50, 2.75, 0.0196], [2.75, 3.00, 0.0203],
            [3.00, 3.25, 0.0210], [3.25, 3.50, 0.0215], [3.50, 3.75, 0.0220],
            [3.75, 4.00, 0.0224], [4.00, 4.25, 0.0227], [4.25, 4.50, 0.0230],
            [4.50, 4.75, 0.0233], [4.75, 5.00, 0.0236], [5.00, 5.25, 0.0238],
            [5.25, 5.50, 0.0240], [5.50, 5.75, 0.0242], [5.75, 6.00, 0.0243],
            [6.00, Infinity, 0.0245]
        ];
        const fInc = this.getFactor(ratio, tableInc);
        const extraWeeks = (this.SemCot - 500) % 52;
        const add = (extraWeeks >= 26) ? 1 : (extraWeeks >= 13 ? 0.5 : 0);
        const blocks = Math.floor((this.SemCot - 500) / 52);
        const incAmt = this.SalCot250 * 1.11 * 365 * (blocks + add) * fInc;
        const allow = (basicAmt + incAmt) * 0.15;
        let ageAdj = 1.0;
        if (this.age < 60) ageAdj = 0;
        else if (this.age < 60.5) ageAdj = 0.75;
        else if (this.age < 61.5) ageAdj = 0.80;
        else if (this.age < 62.5) ageAdj = 0.85;
        else if (this.age < 63.5) ageAdj = 0.90;
        else if (this.age < 64.5) ageAdj = 0.95;
        const monthly = ((basicAmt + incAmt + allow) * ageAdj) / 12;
        const maxPmgYear = getMaxYear(PMG_DATA);
        const pmgYear = PMG_DATA[this.year_last_contribution] ? this.year_last_contribution : maxPmgYear;
        const minPens = PMG_DATA[pmgYear];
        let final = Math.max(minPens, Math.min(monthly, MAX_PENSION));
        final = Math.round(final);
        return {
            retirementAge: this.age,
            salMin250: this.SalMin250,
            salCot250: this.SalCot250,
            contributedWeeks: this.SemCot,
            basicAmount: basicAmt,
            incrementAmount: incAmt,
            allowances: allow,
            ageAdjustment: ageAdj,
            calculatedPension: final
        };
    }
}
class PensionCalculator {
    constructor(curp, employmentData, nombre, email, opts) {
        this.curp = curp;
        this.nombre_raw = nombre;
        this.email = email;
        // v5.3: saldos del motor contrafactual (opcionales) — si vienen, mandan.
        this.saldos_motor = (opts && opts.saldos_motor) || null;
        this.employment_history_data = employmentData.data || {};
        this.nombre = this.resolveName(nombre, this.employment_history_data, email, curp);
        this.user_data = this.extractUserData();
        // v5.3: serie generacional del cliente (por año de nacimiento) y su
        // función de rendimiento anual — se usa en RCV97, SAR92 post-97 y
        // en TODAS las proyecciones de saldos Siefore.
        this.serie_gen = getSerieGeneracionalPorAnio(parseInt(this.user_data.birth_date.slice(0, 4)));
        this.rateSiefore = (y) => getRendimientoSieforeNetoGen(y, this.serie_gen);
        this.daily_map = this.buildDailyMapFromEvents();
        if (!this.daily_map || Object.keys(this.daily_map).length === 0) {
            this.daily_map = this.buildDailyMapFromHistory();
        }
        this.simulation_results = {};
        this.scenarios = [];
    }
    resolveName(nombreInput, employmentData, email, curp) {
        // Cadena de fallbacks para nombre. Devuelve el primer valor utilizable.
        // Considera "Usuario" / "usuario" / "" / null / "undefined" como NO utilizable.
        const isPlaceholder = (v) => {
            if (v === null || v === undefined) return true;
            const s = String(v).trim();
            if (s === "") return true;
            const lower = s.toLowerCase();
            return ["usuario", "user", "undefined", "null", "n/a", "na", "-", "cliente"].includes(lower);
        };
        const titleCase = (s) => {
            return String(s).toLowerCase()
                .split(/\s+/).filter(Boolean)
                .map(w => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ");
        };
        // 1) Input explícito del payload (this.nombre desde N8N)
        if (!isPlaceholder(nombreInput)) {
            return String(nombreInput).trim();
        }
        // 2) employment_info.nombre / nombre_completo (a veces SISEC lo trae)
        const ei = (employmentData && employmentData.employment_info) || {};
        const eiCandidates = [ei.nombre, ei.nombre_completo, ei.full_name, ei.name];
        for (const c of eiCandidates) {
            if (!isPlaceholder(c)) return titleCase(c);
        }
        // 3) Top-level employmentData.nombre / name (algunos pipelines lo ponen aquí)
        const topCandidates = [
            employmentData && employmentData.nombre,
            employmentData && employmentData.name,
            employmentData && employmentData.full_name
        ];
        for (const c of topCandidates) {
            if (!isPlaceholder(c)) return titleCase(c);
        }
        // 4) Username del email (antes de @)
        if (email && typeof email === "string" && email.includes("@")) {
            const userPart = email.split("@")[0]
                .replace(/[._\-+]/g, " ")
                .replace(/\d+/g, "")
                .trim();
            if (!isPlaceholder(userPart)) return titleCase(userPart);
        }
        // 5) Último recurso: identificar por CURP (primeras 4 letras + año)
        if (curp && typeof curp === "string" && curp.length >= 6) {
            const initials = curp.substring(0, 4).toUpperCase();
            return `Cliente ${initials}`;
        }
        return "Cliente";
    }
    extractUserData() {
        let yy = parseInt(this.curp.substring(4, 6));
        yy = yy < 30 ? 2000 + yy : 1900 + yy;
        const mm = parseInt(this.curp.substring(6, 8)) - 1;
        const dd = parseInt(this.curp.substring(8, 10));
        const birthDate = new Date(yy, mm, dd);
        const now = new Date();
        const age = (now - birthDate) / (1000 * 60 * 60 * 24 * 365.25);
        const ei = this.employment_history_data.employment_info || {};
        const cw = parseInt(ei.quoted_weeks || 0);
        const dw = parseInt(ei.discounted_weeks || 0);
        const rw = parseInt(ei.reintegrated_weeks || 0);
        const status = ei.status || "";
        const nss = ei.nss;
        const hist = this.employment_history_data.employment_history || [];
        const valid = hist.filter(j => j.start_date);
        let ley73 = false;
        if (valid.length > 0) {
            const firstDate = new Date(Math.min(...valid.map(j => parseDate(j.start_date))));
            ley73 = firstDate < new Date(1997, 6, 1);
        }
        valid.sort((a, b) => parseDate(b.start_date) - parseDate(a.start_date));
        let lastSal = 0;
        let firstContribDate = null;
        let firstEmployer = null;
        if (valid.length > 0) {
            const firstJob = valid[valid.length - 1];
            firstContribDate = firstJob.start_date;
            firstEmployer = firstJob.employer;
        }
        const events = this.employment_history_data.employment_events || [];
        // ==================================================================
        // v5.2 FIX — ÚLTIMO SALARIO REGISTRADO
        // Antes: se tomaba el evento más reciente con salario > 0. Si la BAJA
        // de un patrón anterior era posterior al alta del empleo VIGENTE
        // (p.ej. baja 2014-11-17 a $797.87 vs empleo activo desde 2014-11-01
        // a $2,932.75), la baja pisaba el salario real del empleo activo.
        // Ahora: 1) manda el salario de los empleos ACTIVOS (end_date null);
        // si hay varios patrones simultáneos el SBC se acumula, topado a 25 UMA.
        // 2) Si el historial no marca activos, se deducen de los eventos (último
        // evento por registro patronal que no sea baja = empleo vigente).
        // 3) Sin empleo vigente: evento más reciente con salario (como antes).
        // ==================================================================
        let salariosActivos = valid
            .filter(j => !j.end_date && parseFloat(j.base_salary || 0) > 0)
            .map(j => parseFloat(j.base_salary));
        if (salariosActivos.length === 0 && events.length > 0) {
            const lastEventByReg = {};
            for (const ev of events) {
                const key = ev.registro_patronal || ev.employer || "Unknown";
                if (!lastEventByReg[key] || parseDate(ev.event_date) >= parseDate(lastEventByReg[key].event_date)) {
                    lastEventByReg[key] = ev;
                }
            }
            for (const key in lastEventByReg) {
                const ev = lastEventByReg[key];
                const t = (ev.event_type || "").toLowerCase();
                const esBaja = t.includes("discharge") || t.includes("baja");
                if (!esBaja && parseFloat(ev.base_salary || 0) > 0) {
                    salariosActivos.push(parseFloat(ev.base_salary));
                }
            }
        }
        if (salariosActivos.length > 0) {
            const sumaActivos = salariosActivos.reduce((a, b) => a + b, 0);
            lastSal = Math.min(sumaActivos, 25 * getExtendedUma(new Date().getFullYear()));
        } else if (events.length > 0) {
            const sortedEvents = [...events].sort((a,b) => parseDate(b.event_date) - parseDate(a.event_date));
            for(const ev of sortedEvents) {
                if (ev.base_salary && ev.base_salary > 0) {
                    lastSal = ev.base_salary;
                    break;
                }
            }
        }
        if (lastSal === 0 && valid.length > 0) {
            lastSal = parseFloat(valid[0].base_salary || 0);
        }
        const lastContrib = this.getLastContributionDate(valid);
        const safeNow = new Date(); safeNow.setHours(0,0,0,0);
        const safeLast = new Date(lastContrib); safeLast.setHours(0,0,0,0);
        let gap = (safeNow - safeLast) / (1000 * 60 * 60 * 24 * 365.25);
        if (gap < 0.003) gap = 0;
        const groupData = this.determineGroup(birthDate, ley73, status, gap);
        let faltanSemanas = "No";
        if (valid.length > 0 && nss && nss.length >= 4) {
             const firstJ = valid[valid.length - 1];
             const yearFirst = parseDate(firstJ.start_date).getFullYear();
             const yearNss = parseInt(nss.substring(2, 4)) >= 30 ? 1900 + parseInt(nss.substring(2,4)) : 2000 + parseInt(nss.substring(2,4));
             if (yearFirst > yearNss) faltanSemanas = "Si";
        }
        // Determinar origen del nombre para trazabilidad / auditoría
        let nameSource = "fallback_curp";
        const isPH = (v) => {
            if (v === null || v === undefined) return true;
            const s = String(v).trim().toLowerCase();
            return ["", "usuario", "user", "undefined", "null", "n/a", "na", "-", "cliente"].includes(s);
        };
        if (!isPH(this.nombre_raw)) {
            nameSource = "payload";
        } else if (!isPH(ei.nombre) || !isPH(ei.nombre_completo) || !isPH(ei.full_name) || !isPH(ei.name)) {
            nameSource = "employment_info";
        } else if (this.email && typeof this.email === "string" && this.email.includes("@")) {
            const up = this.email.split("@")[0].replace(/[._\-+]/g, " ").replace(/\d+/g, "").trim();
            if (!isPH(up)) nameSource = "email_username";
        }
        return {
            curp: this.curp, nss: nss, name: this.nombre, email: this.email,
            name_source: nameSource,
            name_raw_input: this.nombre_raw || null,
            birth_date: formatDate(birthDate), current_age: Number(age.toFixed(4)),
            contributed_weeks: cw, deducted_weeks: dw, reintegrated_weeks: rw,
            status: status, law: ley73 ? "Ley73" : "Ley97",
            last_registered_salary: lastSal, profile: groupData.group,
            "Gap ultima cotizacion": gap * 12,
            gap_ultima_cotizacion_anos: Number(gap.toFixed(2)),
            employment_history: valid,
            employment_events: events,
            faltan_semanas: faltanSemanas,
            first_contribution_date: firstContribDate,
            first_contribution_employer: firstEmployer
        };
    }
    determineGroup(bd, ley73, status, gap) {
        const law = ley73 ? "Ley73" : "Ley97";
        const emp = status === "empleado";
        const m40 = ley73 && !emp && gap <= 5;
        return { group: { groupId: 0, description: "Standard" }, law, m40 };
    }
    getLastContributionDate(hist) {
        if (!hist || hist.length === 0) return new Date();
        const dates = hist.map(j => j.end_date ? parseDate(j.end_date) : new Date());
        return new Date(Math.max(...dates));
    }
    getLastMod40EndDate() {
        const hist = this.user_data.employment_history || [];
        let maxDate = null;
        for (const job of hist) {
            const reg = job.employer_registration || "";
            if (!reg.endsWith("40")) continue;
            const ed = job.end_date ? parseDate(job.end_date) : new Date();
            if (!maxDate || ed > maxDate) {
                maxDate = ed;
            }
        }
        return maxDate;
    }
    calculateLifetimeAverageUmaRatio() {
        const hist = this.user_data.employment_history || [];
        let totalWeightedRatio = 0;
        let totalDays = 0;
        const today = new Date(); today.setHours(0,0,0,0);
        for (const job of hist) {
            const sd = parseDate(job.start_date);
            if (!sd) continue;
            const ed = job.end_date ? parseDate(job.end_date) : today;
            if (ed < sd) continue;
            const salary = parseFloat(job.base_salary || 0);
            if (salary <= 0) continue;
            const year = sd.getFullYear();
            const uma = getExtendedUma(year);
            if (uma > 0) {
                const days = diffDays(ed, sd);
                const finalDays = days === 0 ? 1 : days;
                const ratio = salary / uma;
                totalWeightedRatio += (ratio * finalDays);
                totalDays += finalDays;
            }
        }
        if (totalDays === 0) return 0;
        return parseFloat((totalWeightedRatio / totalDays).toFixed(2));
    }
    buildDailyMapFromHistory() {
        const dailyMap = {};
        const hist = this.user_data.employment_history || [];
        const today = new Date(); today.setHours(0,0,0,0);
        const intervals = [];
        for (const j of hist) {
            const sd = parseDate(j.start_date);
            if (!sd) continue;
            let ed = j.end_date ? parseDate(j.end_date) : new Date(today);
            if (ed < sd) continue;
            intervals.push({ sd, ed, bs: parseFloat(j.base_salary || 0) });
        }
        if (intervals.length === 0) return dailyMap;
        const minDate = new Date(Math.min(...intervals.map(i => i.sd)));
        const maxDate = new Date(Math.max(...intervals.map(i => i.ed)));
        let curr = new Date(minDate);
        while (curr <= maxDate) {
            let sumSal = 0;
            const y = curr.getFullYear();
            for (const iv of intervals) {
                if (curr >= iv.sd && curr <= iv.ed && iv.bs > 0) {
                    const endDateRef = iv.ed;
                    const diff = diffDays(curr, endDateRef);
                    const yearsBack = diff / 365.25;
                    const adjustedSalary = iv.bs / Math.pow(1.05, yearsBack);
                    sumSal += adjustedSalary;
                }
            }
            if (sumSal > 0) {
                let limitValue = getExtendedUma(y);
                if (limitValue === 0) {
                    limitValue = getExtendedMinWage(y);
                }
                const capped = Math.min(sumSal, 25 * limitValue);
                dailyMap[formatDate(curr)] = {
                    base_salary: capped,
                    min_wage: getExtendedMinWage(y)
                };
            }
            curr.setDate(curr.getDate() + 1);
        }
        return dailyMap;
    }
    // ======================================================================
    // v5.3 — DAILY MAP DESDE EVENTOS CON TRAYECTORIA SALARIAL
    // Antes: salario PLANO entre evento y evento (el del último evento).
    // Ahora, por cada empleo (segmento alta→baja del mismo patrón):
    //   - CON salary_modification: escalones exactos (los eventos SON la
    //     trayectoria; no se interpola).
    //   - SIN modificaciones y salario de baja ≠ salario de alta: se interpola
    //     GEOMÉTRICAMENTE día a día del salario del alta al de la baja.
    //   - Empleo ACTIVO (sin baja): el salario final es el del empleo activo
    //     en el historial (mismo patrón) y se interpola del alta a hoy.
    // Se conserva: concurrencia de patrones sumada y topada a 25 UMA, y la
    // exclusión del día de la baja (semántica v5.2).
    // ======================================================================
    buildDailyMapFromEvents() {
        const events = this.user_data.employment_events;
        if (!events || events.length === 0) return null;
        const sorted = [...events].sort((a, b) => parseDate(a.event_date) - parseDate(b.event_date));
        const today = new Date(); today.setHours(0,0,0,0);
        // 1) Agrupar por patrón y armar segmentos con breakpoints salariales
        const porPatron = {};
        for (const ev of sorted) {
            const key = ev.registro_patronal || ev.employer || "Unknown";
            (porPatron[key] = porPatron[key] || []).push(ev);
        }
        const segmentos = [];
        for (const key in porPatron) {
            let abierto = null;
            for (const ev of porPatron[key]) {
                const t = (ev.event_type || "").toLowerCase();
                const d = parseDate(ev.event_date);
                const sal = parseFloat(ev.base_salary || 0);
                const esBaja = t.includes("discharge") || t.includes("baja");
                const esModificacion = t.includes("salary") || t.includes("modification");
                if (esBaja) {
                    if (abierto) {
                        abierto.fin = d; // exclusivo (el día de la baja no cotiza, como en v5.2)
                        if (sal > 0) abierto.salFin = sal;
                        segmentos.push(abierto);
                        abierto = null;
                    }
                } else if (esModificacion) {
                    if (!abierto) {
                        abierto = { ini: d, salIni: sal, mods: [], fin: null, salFin: null, key };
                    } else if (sal > 0) {
                        abierto.mods.push({ d, sal });
                    }
                } else { // reentry / alta
                    if (abierto) {
                        abierto.fin = d; // baja implícita: contiguo, sin hueco (como v5.2)
                        segmentos.push(abierto);
                    }
                    abierto = { ini: d, salIni: sal, mods: [], fin: null, salFin: null, key };
                }
            }
            if (abierto) segmentos.push(abierto); // sigue activo
        }
        // 2) Empleos ACTIVOS: salario final desde el historial (mismo patrón)
        const hist = this.user_data.employment_history || [];
        for (const s of segmentos) {
            if (s.fin) continue;
            const m = hist.find(j => !j.end_date && parseFloat(j.base_salary || 0) > 0 &&
                ((j.registro_patronal && j.registro_patronal === s.key) || (j.employer && j.employer === s.key)));
            if (m) s.salFin = parseFloat(m.base_salary);
        }
        // 3) Salario diario dentro de un segmento
        const salarioEn = (s, d) => {
            if (s.mods.length > 0) {
                let sal = s.salIni;
                for (const m of s.mods) {
                    if (m.d <= d) sal = m.sal; else break;
                }
                return sal;
            }
            const s0 = s.salIni, s1 = s.salFin;
            const fin = s.fin || today;
            if (s0 > 0 && s1 > 0 && s1 !== s0) {
                const total = Math.max(1, diffDays(fin, s.ini));
                const t = Math.min(1, Math.max(0, diffDays(d, s.ini) / total));
                return s0 * Math.pow(s1 / s0, t); // interpolación geométrica
            }
            return s0 > 0 ? s0 : (s1 || 0);
        };
        // 4) Mapa diario: patrones concurrentes sumados, topados a 25 UMA
        const dailyMap = {};
        const firstDate = parseDate(sorted[0].event_date);
        let curr = new Date(firstDate);
        while (curr <= today) {
            let dailyTotal = 0;
            for (const s of segmentos) {
                if (curr < s.ini) continue;
                if (s.fin) { if (curr >= s.fin) continue; } // fin exclusivo
                else if (curr > today) continue;
                dailyTotal += salarioEn(s, curr);
            }
            if (dailyTotal > 0) {
                const y = curr.getFullYear();
                let limitValue = getExtendedUma(y);
                if (limitValue === 0) limitValue = getExtendedMinWage(y);
                const capped = Math.min(dailyTotal, 25 * limitValue);
                dailyMap[formatDate(curr)] = {
                    base_salary: capped,
                    min_wage: getExtendedMinWage(y)
                };
            }
            curr.setDate(curr.getDate() + 1);
        }
        return dailyMap;
    }
    evaluateSyntheticMonths() {
        const sortedDates = Object.keys(this.daily_map).sort().reverse();
        const cot = [];
        const today = new Date(); today.setHours(0,0,0,0);
        for (const dStr of sortedDates) {
            const d = parseDate(dStr);
            const info = this.daily_map[dStr];
            if (d <= today && info.base_salary > 0) {
                cot.push(info);
            }
        }
        const DAYS = 30;
        const MAXM = 60;
        const months = [];
        let idx = 0;
        while (months.length < MAXM && (idx + DAYS) <= cot.length) {
            const chunk = cot.slice(idx, idx + DAYS);
            const sumSal = chunk.reduce((acc, curr) => acc + curr.base_salary, 0);
            const sumMin = chunk.reduce((acc, curr) => acc + curr.min_wage, 0);
            const avgSal = sumSal / DAYS;
            const avgMin = sumMin / DAYS;
            months.push({
                month_index: months.length + 1,
                average_daily_salary: parseFloat(avgSal.toFixed(2)),
                average_minimum_wage: parseFloat(avgMin.toFixed(2))
            });
            idx += DAYS;
        }
        while (months.length < MAXM) {
            months.push({
                month_index: months.length + 1,
                average_daily_salary: 0,
                average_minimum_wage: 0
            });
        }
        return months;
    }
    check12of60Condition() {
        const DAYS_12 = 365;
        const DAYS_60 = Math.round(60 * 30.4375);
        const today = new Date(); today.setHours(0,0,0,0);
        const daysNo40 = new Set();
        const hist = this.user_data.employment_history;
        for (const j of hist) {
            if ((j.employer_registration||"").endsWith("40")) continue;
            const sd = parseDate(j.start_date);
            const ed = j.end_date ? parseDate(j.end_date) : today;
            let c = new Date(sd);
            while(c <= ed) { daysNo40.add(formatDate(c)); c.setDate(c.getDate()+1); }
        }
        if (daysNo40.size === 0) return { Aplica_Mod40: false, last_date_no40: null };
        const sortedDays = Array.from(daysNo40).sort().reverse();
        let last12 = null;
        for (const dStr of sortedDays) {
            const d = parseDate(dStr);
            const startWin = addDays(d, -DAYS_60);
            let count = 0;
            for (let i=0; i<=DAYS_60; i++) {
                if(daysNo40.has(formatDate(addDays(startWin, i)))) count++;
            }
            if (count >= DAYS_12) { last12 = d; break; }
        }
        if (!last12) return { Aplica_Mod40: false, last_date_no40: null };
        const loseDate = addDays(last12, 365*5);
        return { Aplica_Mod40: loseDate > today, last_date_no40: last12, lose_condition_date: loseDate, lose_date: loseDate };
    }
    obtenerUltimaFechaConDerechos() {
        const cond = this.check12of60Condition();
        const d = cond.last_date_no40;
        if (!d) return null;
        let fecha = new Date(d);
        const weeks = this.user_data.contributed_weeks;
        while (true) {
            const consWeeks = Math.max(Math.floor(weeks / 4), 52);
            const fin = addDays(fecha, consWeeks * 7);
            let nueva = null;
            for (const j of this.user_data.employment_history) {
                if ((j.employer_registration||"").endsWith("40")) continue;
                const sd = parseDate(j.start_date);
                if (sd > fecha && sd <= fin) {
                    if (!nueva || sd > nueva) nueva = sd;
                }
            }
            if (nueva) fecha = nueva;
            else break;
        }
        return fecha;
    }
    contarSemanasNuevas(startDate, weeksReq) {
        const diasReq = weeksReq * 7;
        const dias = new Set();
        const today = new Date(); today.setHours(0,0,0,0);
        for (const j of this.user_data.employment_history) {
             const sd = parseDate(j.start_date);
             const ed = j.end_date ? parseDate(j.end_date) : today;
             if (ed < startDate) continue;
             const iStart = (sd > startDate) ? sd : startDate;
             let curr = new Date(iStart);
             while(curr <= ed) {
                 dias.add(formatDate(curr));
                 curr.setDate(curr.getDate() + 1);
             }
        }
        if (dias.size >= diasReq) {
            const sorted = Array.from(dias).sort();
            return parseDate(sorted[diasReq - 1]);
        }
        return null;
    }
    evaluarConservacionYRecuperacion() {
        const ultima = this.obtenerUltimaFechaConDerechos();
        if (!ultima) {
            return {
                conserva_derechos: false,
                motivo: "Nunca tuvo un bloque de cotización válido.",
                fecha_vencimiento: null
            };
        }
        const weeks = this.user_data.contributed_weeks;
        const today = new Date(); today.setHours(0,0,0,0);
        const consWeeks = Math.max(Math.floor(weeks / 4), 52);
        const fechaPerdidaOriginal = addDays(ultima, consWeeks * 7);
        if (today <= fechaPerdidaOriginal) {
            return {
                conserva_derechos: true,
                fecha_vencimiento: formatDate(fechaPerdidaOriginal),
                motivo: "Vigente por conservación de derechos."
            };
        }
        const reingresos = [];
        for (const j of this.user_data.employment_history) {
            if ((j.employer_registration||"").endsWith("40")) continue;
            const sd = parseDate(j.start_date);
            if (sd > ultima) reingresos.push(sd);
        }
        if (reingresos.length === 0) {
            return {
                conserva_derechos: false,
                fecha_vencimiento: formatDate(fechaPerdidaOriginal),
                motivo: "Se agotó conservación y no hay reingreso."
            };
        }
        reingresos.sort((a,b)=>a-b);
        const primerReingreso = reingresos[0];
        const anosInterrupcion = (primerReingreso - ultima) / (1000 * 60 * 60 * 24 * 365.25);
        let semanasNecesarias = 0;
        let desc = "";
        if (anosInterrupcion <= 3) {
            semanasNecesarias = 0;
            desc = "Reactivación inmediata (<3 años)";
        } else if (anosInterrupcion <= 6) {
            semanasNecesarias = 26;
            desc = "Requiere 26 semanas (3-6 años)";
        } else {
            semanasNecesarias = 52;
            desc = "Requiere 52 semanas (>6 años)";
        }
        let fechaReactivacion = null;
        if (semanasNecesarias === 0) fechaReactivacion = primerReingreso;
        else fechaReactivacion = this.contarSemanasNuevas(primerReingreso, semanasNecesarias);
        if (!fechaReactivacion) {
             return {
                conserva_derechos: false,
                fecha_vencimiento: formatDate(fechaPerdidaOriginal),
                motivo: `Reingresó (${desc}), pero NO completó las semanas requeridas.`
            };
        }
        const ultimaBajaReciente = this.getLastContributionDate(this.user_data.employment_history);
        const nuevasConsWeeks = Math.max(Math.floor(this.user_data.contributed_weeks / 4), 52);
        const nuevaFechaPerdida = addDays(ultimaBajaReciente, nuevasConsWeeks * 7);
        const vigente = today <= nuevaFechaPerdida;
        return {
            conserva_derechos: vigente,
            fecha_vencimiento: formatDate(nuevaFechaPerdida),
            motivo: `Derechos recuperados: ${desc}. ` + (vigente ? "Vigente actualmente." : "Pero volvió a perder vigencia.")
        };
    }
    obtenerUltimaFechaMod40UltimoAno() {
        const today = new Date(); today.setHours(0,0,0,0);
        const limitDate = new Date(today);
        limitDate.setDate(limitDate.getDate() - 365);
        let maxDate = null;
        const hist = this.user_data.employment_history || [];
        for (const job of hist) {
            const reg = job.employer_registration || "";
            if (!reg.endsWith("40")) continue;
            const sd = parseDate(job.start_date);
            if (!sd) continue;
            const ed = job.end_date ? parseDate(job.end_date) : new Date(today);
            const startOverlap = (sd > limitDate) ? sd : limitDate;
            const endOverlap = (ed < today) ? ed : today;
            if (startOverlap <= endOverlap) {
                if (!maxDate || endOverlap > maxDate) {
                    maxDate = endOverlap;
                }
            }
        }
        return maxDate ? formatDate(maxDate) : null;
    }
    // v5.3: cuota social DOF-exacta (mismas reglas verificadas del motor
    // contrafactual v1.6). Reemplaza la aproximación (0.063*UMA si ≤15 UMA).
    //   <2009: universal, $1.45 diarios de 1997 indexados (LSS 1997 art. 168-IV)
    //   2009-2020: bandas por VECES EL SALARIO MÍNIMO hasta 15 SM (DOF 26-may-2009)
    //   2021+: bandas por UMA hasta 4 UMA con monto especial 1 SM (DOF 16-dic-2020)
    //   2023+: banda adicional ≤7.09 UMA ~$1.7 indexado
    calculateSocialQuota(currentDate, salaryUma) {
        const year = currentDate.getFullYear();
        const uma = getExtendedUma(year);
        if (year < 2009) {
            return 1.45 * (uma / UMA_HISTORY[1997]);
        }
        if (year < 2021) {
            const sm = getExtendedMinWage(year);
            const vecesSm = sm > 0 ? (salaryUma * uma) / sm : 0;
            const idx = uma / UMA_HISTORY[2009];
            if (vecesSm <= 1.0) return 3.87077 * idx;
            if (vecesSm <= 4.0) return 3.70949 * idx;
            if (vecesSm <= 7.0) return 3.5482 * idx;
            if (vecesSm <= 10.0) return 3.38692 * idx;
            if (vecesSm <= 15.0) return 3.22564 * idx;
            return 0;
        }
        const sm = getExtendedMinWage(year);
        const idx = uma / UMA_HISTORY[2021];
        const salDiario = salaryUma * uma;
        if (salDiario <= sm * 1.001) return 10.75 * idx;
        if (salaryUma <= 1.5) return 10.0 * idx;
        if (salaryUma <= 2.0) return 9.25 * idx;
        if (salaryUma <= 2.5) return 8.5 * idx;
        if (salaryUma <= 3.0) return 7.75 * idx;
        if (salaryUma <= 3.5) return 7.0 * idx;
        if (salaryUma <= 4.0) return 6.25 * idx;
        if (year >= 2023 && salaryUma <= 7.09) return 1.7 * idx;
        return 0;
    }
    // ======================================================================
    // v5.4 — F2: RECONSTRUCCIÓN DE RETIROS POR DESEMPLEO (espejo del motor
    // contrafactual v1.8, reconstruirRetirosDesempleo, en resolución mensual).
    // Con las semanas DESCONTADAS del SISEC (user_data.deducted_weeks, brutas):
    //  · Detecta los DESEMPLEOS reales (huecos ≥2 meses sin cotizar, era RCV).
    //  · En cada desempleo el retiro máximo = max(A: 30 días del SBC reciente
    //    topado a 10 SM; B: min(90 días del SBC prom. 250 sem, 11.5% del saldo
    //    RCV valuado EN ESA FECHA)). fracción = monto/saldo; semanas del retiro
    //    = fracción × semanas acumuladas en ese momento (escala SISEC).
    //  · Colocación: del desempleo más reciente hacia atrás, solo si NO
    //    sobre-explica lo que falta; cooldown 5 años; residuo → el más antiguo.
    // Devuelve [{mes, fecha, fraccion, semanas}] asc. Memoizado.
    // ======================================================================
    getRetirosDesempleo() {
        if (this._retirosCache !== undefined) return this._retirosCache;
        this._retirosCache = [];
        const desc = Number(this.user_data.deducted_weeks || 0);
        if (!(desc > 0) || !this.daily_map) return this._retirosCache;
        const startRCV = new Date(1997, 6, 1);
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        // 1) Serie mensual: días cotizados, SBC prom. y aporte RCV+CS nominal
        const meses = {}; // 'YYYY-MM' -> { dias, salSum, aporte }
        const sortedDates = Object.keys(this.daily_map).sort();
        for (const dStr of sortedDates) {
            const di = parseDate(dStr);
            if (di > hoy) continue;
            const sal = this.daily_map[dStr].base_salary;
            if (sal <= 0) continue;
            const ym = dStr.slice(0, 7);
            const m = (meses[ym] = meses[ym] || { dias: 0, salSum: 0, aporte: 0 });
            m.dias++; m.salSum += sal;
            if (di >= startRCV) {
                const y = di.getFullYear();
                const uma = getExtendedUma(y);
                const su = uma ? sal / uma : 0;
                m.aporte += getTasaRcvTotal(y, sal) * sal + this.calculateSocialQuota(di, su);
            }
        }
        const ymList = Object.keys(meses).sort();
        if (ymList.length === 0) return this._retirosCache;
        const ymIdx = (ym) => { const p = ym.split('-').map(Number); return p[0] * 12 + (p[1] - 1); };
        const idxFecha = (i) => new Date(Math.floor(i / 12), i % 12, 1);
        const firstIdx = ymIdx(ymList[0]);
        const corteIdx = hoy.getFullYear() * 12 + hoy.getMonth();
        const rcvIniIdx = ymIdx('1997-07');
        // 2) Semanas acumuladas (días/7) escaladas a las semanas SISEC
        const wCum = {}; let wAcc = 0;
        for (const ym of ymList) { wAcc += meses[ym].dias / 7; wCum[ymIdx(ym)] = wAcc; }
        const semCot = Number(this.user_data.contributed_weeks || 0);
        const escala = (semCot > 0 && wAcc > 0) ? semCot / wAcc : 1;
        const wObsEn = (idx) => {
            let w = 0;
            for (const ym of ymList) { const i = ymIdx(ym); if (i <= idx) w = wCum[i]; else break; }
            return w * escala;
        };
        // 3) Saldo RCV valuado EN la fecha idx (aportes capitalizados hasta ahí)
        const balEn = (idx) => {
            const fin = idxFecha(idx);
            const f = makeFactorHasta(this.rateSiefore, fin);
            let bal = 0;
            for (const ym of ymList) {
                const i = ymIdx(ym);
                if (i >= idx) break;
                if (i < rcvIniIdx) continue;
                bal += meses[ym].aporte * f(new Date(Math.floor(i / 12), i % 12, 15));
            }
            return bal;
        };
        const sbcPromAntes = (idx) => {
            let sd = 0, dd = 0;
            for (const ym of ymList) {
                const i = ymIdx(ym);
                if (i >= idx) break;
                if (i < idx - RETIRO_VENTANA_SBC_MESES) continue;
                sd += meses[ym].salSum; dd += meses[ym].dias;
            }
            if (dd > 0) return sd / dd;
            let last = 0;
            for (const ym of ymList) { if (ymIdx(ym) < idx) last = meses[ym].salSum / meses[ym].dias; else break; }
            return last;
        };
        const sbcUltimoAntes = (idx) => {
            let last = 0;
            for (const ym of ymList) { if (ymIdx(ym) < idx) last = meses[ym].salSum / meses[ym].dias; else break; }
            return last;
        };
        // 4) Desempleos: huecos ≥ RETIRO_MIN_GAP_MESES en la era RCV
        const cot = new Set(ymList.map(ymIdx));
        const gaps = [];
        let i = firstIdx;
        while (i <= corteIdx) {
            if (!cot.has(i) && cot.has(i - 1)) {
                const inicio = i; let j = i;
                while (j <= corteIdx && !cot.has(j)) j++;
                if ((j - inicio) >= RETIRO_MIN_GAP_MESES && inicio >= rcvIniIdx) gaps.push(inicio);
                i = j;
            } else i++;
        }
        if (gaps.length === 0) return this._retirosCache;
        // 5) Colocación
        const retiros = [];
        let restante = desc;
        const EPS = 0.5;
        const fraccionEn = (idx) => {
            const bal = balEn(idx);
            if (!(bal > 0)) return { f: 0, w: 0 };
            const anio = Math.floor(idx / 12);
            const sm = getExtendedMinWage(anio);
            const montoA = RETIRO_DIAS_A * Math.min(sbcUltimoAntes(idx), RETIRO_TOPE_SM_A * sm);
            const montoB = Math.min(RETIRO_DIAS_B * sbcPromAntes(idx), RETIRO_TOPE_PCT * bal);
            const monto = Math.min(bal, Math.max(montoA, montoB));
            const f = Math.max(0, Math.min(1, monto / bal));
            return { f, w: f * wObsEn(idx) };
        };
        let ultimo = Infinity;
        for (const g of [...gaps].sort((a, b) => b - a)) {
            if (restante <= EPS) break;
            if (ultimo - g < RETIRO_COOLDOWN_MESES) continue; // cooldown 5 años
            const r = fraccionEn(g);
            if (!(r.w > 0)) continue;
            if (restante + EPS >= r.w) { // no sobre-explica → se coloca aquí
                retiros.push({ idx: g, fraccion: r.f, semanas: r.w });
                restante -= r.w;
                ultimo = g;
            } // si sobre-explicaría, se salta (se "envía para atrás")
        }
        if (restante > EPS) { // residuo → retiro parcial en el desempleo más antiguo
            const usados = new Set(retiros.map(r => r.idx));
            for (const g of [...gaps].sort((a, b) => a - b)) {
                if (usados.has(g)) continue;
                if (retiros.some(r => Math.abs(r.idx - g) < RETIRO_COOLDOWN_MESES)) continue;
                const w = wObsEn(g);
                if (!(w > 0)) continue;
                const f = Math.max(0, Math.min(1, restante / w));
                retiros.push({ idx: g, fraccion: f, semanas: f * w });
                break;
            }
        }
        this._retirosCache = retiros.sort((a, b) => a.idx - b.idx).map(r => ({
            mes: `${Math.floor(r.idx / 12)}-${String((r.idx % 12) + 1).padStart(2, '0')}`,
            fecha: idxFecha(r.idx),
            fraccion: parseFloat(r.fraccion.toFixed(6)),
            semanas: parseFloat(r.semanas.toFixed(1))
        }));
        return this._retirosCache;
    }
    // v5.3: capitaliza con la MEDIANA generacional real (precios CONSAR) y usa
    // la tasa RCV completa (retiro + cesantía patronal por banda/año + obrera
    // + estatal hasta 2022) + cuota social DOF-exacta.
    // v5.4: + F2 (cada retiro quita su fracción del saldo EN SU FECHA → las
    // aportaciones previas pierden también el rendimiento posterior) y castigo
    // plano 10% (alineado al motor v1.8). Memoizado.
    calculateHistoricalRCV() {
        if (this._rcv97Cache !== undefined) return this._rcv97Cache;
        if (!this.daily_map) return (this._rcv97Cache = 0);
        const retiros = this.getRetirosDesempleo();
        // producto acumulado de (1-fracción) de los retiros POSTERIORES a cada día
        const sufijo = new Array(retiros.length + 1).fill(1);
        for (let k = retiros.length - 1; k >= 0; k--) sufijo[k] = sufijo[k + 1] * (1 - retiros[k].fraccion);
        const factorRetiros = (di) => {
            let k = 0;
            while (k < retiros.length && retiros[k].fecha <= di) k++;
            return sufijo[k];
        };
        let total = 0.0;
        const startRCV = new Date(1997, 6, 1);
        const hoy = new Date();
        const factorHoy = makeFactorHasta(this.rateSiefore, hoy);
        const sortedDates = Object.keys(this.daily_map).sort();
        for (const dStr of sortedDates) {
            const di = parseDate(dStr);
            if (di < startRCV || di > hoy) continue;
            const info = this.daily_map[dStr];
            const sal = info.base_salary;
            if (sal <= 0) continue;
            const y = di.getFullYear();
            const uma = getExtendedUma(y);
            const su = uma ? (sal / uma) : 0;
            const rcv = getTasaRcvTotal(y, sal) * sal;
            const sq = this.calculateSocialQuota(di, su);
            const dr = rcv + sq;
            const af = factorHoy(di);
            total += dr * af * factorRetiros(di);
        }
        // v5.4: castigo plano temporal (mismo del motor v1.8)
        return (this._rcv97Cache = total * (1 - CASTIGO_PLANO_V54));
    }
    // v5.0/v5.3: dos regímenes legales:
    //   may-1992 a jun-1997: INPC del año + 2% real (Banxico, Arts. 183-I/J LSS)
    //   jul-1997 a hoy: Siefore GENERACIONAL neta (unificado a Afore, default)
    //   o INPC + 2% si sigue en cuenta concentradora (DOF 24/12/2002)
    // v5.4: + castigo plano 10% (alineado al motor v1.8). Los retiros por
    // desempleo NO tocan el SAR92 (igual que el motor: solo subcuenta RCV).
    calculateSar92() {
        if (this._sar92Cache !== undefined) return this._sar92Cache;
        if (!this.daily_map) return (this._sar92Cache = 0);
        let total = 0.0;
        const startSar = new Date(1992, 4, 1);
        const cutoffSar = new Date(1997, 6, 1);
        const hoy = new Date();
        const factorACorte = makeFactorHasta(getRendimientoSar92Banxico, cutoffSar);
        const ratePost = SUPUESTOS_RENDIMIENTO.sar92_en_concentradora
            ? getRendimientoSar92Banxico
            : this.rateSiefore;
        const factorPost97 = factorCapitalizacion(cutoffSar, hoy, ratePost);
        const sortedDates = Object.keys(this.daily_map).sort();
        for (const dStr of sortedDates) {
            const di = parseDate(dStr);
            if (di < startSar || di >= cutoffSar || di > hoy) continue;
            const info = this.daily_map[dStr];
            const sal = info.base_salary;
            if (sal <= 0) continue;
            const dr = 0.02 * sal;
            const af = factorACorte(di) * factorPost97;
            total += dr * af;
        }
        return (this._sar92Cache = total * (1 - CASTIGO_PLANO_V54));
    }
    // v5.0: capitaliza con INPC del año (1992-2017) + serie oficial Infonavit
    // (2018-2025) — sin cambios en v5.3
    calculateHistoricalInfonavit() {
        if (!this.daily_map) return 0;
        let total = 0.0;
        const startInfo = new Date(1992, 4, 1);
        const hoy = new Date();
        const factorHoy = makeFactorHasta(getRendimientoInfonavit, hoy);
        const sortedDates = Object.keys(this.daily_map).sort();
        for (const dStr of sortedDates) {
            const di = parseDate(dStr);
            if (di < startInfo || di > hoy) continue;
            const sal = this.daily_map[dStr].base_salary;
            if (sal <= 0) continue;
            const dr = 0.05 * sal;
            const af = factorHoy(di);
            total += dr * af;
        }
        return total;
    }
    getEmployerQuota(salaryUmaFuture, year) {
        for (const row of EMPLOYER_QUOTA_HISTORY) {
            if (salaryUmaFuture >= row.min && salaryUmaFuture <= row.max) {
                const idx = year - 2023;
                const rate = (idx >= 0 && idx < row.rates.length) ? row.rates[idx] : row.rates[row.rates.length - 1];
                return rate / 100;
            }
        }
        return 0;
    }
    calculateLey97Pension(retAge, futureSalary, projectedWeeks, historicalRatio) {
        const bd = parseDate(this.user_data.birth_date);
        const retDate = addDays(bd, retAge * 365.25);
        const hoy = new Date();
        const retYear = retDate.getFullYear();
        // v5.3: si vienen los saldos del motor contrafactual, mandan.
        let fondo = (this.saldos_motor && Number.isFinite(this.saldos_motor.rcv97))
            ? this.saldos_motor.rcv97
            : this.calculateHistoricalRCV();
        const yearsUntil = diffDays(retDate, hoy) / 365.25;
        // v5.1: proyección futura en términos REALES (pesos de hoy). El saldo
        // histórico (nominal a hoy) crece a 3% real hasta el retiro.
        const rFut = SUPUESTOS_RENDIMIENTO.rendimiento_futuro_siefore;
        fondo *= Math.pow(1 + rFut, Math.max(0, yearsUntil));
        let futureAccum = 0;
        const umaActual = getExtendedUma(hoy.getFullYear()); // v5.3: año en curso (antes 2025 fijo)
        if (futureSalary > 0 && yearsUntil > 0) {
            const currentYear = hoy.getFullYear();
            for (let y = currentYear; y <= retYear; y++) {
                let startOfYear = new Date(y, 0, 1);
                let endOfYear = new Date(y, 11, 31);
                if (y === currentYear) startOfYear = hoy;
                if (y === retYear) endOfYear = retDate;
                const activeDays = diffDays(endOfYear, startOfYear);
                if (activeDays <= 0) continue;
                const umaF = futureSalary / umaActual;
                const eq = this.getEmployerQuota(umaF, y);
                const dailyRate = 0.0335 + eq;
                const annualContrib = dailyRate * futureSalary * activeDays;
                const midPoint = addDays(startOfYear, activeDays / 2);
                const yearsToCompound = diffDays(retDate, midPoint) / 365.25;
                futureAccum += annualContrib * Math.pow(1 + rFut, Math.max(0, yearsToCompound));
            }
        }
        fondo += futureAccum;
        // v5.1: URV de tabla actuarial por EDAD y SEXO (sexo desde CURP, pos 11).
        const sexo = (this.curp && this.curp.length > 10)
            ? this.curp.charAt(10).toUpperCase() : 'H';
        const urv = getURV(retAge, sexo);
        let monthlyOwn = ((fondo / urv) * 0.81) / 12;
        const minReq = Math.min(1000, 750 + (retYear - 2021) * 25);
        let resultPension = 0;
        let isMinima = false;
        let pmgFinal = 0;
        let finalAvgRatio = historicalRatio;
        if (projectedWeeks < minReq) {
            resultPension = "Negativa de Pensión";
        } else {
            const futureRatio = futureSalary / umaActual;
            const weeksHist = this.user_data.contributed_weeks;
            const weeksFut = Math.max(0, projectedWeeks - weeksHist);
            if (projectedWeeks > 0) {
                finalAvgRatio = ((historicalRatio * weeksHist) + (futureRatio * weeksFut)) / projectedWeeks;
            }
            let row = PMG_TABLE_FULL[PMG_TABLE_FULL.length - 1];
            for(const r of PMG_TABLE_FULL) {
                if (finalAvgRatio >= r.min && finalAvgRatio <= r.max) {
                    row = r; break;
                }
            }
            const ageIndex = Math.min(5, Math.max(0, Math.floor(retAge) - 60));
            let pmgBase = row.ages[ageIndex];
            const extraWeeks = Math.max(0, projectedWeeks - minReq);
            const extraYears = Math.min(5, Math.floor(extraWeeks / 52));
            const incrementTotal = extraYears * row.inc;
            const umaFactor = umaActual / UMA_HISTORY[2021];
            pmgFinal = (pmgBase + incrementTotal) * umaFactor;
            if (pmgFinal > monthlyOwn) {
                resultPension = pmgFinal;
                isMinima = true;
            } else {
                resultPension = monthlyOwn;
            }
        }
        return {
            pension: resultPension,
            rcv_balance: fondo,
            urv: urv,
            pmg: pmgFinal,
            is_minima: isMinima,
            applied_ratio: parseFloat(finalAvgRatio.toFixed(2))
        };
    }
    calculateVoluntaryCosts(retDate, refSalary) {
        const cond = this.check12of60Condition();
        let aplica = cond.Aplica_Mod40;
        const lastMod40 = this.getLastMod40EndDate();
        const lastMandatory = cond.last_date_no40;
        const now = new Date(); now.setHours(0,0,0,0);
        let realLastDate = lastMandatory;
        let isMod40Last = false;
        if (lastMod40) {
            if (!lastMandatory || lastMod40 > lastMandatory) {
                realLastDate = lastMod40;
                isMod40Last = true;
            }
        }
        if (this.user_data.status !== "empleado" && realLastDate) {
             const gapMonths = diffDays(now, realLastDate) / 30.4375;
             if (gapMonths > 60) {
                 aplica = false;
             } else if (isMod40Last && gapMonths > 12) {
                 aplica = false;
             }
        }
        const months = Math.floor(diffDays(retDate, now) / 30.45);
        if (months <= 0) {
            return { total_cost: 0, accumulated_cost_12_months: 0, first_month_cost: 0, first_month_modality: null };
        }
        let total = 0, acc12 = 0;
        let lastSal = this.user_data.last_registered_salary || MINIMUM_WAGE_2026;
        let firstMonthCost = 0;
        let firstMonthModality = null;
        let canUseMod40 = aplica;
        let monthsInMod10 = 0;
        for (let m = 1; m <= months; m++) {
            const d = addDays(now, m * 30.45);
            const year = d.getFullYear();
            const remaining = months - (m - 1);
            let mod = '10', sal = MINIMUM_WAGE_2026;
            if (remaining > 60) {
                 mod = '10';
                 sal = getExtendedMinWage(year);
                 if (!canUseMod40) {
                     monthsInMod10++;
                     if (monthsInMod10 >= 12) canUseMod40 = true;
                 }
            } else {
                 if (canUseMod40) {
                     mod = '40';
                     sal = Math.max(refSalary, lastSal);
                 } else {
                     mod = '10';
                     sal = refSalary;
                     monthsInMod10++;
                     if (monthsInMod10 >= 12) canUseMod40 = true;
                 }
            }
            let rate = 0;
            if (mod === '40') {
                rate = getMod40Rate(year);
            } else {
                const yearsElapsed = Math.max(0, Math.min(year - 2024, 6));
                let found = false;
                for (const row of MODALITY_10_RATES) {
                    if (sal <= row.cap) { rate = row.rate + (row.inc * yearsElapsed); found=true; break; }
                }
                if (!found) {
                    const l = MODALITY_10_RATES[MODALITY_10_RATES.length-1];
                    rate = l.rate + (l.inc * yearsElapsed);
                }
            }
            const cost = sal * 30.4 * (rate / 100);
            total += cost;
            if (m <= 12) acc12 += cost;
            if (m === 1) {
                firstMonthCost = cost;
                firstMonthModality = mod;
            }
        }
        return {
            total_cost: total,
            accumulated_cost_12_months: acc12,
            first_month_cost: firstMonthCost,
            first_month_modality: firstMonthModality
        };
    }
    calculateAverageContributionSalary(retAge, futureSalary, proyectar) {
        const DAYS_250 = 1750;
        const bd = parseDate(this.user_data.birth_date);
        const retDate = addDays(bd, retAge * 365.25);
        const today = new Date(); today.setHours(0,0,0,0);
        const sortedDates = Object.keys(this.daily_map).sort().reverse();
        let history = [];
        for (const dStr of sortedDates) {
             const d = parseDate(dStr);
             if (d < today) history.push({...this.daily_map[dStr], fecha: dStr});
        }
        let pool = [];
        if (proyectar) {
            const diff = diffDays(retDate, today);
            let fut = [];
            for(let i=0; i<diff; i++) {
                const fd = addDays(today, i);
                const y = fd.getFullYear();
                fut.push({ base_salary: Math.min(futureSalary, 25*getExtendedUma(y)), min_wage: getExtendedMinWage(y) });
            }
            pool = fut.concat(history);
        } else { pool = history; }
        pool = pool.slice(0, DAYS_250);
        if(!pool.length) return [0,0];
        const avgSal = pool.reduce((a,b)=>a+b.base_salary,0)/pool.length;
        const avgMin = pool.reduce((a,b)=>a+b.min_wage,0)/pool.length;
        return [avgSal, avgMin];
    }
    calculateRetroCostBreakdown(startDate, endDate, baseSalary) {
        let cursor = new Date(startDate);
        cursor.setDate(1);
        let total_base = 0;
        let total_act = 0;
        let total_rec = 0;
        let months_paid = 0;
        const endYear = endDate.getFullYear();
        const endMonth = endDate.getMonth() + 1;
        const inpc_pago = getINPC(endYear, endMonth);
        while (cursor.getFullYear() < endYear || (cursor.getFullYear() === endYear && cursor.getMonth() < endDate.getMonth())) {
            const y = cursor.getFullYear();
            const m = cursor.getMonth() + 1;
            const rate = getMod40Rate(y) / 100;
            const cuota_mensual = baseSalary * 30.4 * rate;
            const inpc_adeudo = getINPC(y, m);
            let factor = inpc_pago / inpc_adeudo;
            if (factor < 1) factor = 1;
            const cuota_actualizada = cuota_mensual * factor;
            const actualizacion = cuota_actualizada - cuota_mensual;
            const meses_retraso = (endYear - y) * 12 + (endDate.getMonth() - cursor.getMonth());
            const recargos = cuota_actualizada * (meses_retraso * 0.0147);
            total_base += cuota_mensual;
            total_act += actualizacion;
            total_rec += recargos;
            months_paid++;
            cursor.setMonth(cursor.getMonth() + 1);
        }
        return {
            salario_referencia_diario: parseFloat(baseSalary.toFixed(2)),
            meses_pagados: months_paid,
            cuota_base_total: Math.round(total_base),
            monto_actualizacion: Math.round(total_act),
            monto_recargos: Math.round(total_rec),
            inversion_total_estimada: Math.round(total_base + total_act + total_rec)
        };
    }
    formatScenario(sc, name, ley) {
        let investmentDurationMonths = 0;
        if (typeof sc.retirementAge === 'number') {
            investmentDurationMonths = (sc.retirementAge - this.user_data.current_age) * 12;
        }
        return {
            ley: ley,
            escenario: name,
            aplica: sc.aplica !== undefined ? sc.aplica : true,
            fecha_pension_objetivo: sc.fecha_pension_objetivo || "N/A",
            retirementAge: typeof sc.retirementAge === 'number' ? parseFloat(sc.retirementAge.toFixed(1)) : sc.retirementAge,
            calculatedPension: (typeof sc.calculatedPension === 'number') ? Math.round(sc.calculatedPension) : sc.calculatedPension,
            salaryTypeUsed: sc.salaryTypeUsed || "N/A",
            contributedWeeks: Math.round(sc.contributedWeeks || 0),
            first_month_cost: sc.first_month_cost || 0,
            first_month_modality: sc.first_month_modality || "N/A",
            total_cost: sc.total_cost || 0,
            accumulated_cost_12_months: sc.accumulated_cost_12_months || 0,
            basicAmount: sc.basicAmount || 0,
            incrementAmount: sc.incrementAmount || 0,
            allowances: sc.allowances || 0,
            ageAdjustment: sc.ageAdjustment || 0,
            salMin250: sc.salMin250 || 0,
            salCot250: sc.salCot250 || 0,
            urv_used: sc.urv_used || sc.urv || 0,
            investment_duration_months: Math.max(0, Math.round(investmentDurationMonths)) || 0,
            sar92_estimado: sc.sar92_estimado || 0,
            infonavit_estimado: sc.infonavit_estimado || 0,
            rcv97_estimado: sc.rcv97_estimado || sc.estimated_rcv || sc.rcv_balance || 0,
            desglose_retro_meses: sc.desglose_retro_meses || 0,
            desglose_retro_cuota_base: sc.desglose_retro_cuota_base || 0,
            desglose_retro_actualizacion: sc.desglose_retro_actualizacion || 0,
            desglose_retro_recargos: sc.desglose_retro_recargos || 0,
            desglose_retro_total: sc.desglose_retro_total || 0,
            // Desglose del costo total del proyecto retroactivo
            costo_imss: sc.costo_imss || 0,
            costo_despacho_pct: sc.costo_despacho_pct || 0,
            costo_despacho: sc.costo_despacho || 0,
            costo_gestorias: sc.costo_gestorias || 0,
            costo_proyecto_retroactivo: sc.costo_proyecto_retroactivo || 0
        };
    }
    getNAScenario(name) {
        return this.formatScenario({
            aplica: false,
            fecha_pension_objetivo: "N/A",
            retirementAge: "N/A",
            calculatedPension: "N/A",
            costo_proyecto_retroactivo: "N/A"
        }, name, "Ley73");
    }
    selectScenarios(results, retroFuturo) {
        const valid = results.filter(r => typeof r.calculatedPension === 'number' && r.calculatedPension > 0);
        if (valid.length === 0 && !(retroFuturo && retroFuturo.aplica)) {
             return [this.formatScenario({
                 aplica: false,
                 retirementAge: 60,
                 calculatedPension: "Negativa de Pensión",
                 salaryTypeUsed: "último registrado",
                 contributedWeeks: this.user_data.contributed_weeks
             }, "Escenario Base (Cálculo Informativo)", "Ley73")];
        }
        const output = [];
        const baseResults = results.filter(r => r.salaryTypeUsed === "último registrado");
        if (this.user_data.status === "empleado") {
             const baseScenario = baseResults.length > 0
                ? baseResults.reduce((min, curr) => curr.retirementAge < min.retirementAge ? curr : min)
                : valid[0];
             if (baseScenario) {
                 output.push(this.formatScenario(baseScenario, "Escenario Base", "Ley73"));
             }
        } else {
             const cons = this.user_data.conservacion_derechos;
             const weeks = this.user_data.contributed_weeks;
             // 1. Calculamos la edad base dinámicamente
             const baseAge = Math.max(60, this.user_data.current_age);
             if (!cons.conserva_derechos || weeks < 500) {
                 output.push(this.formatScenario({
                     aplica: false,
                     retirementAge: baseAge, // <-- Reemplazado 60 por baseAge
                     calculatedPension: "Negativa de Pensión (Sin reactivación)",
                     salaryTypeUsed: "último registrado",
                     contributedWeeks: weeks
                 }, "Escenario Base", "Ley73"));
             } else {
                 // 2. Usamos la edad base en los cálculos
                 const [sc, sm] = this.calculateAverageContributionSalary(baseAge, 0, false); // <-- Reemplazado 60 por baseAge
                 // FIX: usar año de última cotización para resolver PMG correcta (no el año actual)
                 const lastContribYear = this.getLastContributionDate(this.user_data.employment_history).getFullYear();
                 const calc = new Ley73PensionCalculator(baseAge, sm, sc, weeks, lastContribYear);
                 const res = calc.calculatePension();
                 output.push(this.formatScenario({
                     ...res,
                     salaryTypeUsed: "último registrado"
                 }, "Escenario Base", "Ley73"));
             }
        }
        const minResults = results.filter(r => r.salaryTypeUsed === "mínimo" && typeof r.calculatedPension === 'number' && r.calculatedPension > 0);
        if(minResults.length > 0) {
            const minScenario = minResults.reduce((min, curr) => curr.retirementAge < min.retirementAge ? curr : min);
            output.push(this.formatScenario(minScenario, "Escenario Mínimo", "Ley73"));
        }
        // --- LÓGICA MODIFICADA PARA ESCENARIO MÁXIMO ---
        if (retroFuturo && retroFuturo.aplica) {
            // Si el retroactivo futuro aplica, le damos prioridad sobre el cálculo matemático absoluto
            output.push({ ...retroFuturo, escenario: "Escenario Máximo" });
        } else if (valid.length > 0) {
            // Si no aplica, regresamos al comportamiento estándar de tomar la mayor pensión de la lista
            const maxScenario = valid.reduce((max, curr) => curr.calculatedPension > max.calculatedPension ? curr : max);
            output.push(this.formatScenario(maxScenario, "Escenario Máximo", "Ley73"));
        }
        return output;
    }
    selectScenariosLey97(results) {
        const output = [];
        const minCalculatedAge = results.length > 0
            ? Math.min(...results.map(r => r.retirementAge))
            : 60;
        const baseResults = results.filter(r => r.retirementAge === minCalculatedAge && r.salaryTypeUsed === "último registrado");
        if (baseResults.length > 0) {
            output.push(this.formatScenario(baseResults[0], "Escenario Base", "Ley97"));
        }
        const minResults = results.filter(r => r.retirementAge === minCalculatedAge && r.salaryTypeUsed === "mínimo");
        if (minResults.length > 0) {
            output.push(this.formatScenario(minResults[0], "Escenario Mínimo", "Ley97"));
        }
        const positiveResults = results.filter(r => typeof r.calculatedPension === 'number' && r.calculatedPension > 0);
        if (positiveResults.length > 0) {
            const maxScenario = positiveResults.reduce((p, c) => (p.calculatedPension > c.calculatedPension) ? p : c);
            output.push(this.formatScenario(maxScenario, "Escenario Máximo", "Ley97"));
        } else if (results.length > 0) {
             output.push(this.formatScenario(results[results.length-1], "Escenario Máximo", "Ley97"));
        }
        return output;
    }
    execute() {
        const results73 = [];
        const results97 = [];
        const initialAge = Math.max(60, this.user_data.current_age);
        const bd = parseDate(this.user_data.birth_date);
        const today = new Date(); today.setHours(0,0,0,0);
        const salaries = [
            {t:"mínimo", v:MINIMUM_WAGE_2026},
            {t:"último registrado", v:Math.max(MINIMUM_WAGE_2026, this.user_data.last_registered_salary)},
            {t:"máximo", v:MAXIMUM_CONTRIBUTION_WAGE}
        ];
        const cons = this.evaluarConservacionYRecuperacion();
        this.user_data.conservacion_derechos = cons;
        this.user_data.synthetic_months_table = this.evaluateSyntheticMonths();
        const histUmaRatio = this.calculateLifetimeAverageUmaRatio();
        this.user_data.average_lifetime_uma_ratio = histUmaRatio;
        // --- Salario promedio actual de las últimas 250 semanas ---
        const [avgSalActual] = this.calculateAverageContributionSalary(this.user_data.current_age, 0, false);
        this.user_data.salario_promedio_ultimas_250_semanas = parseFloat(avgSalActual.toFixed(2));
        // ----------------------------------------------------------------------
        const statusMod40 = this.check12of60Condition();
        // v5.3: si el flujo trae los saldos del motor contrafactual
        // (payload.saldos_motor = { rcv97, sar92 }), MANDAN sobre el estimado.
        const motor = this.saldos_motor || {};
        this.user_data.RCV97 = Number.isFinite(motor.rcv97) ? Math.round(motor.rcv97) : Math.round(this.calculateHistoricalRCV());
        this.user_data.SAR92 = Number.isFinite(motor.sar92) ? Math.round(motor.sar92) : Math.round(this.calculateSar92());
        this.user_data.INFONAVIT = Math.round(this.calculateHistoricalInfonavit());
        this.user_data.saldos_fuente = (Number.isFinite(motor.rcv97) || Number.isFinite(motor.sar92))
            ? "motor_contrafactual_v1.8" : "estimado_v5.4_generacional_f2";
        // v5.4: trazabilidad F2 + castigo. Solo aplica a saldos ESTIMADOS; los
        // saldos_motor ya vienen del batch v1.8 con F2+castigo (no se re-aplican).
        const esEstimado = !(Number.isFinite(motor.rcv97) || Number.isFinite(motor.sar92));
        this.user_data.retiros_desempleo = esEstimado
            ? this.getRetirosDesempleo().map(r => ({ mes: r.mes, fraccion: r.fraccion, semanas: r.semanas }))
            : "incluidos_en_saldos_motor";
        this.user_data.castigo_plano = esEstimado ? CASTIGO_PLANO_V54 : "incluido_en_saldos_motor";
        this.user_data.last_mod40_date_1yr = this.obtenerUltimaFechaMod40UltimoAno();
        // v5.3: trazabilidad de los supuestos de rendimiento usados
        this.user_data.supuestos_rendimiento = {
            motor: "v5.4-generacional-f2-castigo (alineado a contrafactual v1.8)",
            retiros_desempleo: "F2: retiros reconstruidos en desempleos reales; max(30 días SBC reciente topado 10 SM, min(90 días SBC prom 250 sem, 11.5% RCV)); cooldown 5 años; quitan unidades en su fecha",
            castigo_plano: CASTIGO_PLANO_V54,
            serie_generacional: this.serie_gen,
            rcv97_rendimiento: "mediana anual del sistema por SIEFORE generacional (precios de bolsa CONSAR netos, corte 2026-06); fallback tramos v5.0",
            rcv97_tasa: "retiro 2% + cesantía patronal (3.15% <2023; bandas UMA DOF 2023-2030) + obrera 1.125% + estatal 0.225% hasta 2022",
            cuota_social: "DOF-exacta: universal <2009; bandas SM 2009-2020; bandas UMA 2021+ (1SM especial); ≤7.09 UMA desde 2023",
            sar92_regimen_92_97: "INPC + 2% real (DOF 24/02/1992)",
            sar92_post_97: SUPUESTOS_RENDIMIENTO.sar92_en_concentradora ? "INPC + 2% (concentradora)" : "Siefore generacional neta (unificado a Afore)",
            infonavit: "INPC 1992-2017; serie oficial Consejo 2018-2025; futuro premio real ~1%",
            salario_historico: "eventos con interpolación alta→baja por empleo (escalones exactos si hay salary_modification)",
            proyeccion_futura_siefore: SUPUESTOS_RENDIMIENTO.rendimiento_futuro_siefore,
            base_valuacion: "pesos de hoy (valor presente): historico nominal, futuro real",
            urv: "tabla actuarial por edad y sexo (Excel Calculadora 97)",
            inflacion_futura: SUPUESTOS_RENDIMIENTO.inflacion_futura,
            saldos_fuente: this.user_data.saldos_fuente
        };
        // ============================================
        // DIAGNÓSTICO MODALIDAD 40
        // ============================================
        const lastMod40EndDate = this.getLastMod40EndDate();
        const lastMandatoryEndDate = statusMod40.last_date_no40;
        // --- RESTRICCIÓN: ÚLTIMO TRABAJO FUE MOD 40 Y PASARON MÁS DE 12 MESES ---
        let maxEndDateHist = null;
        let isAbsoluteLastJobMod40 = false;
        for (const job of (this.user_data.employment_history || [])) {
            const ed = job.end_date ? parseDate(job.end_date) : today;
            if (!maxEndDateHist || ed > maxEndDateHist) {
                maxEndDateHist = ed;
                isAbsoluteLastJobMod40 = (job.employer_registration || "").endsWith("40");
            }
        }
        let bloqueoMod40Vencida = false;
        if (isAbsoluteLastJobMod40 && maxEndDateHist) {
            const gapDesdeUltimoTrabajo = diffDays(today, maxEndDateHist) / 30.4375;
            if (gapDesdeUltimoTrabajo > 12) {
                bloqueoMod40Vencida = true;
            }
        }
        // ------------------------------------------------------------------------------
        let fechaReferenciaBaja = null;
        if (lastMod40EndDate && lastMandatoryEndDate) {
            if (lastMod40EndDate > lastMandatoryEndDate) fechaReferenciaBaja = lastMod40EndDate;
            else fechaReferenciaBaja = lastMandatoryEndDate;
        } else if (lastMod40EndDate) {
            fechaReferenciaBaja = lastMod40EndDate;
        } else {
            fechaReferenciaBaja = lastMandatoryEndDate;
        }
        let gapMeses = Infinity;
        if (fechaReferenciaBaja) {
            gapMeses = diffDays(today, fechaReferenciaBaja) / 30.4375;
        }
        const esLey73 = this.user_data.law === "Ley73";
        const mayor60 = this.user_data.current_age >= 60;
        const masDe1000Semanas = this.user_data.contributed_weeks > 1000;
        const gapMayor11Meses = gapMeses > 11;
        const gapMayor60Meses = gapMeses > 60;
        let reingresoValidoMod40 = true;
        let esRefMod40 = false;
        if (fechaReferenciaBaja && lastMod40EndDate && fechaReferenciaBaja.getTime() === lastMod40EndDate.getTime()) {
            esRefMod40 = true;
            if (gapMeses > 12) reingresoValidoMod40 = false;
        }
        // Aplicamos el bloqueo definitivo si el último registro absoluto fue Mod 40 hace más de 12 meses
        if (bloqueoMod40Vencida) {
            reingresoValidoMod40 = false;
        }
        const aplicaRetroactivo = esLey73 && mayor60 && masDe1000Semanas && gapMayor11Meses && reingresoValidoMod40 && !gapMayor60Meses;
        this.user_data.diagnostico_modalidad_40 = {
            es_ley_73: esLey73,
            cumple_regla_52_semanas: statusMod40.Aplica_Mod40,
            aplica_modalidad_40: (esLey73 && statusMod40.Aplica_Mod40),
            fecha_limite_inscripcion: statusMod40.lose_date ? formatDate(statusMod40.lose_date) : "N/A",
            edad_60_mas: mayor60,
            semanas_mayor_1000: masDe1000Semanas,
            gap_mayor_11_meses: gapMayor11Meses,
            reingreso_valido_m40: reingresoValidoMod40,
            meses_desde_baja_relevante: isFinite(gapMeses) ? parseFloat(gapMeses.toFixed(1)) : "N/A",
            aplica_reingreso_retroactivo: aplicaRetroactivo,
            bloqueo_por_mod40_vencida: bloqueoMod40Vencida
        };
        this.user_data.last_date_no40 = statusMod40.last_date_no40 ? formatDate(statusMod40.last_date_no40) : null;
        // ============================================
        // CÁLCULO ESCENARIO RETROACTIVO (HOY)
        // ============================================
        let escenarioRetroactivo = this.getNAScenario("Modalidad 40 Retroactiva Hoy");
        if (aplicaRetroactivo && fechaReferenciaBaja) {
            const gapDays = diffDays(today, fechaReferenciaBaja);
            if (gapDays > 0) {
                let retroHistory = [];
                const yearUltimaBaja = fechaReferenciaBaja.getFullYear();
                const refSalaryRetroactivo = 25 * getExtendedUma(yearUltimaBaja);
                for (let i = 0; i < gapDays; i++) {
                     const d = addDays(today, -i);
                     const y = d.getFullYear();
                     retroHistory.push({ base_salary: refSalaryRetroactivo, min_wage: getExtendedMinWage(y), fecha: formatDate(d) });
                }
                const sortedDates = Object.keys(this.daily_map).sort().reverse();
                for (const dStr of sortedDates) {
                     const d = parseDate(dStr);
                     if (d <= fechaReferenciaBaja) {
                         retroHistory.push({...this.daily_map[dStr], fecha: dStr});
                     }
                }
                const pool = retroHistory.slice(0, 1750);
                const avgSalRetro = pool.reduce((a,b)=>a+b.base_salary,0) / pool.length;
                const avgMinRetro = pool.reduce((a,b)=>a+b.min_wage,0) / pool.length;
                const weeksInGap = gapDays / 7;
                const totalWeeksRetro = this.user_data.contributed_weeks + weeksInGap;
                const calcRetro = new Ley73PensionCalculator(this.user_data.current_age, avgMinRetro, avgSalRetro, totalWeeksRetro, today.getFullYear());
                const resRetro = calcRetro.calculatePension();
                const breakdownHoy = this.calculateRetroCostBreakdown(fechaReferenciaBaja, today, refSalaryRetroactivo);
                resRetro.aplica = true;
                resRetro.fecha_pension_objetivo = formatDate(today);
                resRetro.salaryTypeUsed = "retroactivo_mod40";
                resRetro.sar92_estimado = this.user_data.SAR92;
                resRetro.infonavit_estimado = this.user_data.INFONAVIT;
                const retiro_aportado_hoy = breakdownHoy.meses_pagados * 30.4 * refSalaryRetroactivo * 0.02;
                resRetro.rcv97_estimado = this.user_data.RCV97 + Math.round(retiro_aportado_hoy);
                resRetro.desglose_retro_meses = breakdownHoy.meses_pagados;
                resRetro.desglose_retro_cuota_base = breakdownHoy.cuota_base_total;
                resRetro.desglose_retro_actualizacion = breakdownHoy.monto_actualizacion;
                resRetro.desglose_retro_recargos = breakdownHoy.monto_recargos;
                resRetro.desglose_retro_total = breakdownHoy.inversion_total_estimada;
                // Costo total del proyecto: saldo IMSS + fee despacho (bracket) + gestorias fijas
                const projectCostHoy = calculateProjectCost(breakdownHoy.inversion_total_estimada);
                resRetro.costo_imss = projectCostHoy.costo_imss;
                resRetro.costo_despacho_pct = projectCostHoy.costo_despacho_pct;
                resRetro.costo_despacho = projectCostHoy.costo_despacho;
                resRetro.costo_gestorias = projectCostHoy.costo_gestorias;
                resRetro.costo_proyecto_retroactivo = projectCostHoy.total_project_cost;
                escenarioRetroactivo = this.formatScenario(resRetro, "Modalidad 40 Retroactiva Hoy", "Ley73");
            }
        }
        // ============================================
        // CÁLCULO ESCENARIO RETROACTIVO (FUTURO IDEAL)
        // ============================================
        let escenarioRetroactivoFuturo = this.getNAScenario("Futuro Retroactivo");
        let fechaInicioEspera = null;
        let esBajaMod40Futura = false;
        if (this.user_data.status === "empleado") {
            fechaInicioEspera = today;
            esBajaMod40Futura = false;
        } else {
            fechaInicioEspera = fechaReferenciaBaja;
            esBajaMod40Futura = esRefMod40;
        }
        if (esLey73 && fechaInicioEspera) {
            const fecha60 = addDays(bd, 60 * 365.25);
            const fechaGap11Meses = addDays(fechaInicioEspera, Math.round(11 * 30.4375) + 1);
            let fecha1000Semanas = fechaInicioEspera;
            const weeksNow = this.user_data.contributed_weeks;
            if (weeksNow < 1000) {
                const weeksMissing = 1000 - weeksNow;
                const daysMissing = Math.ceil(weeksMissing * 7);
                fecha1000Semanas = addDays(fechaInicioEspera, daysMissing);
            }
            let rawTargetDate = new Date(Math.max(today.getTime(), fecha60.getTime(), fechaGap11Meses.getTime(), fecha1000Semanas.getTime()));
            const milestones = [];
            milestones.push(addDays(bd, 60 * 365.25));
            milestones.push(addDays(bd, (60 * 365.25) + 183));
            milestones.push(addDays(bd, (61 * 365.25) + 183));
            milestones.push(addDays(bd, (62 * 365.25) + 183));
            milestones.push(addDays(bd, (63 * 365.25) + 183));
            milestones.push(addDays(bd, (64 * 365.25) + 183));
            milestones.push(addDays(bd, 65 * 365.25));
            let targetDate = rawTargetDate;
            const lastMilestone = milestones[milestones.length - 1];
            if (rawTargetDate > lastMilestone) {
                targetDate = addDays(rawTargetDate, 183);
            } else {
                for (const m of milestones) {
                    if (m >= rawTargetDate) {
                        const gapDaysEstimado = diffDays(m, fechaInicioEspera);
                        if (this.user_data.status === "empleado") {
                            if (gapDaysEstimado >= 300) {
                                targetDate = m;
                                break;
                            }
                        } else {
                            targetDate = m;
                            break;
                        }
                    }
                }
                if (targetDate < rawTargetDate) targetDate = lastMilestone > rawTargetDate ? lastMilestone : rawTargetDate;
            }
            let posibleFuturo = true;
            // --- RESTRICCIÓN APLICADA AL FUTURO ---
            if (bloqueoMod40Vencida) {
                posibleFuturo = false;
            } else if (esBajaMod40Futura) {
                const limiteMod40 = addDays(fechaInicioEspera, Math.round(12 * 30.4375));
                if (targetDate > limiteMod40) posibleFuturo = false;
            } else {
                const limitePatron = addDays(fechaInicioEspera, Math.round(5 * 365.25));
                const gapTotalMeses = diffDays(targetDate, fechaInicioEspera) / 30.4375;
                if (targetDate > limitePatron || gapTotalMeses > 60) {
                    targetDate = limitePatron;
                    if (targetDate <= today) posibleFuturo = false;
                }
            }
            if (targetDate < fecha60) {
                posibleFuturo = false;
            }
            if (posibleFuturo) {
                 const gapDays = diffDays(targetDate, fechaInicioEspera);
                 if (gapDays > 30) {
                     let retroHistory = [];
                     const yearUltimaBaja = fechaInicioEspera.getFullYear();
                     const refSalaryRetroactivo = 25 * getExtendedUma(yearUltimaBaja);
                     for (let i = 0; i < gapDays; i++) {
                          const d = addDays(targetDate, -i);
                          const y = d.getFullYear();
                          retroHistory.push({ base_salary: refSalaryRetroactivo, min_wage: getExtendedMinWage(y), fecha: formatDate(d) });
                     }
                     const sortedDates = Object.keys(this.daily_map).sort().reverse();
                     for (const dStr of sortedDates) {
                          const d = parseDate(dStr);
                          if (d <= fechaInicioEspera) {
                              retroHistory.push({...this.daily_map[dStr], fecha: dStr});
                          }
                     }
                     const pool = retroHistory.slice(0, 1750);
                     const avgSalFut = pool.reduce((a,b)=>a+b.base_salary,0) / pool.length;
                     const avgMinFut = pool.reduce((a,b)=>a+b.min_wage,0) / pool.length;
                     const weeksInGap = gapDays / 7;
                     const totalWeeksFut = this.user_data.contributed_weeks + weeksInGap;
                     const futureAge = (targetDate - bd) / (1000 * 60 * 60 * 24 * 365.25);
                     const calcFut = new Ley73PensionCalculator(futureAge, avgMinFut, avgSalFut, totalWeeksFut, targetDate.getFullYear());
                     const resFut = calcFut.calculatePension();
                     const breakdownFuturo = this.calculateRetroCostBreakdown(fechaInicioEspera, targetDate, refSalaryRetroactivo);
                     resFut.aplica = true;
                     resFut.fecha_pension_objetivo = formatDate(targetDate);
                     resFut.salaryTypeUsed = "retroactivo_mod40_futuro";
                     resFut.contributedWeeks = totalWeeksFut;
                     // v5.3: proyección por subcuenta en pesos de hoy (Siefore generacional; Infonavit premio real ~1%)
                     const factorFutSiefore = factorCapitalizacion(today, targetDate, this.rateSiefore);
                     const factorFutInfonavit = factorCapitalizacion(today, targetDate, getRendimientoInfonavit);
                     resFut.sar92_estimado = Math.round(this.user_data.SAR92 * factorFutSiefore);
                     resFut.infonavit_estimado = Math.round(this.user_data.INFONAVIT * factorFutInfonavit);
                     const retiro_aportado_fut = breakdownFuturo.meses_pagados * 30.4 * refSalaryRetroactivo * 0.02;
                     resFut.rcv97_estimado = Math.round((this.user_data.RCV97 + retiro_aportado_fut) * factorFutSiefore);
                     resFut.desglose_retro_meses = breakdownFuturo.meses_pagados;
                     resFut.desglose_retro_cuota_base = breakdownFuturo.cuota_base_total;
                     resFut.desglose_retro_actualizacion = breakdownFuturo.monto_actualizacion;
                     resFut.desglose_retro_recargos = breakdownFuturo.monto_recargos;
                     resFut.desglose_retro_total = breakdownFuturo.inversion_total_estimada;
                     // Costo total del proyecto: saldo IMSS + fee despacho (bracket) + gestorias fijas
                     const projectCostFut = calculateProjectCost(breakdownFuturo.inversion_total_estimada);
                     resFut.costo_imss = projectCostFut.costo_imss;
                     resFut.costo_despacho_pct = projectCostFut.costo_despacho_pct;
                     resFut.costo_despacho = projectCostFut.costo_despacho;
                     resFut.costo_gestorias = projectCostFut.costo_gestorias;
                     resFut.costo_proyecto_retroactivo = projectCostFut.total_project_cost;
                     escenarioRetroactivoFuturo = this.formatScenario(resFut, `Futuro Retroactivo (${formatDate(targetDate)})`, "Ley73");
                 }
            }
        }
        // =========================================================================
        // LEY 73 (Cálculo Estándar)
        // =========================================================================
        for (let i=0; i<11; i++) {
            const ra = initialAge + (i*0.5);
            const rd = addDays(bd, ra*365.25);
            const ry = rd.getFullYear();
            for (const s of salaries) {
                const proyectarFuturo = true;
                const [sc, sm] = this.calculateAverageContributionSalary(ra, s.v, proyectarFuturo);
                const weeksToAdd = proyectarFuturo ? ((ra - this.user_data.current_age)*52.17) : 0;
                const cw = this.user_data.contributed_weeks + weeksToAdd;
                let mantiene = false;
                let motivo = cons.motivo;
                if (proyectarFuturo && weeksToAdd > 2) {
                    mantiene = true; motivo = "Vigencia por proyección futura.";
                } else {
                    const fechaPerdida = parseDate(cons.fecha_perdida_futura || cons.fecha_perdida || cons.fecha_vencimiento);
                    if (cons.conserva_derechos && fechaPerdida >= rd) {
                        mantiene = true; motivo = "Conserva derechos por tiempo de espera.";
                    } else {
                        mantiene = false; motivo = "Pierde conservación antes de llegar a la edad objetivo.";
                    }
                }
                if (!mantiene) {
                    results73.push({ retirementAge: ra, salaryTypeUsed: s.t, result: "No conserva derechos", motivo: motivo, calculatedPension: 0 });
                    continue;
                }
                const calc = new Ley73PensionCalculator(ra, sm, sc, cw, ry);
                const res = calc.calculatePension();
                const costs = this.calculateVoluntaryCosts(rd, s.v);
                res.salaryTypeUsed = s.t;
                res.fecha_pension_objetivo = formatDate(rd);
                // v5.3: proyección por subcuenta en pesos de hoy (Siefore generacional; Infonavit premio real ~1%)
                const factorEstSiefore = factorCapitalizacion(today, rd, this.rateSiefore);
                const factorEstInfonavit = factorCapitalizacion(today, rd, getRendimientoInfonavit);
                res.sar92_estimado = Math.round(this.user_data.SAR92 * factorEstSiefore);
                res.infonavit_estimado = Math.round(this.user_data.INFONAVIT * factorEstInfonavit);
                res.rcv97_estimado = Math.round(this.user_data.RCV97 * factorEstSiefore);
                if (proyectarFuturo) {
                    res.total_cost = Math.round(costs.total_cost);
                    res.accumulated_cost_12_months = Math.round(costs.accumulated_cost_12_months);
                    res.first_month_cost = Math.round(costs.first_month_cost);
                    res.first_month_modality = costs.first_month_modality;
                } else {
                    res.total_cost = 0;
                    res.accumulated_cost_12_months = 0;
                    res.first_month_cost = null;
                    res.first_month_modality = null;
                }
                results73.push(res);
            }
        }
        // =========================================================================
        // LEY 97
        // =========================================================================
        for (let i=0; i<6; i++) {
             const ra = initialAge + i;
             const rd = addDays(bd, ra*365.25);
             for (const s of salaries) {
                 const weeksToAdd = ((ra - this.user_data.current_age)*52.17);
                 const projectedWeeks = this.user_data.contributed_weeks + weeksToAdd;
                 const futureSal = s.v;
                 const p97Obj = this.calculateLey97Pension(ra, futureSal, projectedWeeks, histUmaRatio);
                 // v5.3: proyección por subcuenta en pesos de hoy (Siefore generacional; Infonavit premio real ~1%)
                 const factorEst97Siefore = factorCapitalizacion(today, rd, this.rateSiefore);
                 const factorEst97Infonavit = factorCapitalizacion(today, rd, getRendimientoInfonavit);
                 results97.push({
                     fecha_pension_objetivo: formatDate(rd),
                     retirementAge: ra,
                     salaryTypeUsed: s.t,
                     calculatedPension: typeof p97Obj.pension === 'number' ? Math.round(p97Obj.pension) : p97Obj.pension,
                     contributedWeeks: projectedWeeks,
                     urv_used: parseFloat(p97Obj.urv.toFixed(2)),
                     applied_ratio: p97Obj.applied_ratio,
                     sar92_estimado: Math.round(this.user_data.SAR92 * factorEst97Siefore),
                     infonavit_estimado: Math.round(this.user_data.INFONAVIT * factorEst97Infonavit),
                     rcv97_estimado: Math.round(p97Obj.rcv_balance)
                 });
             }
        }
        this.simulation_results = { Ley73: results73, Ley97: results97 };
        const scenarios73 = this.selectScenarios(results73, escenarioRetroactivoFuturo);
        const scenarios97 = this.selectScenariosLey97(results97);
        const primaryScenarios = (this.user_data.law === "Ley73" && scenarios73.length > 0) ? scenarios73 : scenarios97;
        return {
            metadata: {
                calculation_success: true,
                curp_processed: this.curp,
                server_version: "2.4.0-f2-castigo-v18",
                timestamp: new Date().toISOString()
            },
            user_data: this.user_data,
            simulation_results: this.simulation_results,
            selected_scenarios: primaryScenarios,
            escenario_mod40_retroactivo: escenarioRetroactivo,
            escenario_mod40_retroactivo_futuro: escenarioRetroactivoFuturo
        };
    }
}
// --- EJECUCIÓN ---
const items = (typeof $input !== 'undefined') ? $input.all() : [];
const returnData = [];
for (const item of items) {
    try {
        const root = item.json.body || item.json;
        const payload = root.payload || root;
        // v5.0: override opcional por item — si el SAR92 del cliente NO está
        // unificado a su Afore (sigue en cuenta concentradora), mandar
        // payload.sar92_en_concentradora = true
        if (payload.sar92_en_concentradora !== undefined) {
            SUPUESTOS_RENDIMIENTO.sar92_en_concentradora = !!payload.sar92_en_concentradora;
        }
        if (!payload.curp) {
            if (payload.user_data && payload.user_data.curp) {
                payload.curp = payload.user_data.curp;
                payload.nombre = payload.user_data.name;
                payload.email = payload.user_data.email;
                payload.employment_history_json = {
                    data: {
                        employment_history: payload.user_data.employment_history,
                        employment_events: payload.user_data.employment_events,
                        employment_info: {
                            nombre: payload.user_data.name,
                            quoted_weeks: payload.user_data.contributed_weeks,
                            discounted_weeks: payload.user_data.discounted_weeks,
                            status: payload.user_data.status,
                            nss: payload.user_data.nss
                        }
                    }
                };
            } else {
                throw new Error("No se encontró CURP en el payload de entrada");
            }
        }
        // v5.3: payload.saldos_motor = { rcv97, sar92 } (opcional) — saldos ya
        // calculados por el motor contrafactual (calculo_pensional.contrafactual);
        // si vienen, la calculadora los usa tal cual en lugar de re-estimarlos.
        const calc = new PensionCalculator(payload.curp, payload.employment_history_json, payload.nombre, payload.email, {
            saldos_motor: payload.saldos_motor || null
        });
        returnData.push({ json: { ...calc.execute(), context: root.context || {} } });
    } catch(e) {
        returnData.push({ json: { error: e.message, stack: e.stack } });
    }
}
return returnData;
