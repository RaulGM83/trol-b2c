// Fixture real: ENRIQUE (CAFE660610HNLHNN07), Ley 73, extraído del Excel
// CALCULADORA_CAFE660610HNLHNN07.xlsx (versión corregida de la hoja Mod40,
// jun-2026: F10→C31, I14=30% plano, I27=pensión×(meses−2)).
// Valores esperados calculados con TODAY() = 2026-06-10 (edad exacta 60.0).

import type { PerfilSemilla, SaldosSemilla, SalarioMes } from '../types';

export const HOY_EXCEL_CAFE = new Date(Date.UTC(2026, 5, 10)); // 2026-06-10

export const perfilCafe: PerfilSemilla = {
  nombre: 'Enrique',
  curp: 'CAFE660610HNLHNN07',
  nss: '43906696208',
  sexo: 'H',
  fecha_nacimiento: '1966-06-10',
  ley: 'Ley73',
  status_empleo: 'desempleado',
  salario_diario_registrado: 261.55,
  salario_promedio_250: 241.26,
  ratio_historico_salario_uma: 1.99,
  semanas: { cotizadas: 1320, descontadas: 0, recuperadas: 0, netas: 1320 },
  fechas: {
    primera_cotizacion: '1990-06-01',
    ultima_cotizacion_valida: '2024-05-31',
    ultima_cotizacion_mod40: null,
    limite_inscripcion_mod40: '2029-05-30',
    fin_conservacion_derechos: '2030-09-27',
  },
  conserva_derechos: true,
  aplica_mod40: true,
  gap_meses: 24.3,
};

export const saldosCafe: SaldosSemilla = {
  rcv97: 145915,
  sar92: 24834,
  infonavit: 94737,
  ahorro_voluntario: 0,
  credito_infonavit_vigente: false,
};

// Hoja "Información Personal" filas 182-241 (mes 1 = más reciente)
const S = 261.55;
const datos: Array<[number, number, number]> = [
  [1, S, 248.93], [2, S, 248.93], [3, S, 248.93], [4, S, 248.93], [5, S, 248.93],
  [6, S, 208.82], [7, S, 207.44], [8, S, 207.44], [9, S, 207.44], [10, S, 207.44],
  [11, S, 207.44], [12, S, 207.44], [13, S, 207.44], [14, S, 207.44], [15, S, 207.44],
  [16, S, 207.44], [17, S, 207.44], [18, S, 179.78], [19, S, 172.87], [20, S, 172.87],
  [21, S, 172.87], [22, S, 172.87], [23, S, 172.87], [24, S, 172.87], [25, S, 172.87],
  [26, S, 172.87], [27, S, 172.87], [28, 281.79, 156.49], [29, 348.28, 102.68],
  [30, 348.28, 102.68], [31, 297.99, 102.68], [32, 240.51, 102.68], [33, 202.74, 93.61],
  [34, 180.88, 88.36], [35, 180.88, 88.36], [36, 180.88, 88.36], [37, 180.88, 85.86],
  [38, 180.88, 80.04], [39, 180.88, 80.04], [40, 180.88, 80.04], [41, 327.56, 80.04],
  [42, 275.86, 80.04], [43, 209.54, 80.04], [44, 209.54, 80.04], [45, 209.54, 80.04],
  [46, 209.54, 80.04], [47, 209.54, 80.04], [48, 209.54, 80.04], [49, 209.54, 79.11],
  [50, 209.54, 73.04], [51, 209.54, 73.04], [52, 209.54, 73.04], [53, 209.54, 73.04],
  [54, 209.54, 73.04], [55, 209.54, 73.04], [56, 209.54, 73.04], [57, 209.54, 73.04],
  [58, 209.54, 73.04], [59, 209.54, 73.04], [60, 209.54, 73.04],
];

export const salario60mCafe: SalarioMes[] = datos.map(([mes, sd, sm]) => ({
  mes,
  salario_diario: sd,
  salario_minimo: sm,
}));
