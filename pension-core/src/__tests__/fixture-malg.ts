// Fixture real: GERARDO RUBEN (MALG621210HDFRRR01), Ley 73, 63.5 años.
// CASO BORDE: la hoja "Mod40 Retroactivo" del Excel se rompe con edad > 60
// (F16 hardcodeado en 60 → semanas retro negativas y #VALUE!). El motor TS
// usa edadProyecto = max(60, edad actual) y debe producir resultados válidos.

import type { PerfilSemilla, SaldosSemilla, SalarioMes } from '../types';

export const HOY_EXCEL_MALG = new Date(Date.UTC(2026, 5, 10)); // 2026-06-10

export const perfilMalg: PerfilSemilla = {
  nombre: 'Gerardo Ruben',
  curp: 'MALG621210HDFRRR01',
  nss: '10826255654',
  sexo: 'H',
  fecha_nacimiento: '1962-12-10',
  ley: 'Ley73',
  status_empleo: 'desempleado',
  salario_diario_registrado: 261.2,
  salario_promedio_250: 159.35,
  ratio_historico_salario_uma: 2.69,
  semanas: { cotizadas: 919, descontadas: 65, recuperadas: 0, netas: 854 },
  fechas: {
    primera_cotizacion: '1982-11-26',
    ultima_cotizacion_valida: '2024-02-01',
    ultima_cotizacion_mod40: null,
    limite_inscripcion_mod40: '2029-01-30',
    fin_conservacion_derechos: '2028-06-22',
  },
  conserva_derechos: true,
  aplica_mod40: true,
  gap_meses: 28.3,
};

export const saldosMalg: SaldosSemilla = {
  rcv97: 75055,
  sar92: 138324,
  infonavit: 120783,
  ahorro_voluntario: 0,
  credito_infonavit_vigente: false,
};

const datos: Array<[number, number, number]> = [
  [1, 261.2, 248.93], [2, 261.2, 208.82], [3, 261.2, 207.44], [4, 261.2, 207.44],
  [5, 261.2, 207.44], [6, 261.2, 207.44], [7, 261.2, 207.44], [8, 261.2, 207.44],
  [9, 261.2, 207.44], [10, 174.75, 146.84], [11, 215.95, 118.43], [12, 280.34, 102.68],
  [13, 199.51, 102.68], [14, 128.79, 102.68], [15, 128.79, 102.68], [16, 128.79, 102.68],
  [17, 128.79, 102.68], [18, 128.79, 102.68], [19, 128.79, 102.68], [20, 128.79, 102.68],
  [21, 128.79, 102.68], [22, 128.79, 102.68], [23, 128.79, 101.73], [24, 128.79, 88.36],
  [25, 128.79, 88.36], [26, 128.79, 88.36], [27, 128.79, 88.36], [28, 314, 88.36],
  [29, 179.88, 88.36], [30, 128.79, 88.36], [31, 128.79, 88.36], [32, 128.79, 88.36],
  [33, 128.79, 88.36], [34, 128.79, 88.36], [35, 289.95, 88.36], [36, 307.86, 80.87],
  [37, 212.36, 80.04], [38, 128.79, 80.04], [39, 128.79, 80.04], [40, 128.79, 80.04],
  [41, 128.79, 80.04], [42, 128.79, 80.04], [43, 110.18, 80.04], [44, 104.52, 80.04],
  [45, 104.52, 80.04], [46, 104.52, 73.74], [47, 104.52, 73.04], [48, 104.52, 73.04],
  [49, 104.52, 73.04], [50, 193.63, 65.31], [51, 129.98, 59.41], [52, 104.52, 57.46],
  [53, 104.52, 57.46], [54, 91.98, 53.94], [55, 73.16, 48.67], [56, 73.16, 48.67],
  [57, 73.16, 48.67], [58, 73.16, 48.67], [59, 73.16, 47.98], [60, 172.36, 36.31],
];

export const salario60mMalg: SalarioMes[] = datos.map(([mes, sd, sm]) => ({
  mes,
  salario_diario: sd,
  salario_minimo: sm,
}));
