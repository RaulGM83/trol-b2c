// ============================================================================
// Caminos de Ley 73 después del corte del 22-oct-2026 (claude/106 §3b, D2/D4).
//
// Ya no hay retro ni mezcla de modalidades, así que la asesoría se reduce a
// tres caminos que SIEMPRE se presentan juntos:
//   · Pensionarse ya (o esperar sin cotizar hasta los 60).
//   · Seguir cotizando en Mod 40 (topada al último SBC + 1 UMA).
//   · Seguir cotizando en Mod 10 (hasta 25 UMA, cuesta más).
// Y a una pregunta nueva para quien hoy cotiza: ¿cuándo arranco? Pagar desde
// la baja hasta el retiro puede ser mucho más caro que esperar y pagar sólo
// los últimos años, porque ~4.8 años de cotización topada ya llenan el
// promedio de 250 semanas; lo que sobra sólo compra semanas.
//
// Todo sale de `computeLey73`: aquí no hay fórmulas nuevas, sólo corridas.
// ============================================================================

import { computeLey73 } from './ley73';
import type { EntradaCalculo, EstatusPension73, Palancas } from './types';
import { addDias, addMeses, DIAS_ANIO, DIAS_ANIO_RETIRO, diasEntre, parseISO } from './util';

/** Meses de aumento en los que debe recuperarse el costo para recomendar cotizar. */
export const UMBRAL_RECUPERACION_MESES = 36;
/** Plazos que se muestran por camino. */
export const MESES_CAMINO_DEFAULT = [12, 24];
/** Lo mínimo que vale la pena cotizar en el barrido de inicio. */
export const MESES_MINIMOS_COTIZAR = 12;
/** Mod 10 escalonada: meses al tope antes del retiro (~250 semanas; claude/107 decisión 9). */
export const MOD10_ESCALON_MESES = 58;

export interface OpcionCotizar {
  meses: number;
  fechaInicio: Date;
  fechaRetiro: Date;
  salario: number;
  status: EstatusPension73;
  pension: number | null;
  /** Cuotas al IMSS del tramo. */
  costoCuotas: number;
  costoMensual: number;
  /** Mensualidades que deja de cobrar por seguir cotizando (si ya podía pensionarse). */
  pensionNoCobrada: number;
  /** pension − pensión hoy; null si alguna no es viable. */
  aumento: number | null;
  /** (costoCuotas + pensionNoCobrada) / aumento; null si no hay aumento. */
  mesesRecuperacion: number | null;
  avisos: string[];
}

export interface CaminoCotizar {
  modalidad: 'mod40' | 'mod10';
  aplica: boolean;
  motivo: string | null;
  sbcTope: number | null;
  opciones: OpcionCotizar[];
}

export interface CaminosLey73 {
  fechaInicio: Date;
  pensionHoy: {
    status: EstatusPension73;
    pension: number | null;
    /** ¿Ya puede tramitarla (60 cumplidos a la fecha de inicio)? */
    tramitable: boolean;
    fechaDerecho: Date | null;
    retroactivoMeses: number;
  };
  mod40: CaminoCotizar;
  mod10: CaminoCotizar;
  recomendacion: 'pension_hoy' | 'mod40' | 'mod10' | 'ninguno';
  umbralMeses: number;
  avisos: string[];
}

export interface OpcionesCaminos {
  /** Arranque del plan (default `entrada.fechaTramite ?? hoy`). */
  fechaInicio?: Date;
  meses?: number[];
  umbralMeses?: number;
}

const SALARIO_SIN_TOPE = 1_000_000; // el motor lo recorta al tope de la modalidad

function edadEn(fnac: Date, d: Date): number {
  return diasEntre(fnac, d) / DIAS_ANIO;
}

