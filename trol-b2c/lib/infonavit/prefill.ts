// Puente entre el expediente trol3 y el motor de asesoría Infonavit.
//
// El motor pide cosas que el expediente no guarda tal cual: el salario MENSUAL
// (el IMSS registra salario diario), cuántos meses seguirá cotizando (es un
// supuesto, no un dato) y, en Ley 97, qué proporción del saldo conserva valor.
// Aquí se hacen esas traducciones y se deja dicho de dónde salió cada una,
// porque el asesor tiene que poder defenderlas frente al cliente.
//
// La semilla es el camino cómodo, no el obligatorio. Hay clientes con expediente
// suficiente y sin consulta SISEC: para ellos armamos el titular con lo que sí
// hay y devolvemos `faltantes` para que la pestaña lo pida en vez de bloquearse.
import { computeLey97, conservaValorSSV } from '@trol/pension-core';
import type { EntradaCalculo, Palancas } from '@trol/pension-core/types';
import type { TitularInfonavit } from '@trol/pension-core';
import type { SemillaV2 } from '@trol/pension-core/semilla';

/** El motor trabaja en salario mensual; el IMSS registra salario diario. */
export const DIAS_MES = 30.4;

/** Lo que impide calcular hasta que alguien lo capture. */
export type FaltanteInfonavit = 'ley' | 'fecha_nacimiento' | 'salario_diario' | 'conserva_valor';

export const ETIQUETA_FALTANTE: Record<FaltanteInfonavit, { titulo: string; por_que: string }> = {
  ley: { titulo: 'Régimen (Ley 73 o 97)', por_que: 'Cambia si el saldo se devuelve en efectivo o se convierte en pensión.' },
  fecha_nacimiento: { titulo: 'Fecha de nacimiento', por_que: 'De la edad sale el plazo del crédito: MIN(30, 70 − edad).' },
  salario_diario: { titulo: 'Salario diario registrado ante el IMSS', por_que: 'De ahí salen la tasa Infonavit, la aportación patronal del 5% y qué tanto de su salario se lleva la retención.' },
  conserva_valor: { titulo: '¿Su pensión Ley 97 supera la Pensión Mínima Garantizada?', por_que: 'Sin historial salarial no podemos proyectarlo. Si quedara en PMG, el sistema consumiría su saldo y conviene rescatarlo antes.' },
};

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
  /** Vacío = se puede calcular. Con elementos = hay que capturarlos primero. */
  faltantes: FaltanteInfonavit[];
  /** false cuando se armó con datos sueltos del expediente en vez de la semilla. */
  desdeSemilla: boolean;
}

export interface EntradaPrefill {
  /** Camino cómodo. Si es null se arma con los campos sueltos de abajo. */
  semilla: SemillaV2 | null;
  ley: string | null;
  fechaNacimiento: string | null;
  statusEmpleo: string | null;
  /** SBC diario declarado en el expediente (campo `salario_diario`). */
  salarioDiario: number | null;
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
 * Se proyecta con el saldo que de verdad tiene (el reportado si lo hay), porque
 * bajo la PMG la diferencia cambia la conclusión. Sin semilla no hay historial
 * salarial que proyectar: entonces NO se defaultea, se pide.
 */
function conservaValor(
  e: EntradaPrefill, ley: string | null, ssv: number,
): { valor: number; origen: string; falta: boolean } {
  if (ley !== 'Ley97') {
    return { valor: 1, origen: 'Ley 73: el saldo se devuelve en efectivo al pensionarse', falta: false };
  }
  if (!e.semilla) {
    return {
      valor: 1, falta: true,
      origen: 'Sin historial salarial no podemos proyectar su pensión contra la PMG: decídelo con lo que sepas de su caso',
    };
  }
  try {
    const entrada: EntradaCalculo = {
      perfil: e.semilla.perfil,
      saldos: { ...e.semilla.saldos, infonavit: ssv },
      salario_60m: e.semilla.salario_60m,
      palancas: palancasLey97(e.semilla, e.creditoVigente ?? false),
    };
    const cv = conservaValorSSV(computeLey97(entrada));
    const origen = cv >= 0.999
      ? 'Su pensión Ley 97 queda por encima de la PMG: el saldo conserva su valor completo'
      : cv <= 0.001
        ? 'Quedaría en Pensión Mínima Garantizada: el sistema consumiría el saldo pagando la pensión que recibiría de todos modos'
        : `Queda a caballo de la PMG: sólo ${Math.round(cv * 100)}% del saldo levanta su pensión por encima del piso`;
    return { valor: cv, origen, falta: false };
  } catch {
    return {
      valor: 1, falta: true,
      origen: 'No pudimos proyectar su pensión Ley 97 con la semilla que hay: decídelo con lo que sepas de su caso',
    };
  }
}

export function titularDesdeExpediente(e: EntradaPrefill): BaseInfonavit {
  const p = e.semilla?.perfil ?? null;
  const faltantes: FaltanteInfonavit[] = [];

  const ley = p?.ley ?? (e.ley === 'Ley97' || e.ley === 'Ley73' ? e.ley : null);
  if (!ley) faltantes.push('ley');

  const fnac = p?.fecha_nacimiento ?? e.fechaNacimiento;
  if (!fnac) faltantes.push('fecha_nacimiento');
  const edad = fnac ? (Date.now() - new Date(fnac).getTime()) / 86_400_000 / 365.25 : 0;

  const sbc = p?.salario_diario_registrado ?? e.salarioDiario ?? 0;
  if (!(sbc > 0)) faltantes.push('salario_diario');
  const salarioMensual = sbc * DIAS_MES;

  const ssv = e.saldoInfonavit ?? e.semilla?.saldos.infonavit ?? 0;
  const cotiza = (p?.status_empleo ?? e.statusEmpleo) === 'empleado';
  const meses = cotiza ? e.mesesCotizandoDefault : 0;

  const cv = conservaValor(e, ley, ssv);
  if (cv.falta) faltantes.push('conserva_valor');

  const ingresoReal = e.ingresoRealMensual ?? salarioMensual;

  return {
    titular: {
      regimen: ley === 'Ley97' ? 97 : 73,
      edad: Math.round(edad * 10) / 10,
      salario_imss: salarioMensual,
      ssv,
      meses_cotizando: meses,
      ingreso_real: ingresoReal,
      deducciones_usadas: e.deduccionesUsadas ?? 0,
      conserva_valor: cv.valor,
    },
    origen: {
      salario: sbc > 0
        ? `SBC de $${sbc.toFixed(2)} diarios × ${DIAS_MES}${p ? '' : ' (declarado en el expediente)'}`
        : 'Falta el salario diario registrado ante el IMSS',
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
    faltantes,
    desdeSemilla: Boolean(e.semilla),
  };
}

/** Titular 2 en blanco: el crédito conyugal se captura a mano en la sesión. */
export const TITULAR_VACIO: TitularInfonavit = {
  regimen: 0, edad: 0, salario_imss: 0, ssv: 0,
  meses_cotizando: 0, ingreso_real: 0, deducciones_usadas: 0, conserva_valor: 1,
};
