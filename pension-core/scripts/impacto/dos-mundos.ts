// ============================================================================
// Informe Trol #2 — dos mundos por persona (claude/107 §3, paso 4).
//
// Mundo viejo: hoy = 21-oct-2026 (antes del corte). Mejor jugada = proyecto
// Mod 40 retroactivo a 25 UMA (`computeProyectoMod40`), con la pensión base
// como piso. Mundo nuevo: hoy = 24-oct-2026. Caminos: pensionarse sin cotizar
// más, Mod 40 topada (si está permitida), Mod 10 al tope, Mod 10 escalonada
// (mínimo para sumar semanas y 25 UMA los últimos 58 meses) y el inicio
// sugerido (`sugerirInicio`) por modalidad. Todo a cada edad de retiro de la
// edad mínima a los 65.
//
// Puro: sin red ni base. Lo usa `scripts/impacto-mod40-batch.ts`.
// ============================================================================

import { computeLey73 } from '../../src/ley73';
import { computeProyectoMod40 } from '../../src/mod40-proyecto';
import { regimenMod40, type RegistroHistorialMod40 } from '../../src/mod40-ventana';
import { sugerirInicio, MOD10_ESCALON_MESES } from '../../src/caminos-ley73';
import { parseSemillaV2 } from '../../src/semilla';
import { UMA, SALARIO_MINIMO, CESANTIA97_ANIOS, CESANTIA97_PCT } from '../../src/tablas';
import { CESANTIA97_BANDAS_UMA_SUP, TASA_CESANTIA_TRABAJADOR, TASA_CESANTIA_PATRON_PRE2023 } from '../../src/tablas-contrafactual';
import { INPC_INDICES } from '../../src/inpc';
import { ENGINE_VERSION } from '../../src/version';
import type { EntradaCalculo, Palancas } from '../../src/types';

export const HOY_NUEVO = new Date('2026-10-24T00:00:00.000Z');
export const HOY_VIEJO = new Date('2026-10-21T00:00:00.000Z');
export const EDAD_MAX = 65;

export interface FilaEntrada {
  persona_id: string;
  segmento: string;
  grupo: string;
  sexo: string | null;
  edad: number | null;
  semilla: unknown;
  ultima_modalidad: string | null;
}

export interface Camino {
  pension: number | null;
  costo: number;
  status?: string;
  inicio?: string;
  meses?: number;
}

export interface DetalleEdad {
  /** Edad exacta al retiro (fraccional para quien ya tiene 60+). */
  edad: number;
  fecha_retiro: string;
  /** Meses desde hoy hasta el retiro. */
  meses: number;
  viejo: {
    base: number | null;
    /** Proyecto Mod 40 retroactivo a 25 UMA; `ventana_ok` = podía inscribirse a esa fecha. */
    proyecto: (Camino & { total?: number; ventana_ok?: boolean }) | null;
    /** Calculadora del mundo viejo: retro hoy + Mod 10 mínimo → Mod 40 los últimos 60 meses. */
    adelante: Camino | null;
    mejor: string;
  };
  nuevo: {
    base: number | null;
    mod40: Camino | null;
    mod10: Camino | null;
    mod10_escalonada: Camino | null;
    sugerido_mod40: Camino | null;
    sugerido_mod10: Camino | null;
    sugerido_mod40_rec: Camino | null;
    sugerido_mod10_rec: Camino | null;
  };
}

export interface ResultadoPersona {
  persona_id: string;
  motor_version: string;
  error: string | null;
  semanas: number | null;
  ultimo_sbc: number | null;
  sbc_tope_mod40: number | null;
  mod40_permitida: boolean | null;
  edad_retiro_min: number | null;
  viejo_pension: number | null;
  viejo_costo_imss: number | null;
  viejo_costo_total: number | null;
  nuevo_mejor_camino: string | null;
  nuevo_pension: number | null;
  nuevo_costo: number | null;
  base_pension: number | null;
  detalle: { edades: DetalleEdad[]; avisos: string[]; resumen?: Resumen; propuestas?: Propuestas } | null;
}

