// Fixture real de producción, ANONIMIZADO (nombre/CURP/NSS reemplazados).
// Expediente cuya última cotización fue Modalidad 40 con baja el 2024-09-30:
// la semilla trae el límite de 5 años (2029-09-29) y la regla correcta del
// art. 220 da 2025-09-30, así que a día de hoy la ventana está VENCIDA.
// Sirve para probar que el snapshot congela una ventana que ya no procede.

import type { SalarioMes } from '@/lib/imss/types';
import type { SemillaV2 } from '@/lib/imss/semilla';
import type { RegistroHistorialMod40 } from '@/lib/imss/mod40-ventana';

const salario60m: SalarioMes[] = [
  { mes: 1, salario_diario: 1500, salario_minimo: 248.93 },
  { mes: 2, salario_diario: 1500, salario_minimo: 248.93 },
  { mes: 3, salario_diario: 1500, salario_minimo: 248.93 },
  { mes: 4, salario_diario: 1500, salario_minimo: 248.93 },
  { mes: 5, salario_diario: 1500, salario_minimo: 248.93 },
  { mes: 6, salario_diario: 1500, salario_minimo: 248.93 },
  { mes: 7, salario_diario: 1500, salario_minimo: 248.93 },
  { mes: 8, salario_diario: 1500, salario_minimo: 248.93 },
  { mes: 9, salario_diario: 1500, salario_minimo: 248.93 },
  { mes: 10, salario_diario: 1500, salario_minimo: 211.59 },
  { mes: 11, salario_diario: 1245.9, salario_minimo: 207.44 },
  { mes: 12, salario_diario: 653, salario_minimo: 207.44 },
  { mes: 13, salario_diario: 653, salario_minimo: 207.44 },
  { mes: 14, salario_diario: 407.37, salario_minimo: 207.44 },
  { mes: 15, salario_diario: 300, salario_minimo: 207.44 },
  { mes: 16, salario_diario: 300, salario_minimo: 207.44 },
  { mes: 17, salario_diario: 300, salario_minimo: 207.44 },
  { mes: 18, salario_diario: 300, salario_minimo: 207.44 },
  { mes: 19, salario_diario: 300, salario_minimo: 207.44 },
  { mes: 20, salario_diario: 300, salario_minimo: 207.44 },
  { mes: 21, salario_diario: 300, salario_minimo: 207.44 },
  { mes: 22, salario_diario: 300, salario_minimo: 183.24 },
  { mes: 23, salario_diario: 300, salario_minimo: 172.87 },
  { mes: 24, salario_diario: 300, salario_minimo: 172.87 },
  { mes: 25, salario_diario: 300, salario_minimo: 172.87 },
  { mes: 26, salario_diario: 300, salario_minimo: 172.87 },
  { mes: 27, salario_diario: 300, salario_minimo: 172.87 },
  { mes: 28, salario_diario: 300, salario_minimo: 172.87 },
  { mes: 29, salario_diario: 300, salario_minimo: 172.87 },
  { mes: 30, salario_diario: 300, salario_minimo: 172.87 },
  { mes: 31, salario_diario: 300, salario_minimo: 172.87 },
  { mes: 32, salario_diario: 300, salario_minimo: 172.87 },
  { mes: 33, salario_diario: 300, salario_minimo: 172.87 },
  { mes: 34, salario_diario: 300, salario_minimo: 156.25 },
  { mes: 35, salario_diario: 300, salario_minimo: 141.7 },
  { mes: 36, salario_diario: 300, salario_minimo: 141.7 },
  { mes: 37, salario_diario: 300, salario_minimo: 141.7 },
  { mes: 38, salario_diario: 300, salario_minimo: 141.7 },
  { mes: 39, salario_diario: 157.32, salario_minimo: 141.7 },
  { mes: 40, salario_diario: 128.79, salario_minimo: 126.3 },
  { mes: 41, salario_diario: 128.79, salario_minimo: 123.22 },
  { mes: 42, salario_diario: 128.79, salario_minimo: 123.22 },
  { mes: 43, salario_diario: 128.79, salario_minimo: 123.22 },
  { mes: 44, salario_diario: 128.79, salario_minimo: 123.22 },
  { mes: 45, salario_diario: 128.79, salario_minimo: 123.22 },
  { mes: 46, salario_diario: 128.79, salario_minimo: 123.22 },
  { mes: 47, salario_diario: 128.79, salario_minimo: 107.47 },
  { mes: 48, salario_diario: 128.79, salario_minimo: 102.68 },
  { mes: 49, salario_diario: 128.79, salario_minimo: 102.68 },
  { mes: 50, salario_diario: 128.79, salario_minimo: 102.68 },
  { mes: 51, salario_diario: 128.79, salario_minimo: 102.68 },
  { mes: 52, salario_diario: 128.79, salario_minimo: 102.68 },
  { mes: 53, salario_diario: 128.79, salario_minimo: 102.68 },
  { mes: 54, salario_diario: 128.79, salario_minimo: 102.68 },
  { mes: 55, salario_diario: 128.79, salario_minimo: 102.68 },
  { mes: 56, salario_diario: 128.79, salario_minimo: 102.68 },
  { mes: 57, salario_diario: 128.79, salario_minimo: 102.68 },
  { mes: 58, salario_diario: 128.79, salario_minimo: 102.68 },
  { mes: 59, salario_diario: 128.79, salario_minimo: 94.09 },
  { mes: 60, salario_diario: 128.79, salario_minimo: 88.36 },
];

