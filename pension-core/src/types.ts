// ============================================================================
// Tipos del motor IMSS — espejo de la semilla calculo_pensional v2
// (ver SEMILLA_CALCULO_PENSIONAL_V2.md en el proyecto Producto B2B)
// ============================================================================

import type { SerieINPC } from './inpc';
import type { LineasCapturaMod40 } from './mod40-lineas';
import type { VentanaMod40 } from './mod40-ventana';

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
  /**
   * Ajuste de semanas (±) sobre las semanas del cliente: positivas = semanas
   * por recuperar/reconocer (trámite), negativas = riesgo de que el IMSS no
   * reconozca algún periodo. Aplica en Ley 73 y en el proyecto Mod40 (vía
   * semanasExtra). Default 0.
   */
  ajusteSemanas?: number;
  /** Overrides de saldos estimados (si el asesor tiene el dato real). */
  overrides?: {
    rcv97?: number;
    sar92?: number;
    infonavit?: number;
    ahorroVoluntario?: number;
    /**
     * "Disponible AFORE" real capturado por el asesor (un solo número). Si se
     * define, reemplaza al estimado SAR92 + 30% del RCV97 en el efectivo del
     * proyecto Mod40.
     */
    disponibleAfore?: number;
  };
}

export interface EntradaCalculo {
  perfil: PerfilSemilla;
  saldos: SaldosSemilla;
  salario_60m: SalarioMes[];
  palancas: Palancas;
  /** Fecha de cálculo (default: hoy). Fijarla permite tests reproducibles. */
  hoy?: Date;
  /**
   * Serie INPC para las actualizaciones de la línea de captura del Mod 40.
   * El servidor la lee de `trol3.inpc_mensual`; sin ella el motor usa el
   * fallback embebido de `inpc.ts`, que puede ir un mes atrás del INEGI.
   */
  serieINPC?: SerieINPC;
}

export interface DesgloseRetro {
  meses: number;
  cuotaBase: number;
  actualizaciones: number;
  recargos: number;
  total: number;
}

/**
 * Por qué se negó en Ley 73. Son DOS requisitos independientes: llegar a 500
 * semanas y tener vigente la conservación de derechos (Art. 150 LSS). El motor
 * solo miraba las semanas, así que quien perdió la conservación veía un monto
 * que sin reactivar no le corresponde.
 */
export interface RazonNegativa73 {
  /** No llega a las 500 semanas al retiro. */
  faltanSemanas: boolean;
  /** Perdió la conservación de derechos y no la reactiva en este escenario. */
  pierdeConservacion: boolean;
  semanasActuales: number;
  semanasAlRetiro: number;
  /** 500 (Art. 162 LSS 73). */
  semanasRequeridas: number;
  semanasFaltantes: number;
  /** Meses transcurridos desde la última cotización. */
  gapMeses: number;
  /**
   * Art. 151 LSS: semanas de NUEVAS cotizaciones para recuperar las anteriores.
   * 0 si la interrupción no excede 3 años (fracc. I, reconocimiento inmediato);
   * 26 si excede 3 pero no 6 (fracc. II); 52 si excede 6 (fracc. III).
   */
  semanasParaReactivar: number;
  /** Fin del periodo de conservación (Art. 150), si la semilla lo trae. */
  finConservacion: string | null;
}

export interface ResultadoLey73 {
  ley: 'Ley73';
  /** Pensión mensual (null = negativa de pensión). */
  pensionMensual: number | null;
  status: EstatusPension73;
  /** Derivado de `status`; se conserva por compatibilidad. */
  negativa: boolean;
  /** Solo cuando status !== 'viable'. */
  razon: RazonNegativa73 | null;
  /**
   * Monto que le tocaría si el ÚNICO obstáculo es la conservación y la
   * reactiva. null cuando además le faltan semanas o ya es viable.
   */
  pensionSiReactiva: number | null;
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
  /**
   * Retroactivo al pensionarse: si el cliente ya adquirió el derecho (60 años
   * + más de 500 semanas + baja) y se pensiona sin volver a cotizar (pct = 0,
   * sin Mod40 retro), el IMSS le paga la pensión desde la fecha en que
   * adquirió el derecho, topado a 12 meses. null si no aplica.
   */
  retroactivoAlPensionarse: {
    /** Cuándo cumplió todos los requisitos (la más reciente de: 60 años, baja). */
    fechaDerechos: Date;
    /** Meses de retroactivo (tope 12). */
    meses: number;
    /** pensionMensual × meses. */
    monto: number;
  } | null;
  /** Costo de la estrategia futura de cotización (Mod40/Mod10). */
  costoEstrategiaFutura: number;
  costoMensualPrimerMes: number;
  modalidadPrimerMes: 10 | 40 | null;
  /** Costo total (retro + estrategia). */
  costoTotal: number;
}