/** Cesantía y vejez (patrón + trabajador) de cada mundo en el resumen: lo que va a Hacienda al pensionarse. */
export interface Resumen { viejo_cyv: number; nuevo_cyv: number }

/** Escenarios de política a la primera fecha de retiro (claude/110). */
export interface Propuestas {
  tope12: number | null;
  /** a) Mod 40 hacia adelante con tope = promedio actualizado de 12 meses + 1 UMA. */
  a_tope12: Camino | null;
  /** b) 12 meses hacia atrás: al tope de 12 meses (b1) o hasta 25 UMA (b2). Sólo con trámite a los 60+. */
  b1_retro12_tope: Camino | null;
  b2_retro12_25uma: Camino | null;
  /** d) Conservación: con 500+ semanas se pensiona aunque haya perdido la conservación. */
  d_conservacion: number | null;
}

const PALANCAS: Palancas = {
  edadRetiro: 60,
  pctTiempoCotizando: 0,
  salarioMod40: 0,
  recuperarSemanasDescontadas: false,
  recuperarSemanasMod40Retro: false,
  salarioCotizacionRetro: 'MAXIMO',
  usaCreditoInfonavit: false,
  ahorroVoluntarioMensual: 0,
};

const MODALIDADES = new Set(['obligatorio', 'mod40', 'independiente', 'otra_voluntaria']);
const r0 = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : Math.round(n));
const iso = (d: Date) => d.toISOString().slice(0, 10);

function cumple(fnac: Date, edad: number): Date {
  return new Date(Date.UTC(fnac.getUTCFullYear() + edad, fnac.getUTCMonth(), fnac.getUTCDate()));
}

const anioUTC = (d: Date) => d.getUTCFullYear();
function porAnioT(t: Record<number, number>, y: number): number {
  const ks = Object.keys(t).map(Number);
  const yy = Math.min(Math.max(y, Math.min(...ks)), Math.max(...ks));
  return t[yy];
}
/** Tasa de cesantía y vejez (patrón por banda de UMA + trabajador) en un año. */
export function tasaCyV(salario: number, anio: number): number {
  const uma = porAnioT(UMA, anio);
  const sm = porAnioT(SALARIO_MINIMO, anio);
  let pat = TASA_CESANTIA_PATRON_PRE2023;
  if (anio >= 2023 && salario > sm) {
    const k = Math.min(Math.max(anio, 2023), 2030);
    const col = CESANTIA97_ANIOS.indexOf(k);
    let fila = CESANTIA97_BANDAS_UMA_SUP.findIndex((c) => salario / uma <= c);
    if (fila < 0) fila = CESANTIA97_BANDAS_UMA_SUP.length;
    pat = CESANTIA97_PCT[fila][col] / 100;
  }
  return pat + TASA_CESANTIA_TRABAJADOR;
}
/** CyV de una serie mensual [desde, hasta) con salario por mes (meses restantes al final → salario). */
export function cyvSerie(desde: Date, hasta: Date, salario: (mesesAlFinal: number, mes: Date) => number): number {
  let total = 0;
  const meses: Date[] = [];
  for (let m = new Date(Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), 1)); m < hasta; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) meses.push(m);
  meses.forEach((m, i) => {
    const sal = salario(meses.length - i, m);
    total += sal * 30.4 * tasaCyV(sal, anioUTC(m));
  });
  return Math.round(total);
}
/** Promedio de los últimos 12 meses registrados, actualizado por INPC al mes de referencia. */
export function promedio12Actualizado(salario60: Array<{ salario_diario: number }>, ultimaCot: Date, ref: Date): number | null {
  const idx = (d: Date) => {
    const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    if (INPC_INDICES[k]) return INPC_INDICES[k];
    const ks = Object.keys(INPC_INDICES).sort();
    return k < ks[0] ? INPC_INDICES[ks[0]] : INPC_INDICES[ks[ks.length - 1]];
  };
  const v = salario60.slice(0, 12);
  if (!v.length) return null;
  const iRef = idx(ref);
  let suma = 0;
  v.forEach((m, i) => {
    const mes = new Date(Date.UTC(ultimaCot.getUTCFullYear(), ultimaCot.getUTCMonth() - i, 1));
    suma += m.salario_diario * (iRef / idx(mes));
  });
  return suma / v.length;
}

