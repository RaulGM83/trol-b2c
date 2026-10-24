// ============================================================================
// Ventana de reingreso a Modalidad 40 (art. 219 y 220 LSS).
//
// Dos plazos, según cómo terminó la ÚLTIMA cotización del historial:
//
//   · Régimen obligatorio (o voluntaria distinta de Mod 40) → 5 años desde la
//     baja (art. 219). La inscripción retroactiva corre del día siguiente a la
//     baja hasta la formalización, con actualizaciones y recargos.
//   · Modalidad 40 → 12 meses desde la baja (art. 220). Lo que se paga son las
//     cuotas OMITIDAS desde esa baja, con recargos. Regla de negocio (Raúl,
//     24-ago-2026): toda baja de Mod 40 se trata como mora — en la práctica la
//     gente deja de pagar y solo se da de baja formal al pensionarse.
//   · Sin baja (la última cotización sigue abierta) → no hay retro; solo
//     cotización hacia adelante.
//
// Pasado el plazo: reingresar al régimen obligatorio ≥52 semanas y reintentar.
// Fuera de plazo con ≥60 años se evalúa pensión directa; con <60, asesoría.
//
// ⚠ La detección de modalidad es ESPEJO de `trol3.derivar_ultima_modalidad`
// (Supabase, migración `ultima_modalidad_mod40_ventana_12m`). Si cambia una,
// cambia la otra: el expediente y la calculadora no pueden contradecirse.
//
// ----------------------------------------------------------------------------
// RÉGIMEN (acuerdo ACDO.AS2.HCT.101026/302.P.DG, DOF 21-oct-2026, vigente
// desde el 22-oct-2026; `claude/106`). Desde el corte:
//   · Nadie paga hacia atrás. La inscripción corre desde la solicitud.
//   · Salario de Mod 40 = último SBC al causar baja (sin actualizar por
//     inflación, decisión de Raúl) + 1 UMA del año de la solicitud; piso 1 SM.
//   · Quien viene de Mod 10 (independiente) no puede contratar Mod 40.
//   · Quien ya estaba en Mod 40 y sigue pagando conserva sus condiciones
//     (`anterior`): su salario de Mod 40, sin la UMA extra mientras el IMSS no
//     implemente la actualización (pendiente, 22-oct).
//   · Art. 218 (5 años) y 220 (12 meses) siguen vivos.
// Lo de arriba (ventana, retro) se conserva para calcular ANTES del corte:
// los caminos cerrados en modo «Ver» y los goldens del mundo anterior.
// ⚠ `regimenMod40` es ESPEJO de `trol3.regimen_mod40` y del nodo n8n v5.8.
// ============================================================================

import { SALARIO_MINIMO, UMA } from './tablas';
import { diasEntre, parseISO, porAnio } from './util';

/** Día hábil siguiente a la publicación en el DOF (21-oct-2026). */
export const MOD40_CORTE_REGIMEN = '2026-10-22';
/** UMAs que se pueden sumar al último SBC en el régimen nuevo. */
export const MOD40_UMA_EXTRA = 1;
/** Tope absoluto de cotización (art. 28 LSS). */
export const MOD40_UMAS_TOPE = 25;

export type RegimenMod40 = 'anterior' | 'nuevo';

export interface OpcionesRegimenMod40 {
  /** Sólo para goldens del mundo anterior: mueve el corte. */
  corte?: string | Date | null;
  /**
   * Fecha de cálculo. Si es anterior al corte se reproduce el mundo viejo
   * completo aunque la fecha de trámite caiga después: así los goldens
   * fechados en 2026-06 (MOJA, CAFE, MALG) siguen midiendo lo que medían.
   * En producción `hoy` ya es posterior al corte y no cambia nada.
   */
  hoy?: Date | null;
  /**
   * Último SBC conocido cuando el historial no trae salario (p. ej. la semilla
   * sólo trae `salario_diario_registrado`). El historial manda si lo trae.
   */
  ultimoSbc?: number | null;
  /** Clasificación de la última cotización si ya se tiene (expediente). */
  ultimaModalidad?: ModalidadUltimaCotizacion | null;
  /** `limite_inscripcion_mod40` del expediente (art. 218/220). */
  limiteExpediente?: string | Date | null;
  /**
   * La última cotización sigue abierta (empleado / Mod 40 vigente). Sólo se
   * usa cuando no hay historial; con historial se lee de `fecha_fin`.
   */
  sinBaja?: boolean;
  /**
   * `conserva_derechos` del expediente (hoy). Con `false` no se ofrece Mod 40:
   * la vía para recuperar derechos es la Mod 10, y después de una Mod 10 ya no
   * hay Mod 40 (claude/107 decisión 10; espejo de trol3 migración 258). Si la
   * persona se reactiva con patrón y recupera la conservación, la regla general
   * vuelve a abrirla.
   */
  conservaDerechos?: boolean | null;
}