/**
 * Estatus del escenario. La negativa NO es un valor faltante: es un resultado,
 * y el front debe pintarla como tal en vez de dejar el monto vacío.
 * Vocabulario alineado con `escenario_base_status` de HubSpot
 * (`con_pension` ≡ `viable`; `sin_dato` no se emite desde el motor).
 *
 *  · viable                    → se pensiona.
 *  · negativa                  → no se pensiona y reactivar derechos no es el
 *                                bloqueo (le faltan semanas).
 *  · negativa_sin_reactivacion → sería negativa MIENTRAS no reactive sus
 *                                derechos (Art. 150/151 LSS). Solo Ley 73.
 */
export type EstatusPension = 'viable' | 'negativa' | 'negativa_sin_reactivacion';

/** Ley 97 no emite `negativa_sin_reactivacion` (la conservación es Ley 73). */
export type EstatusPension97 = Extract<EstatusPension, 'viable' | 'negativa'>;

/** Ley 73 puede emitir los tres. */
export type EstatusPension73 = EstatusPension;

/** Por qué se negó: lo que tiene contra lo que exige SU año de retiro. */
export interface RazonNegativa97 {
  anioRetiro: number;
  /** Semanas que ya tiene (netas de descuentos). */
  semanasActuales: number;
  /** Semanas proyectadas a la fecha de retiro (incluye cotización futura). */
  semanasAlRetiro: number;
  /** Umbral del año de retiro (tabla 2021→750 … 2031→1000). */
  semanasRequeridas: number;
  semanasFaltantes: number;
}

/**
 * Qué pasa con su dinero cuando hay negativa (Art. 154 LSS): no se pensiona,
 * pero retira lo acumulado. La palanca para revertirlo es seguir cotizando
 * (Modalidad 10/40) hasta alcanzar las semanas.
 */
export interface SalidaNegativa97 {
  /** Subcuenta RCV en una sola exhibición. */
  retiroUnaExhibicion: number;
  /** Devolución de la subcuenta de vivienda (0 si hay crédito vigente). */
  devolucionVivienda: number;
  /** Ahorro voluntario, disponible en cualquier caso. */
  ahorroVoluntario: number;
  /** Total que se lleva si acepta la negativa. */
  total: number;
  /** Semanas que le faltan para revertirla cotizando. */
  semanasFaltantes: number;
}

export interface ResultadoLey97 {
  ley: 'Ley97';
  pensionAfore: number | null;
  pensionAforeInfonavit: number | null;
  pensionTotal: number | null; // + ahorro voluntario
  status: EstatusPension97;
  /** Derivado de `status`; se conserva por compatibilidad. */
  negativa: boolean;
  /** Solo cuando status === 'negativa'. */
  razon: RazonNegativa97 | null;
  /** Solo cuando status === 'negativa'. */
  salida: SalidaNegativa97 | null;
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
  /**
   * Fecha de inicio de trámite con la que se calculó todo el proyecto. Es
   * también la fecha de retiro: en este producto se paga el retroactivo y se
   * pensiona en el mismo acto, así que fecha y edad no son independientes.
   */
  fechaTramite: Date;
  /** El día que el cliente cumple 60: el trámite no puede ser antes. */
  fechaMinimaTramite: Date;
  /** true si la fecha pedida era anterior a los 60 y se recorrió a ese día. */
  recorridaA60: boolean;
  /** Edad exacta a `fechaTramite` (piso 60). La UI la muestra derivada. */
  edadProyecto: number;
  /**
   * Ventana de reingreso (art. 219 / 220 LSS) a esa fecha. Informativa: una
   * ventana vencida NO anula los números, solo los acompaña de un aviso.
   */
  ventana: VentanaMod40;
  /** Avisos en lenguaje llano (ventana, conservación, edad, retro parcial). */
  avisos: string[];
  /**
   * La línea de captura con precisión diaria, con su desglose mes a mes.
   * `pagoImss` es su resumen; esto trae el detalle y la trazabilidad del INPC.
   * NO va al snapshot (son 60+ filas por variante): del snapshot se congela
   * sólo la serie INPC del tramo.
   */
  lineas: LineasCapturaMod40;
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