/** Edad (fraccional) que hace que `computeLey73` ponga el retiro en `fechaRetiro`. */
function edadParaRetiro(fnac: Date, hoy: Date, fechaRetiro: Date): number {
  const edadActual = edadEn(fnac, hoy);
  return edadActual + (diasEntre(hoy, fechaRetiro) + 1) / DIAS_ANIO_RETIRO;
}

function fechaRetiroDe(fnac: Date, hoy: Date, palancas: Palancas): Date {
  const edadActual = edadEn(fnac, hoy);
  const edadRetiro = Math.max(palancas.edadRetiro, Math.max(60, edadActual));
  return addDias(hoy, (edadRetiro - edadActual) * DIAS_ANIO_RETIRO - 1);
}

function opcion(
  entrada: EntradaCalculo,
  modalidad: 'mod40' | 'mod10',
  fechaInicio: Date,
  meses: number,
  pensionHoy: number | null,
  tramitable: boolean,
): OpcionCotizar {
  const hoy = entrada.hoy ?? new Date();
  const fnac = parseISO(entrada.perfil.fecha_nacimiento);
  const fecha60 = addMeses(fnac, 60 * 12);
  const retiroPedido = addMeses(fechaInicio, meses);
  const fechaRetiro = diasEntre(fecha60, retiroPedido) < 0 ? fecha60 : retiroPedido;
  const r = computeLey73({
    ...entrada,
    fechaTramite: fechaInicio,
    palancas: {
      ...entrada.palancas,
      pctTiempoCotizando: 1,
      modalidadFutura: modalidad,
      salarioMod40: SALARIO_SIN_TOPE,
      recuperarSemanasMod40Retro: false,
      edadRetiro: edadParaRetiro(fnac, hoy, fechaRetiro),
    },
  });
  const pensionNoCobrada = tramitable && pensionHoy != null ? pensionHoy * meses : 0;
  const aumento = r.pensionMensual != null && pensionHoy != null ? r.pensionMensual - pensionHoy : null;
  const mesesRecuperacion =
    aumento != null && aumento > 0 ? (r.costoEstrategiaFutura + pensionNoCobrada) / aumento : null;
  return {
    meses,
    fechaInicio,
    fechaRetiro: r.detalle.fechaRetiro,
    salario: r.detalle.salarioFuturo,
    status: r.status,
    pension: r.pensionMensual,
    costoCuotas: r.costoEstrategiaFutura,
    costoMensual: r.costoMensualPrimerMes,
    pensionNoCobrada,
    aumento,
    mesesRecuperacion,
    avisos: r.detalle.avisosRegimen,
  };
}

/** Texto del motivo por el que no se ofrece Mod 40 (espejo del motor n8n v5.8.1). */
function motivoMod40NoPermitida(motivo: 'mod10_previa' | 'derechos_perdidos' | 'ventana_vencida' | null): string {
  switch (motivo) {
    case 'mod10_previa':
      return 'Viene de Modalidad 10 (independiente): no puede contratar Modalidad 40.';
    case 'derechos_perdidos':
      return 'Sin conservación de derechos: la vía es Modalidad 10 para recuperarlos; después no hay Modalidad 40.';
    case 'ventana_vencida':
      return 'La ventana para inscribirse a Modalidad 40 ya venció.';
    default:
      return 'No puede contratar Modalidad 40 a esta fecha.';
  }
}

/**
 * Los tres caminos a una fecha de inicio. Nunca lanza: un camino que no aplica
 * sale con `aplica: false` y su motivo.
 */