export interface RegimenMod40Info {
  regimen: RegimenMod40;
  /** true cuando la fecha de trámite es anterior al corte: mundo viejo completo. */
  antesDelCorte: boolean;
  corte: Date;
  ultimaModalidad: ModalidadUltimaCotizacion | null;
  /** Alta de la Mod 40 vigente (sólo `anterior` después del corte). */
  altaMod40: Date | null;
  /** Último SBC con el que se calcula el tope. */
  ultimoSbc: number | null;
  /** Piso: 1 salario mínimo del año de trámite. */
  sbcPiso: number;
  /** Tope de salario para Mod 40 a la fecha de trámite (null = sin dato de SBC). */
  sbcTopeMod40: number | null;
  /** Tope de salario para Mod 10 (25 UMA del año de trámite). */
  sbcTopeMod10: number;
  /** ¿Puede contratar Mod 40 a esa fecha? */
  mod40Permitida: boolean;
  motivoNoPermitida: 'mod10_previa' | 'derechos_perdidos' | 'ventana_vencida' | null;
  /** ¿Hay periodo que pagar hacia atrás? Después del corte, nunca. */
  retroAplica: boolean;
  avisos: string[];
}

/**
 * Régimen de Mod 40 a una fecha de trámite. Nunca lanza, nunca bloquea.
 *
 * `historial` puede venir vacío: entonces se usa `opts.ultimaModalidad` y
 * `opts.ultimoSbc` (lo que trae la semilla) y se avisa que es estimado.
 */
export function regimenMod40(
  historial: RegistroHistorialMod40[] | null | undefined,
  fechaTramite: Date,
  opts: OpcionesRegimenMod40 = {},
): RegimenMod40Info {
  const corte = fecha(opts.corte ?? MOD40_CORTE_REGIMEN) ?? parseISO(MOD40_CORTE_REGIMEN);
  const anio = fechaTramite.getUTCFullYear();
  const sbcPiso = porAnio(SALARIO_MINIMO, anio);
  const sbcTopeMod10 = porAnio(UMA, anio) * MOD40_UMAS_TOPE;
  const avisos: string[] = [];

  const registros = Array.isArray(historial) ? historial : [];
  const u = ultimoRegistro(registros);
  const ultimaModalidad: ModalidadUltimaCotizacion | null = u
    ? modalidadDeRegistro(u)
    : (opts.ultimaModalidad ?? null);
  const ultimoSbc = (u ? numero(u.salario_base) : null) ?? numero(opts.ultimoSbc);
  const sinBaja = u ? fecha(u.fecha_fin) === null : !!opts.sinBaja;
  const altaMod40 = u && ultimaModalidad === 'mod40' ? fecha(u.fecha_inicio) : null;

  const antesDelCorte =
    diasEntre(fechaTramite, corte) > 0 || (!!opts.hoy && diasEntre(opts.hoy, corte) > 0);
  if (antesDelCorte) {
    return {
      regimen: 'anterior',
      antesDelCorte: true,
      corte,
      ultimaModalidad,
      altaMod40,
      ultimoSbc,
      sbcPiso,
      sbcTopeMod40: sbcTopeMod10,
      sbcTopeMod10,
      mod40Permitida: true,
      motivoNoPermitida: null,
      retroAplica: true,
      avisos,
    };
  }

  // Después del corte. `anterior` sólo para quien sigue en Mod 40 desde antes.
  const sigueEnMod40 =
    ultimaModalidad === 'mod40' && sinBaja && (!altaMod40 || diasEntre(altaMod40, corte) > 0);
  const regimen: RegimenMod40 = sigueEnMod40 ? 'anterior' : 'nuevo';

  const umaExtra = regimen === 'anterior' ? 0 : MOD40_UMA_EXTRA;
  const sbcTopeMod40 =
    ultimoSbc == null
      ? null
      : Math.min(sbcTopeMod10, Math.max(sbcPiso, ultimoSbc + umaExtra * porAnio(UMA, anio)));

  // Ventana del art. 218 (5 años) / 220 (12 meses): el expediente manda.
  const limiteExp = fecha(opts.limiteExpediente);
  // Quien hoy no tiene baja también puede tenerla a la fecha de trámite (hueco
  // del empleado, claude/106 §3b): el que llama pasa el límite ya calculado
  // desde esa baja, así que aquí no se condiciona a `sinBaja`.
  const ventanaVencida = !!limiteExp && diasEntre(fechaTramite, limiteExp) < 0;
  const mod10Previa = ultimaModalidad === 'independiente';
  // 2026.10.24.1: sin conservación de derechos no se ofrece Mod 40 (la vía es Mod 10).
  const sinDerechos = opts.conservaDerechos === false;
  const mod40Permitida = !mod10Previa && !sinDerechos && !ventanaVencida;
  const motivoNoPermitida = mod10Previa
    ? 'mod10_previa'
    : sinDerechos
      ? 'derechos_perdidos'
      : ventanaVencida
        ? 'ventana_vencida'
        : null;

  if (regimen === 'anterior') {
    avisos.push(
      'Sigues inscrito en Modalidad 40 desde antes del 22 de octubre de 2026: conservas tus condiciones mientras sigas pagando. Si dejas de pagar 12 meses las pierdes.',
    );
    avisos.push(
      'Pendiente del IMSS: aún no está claro si quien ya estaba inscrito puede subir su salario; el cálculo usa el que tienes hoy.',
    );
  } else {
    avisos.push(
      'Desde el 22 de octubre de 2026 la Modalidad 40 ya no se paga hacia atrás: la cotización corre desde que la solicitas.',
    );
    if (sbcTopeMod40 != null) {
      avisos.push(
        `En Modalidad 40 puedes cotizar hasta ${fmtMXN(sbcTopeMod40)} (tu último salario más una UMA). Para cotizar con más, la vía es la Modalidad 10, que cuesta más.`,
      );
    } else {
      avisos.push('No tenemos tu último salario de cotización: el tope de la Modalidad 40 es estimado.');
    }
    if (mod10Previa) {
      avisos.push(
        'Tu última cotización fue como persona trabajadora independiente (Modalidad 10): desde ahí no se puede pasar a Modalidad 40.',
      );
    } else if (sinDerechos) {
      avisos.push(
        'Perdiste la conservación de derechos: la vía para recuperarlos es la Modalidad 10, y después de una Modalidad 10 ya no hay Modalidad 40.',
      );
    }
    if (!u && !opts.ultimaModalidad) {
      avisos.push('No podemos confirmar la modalidad de tu última cotización: el historial no trae el detalle del patrón.');
    }
  }

  return {
    regimen,
    antesDelCorte: false,
    corte,
    ultimaModalidad,
    altaMod40,
    ultimoSbc,
    sbcPiso,
    sbcTopeMod40,
    sbcTopeMod10,
    mod40Permitida,
    motivoNoPermitida,
    retroAplica: false,
    avisos,
  };
}