function pensionDe(r: ReturnType<typeof computeLey73>): number | null {
  return r.status === 'viable' ? r0(r.pensionMensual) : 0;
}

function vacio(f: FilaEntrada, error: string): ResultadoPersona {
  return {
    persona_id: f.persona_id, motor_version: ENGINE_VERSION, error,
    semanas: null, ultimo_sbc: null, sbc_tope_mod40: null, mod40_permitida: null, edad_retiro_min: null,
    viejo_pension: null, viejo_costo_imss: null, viejo_costo_total: null,
    nuevo_mejor_camino: null, nuevo_pension: null, nuevo_costo: null, base_pension: null, detalle: null,
  };
}

export interface OpcionesDosMundos {
  hoyNuevo?: Date;
  hoyViejo?: Date;
  /** Barrido de `sugerirInicio` (lo más caro). Default true. */
  sugerir?: boolean;
  /** Paso del barrido en meses (default 3: suficiente para el informe y 3× más rápido). */
  pasoMeses?: number;
}

export function evaluarDosMundos(f: FilaEntrada, opts: OpcionesDosMundos = {}): ResultadoPersona {
  const hoyN = opts.hoyNuevo ?? HOY_NUEVO;
  const hoyV = opts.hoyViejo ?? HOY_VIEJO;
  const s = parseSemillaV2(f.semilla);
  if (!s) return vacio(f, 'semilla_invalida');
  if (s.perfil.ley !== 'Ley73') return vacio(f, 'no_ley73');

  const raw = f.semilla as { historial?: RegistroHistorialMod40[] };
  const historial = Array.isArray(raw.historial) ? raw.historial : [];
  const um = f.ultima_modalidad && MODALIDADES.has(f.ultima_modalidad)
    ? (f.ultima_modalidad as EntradaCalculo['ultimaModalidad'])
    : null;
  const reg = regimenMod40(historial, hoyN, {
    ultimoSbc: s.perfil.salario_diario_registrado,
    ultimaModalidad: um,
    sinBaja: s.perfil.status_empleo === 'empleado',
    limiteExpediente: s.perfil.fechas.limite_inscripcion_mod40,
    conservaDerechos: s.perfil.conserva_derechos,
  });
  const ultimaModalidad = reg.ultimaModalidad ?? um ?? 'obligatorio';

  const fnac = new Date(`${s.perfil.fecha_nacimiento}T00:00:00.000Z`);
  const edadHoy = (hoyN.getTime() - fnac.getTime()) / (365.25 * 86_400_000);
  const edadMin = Math.max(60, Math.floor(edadHoy));
  // Horizontes: menores de 60 → cumpleaños 60…65; 60+ → hoy, +12, +24 … +60 meses.
  const DIA = 86_400_000;
  const horizontes: Array<{ edad: number; fechaV: Date; fechaN: Date }> = [];
  if (edadHoy < 60) {
    for (let a = 60; a <= EDAD_MAX; a++) horizontes.push({ edad: a, fechaV: cumple(fnac, a), fechaN: cumple(fnac, a) });
  } else {
    for (let k = 0; k <= 5; k++) {
      const add = (d: Date) => new Date(Date.UTC(d.getUTCFullYear() + k, d.getUTCMonth(), d.getUTCDate()));
      horizontes.push({ edad: edadHoy + k, fechaV: add(hoyV), fechaN: add(hoyN) });
    }
  }

  const tope = 25 * UMA[2026];
  const base: Omit<EntradaCalculo, 'palancas' | 'hoy'> = {
    perfil: s.perfil,
    saldos: s.saldos,
    salario_60m: s.salario_60m,
    ultimoSbc: reg.ultimoSbc,
    ultimaModalidad,
  };
  const avisos: string[] = [];
  const detalle: DetalleEdad[] = [];

  for (const [i, h] of horizontes.entries()) {
    const a = h.edad;
    const pal = { ...PALANCAS, edadRetiro: a };
    // ---- Mundo viejo ----
    const eV = { ...base, hoy: hoyV, palancas: pal };
    const baseV = pensionDe(computeLey73(eV));
    let proyecto: DetalleEdad['viejo']['proyecto'] = null;
    try {
      const fechaPry = h.fechaV < hoyV ? hoyV : h.fechaV;
      const p = computeProyectoMod40({
        ...eV, fechaTramite: fechaPry, historial, umasProyecto: 25,
        limiteInscripcionMod40: s.perfil.fechas.limite_inscripcion_mod40,
      });
      if (p) {
        proyecto = {
          pension: r0(p.conProyecto.pensionMensual), costo: Math.round(p.pagoImss.total), meses: p.pagoImss.meses,
          inicio: iso(p.fechaTramite), total: Math.round(p.totalAPagar),
          ventana_ok: p.ventana.diasRestantes == null || p.ventana.diasRestantes >= 0,
        };
        if (i === 0) avisos.push(...p.avisos.map((x) => `viejo: ${x}`));
      }
    } catch (e) {
      avisos.push(`viejo ${i}: ${(e as Error).message}`);
    }
    let adelanteV: Camino | null = null;
    if (i > 0 || edadHoy < 60) {
      const r = computeLey73({ ...eV, fechaTramite: hoyV, palancas: { ...pal, pctTiempoCotizando: 1, salarioMod40: 25 * UMA[2026], recuperarSemanasMod40Retro: true } });
      adelanteV = { pension: pensionDe(r), costo: Math.round(r.costoEstrategiaFutura + (r.retro?.total ?? 0)), status: r.status };
    }
    const opV: Array<[string, number]> = [['base', baseV ?? 0]];
    if (proyecto?.ventana_ok) opV.push(['proyecto', proyecto.pension ?? 0]);
    if (adelanteV) opV.push(['adelante', adelanteV.pension ?? 0]);
    opV.sort((x, y) => y[1] - x[1]);

    // ---- Mundo nuevo ----
    const eN = { ...base, hoy: hoyN, fechaTramite: hoyN };
    const baseN = pensionDe(computeLey73({ ...eN, palancas: pal }));
    const corre = (extra: Partial<Palancas>): Camino => {
      const r = computeLey73({ ...eN, palancas: { ...pal, pctTiempoCotizando: 1, salarioMod40: tope, ...extra } });
      return { pension: pensionDe(r), costo: Math.round(r.costoEstrategiaFutura), status: r.status };
    };
    // Retiro hoy (60+, primer horizonte): no hay meses que cotizar; sólo pensionarse.
    const cotiza = h.fechaN.getTime() - hoyN.getTime() > 30 * DIA;
    const mod40 = cotiza && reg.mod40Permitida ? corre({ modalidadFutura: 'mod40' }) : null;
    const mod10 = cotiza ? corre({ modalidadFutura: 'mod10' }) : null;
    const mod10Esc = cotiza ? corre({ modalidadFutura: 'mod10', mod10EscalonMeses: MOD10_ESCALON_MESES }) : null;

    let sug40: Camino | null = null;
    let sug10: Camino | null = null;
    let sug40r: Camino | null = null;
    let sug10r: Camino | null = null;
    if (opts.sugerir !== false && h.fechaN.getTime() - hoyN.getTime() > 365 * DIA) {
      try {
        const sg = sugerirInicio({ ...eN, palancas: { ...pal, pctTiempoCotizando: 1, salarioMod40: tope } }, { pasoMeses: opts.pasoMeses ?? 3 });
        const de = (p: { pension: number | null; costoCuotas: number; fechaInicio: Date; mesesCotizando: number } | null | undefined): Camino | null =>
          p ? { pension: r0(p.pension), costo: Math.round(p.costoCuotas), inicio: iso(p.fechaInicio), meses: p.mesesCotizando } : null;
        sug40 = de(sg.mod40?.maxPension);
        sug10 = de(sg.mod10?.maxPension);
        sug40r = de(sg.mod40?.recomendado);
        sug10r = de(sg.mod10?.recomendado);
      } catch (e) {
        avisos.push(`sugerir ${a}: ${(e as Error).message}`);
      }
    }
    detalle.push({
      edad: Math.round(a * 100) / 100,
      fecha_retiro: iso(h.fechaN),
      meses: Math.round((h.fechaN.getTime() - hoyN.getTime()) / (30.4375 * DIA)),
      viejo: { base: baseV, proyecto, adelante: adelanteV, mejor: opV[0][0] },
      nuevo: { base: baseN, mod40, mod10, mod10_escalonada: mod10Esc, sugerido_mod40: sug40, sugerido_mod10: sug10, sugerido_mod40_rec: sug40r, sugerido_mod10_rec: sug10r },
    });
  }

  // ---- Resumen a la edad mínima ----
  const d0 = detalle[0];
  const viejoMejor: (Camino & { total?: number }) | null =
    d0.viejo.mejor === 'proyecto' ? d0.viejo.proyecto : d0.viejo.mejor === 'adelante' ? d0.viejo.adelante : null;
  const candidatos: Array<[string, Camino]> = [['pensionarse', { pension: d0.nuevo.base, costo: 0 }]];
  for (const [k, c] of Object.entries({
    mod40: d0.nuevo.mod40, mod10: d0.nuevo.mod10, mod10_escalonada: d0.nuevo.mod10_escalonada,
    sugerido_mod40: d0.nuevo.sugerido_mod40, sugerido_mod10: d0.nuevo.sugerido_mod10,
  })) if (c && c.pension != null) candidatos.push([k, c]);
  // Mayor pensión; a igual pensión (±$50), el más barato.
  candidatos.sort((x, y) => {
    const dp = (y[1].pension ?? 0) - (x[1].pension ?? 0);
    return Math.abs(dp) > 50 ? dp : x[1].costo - y[1].costo;
  });
  const [mejorK, mejorC] = candidatos[0];

  // ---- Cesantía y vejez de cada mundo (lo que va a Hacienda) ----
  const ultimaCot = new Date(`${s.perfil.fechas.ultima_cotizacion_valida}T00:00:00.000Z`);
  const fRet = new Date(`${d0.fecha_retiro}T00:00:00.000Z`);
  const uma25 = (y: number) => 25 * porAnioT(UMA, y);
  const smA = (y: number) => porAnioT(SALARIO_MINIMO, y);
  let viejoCyv = 0;
  if (d0.viejo.mejor === 'proyecto' && d0.viejo.proyecto) {
    const fT = new Date(`${d0.viejo.proyecto.inicio}T00:00:00.000Z`);
    const desde = new Date(Math.max(ultimaCot.getTime(), Date.UTC(fT.getUTCFullYear(), fT.getUTCMonth() - 60, 1)));
    viejoCyv = cyvSerie(desde, fT, () => uma25(anioUTC(ultimaCot)));
  } else if (d0.viejo.mejor === 'adelante') {
    const desde = new Date(Math.max(ultimaCot.getTime(), Date.UTC(hoyV.getUTCFullYear(), hoyV.getUTCMonth() - 60, 1)));
    viejoCyv = cyvSerie(desde, hoyV, () => uma25(anioUTC(ultimaCot))) +
      cyvSerie(hoyV, fRet, (x, m) => (x > 60 ? smA(anioUTC(m)) : uma25(anioUTC(m))));
  }
  let nuevoCyv = 0;
  const tope40 = reg.sbcTopeMod40 ?? uma25(2026);
  if (mejorK === 'mod40') nuevoCyv = cyvSerie(hoyN, fRet, () => tope40);
  else if (mejorK === 'mod10') nuevoCyv = cyvSerie(hoyN, fRet, (_x, m) => uma25(anioUTC(m)));
  else if (mejorK === 'mod10_escalonada') nuevoCyv = cyvSerie(hoyN, fRet, (x, m) => (x > MOD10_ESCALON_MESES ? smA(anioUTC(m)) : uma25(anioUTC(m))));
  else if (mejorK === 'sugerido_mod40' || mejorK === 'sugerido_mod10') {
    const ini = new Date(`${mejorC.inicio}T00:00:00.000Z`);
    nuevoCyv = cyvSerie(ini, fRet, (_x, m) => (mejorK === 'sugerido_mod40' ? tope40 : uma25(anioUTC(m))));
  }

  // ---- Propuestas (claude/110) a la primera fecha de retiro ----
  const prop: Propuestas = { tope12: null, a_tope12: null, b1_retro12_tope: null, b2_retro12_25uma: null, d_conservacion: null };
  try {
    const p12 = promedio12Actualizado(s.salario_60m, ultimaCot, hoyN);
    const tope12 = p12 == null ? null : Math.min(uma25(2026), p12 + UMA[2026]);
    prop.tope12 = tope12 == null ? null : Math.round(tope12 * 100) / 100;
    const pal0 = { ...PALANCAS, edadRetiro: d0.edad };
    if (tope12 != null && reg.mod40Permitida && fRet.getTime() - hoyN.getTime() > 30 * DIA) {
      const r = computeLey73({ ...base, hoy: hoyN, fechaTramite: hoyN, sbcTopeMod40Override: tope12,
        palancas: { ...pal0, pctTiempoCotizando: 1, salarioMod40: uma25(2026), modalidadFutura: 'mod40' } });
      prop.a_tope12 = { pension: pensionDe(r), costo: Math.round(r.costoEstrategiaFutura), status: r.status };
    }
    // Retro de 12 meses: se paga y se pensiona en el mismo acto (trámite a los 60+).
    const fechaB = fRet < hoyV ? hoyV : fRet;
    const retro = (umas: number): Camino | null => {
      const p = computeProyectoMod40({ ...base, hoy: hoyV, palancas: pal0, fechaTramite: fechaB, historial, umasProyecto: umas,
        mesesRetroMax: 12, limiteInscripcionMod40: s.perfil.fechas.limite_inscripcion_mod40 });
      if (!p || !(p.ventana.diasRestantes == null || p.ventana.diasRestantes >= 0)) return null;
      return { pension: r0(p.conProyecto.pensionMensual), costo: Math.round(p.pagoImss.total), meses: p.pagoImss.meses };
    };
    // Sólo con baja: quien cotiza hoy no tiene periodo que pagar hacia atrás.
    if (s.perfil.status_empleo !== 'empleado') {
      if (tope12 != null) prop.b1_retro12_tope = retro(tope12 / porAnioT(UMA, anioUTC(ultimaCot)));
      prop.b2_retro12_25uma = retro(25);
    }
    const sem = s.perfil.semanas.cotizadas - s.perfil.semanas.descontadas + s.perfil.semanas.recuperadas;
    if (!s.perfil.conserva_derechos && sem >= 500) {
      prop.d_conservacion = pensionDe(computeLey73({ ...base, perfil: { ...s.perfil, conserva_derechos: true }, hoy: hoyN, palancas: pal0 }));
    }
  } catch (e) {
    avisos.push(`propuestas: ${(e as Error).message}`);
  }

  return {
    persona_id: f.persona_id,
    motor_version: ENGINE_VERSION,
    error: null,
    semanas: s.perfil.semanas.cotizadas - s.perfil.semanas.descontadas + s.perfil.semanas.recuperadas,
    ultimo_sbc: reg.ultimoSbc,
    sbc_tope_mod40: reg.sbcTopeMod40,
    mod40_permitida: reg.mod40Permitida,
    edad_retiro_min: edadMin,
    viejo_pension: viejoMejor ? viejoMejor.pension : d0.viejo.base,
    viejo_costo_imss: viejoMejor ? viejoMejor.costo : 0,
    viejo_costo_total: viejoMejor ? (viejoMejor.total ?? viejoMejor.costo) : 0,
    nuevo_mejor_camino: mejorK,
    nuevo_pension: mejorC.pension,
    nuevo_costo: mejorC.costo,
    base_pension: d0.nuevo.base,
    detalle: { edades: detalle, avisos: avisos.slice(0, 10), resumen: { viejo_cyv: viejoCyv, nuevo_cyv: nuevoCyv }, propuestas: prop },
  };
}
