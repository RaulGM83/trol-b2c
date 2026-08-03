// ============================================================================
// Régimen de transición: quien cotizó antes del 1-jul-1997 puede pensionarse
// por Ley 73, pero ese derecho depende de conservar la conservación de
// derechos (Art. 150 LSS). Si la perdió y no la reactiva (Art. 151), la Ley 73
// deja de estar disponible y su ruta es la Ley 97 con el saldo de su AFORE,
// siempre que alcance el umbral de semanas de SU año de retiro.
//
// Esta es una decisión de RÉGIMEN, no de presentación: vive en el motor para
// que B2B y B2C resuelvan igual.
// ============================================================================

import { computeLey73 } from './ley73';
import { computeLey97 } from './ley97';
import type {
  EntradaCalculo,
  EstatusPension,
  ResultadoLey73,
  ResultadoLey97,
} from './types';

export interface ResultadoTransicion {
  ley73: ResultadoLey73;
  /**
   * Ruta alterna: solo se evalúa cuando la Ley 73 se cae por conservación.
   * null si la Ley 73 sigue disponible (o si falla por semanas, donde la Ley 97
   * —que pide MÁS semanas que las 500— tampoco alcanzaría).
   */
  ley97Alterna: ResultadoLey97 | null;
  /** Régimen bajo el que efectivamente se pensionaría hoy. */
  regimenEfectivo: 'Ley73' | 'Ley97' | 'ninguno';
  /** Estatus consolidado del caso (vocabulario `escenario_base_status`). */
  status: EstatusPension;
  /** Pensión mensual del régimen efectivo; null si no se pensiona. */
  pensionMensual: number | null;
}

export function computeTransicion(entrada: EntradaCalculo): ResultadoTransicion {
  const ley73 = computeLey73(entrada);

  // Ley 73 disponible: no hay nada que evaluar.
  if (ley73.status === 'viable') {
    return {
      ley73,
      ley97Alterna: null,
      regimenEfectivo: 'Ley73',
      status: 'viable',
      pensionMensual: ley73.pensionMensual,
    };
  }

  // Le faltan semanas para las 500 de Ley 73: la Ley 97 pide entre 750 y 1,000
  // según el año de retiro, así que tampoco es ruta. No la calculamos.
  if (!ley73.razon?.pierdeConservacion) {
    return {
      ley73,
      ley97Alterna: null,
      regimenEfectivo: 'ninguno',
      status: ley73.status,
      pensionMensual: null,
    };
  }

  // Perdió conservación: la Ley 97 es la ruta que le queda.
  const ley97Alterna = computeLey97(entrada);
  if (ley97Alterna.status === 'viable') {
    return {
      ley73,
      ley97Alterna,
      regimenEfectivo: 'Ley97',
      // Se pensiona, pero NO por el régimen que esperaba: el estatus conserva
      // que la Ley 73 sigue recuperable reactivando (y suele pagar más).
      status: 'negativa_sin_reactivacion',
      pensionMensual: ley97Alterna.pensionAfore,
    };
  }

  return {
    ley73,
    ley97Alterna,
    regimenEfectivo: 'ninguno',
    status: 'negativa_sin_reactivacion',
    pensionMensual: null,
  };
}