export type ModalidadUltimaCotizacion =
  | 'obligatorio'
  | 'mod40'
  | 'independiente'
  | 'otra_voluntaria';

export type PlazoVentanaMod40 = '5a' | '12m';

/** `por_vencer` es `vigente` con prisa: sigue aplicando, pero con fecha encima. */
export type EstadoVentanaMod40 = 'vigente' | 'por_vencer' | 'vencida';

/**
 * Registro del historial laboral. Estructural a propósito: así el módulo vive
 * igual en `pension-core` y en `trol-b2c/lib/imss`, cuyos `EmpleoHistorial`
 * han divergido.
 */
export interface RegistroHistorialMod40 {
  empleador?: string | null;
  registro_patronal?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  /**
   * Llega como number desde `getHistoriaLaboral`, pero como STRING desde la
   * semilla cruda (`calculo_pensional.historial[].salario_base` = "2828.5").
   * Se acepta cualquiera de los dos y se convierte aquí.
   */
  salario_base?: number | string | null;
}

export interface OpcionesVentanaMod40 {
  /**
   * `limite_inscripcion_mod40` del expediente. Manda sobre el cálculo local:
   * trol3 ya corrigió ahí el límite de 12 meses y es la única verdad que ve el
   * asesor. Solo se pasa cuando el dato existe.
   */
  limiteExpediente?: string | Date | null;
  /**
   * Salario base de cotización con el que se pretende reingresar. Al reingresar
   * a Mod 40 no puede ser menor al último que tuvo (art. 65 RLSS-ACRF).
   */
  sbcReingreso?: number | null;
  /** Días antes del límite en los que la ventana pasa a `por_vencer` (default 90). */
  diasAviso?: number;
}