export function caminosLey73(entrada: EntradaCalculo, opts: OpcionesCaminos = {}): CaminosLey73 {
  const hoy = entrada.hoy ?? new Date();
  const fnac = parseISO(entrada.perfil.fecha_nacimiento);
  const fechaInicio = opts.fechaInicio ?? entrada.fechaTramite ?? hoy;
  const meses = opts.meses ?? MESES_CAMINO_DEFAULT;
  const umbralMeses = opts.umbralMeses ?? UMBRAL_RECUPERACION_MESES;

  // Pensión sin cotizar más: la regla del derecho pone el monto a D (60 años
  // o la baja, lo que sea más tarde), así que sirve igual para quien ya puede
  // tramitar y para quien espera a los 60.
  const base = computeLey73({
    ...entrada,
    fechaTramite: fechaInicio,
    palancas: { ...entrada.palancas, pctTiempoCotizando: 0, recuperarSemanasMod40Retro: false },
  });
  const tramitable = edadEn(fnac, fechaInicio) >= 60 && base.status === 'viable';
  const pensionHoy = {
    status: base.status,
    pension: base.pensionMensual,
    tramitable,
    fechaDerecho: base.derecho?.fecha ?? null,
    retroactivoMeses: base.retroactivoAlPensionarse?.meses ?? 0,
  };

  const sonda = computeLey73({
    ...entrada,
    fechaTramite: fechaInicio,
    palancas: { ...entrada.palancas, pctTiempoCotizando: 1, modalidadFutura: 'mod40', salarioMod40: SALARIO_SIN_TOPE },
  });
  const mod40Aplica = !sonda.detalle.antesDelCorte && sonda.detalle.mod40Permitida;
  const mod40: CaminoCotizar = {
    modalidad: 'mod40',
    aplica: mod40Aplica,
    motivo: mod40Aplica
      ? null
      : sonda.detalle.antesDelCorte
        ? 'Antes del corte del 22-oct-2026 aplica el régimen anterior (retro).'
        : motivoMod40NoPermitida(sonda.detalle.motivoNoPermitida),
    sbcTope: mod40Aplica ? sonda.detalle.sbcTope : null,
    opciones: mod40Aplica
      ? meses.map((m) => opcion(entrada, 'mod40', fechaInicio, m, base.pensionMensual, tramitable))
      : [],
  };
  const mod10Opciones = meses.map((m) => opcion(entrada, 'mod10', fechaInicio, m, base.pensionMensual, tramitable));
  const mod10: CaminoCotizar = {
    modalidad: 'mod10',
    aplica: !sonda.detalle.antesDelCorte,
    motivo: sonda.detalle.antesDelCorte ? 'Antes del corte aplica el régimen anterior.' : null,
    sbcTope: mod10Opciones[0]?.salario ?? null,
    opciones: sonda.detalle.antesDelCorte ? [] : mod10Opciones,
  };

  // Recomendación: el camino que recupera su costo más rápido dentro del
  // umbral; si ninguno, pensionarse ya (si puede) o nada.
  let mejor: { camino: 'mod40' | 'mod10'; meses: number } | null = null;
  for (const c of [mod40, mod10]) {
    for (const o of c.opciones) {
      if (o.status !== 'viable' || o.mesesRecuperacion == null || o.mesesRecuperacion > umbralMeses) continue;
      if (!mejor || o.mesesRecuperacion < mejor.meses) mejor = { camino: c.modalidad, meses: o.mesesRecuperacion };
    }
  }
  const recomendacion: CaminosLey73['recomendacion'] = mejor
    ? mejor.camino
    : tramitable
      ? 'pension_hoy'
      : 'ninguno';

  const avisos = [...sonda.detalle.avisosRegimen];
  if (!tramitable && base.status === 'viable') {
    avisos.push('Aún no cumple 60 años: «pensión hoy» es lo que cobraría a los 60 sin volver a cotizar.');
  }

  return { fechaInicio, pensionHoy, mod40, mod10, recomendacion, umbralMeses, avisos };
}

// ---------------------------------------------------------------------------
// ¿Cuándo arranco? (claude/106 §3b, D4/D5)
// ---------------------------------------------------------------------------

export interface PuntoInicio {
  fechaInicio: Date;
  edadInicio: number;
  huecoMeses: number;
  mesesCotizando: number;
  /** Mod 40 permitida a esa fecha (ventana art. 218 y sin Mod 10 previa). */
  permitida: boolean;
  status: EstatusPension73;
  pension: number | null;
  semanas: number;
  costoCuotas: number;
  aumento: number | null;
  mesesRecuperacion: number | null;
}