export const semillaMod40: SemillaV2 = {
  meta: { curp: 'XXXX000000XXXXXX00', ley: 'Ley73', version_semilla: '2.0' },
  perfil: {
    nombre: 'ANON',
    curp: 'XXXX000000XXXXXX00',
    nss: '00000000000',
    sexo: 'M',
    fecha_nacimiento: '1966-05-17',
    ley: 'Ley73',
    status_empleo: 'desempleado',
    salario_diario_registrado: 1500,
    salario_promedio_250: 476.68,
    ratio_historico_salario_uma: 2.56,
    semanas: { cotizadas: 1530, descontadas: 0, recuperadas: 0, netas: 1530 },
    fechas: {
      primera_cotizacion: '1990-04-01',
      ultima_cotizacion_valida: '2024-09-30',
      ultima_cotizacion_mod40: null,
      // 5 años: es el dato VIEJO de la semilla. El bueno son 12 meses.
      limite_inscripcion_mod40: '2029-09-29',
      fin_conservacion_derechos: '2032-01-26',
    },
    conserva_derechos: true,
    aplica_mod40: true,
    gap_meses: 21.91,
  },
  saldos: {
    rcv97: 319735,
    sar92: 10258,
    infonavit: 97463,
    ahorro_voluntario: 0,
    credito_infonavit_vigente: false,
  },
  salario_60m: salario60m,
};

/** El último registro es Mod 40 y se delata por el RP terminado en 9999940. */
export const historialMod40: RegistroHistorialMod40[] = [
  { empleador: 'CONTINUACION VOLUNTARIA EN EL REGIMEN OBLIGATORIO', fecha_fin: '2024-09-30', fecha_inicio: '2023-11-14', salario_base: 1500, registro_patronal: 'F799999940' },
  { empleador: 'QUEZAR', fecha_fin: '2023-10-31', fecha_inicio: '2023-08-16', salario_base: 653, registro_patronal: 'D456578910' },
  { empleador: 'CONTINUACION VOLUNTARIA EN EL REGIMEN OBLIGATORIO', fecha_fin: '2023-07-31', fecha_inicio: '2021-07-14', salario_base: 300, registro_patronal: 'F799999940' },
  { empleador: 'MOISES M B', fecha_fin: '2020-07-31', fecha_inicio: '2015-04-16', salario_base: 128.79, registro_patronal: 'G031753310' },
];

/** El límite correcto según el expediente de trol3 (baja + 12 meses). */
export const LIMITE_EXPEDIENTE = '2025-09-30';