export interface VentanaMod40 {
  /** Fecha de la última baja; null si la última cotización sigue abierta. */
  ultimaBaja: Date | null;
  /** null cuando el historial no trae detalle suficiente para clasificar. */
  ultimaModalidad: ModalidadUltimaCotizacion | null;
  plazo: PlazoVentanaMod40 | null;
  fechaLimite: Date | null;
  estado: EstadoVentanaMod40;
  /** La última cotización no tiene fecha de fin: sigue vigente. */
  sinBaja: boolean;
  /** Último salario base del historial (art. 65 RLSS-ACRF). */
  ultimoSbc: number | null;
  /** Días de la fecha de trámite al límite. Negativo = vencida. */
  diasRestantes: number | null;
  /** true si `fechaLimite` viene del expediente y no del cálculo local. */
  limiteDelExpediente: boolean;
  /** ¿Hay periodo descubierto que pagar hacia atrás a esta fecha? */
  retroAplica: boolean;
  /** Copy en lenguaje llano. Avisan, nunca bloquean. */
  avisos: string[];
}

const DIAS_AVISO_DEFAULT = 90;
/** Nunca se alcanza salvo que el historial venga sin fecha de fin. */
const SIN_BAJA = '2099-01-01';

const fmtFecha = (d: Date) =>
  new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);

const fmtMXN = (n: number) =>
  '$' + Math.round(n).toLocaleString('es-MX') + ' diarios';

/** `date + n months` como Postgres: recorta al último día del mes, no desborda. */
function addMesesClamp(d: Date, n: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const dia = d.getUTCDate();
  const ultimoDelMes = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(dia, ultimoDelMes)));
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