export interface SugerenciaModalidad {
  modalidad: 'mod40' | 'mod10';
  /** Menor costo por peso de aumento (menos meses de recuperación). */
  recomendado: PuntoInicio | null;
  /** Mayor pensión; a igual pensión, el inicio más tardío (más barato). */
  maxPension: PuntoInicio | null;
  tabla: PuntoInicio[];
  avisos: string[];
}

export interface SugerenciaInicio {
  fechaBaja: Date;
  fechaRetiro: Date;
  /** Pensión sin cotizar más (misma edad de retiro). */
  pensionBase: number | null;
  /** null cuando la Mod 40 no está permitida (Mod 10 previa) o se pidió sólo Mod 10. */
  mod40: SugerenciaModalidad | null;
  mod10: SugerenciaModalidad | null;
  /** El recomendado con menos meses de recuperación entre las dos modalidades. */
  mejor: { modalidad: 'mod40' | 'mod10'; punto: PuntoInicio } | null;
  avisos: string[];
}

export interface OpcionesSugerirInicio {
  modalidad?: 'mod40' | 'mod10';
  /** Paso del barrido en meses (default 1). */
  pasoMeses?: number;
  /** Meses mínimos de cotización antes del retiro (default 12). */
  mesesMinimos?: number;
}

function barrido(
  entrada: EntradaCalculo,
  modalidad: 'mod40' | 'mod10',
  fechaBaja: Date,
  fechaRetiro: Date,
  pensionBase: number | null,
  pasoMeses: number,
  mesesMinimos: number,
): SugerenciaModalidad {
  const hoy = entrada.hoy ?? new Date();
  const fnac = parseISO(entrada.perfil.fecha_nacimiento);
  const primero = diasEntre(hoy, fechaBaja) > 0 ? fechaBaja : hoy;
  const ultimo = addMeses(fechaRetiro, -mesesMinimos);
  const tabla: PuntoInicio[] = [];
  for (let k = 0; ; k += pasoMeses) {
    const inicio = addMeses(primero, k);
    if (diasEntre(inicio, ultimo) < 0) break;
    const r = computeLey73({
      ...entrada,
      fechaTramite: inicio,
      fechaBaja,
      palancas: { ...entrada.palancas, pctTiempoCotizando: 1, modalidadFutura: modalidad, recuperarSemanasMod40Retro: false },
    });
    const permitida = modalidad === 'mod10' || r.detalle.modalidadFutura === 'mod40';
    const aumento = r.pensionMensual != null && pensionBase != null ? r.pensionMensual - pensionBase : null;
    tabla.push({
      fechaInicio: inicio,
      edadInicio: edadEn(fnac, inicio),
      huecoMeses: r.detalle.huecoMeses,
      mesesCotizando: Math.max(0, Math.round(diasEntre(inicio, fechaRetiro) / 30.4375)),
      permitida,
      status: r.status,
      pension: r.pensionMensual,
      semanas: r.detalle.semanasRetiro,
      costoCuotas: r.costoEstrategiaFutura,
      aumento,
      mesesRecuperacion: aumento != null && aumento > 0 ? r.costoEstrategiaFutura / aumento : null,
    });
  }

  const validos = tabla.filter((p) => p.permitida && p.status === 'viable' && p.pension != null);
  let recomendado: PuntoInicio | null = null;
  let maxPension: PuntoInicio | null = null;
  for (const p of validos) {
    if (p.mesesRecuperacion != null && (!recomendado || p.mesesRecuperacion < recomendado.mesesRecuperacion!)) {
      recomendado = p;
    }
    // Empate en pensión (a $1): gana el inicio más tardío, que es el más barato.
    if (
      !maxPension ||
      p.pension! > maxPension.pension! + 1 ||
      (Math.abs(p.pension! - maxPension.pension!) <= 1 && p.costoCuotas < maxPension.costoCuotas)
    ) {
      maxPension = p;
    }
  }
  const avisos: string[] = [];
  if (modalidad === 'mod40' && tabla.some((p) => !p.permitida)) {
    avisos.push('Después de 5 años de la baja ya no se puede contratar Modalidad 40: esos inicios no se recomiendan.');
  }
  if (!validos.length) avisos.push('Ningún inicio da una pensión viable con estas palancas.');
  return { modalidad, recomendado, maxPension, tabla, avisos };
}

