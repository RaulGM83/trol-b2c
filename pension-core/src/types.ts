// ============================================================================
// Tipos del motor IMSS — espejo de la semilla calculo_pensional v2
// (ver SEMILLA_CALCULO_PENSIONAL_V2.md en el proyecto Producto B2B)
// ============================================================================

export type Ley = 'Ley73' | 'Ley97';
export type Sexo = 'H' | 'M';

export interface PerfilSemilla {
  nombre: string;
  curp: string;
  nss: string;
  sexo: Sexo;
  fecha_nacimiento: string; // ISO YYYY-MM-DD
  ley: Ley;
  status_empleo: 'empleado' | 'desempleado';
  salario_diario_registrado: number;
  salario_promedio_250: number;
  ratio_historico_salario_uma: number;
  semanas: {
    cotizadas: number;
    descontadas: number;
    recuperadas: number;
    netas: number;
  };
  fechas: {
    primera_cotizacion: string | null;
    ultima_cotizacion_valida: string;
    ultima_cotizacion_mod40: string | null;
    limite_inscripcion_mod40: string | null;
    fin_conservacion_derechos: string | null;
  };
  conserva_derechos: boolean;
  aplica_mod40: boolean;
  gap_meses: number;
}

export interface SaldosSemilla {
  rcv97: number;
  sar92: number;
  infonavit: number;
  ahorro_voluntario: number;
  credito_infonavit_vigente: boolean;
}

export interface SalarioMes {
  mes: number; // 1 = mes más reciente
  salario_diario: number;
  salario_minimo: number;
}

/** Palancas que mueve el asesor en la calculadora web. */
export interface Palancas {
  /** Edad de retiro deseada. Mínimo efectivo: max(60, edad actual). */
  edadRetiro: number;
  /** % del tiempo hasta el retiro que va a cotizar. */
  pctTiempoCotizando: 0 | 0.25 | 0.5 | 0.75 | 1;
  /** Salario diario de cotización Mod40 / futuro (315.04 – 2933.75 = 25 UMA). */
  salarioMod40: number;
  /** Recuperar semanas descontadas al pensionarse. */
  recuperarSemanasDescontadas: boolean;
  /** Recuperar semanas vía Mod40 retroactivo (solo si aplica hoy). */
  recuperarSemanasMod40Retro: boolean;
  /** Salario con el que se paga el retroactivo. */
  salarioCotizacionRetro: 'MINIMO' | 'MAXIMO';
  /** Ley 97: tiene/usará crédito Infonavit (anula saldo Infonavit de la pensión). */
  usaCreditoInfonavit: boolean;
  /** Ley 97: aportación voluntaria mensual (default 0). */
  ahorroVoluntarioMensual: number;
  /** Overrides de saldos estimados (si el asesor tiene el dato real). */
  overrides?: {
    rcv97?: number;
    sar92?: number;
    infonavit?: number;
    ahorroVoluntario?: number;
  };
}

export interface EntradaCalculo {
  perfil: PerfilSemilla;
  saldos: SaldosSemilla;
  salario_60m: SalarioMes[];
  palancas: Palancas;
  /** Fecha de cálculo (default: hoy). Fijarla permite tests reproducibles. */
  hoy?: Date;
}

export interface DesgloseRetro {
  meses: number;
  cuotaBase: number;
  actualizaciones: number;
  recargos: number;
  total: number;
}

export interface ResultadoLey73 {
  ley: 'Ley73';
  /** Pensión mensual (null = negativa de pensión). */
  pensionMensual: number | null;
  negativa: boolean;
  /** Detalle del cálculo (para mostrar el "cómo"). */
  detalle: {
    edadActual: number;
    fechaRetiro: Date;
    semanasRetiro: number;
    salarioCot250: number;
    salarioMin250: number;
    factorSalarial: number;
    cuantiaBasica: number;
    incrementos: number;
    asignaciones: number;
    ajusteEdad: number;
    pensionMinima: number;
    pensionMaxima: number;
    advertenciaConservacion: boolean;
  };
  /** Mod40 retroactivo (si aplica y se activó la palanca). */
  retro: DesgloseRetro | null;
  aplicaRetroHoy: boolean;
  semanasRecuperablesRetro: number;
  /** Costo de la estrategia futura de cotización (Mod40/Mod10). */
  costoEstrategiaFutura: number;
  costoMensualPrimerMes: number;
  modalidadPrimerMes: 10 | 40 | null;
  /** Costo total (retro + estrategia). */
  costoTotal: number;
}

export interface ResultadoLey97 {
  ley: 'Ley97';
  pensionAfore: number | null;
  pensionAforeInfonavit: number | null;
  pensionTotal: number | null; // + ahorro voluntario
  negativa: boolean;
  detalle: {
    edadActual: number;
    fechaRetiro: Date;
    semanasRetiro: number;
    semanasMinimasPMG: number;
    saldoAforeProyectado: number;
    saldoInfonavitProyectado: number;
    saldoAhorroVoluntario: number;
    urv: number;
    pmg: number;
    aportacionesFuturas: number;
  };
}

export interface ProyectoMod40 {
  /** Sin proyecto: escenario base. */
  sinProyecto: { pensionMensual: number; valorPension: number; valorTotal: number };
  /** Con proyecto. */
  conProyecto: { pensionMensual: number; valorPension: number; efectivoAlRetiro: number; valorTotal: number };
  /** Pago al IMSS. */
  pagoImss: DesgloseRetro;
  /** Costos del despacho. */
  costos: {
    gestorias: number;
    gastosAdministrativos: number;
    comisionApertura: number;
    total: number;
  };
  financiamiento: { meses: number; tasa: number; interes: number; total: number };
  totalAPagar: number;
  creditoDxn: { credito: number; retroactivo: number; efectivoNeto: number };
  /**
   * Flujo de efectivo del proyecto: ¿el cliente pone dinero de su bolsa o le
   * sobra? resultado > 0 = le sobra; resultado < 0 = debe poner |resultado|.
   */
  efectivo: {
    /** Saldos disponibles hoy (SAR92 + porción RCV97 + Infonavit). */
    saldosDisponibles: number;
    /** Retiro 2% recuperado por los meses retroactivos pagados (va a la AFORE). */
    retiro97Recuperado: number;
    /** saldosDisponibles + retiro97Recuperado. */
    totalDisponible: number;
    /** Total a pagar − crédito DXN − retroactivo de pensión. */
    efectivoNetoAPagar: number;
    /** totalDisponible − efectivoNetoAPagar (= L10 del Excel). */
    resultado: number;
  };
  multiplicadorPension: number;
  multiplicadorValor: number;
}