function fecha(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = parseISO(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Clasifica la modalidad de un registro. Espejo literal del CASE de
 * `trol3.derivar_ultima_modalidad`: `upper(empleador)` + LIKE, o registro
 * patronal terminado en 9999940 (el RP genérico de continuación voluntaria).
 * El RP manda igual que el nombre: hay patrones como "SEGUROS ESPECIALES" que
 * solo se delatan por ahí.
 */
export function modalidadDeRegistro(
  r: RegistroHistorialMod40,
): ModalidadUltimaCotizacion {
  const emp = String(r.empleador ?? '').toUpperCase();
  const rp = String(r.registro_patronal ?? '');
  if (emp.includes('CONTINUACION VOLUNTARIA') || /9999940$/.test(rp)) return 'mod40';
  if (emp.includes('TRABAJADORAS INDEPENDIENTES')) return 'independiente';
  if (emp.includes('INCORPORACION VOLUNTARIA')) return 'otra_voluntaria';
  return 'obligatorio';
}

/**
 * Devuelve el registro más reciente del historial, con el mismo orden que usa
 * Supabase: `coalesce(fecha_fin, 2099-01-01) desc, fecha_inicio desc nulls last`.
 * Un registro sin fecha de fin es el vigente y gana siempre.
 */
function ultimoRegistro(
  historial: RegistroHistorialMod40[],
): RegistroHistorialMod40 | null {
  const clave = (r: RegistroHistorialMod40): [number, number] => [
    (fecha(r.fecha_fin) ?? parseISO(SIN_BAJA)).getTime(),
    fecha(r.fecha_inicio)?.getTime() ?? -Infinity,
  ];
  let mejor: RegistroHistorialMod40 | null = null;
  let mejorClave: [number, number] | null = null;
  for (const r of historial) {
    const k = clave(r);
    if (!mejorClave || k[0] > mejorClave[0] || (k[0] === mejorClave[0] && k[1] > mejorClave[1])) {
      mejor = r;
      mejorClave = k;
    }
  }
  return mejor;
}

/**
 * Ventana de reingreso a Mod 40 a una fecha de trámite dada.
 *
 * Nunca lanza y nunca "bloquea": una ventana vencida devuelve el estado y el
 * aviso, y quien llama decide qué hacer con los números.
 */
export function ventanaMod40(
  historial: RegistroHistorialMod40[] | null | undefined,
  fechaTramite: Date,
  opts: OpcionesVentanaMod40 = {},
): VentanaMod40 {
  const diasAviso = opts.diasAviso ?? DIAS_AVISO_DEFAULT;
  const avisos: string[] = [];
  const registros = Array.isArray(historial) ? historial : [];
  const u = ultimoRegistro(registros);

  const limiteExp = fecha(opts.limiteExpediente);

  if (!u) {
    // Sin historial no se puede afirmar nada de la última baja. Si el
    // expediente trae límite, se respeta: es mejor dato que la nada.
    const estado: EstadoVentanaMod40 = limiteExp
      ? diasEntre(fechaTramite, limiteExp) < 0
        ? 'vencida'
        : diasEntre(fechaTramite, limiteExp) <= diasAviso
          ? 'por_vencer'
          : 'vigente'
      : 'vigente';
    avisos.push(
      'No podemos confirmar la modalidad de tu última baja: el historial que tenemos no trae el detalle del patrón. Los plazos de abajo son estimados.',
    );
    if (limiteExp) {
      avisos.push(
        estado === 'vencida'
          ? `Según el expediente el límite para inscribirte era el ${fmtFecha(limiteExp)}.`
          : `Según el expediente tienes hasta el ${fmtFecha(limiteExp)} para inscribirte.`,
      );
    }
    return {
      ultimaBaja: null,
      ultimaModalidad: null,
      plazo: null,
      fechaLimite: limiteExp,
      estado,
      sinBaja: false,
      ultimoSbc: null,
      diasRestantes: limiteExp ? diasEntre(fechaTramite, limiteExp) : null,
      limiteDelExpediente: !!limiteExp,
      retroAplica: true,
      avisos,
    };
  }

  const ultimaModalidad = modalidadDeRegistro(u);
  const ultimaBaja = fecha(u.fecha_fin);
  const sinBaja = ultimaBaja === null;
  const ultimoSbc = numero(u.salario_base);

  const plazo: PlazoVentanaMod40 | null = sinBaja
    ? null
    : ultimaModalidad === 'mod40'
      ? '12m'
      : '5a';

  const limiteLocal =
    ultimaBaja && plazo ? addMesesClamp(ultimaBaja, plazo === '12m' ? 12 : 60) : null;
  // El expediente manda: trol3 ya escribió ahí el límite de 12 meses con la
  // regla del 220 y es lo que ve el asesor. Recalcularlo distinto en el front
  // sería una segunda verdad.
  const fechaLimite = limiteExp ?? limiteLocal;
  const limiteDelExpediente = !!limiteExp && limiteExp.getTime() !== limiteLocal?.getTime();

  const diasRestantes = fechaLimite ? diasEntre(fechaTramite, fechaLimite) : null;
  const estado: EstadoVentanaMod40 =
    diasRestantes === null
      ? 'vigente'
      : diasRestantes < 0
        ? 'vencida'
        : diasRestantes <= diasAviso
          ? 'por_vencer'
          : 'vigente';

  // --- Copy ---------------------------------------------------------------
  if (sinBaja) {
    avisos.push(
      ultimaModalidad === 'mod40'
        ? 'Tu Modalidad 40 sigue vigente: no hay periodo descubierto que pagar hacia atrás, solo cotización hacia adelante.'
        : 'Tu última cotización sigue abierta: no hay baja y, por lo tanto, tampoco periodo retroactivo que pagar.',
    );
  } else if (ultimaModalidad === 'mod40') {
    // Con Mod 40 el límite se muestra SIEMPRE, aunque la fecha elegida sea
    // válida: es el dato que decide si el caso existe o no.
    const vencio = estado === 'vencida';
    avisos.push(
      `Tu última cotización fue en Modalidad 40 y causaste baja el ${fmtFecha(ultimaBaja!)}. La ventana para reingresar es de 12 meses (art. 220 LSS) y ${vencio ? 'venció' : 'vence'} el ${fmtFecha(fechaLimite!)}.`,
    );
  }

  if (estado === 'vencida' && fechaLimite) {
    avisos.push(
      `A la fecha de trámite que elegiste ya no puedes inscribirte: el límite era el ${fmtFecha(fechaLimite)}. Para reintentarlo hay que reingresar al régimen obligatorio y cotizar al menos 52 semanas.`,
    );
  } else if (estado === 'por_vencer' && fechaLimite && diasRestantes !== null) {
    avisos.push(
      `Quedan ${Math.max(0, Math.round(diasRestantes))} días: la ventana vence el ${fmtFecha(fechaLimite)}. Después de esa fecha el trámite ya no procede.`,
    );
  }

  if (
    ultimaModalidad === 'mod40' &&
    ultimoSbc != null &&
    opts.sbcReingreso != null &&
    opts.sbcReingreso < ultimoSbc
  ) {
    avisos.push(
      `Al reingresar a Modalidad 40 el salario no puede ser menor al último que cotizaste (${fmtMXN(ultimoSbc)}, art. 65 RLSS-ACRF); este escenario plantea ${fmtMXN(opts.sbcReingreso)}.`,
    );
  }

  return {
    ultimaBaja,
    ultimaModalidad,
    plazo,
    fechaLimite,
    estado,
    sinBaja,
    ultimoSbc,
    diasRestantes,
    limiteDelExpediente,
    retroAplica: !sinBaja,
    avisos,
  };
}