/**
 * Barre la fecha de inicio entre la baja y el retiro (fijado por
 * `palancas.edadRetiro`) en las dos modalidades y devuelve, por cada una, el
 * inicio que recupera su costo más rápido y el que da más pensión; y el mejor
 * de los dos. La baja no se optimiza (D5): mientras pueda seguir empleado,
 * mejor; sólo se mueve si el cliente dice que podría salir pronto.
 */
export function sugerirInicio(entrada: EntradaCalculo, opts: OpcionesSugerirInicio = {}): SugerenciaInicio {
  const hoy = entrada.hoy ?? new Date();
  const fnac = parseISO(entrada.perfil.fecha_nacimiento);
  const pasoMeses = Math.max(1, opts.pasoMeses ?? 1);
  const mesesMinimos = opts.mesesMinimos ?? MESES_MINIMOS_COTIZAR;
  const fechaRetiro = fechaRetiroDe(fnac, hoy, entrada.palancas);
  const empleado = entrada.perfil.status_empleo === 'empleado';
  const bajaReal = parseISO(entrada.perfil.fechas.ultima_cotizacion_valida);
  const fechaBaja = empleado
    ? (entrada.fechaBaja && diasEntre(hoy, entrada.fechaBaja) > 0 ? entrada.fechaBaja : hoy)
    : bajaReal;

  const base = computeLey73({
    ...entrada,
    palancas: { ...entrada.palancas, pctTiempoCotizando: 0, recuperarSemanasMod40Retro: false },
  });

  const sonda = computeLey73({
    ...entrada,
    fechaTramite: diasEntre(hoy, fechaBaja) > 0 ? fechaBaja : hoy,
    fechaBaja,
    palancas: { ...entrada.palancas, pctTiempoCotizando: 1, modalidadFutura: 'mod40' },
  });
  const avisos: string[] = [];
  const vacio = { fechaBaja, fechaRetiro, pensionBase: base.pensionMensual, mod40: null, mod10: null, mejor: null, avisos };
  if (sonda.detalle.antesDelCorte) {
    avisos.push('Antes del corte del 22-oct-2026 aplica el régimen anterior: el barrido no tiene sentido.');
    return vacio;
  }

  const quiere = (m: 'mod40' | 'mod10') => !opts.modalidad || opts.modalidad === m;
  const mod40 =
    quiere('mod40') && sonda.detalle.mod40Permitida
      ? barrido(entrada, 'mod40', fechaBaja, fechaRetiro, base.pensionMensual, pasoMeses, mesesMinimos)
      : null;
  const mod10 = quiere('mod10')
    ? barrido(entrada, 'mod10', fechaBaja, fechaRetiro, base.pensionMensual, pasoMeses, mesesMinimos)
    : null;
  if (quiere('mod40') && !sonda.detalle.mod40Permitida) {
    avisos.push(motivoMod40NoPermitida(sonda.detalle.motivoNoPermitida));
  }

  let mejor: SugerenciaInicio['mejor'] = null;
  for (const s of [mod40, mod10]) {
    if (!s?.recomendado?.mesesRecuperacion) continue;
    if (!mejor || s.recomendado.mesesRecuperacion < mejor.punto.mesesRecuperacion!) {
      mejor = { modalidad: s.modalidad, punto: s.recomendado };
    }
  }
  return { ...vacio, mod40, mod10, mejor };
}
