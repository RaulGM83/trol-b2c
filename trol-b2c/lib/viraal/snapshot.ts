// ============================================================================
// Snapshot de un escenario autorizado.
//
// La idea completa cabe en una frase: lo que se autorizó tiene que quedar
// escrito, no derivable. El proyecto depende de la fecha de trámite, de la
// semilla del día, del historial y de la versión del motor; cualquiera de las
// cuatro se mueve sola con el tiempo. Reconstruir "lo que se autorizó el
// martes" a partir del estado de hoy no es posible, así que se guarda entero.
//
// Este módulo es PURO a propósito (no toca Supabase ni React): así el
// round-trip se puede testear sin base de datos, y el mismo objeto que se
// imprime en el PDF es el que viaja a la RPC — sin re-derivar nada por el
// camino, que es donde se colarían las diferencias.
// ============================================================================

import { computeProyectoMod40 } from '@/lib/imss/mod40-proyecto';
import type { RegistroHistorialMod40, VentanaMod40 } from '@/lib/imss/mod40-ventana';
import { MOTOR_ID, MOTOR_VERSION } from '@/lib/imss/version';
import type { SemillaV2 } from '@/lib/imss/semilla';
import type { Palancas, ProyectoMod40 } from '@/lib/imss/types';

/** Los diez bloques numéricos de `computeProyectoMod40`, sin fecha ni ventana. */
export type ResultadoSnapshot = Omit<ProyectoMod40, 'fechaTramite' | 'ventana' | 'avisos'>;

/**
 * Ventana con las fechas ya en ISO, que es como sobreviven a `jsonb`.
 *
 * `avisos` son los de `ventanaMod40` (ventana, SBC del art. 65). `avisos_proyecto`
 * son TODOS los que vio el asesor: esos más los que agrega el motor con el perfil
 * en la mano (retro parcial, conservación vencida, edad). Se guardan los dos
 * porque el segundo es lo que de verdad se imprimió, y el primero es la salida
 * literal de `ventanaMod40`.
 */
export interface VentanaSnapshot extends Omit<VentanaMod40, 'ultimaBaja' | 'fechaLimite'> {
  ultimaBaja: string | null;
  fechaLimite: string | null;
  avisos_proyecto: string[];
}

/**
 * Todo lo que hace falta para volver a correr el cálculo tal cual corrió.
 *
 * `palancas`, `umasProyecto` y `semanasExtra` NO estaban en el spec original,
 * pero sin ellas el snapshot no se puede recalcular: el resultado depende de la
 * edad de retiro, del tope de UMAs y del toggle de semanas descontadas. Sin
 * esto el test de round-trip sería imposible de escribir.
 */
export interface InputsSnapshot {
  motor_version: string;
  motor_id: string;
  semilla: SemillaV2;
  historial: RegistroHistorialMod40[];
  fecha_tramite: string; // ISO YYYY-MM-DD
  limite_inscripcion_mod40: string | null;
  palancas: Palancas;
  umas_proyecto: number | null;
  semanas_extra: number | null;
}

export interface SnapshotEscenario {
  inputs: InputsSnapshot;
  resultado: ResultadoSnapshot;
  ventana: VentanaSnapshot;
  /** Atajo de `ventana.avisos_proyecto`: lo que el asesor tenía enfrente. */
  avisos: string[];
}

export interface EntradaSnapshot {
  semilla: SemillaV2;
  historial?: RegistroHistorialMod40[] | null;
  fechaTramite: Date;
  limiteInscripcionMod40?: string | null;
  palancas: Palancas;
  umasProyecto?: number;
  semanasExtra?: number;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

function serializarVentana(v: VentanaMod40, avisosProyecto: string[]): VentanaSnapshot {
  return {
    ...v,
    ultimaBaja: v.ultimaBaja ? iso(v.ultimaBaja) : null,
    fechaLimite: v.fechaLimite ? iso(v.fechaLimite) : null,
    avisos_proyecto: avisosProyecto,
  };
}

/** Separa los bloques numéricos de los metadatos del resultado del motor. */
function bloquesNumericos(p: ProyectoMod40): ResultadoSnapshot {
  return {
    sinProyecto: p.sinProyecto,
    conProyecto: p.conProyecto,
    pagoImss: p.pagoImss,
    costos: p.costos,
    financiamiento: p.financiamiento,
    totalAPagar: p.totalAPagar,
    creditoDxn: p.creditoDxn,
    efectivo: p.efectivo,
    multiplicadorPension: p.multiplicadorPension,
    multiplicadorValor: p.multiplicadorValor,
  };
}

/**
 * Corre el motor UNA vez y devuelve el snapshot completo. null cuando el
 * proyecto no aplica (mismo criterio que `computeProyectoMod40`).
 */
export function construirSnapshot(e: EntradaSnapshot): SnapshotEscenario | null {
  const historial = e.historial ?? [];
  const proy = computeProyectoMod40({
    perfil: e.semilla.perfil,
    saldos: e.semilla.saldos,
    salario_60m: e.semilla.salario_60m,
    fechaTramite: e.fechaTramite,
    historial,
    limiteInscripcionMod40: e.limiteInscripcionMod40 ?? null,
    palancas: e.palancas,
    ...(e.umasProyecto !== undefined ? { umasProyecto: e.umasProyecto } : {}),
    ...(e.semanasExtra !== undefined ? { semanasExtra: e.semanasExtra } : {}),
  });
  if (!proy) return null;

  return {
    inputs: {
      motor_version: MOTOR_VERSION,
      motor_id: MOTOR_ID,
      semilla: e.semilla,
      historial,
      fecha_tramite: iso(e.fechaTramite),
      limite_inscripcion_mod40: e.limiteInscripcionMod40 ?? null,
      palancas: e.palancas,
      umas_proyecto: e.umasProyecto ?? null,
      semanas_extra: e.semanasExtra ?? null,
    },
    resultado: bloquesNumericos(proy),
    ventana: serializarVentana(proy.ventana, proy.avisos),
    avisos: proy.avisos,
  };
}

/**
 * Vuelve a correr el motor de HOY con los inputs guardados de un snapshot.
 *
 * Sirve para una sola cosa: comparar. Si lo que sale de aquí ya no coincide con
 * el `resultado` de la fila, el motor cambió desde que se autorizó — y **manda
 * el snapshot**, no este recálculo. Nunca se usa para "corregir" una fila.
 */
export function recomputarDesdeInputs(inputs: InputsSnapshot): ResultadoSnapshot | null {
  const proy = computeProyectoMod40({
    perfil: inputs.semilla.perfil,
    saldos: inputs.semilla.saldos,
    salario_60m: inputs.semilla.salario_60m,
    fechaTramite: new Date(`${inputs.fecha_tramite}T00:00:00.000Z`),
    historial: inputs.historial,
    limiteInscripcionMod40: inputs.limite_inscripcion_mod40,
    palancas: inputs.palancas,
    ...(inputs.umas_proyecto !== null ? { umasProyecto: inputs.umas_proyecto } : {}),
    ...(inputs.semanas_extra !== null ? { semanasExtra: inputs.semanas_extra } : {}),
  });
  return proy ? bloquesNumericos(proy) : null;
}

/** ¿El snapshot lo produjo el motor que corre hoy? */
export function snapshotEsDelMotorActual(inputs: Pick<InputsSnapshot, 'motor_version'>): boolean {
  return inputs.motor_version === MOTOR_VERSION;
}
