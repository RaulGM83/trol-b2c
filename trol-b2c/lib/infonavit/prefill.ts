// Puente entre el expediente trol3 y el motor de asesoría Infonavit.
//
// El motor pide cosas que el expediente no guarda tal cual: el salario MENSUAL
// (el expediente trae el SBC diario), cuántos meses seguirá cotizando (es un
// supuesto, no un dato) y, en Ley 97, qué proporción del saldo conserva valor.
// Aquí se hacen esas tres traducciones y se deja dicho de dónde salió cada una,
// porque el asesor tiene que poder defenderlas frente al cliente.
import { computeLey97, conservaValorSSV } from '@trol/pension-core';
import type { EntradaCalculo, Palancas } from '@trol/pension-core/types';
import type { TitularInfonavit } from '@trol/pension-core';
import type { SemillaV2 } from '@/lib/imss/semilla';

/** El motor trabaja en salario mensual; el IMSS registra salario diario. */
export const DIAS_MES = 30.4;

export interface BaseInfonavit {
  titular: TitularInfonavit;
  /** De dónde salió cada supuesto, para mostrarlo junto al campo. */
  origen: {
    salario: string;
    ssv: string;
    meses_cotizando: string;
    conserva_valor: string;
    ingreso_real: string;
  };
}

export interface EntradaPrefill {
  semilla: SemillaV2;
  /** Mejor dato del expediente: reportado > estimado (migración 056). */
  saldoInfonavit: number | null;
  saldoEsReportado: boolean;
  creditoVigente: boolean | null;
  mesesCotizandoDefault: number;
  ingresoRealMensual: number | null;
  deduccionesUsadas: number | null;
}

function palancasLey97(semilla: SemillaV2, creditoVigente: boolean): Palancas {
  return {
    edadRetiro: 65, // Ley 97: referencia estándar para ubicarlo respecto de la PMG
    pctTiempoCotizando: semilla.perfil.status_empleo === 'empleado' ? 1 : 0,
    salarioMod40: semilla.perfil.salario_diario_registrado,
    recuperarSemanasDescontadas: false,
    recuperarSemanasMod40Retro: false,
    salarioCotizacionRetro: 'MINIMO',
    usaCreditoInfonavit: creditoVigente,
    ahorroVoluntarioMensual: 0,
  };
}

/**
 * Ley 97: cuánto del saldo de vivienda sobrevive al pasar por la pensión.
 * Se calcula con el saldo que de verdad tiene (el reportado si lo hay), no con
 * el de la semilla, porque bajo la PMG la diferencia cambia la conclusión.
 */
function conservaValor(e: EntradaPrefill, ssv: number): { valor: number; origen: string } {
  if (e.semilla.perfil.ley !== 'Ley97') {
    return { valor: 1, origen: 'Ley 73: el saldo se devuelve en efectivo al pensionarse' };
  }
  try {
    const entrada: EntradaCalculo = {
      perfil: e.semilla.perfil,
      saldos: { ...e.semilla.saldos, infonavit: ssv },
      salario_60m: e.semilla.salario_60m,
      palancas: palancasLey97(e.semilla, e.creditoVigente ?? false),
    };
    const r = computeLey97(entrada);
    const cv = conservaValorSSV(r);
    const origen = cv >= 0.999
      ? 'Su pensión Ley 97 queda por encima de la PMG: el saldo conserva su valor completo'
      : cv <= 0.001
        ? 'Quedaría en Pensión Mínima Garantizada: el sistema consumiría el saldo pagando la pensión que recibiría de todos modos'
        : `Queda a caballo de la PMG: sólo ${Math.round(cv * 100)}% del saldo levanta su pensión por encima del piso`;
    return { valor: cv, origen };
  } catch {
    // Si la proyección no corre (semilla incompleta), no inventamos: 1 y que el asesor decida.
    return { valor: 1, origen: 'No pudimos proyectar su pensión Ley 97; se asume que conserva el valor completo (ajústalo si sabes que queda en PMG)' };
  }
}

export function titularDesdeExpediente(e: EntradaPrefill): BaseInfonavit {
  const p = e.semilla.perfil;
  const edad = (Date.now() - new Date(p.fecha_nacimiento).getTime()) / 86_400_000 / 365.25;
  const salarioMensual = p.salario_diario_registrado * DIAS_MES;
  const ssv = e.saldoInfonavit ?? e.semilla.saldos.infonavit ?? 0;
  const cotiza = p.status_empleo === 'empleado';
  const meses = cotiza ? e.mesesCotizandoDefault : 0;
  const cv = conservaValor(e, ssv);
  const ingresoReal = e.ingresoRealMensual ?? salarioMensual;

  return {
    titular: {
      regimen: p.ley === 'Ley97' ? 97 : 73,
      edad: Math.round(edad * 10) / 10,
      salario_imss: salarioMensual,
      ssv,
      meses_cotizando: meses,
      ingreso_real: ingresoReal,
      deducciones_usadas: e.deduccionesUsadas ?? 0,
      conserva_valor: cv.valor,
    },
    origen: {
      salario: `SBC de $${p.salario_diario_registrado.toFixed(2)} diarios × ${DIAS_MES}`,
      ssv: e.saldoEsReportado
        ? 'Saldo reportado de su cuenta Infonavit'
        : 'Estimado nuestro a partir de su historial de salarios: para formalizar hace falta el saldo real',
      meses_cotizando: cotiza
        ? `Supuesto: sigue cotizando ${meses} meses más. Sólo mientras cotiza, la aportación patronal del 5% amortiza el crédito`
        : 'No está cotizando: no hay aportación patronal que amortice',
      conserva_valor: cv.origen,
      ingreso_real: e.ingresoRealMensual
        ? 'Ingreso real declarado en el expediente'
        : 'A falta del ingreso real usamos el registrado ante el IMSS; si gana más, la devolución de ISR sube (captúralo)',
    },
  };
}

/** Titular 2 en blanco: el crédito conyugal se captura a mano en la sesión. */
export const TITULAR_VACIO: TitularInfonavit = {
  regimen: 0, edad: 0, salario_imss: 0, ssv: 0,
  meses_cotizando: 0, ingreso_real: 0, deducciones_usadas: 0, conserva_valor: 1,
};
