// ============================================================================
// Semilla demo para desarrollo local (forma calculo_pensional v2).
// En producción esto llega de Supabase: clientes.calculo_pensional (jsonb),
// sembrado por el mismo pipeline n8n del portal. Caso real: ALFREDO (Ley 73).
// ============================================================================

const S = 217.67;
const salario_60m = [
  [1, S, 207.44],[2, S, 207.44],[3, S, 207.44],[4, S, 207.44],[5, S, 207.44],
  [6, S, 207.44],[7, S, 207.44],[8, S, 207.44],[9, S, 193.61],[10, S, 172.87],
  [11, S, 172.87],[12, S, 172.87],[13, S, 172.87],[14, S, 172.87],[15, S, 172.87],
  [16, S, 172.87],[17, S, 172.87],[18, S, 172.87],[19, S, 172.87],[20, S, 172.87],
  [21, S, 165.6],[22, S, 141.7],[23, S, 141.7],[24, S, 141.7],[25, S, 141.7],
  [26, S, 141.7],[27, S, 141.7],[28, S, 141.7],[29, S, 141.7],[30, S, 141.7],
  [31, S, 141.7],[32, S, 141.7],[33, S, 140.47],[34, S, 123.22],[35, S, 123.22],
  [36, S, 123.22],[37, S, 123.22],[38, S, 123.22],[39, S, 123.22],[40, S, 123.22],
  [41, S, 123.22],[42, S, 123.22],[43, S, 123.22],[44, S, 123.22],[45, 387.27, 106.25],
  [46, 157.93, 88.36],[47, 209.04, 88.36],[48, 348.68, 80.19],[49, 470.86, 73.04],
  [50, 470.86, 73.04],[51, 470.86, 73.04],[52, 470.86, 73.04],[53, 470.86, 73.04],
  [54, 470.86, 73.04],[55, 470.86, 73.04],[56, 470.86, 73.04],[57, 470.86, 73.04],
  [58, 470.86, 71.47],[59, 470.86, 70.1],[60, 470.86, 70.1],
].map(([mes, salario_diario, salario_minimo]) => ({ mes, salario_diario, salario_minimo }));

export const SEED_DEMO = {
  meta: { curp: 'MOJA661108HMNRNL05', ley: 'Ley73', version_semilla: '2.0.0' },
  perfil: {
    nombre: 'Alfredo',
    curp: 'MOJA661108HMNRNL05',
    nss: '11846602487',
    sexo: 'H',
    fecha_nacimiento: '1966-11-08',
    ley: 'Ley73',
    status_empleo: 'desempleado',
    salario_diario_registrado: 217.67,
    salario_promedio_250: 266.5,
    ratio_historico_salario_uma: 5.73,
    semanas: { cotizadas: 1744, descontadas: 161, recuperadas: 0, netas: 1583 },
    fechas: {
      primera_cotizacion: '1984-01-01',
      ultima_cotizacion_valida: '2023-09-16',
      ultima_cotizacion_mod40: null,
      limite_inscripcion_mod40: '2028-09-14',
      fin_conservacion_derechos: '2032-01-24',
    },
    conserva_derechos: true,
    aplica_mod40: true,
    gap_meses: 32.7,
  },
  saldos: { rcv97: 469555, sar92: 0, infonavit: 249936, ahorro_voluntario: 0, credito_infonavit_vigente: false },
  salario_60m,
};

/** Fecha fija para que el demo sea reproducible (igual que los tests del motor). */
export const HOY_DEMO = new Date(Date.UTC(2026, 5, 8));
