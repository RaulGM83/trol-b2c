/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Eventos laborales (SISEC/Belvo) → segmentos salariales para el contrafactual.
//
// Precisión por fuente (metodología v1.4, ajuste 19-jul-2026):
//   1) `employment_events` de SISEC (procesos.json_sisec): trae
//      reentry / salary_modification / discharge con el salario vigente en
//      CADA fecha → trayectoria salarial exacta. FUENTE PREFERIDA.
//   2) `employment_history` con initial_salary y base_salary (Belvo):
//      se interpola linealmente el salario entre inicio y fin del empleo →
//      mucho mejor que asumir el salario final durante todo el periodo.
//   3) `employment_history` solo con base_salary (final): último recurso;
//      sobreestima las aportaciones tempranas (se marca en supuestos).
// ============================================================================

import type { EmpleoHistorial } from './historia-laboral';

export interface EventoLaboral {
  empleador: string | null;
  registro_patronal: string | null;
  fecha: string; // ISO YYYY-MM-DD
  tipo: 'reentry' | 'salary_modification' | 'discharge';
  salario_base: number | null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extrae y normaliza `employment_events` de un json_sisec o json_belvo
 * (misma ruta en ambos: employment_history_json.data.employment_events).
 * Devuelve [] si no hay eventos.
 */
export function getEventosLaborales(raw: unknown): EventoLaboral[] {
  if (!raw || typeof raw !== 'object') return [];
  // Acepta el array de eventos directo o el wrapper json_sisec/json_belvo.
  const arr = Array.isArray(raw)
    ? raw
    : (raw as Record<string, any>)?.employment_history_json?.data?.employment_events;
  if (!Array.isArray(arr)) return [];
  const out: EventoLaboral[] = [];
  for (const e of arr) {
    const fecha = str(e?.event_date)?.slice(0, 10) ?? null;
    const tipo = str(e?.event_type);
    if (!fecha || !tipo) continue;
    if (tipo !== 'reentry' && tipo !== 'salary_modification' && tipo !== 'discharge') continue;
    out.push({
      empleador: str(e?.employer),
      registro_patronal: str(e?.registro_patronal),
      fecha,
      tipo,
      salario_base: numOrNull(e?.base_salary),
    });
  }
  return out.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}

function diaAnterior(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d - 1));
  return t.toISOString().slice(0, 10);
}

/**
 * Convierte el flujo de eventos en segmentos salariales (EmpleoHistorial[]),
 * agrupando por registro patronal (o empleador si falta):
 *   - reentry abre un segmento con el salario del alta;
 *   - salary_modification cierra el segmento vigente el día anterior y abre
 *     uno nuevo con el salario modificado;
 *   - discharge cierra el segmento vigente en la fecha de baja.
 * Segmentos sin baja quedan abiertos (fecha_fin = null → empleo activo).
 * Empleos concurrentes en distintos patrones quedan como segmentos paralelos
 * (sbcMensual ya los suma con tope de 25 UMA).
 */
export function eventosASegmentos(eventos: EventoLaboral[]): EmpleoHistorial[] {
  const porPatron = new Map<string, EventoLaboral[]>();
  for (const e of eventos) {
    const clave = e.registro_patronal ?? e.empleador ?? '¿?';
    if (!porPatron.has(clave)) porPatron.set(clave, []);
    porPatron.get(clave)!.push(e);
  }

  const segmentos: EmpleoHistorial[] = [];
  for (const [, evs] of porPatron) {
    let abierto: { inicio: string; salario: number | null; empleador: string | null; rp: string | null } | null = null;
    for (const e of evs) {
      if (e.tipo === 'reentry') {
        // reentry con segmento abierto: ciérralo el día anterior (baja implícita).
        if (abierto && abierto.inicio < e.fecha) {
          segmentos.push(seg(abierto, diaAnterior(e.fecha)));
        }
        abierto = { inicio: e.fecha, salario: e.salario_base, empleador: e.empleador, rp: e.registro_patronal };
      } else if (e.tipo === 'salary_modification') {
        if (abierto) {
          if (abierto.inicio < e.fecha) segmentos.push(seg(abierto, diaAnterior(e.fecha)));
          abierto = {
            inicio: e.fecha,
            salario: e.salario_base ?? abierto.salario,
            empleador: abierto.empleador,
            rp: abierto.rp,
          };
        } else {
          // modificación sin alta previa registrada: abre segmento desde aquí.
          abierto = { inicio: e.fecha, salario: e.salario_base, empleador: e.empleador, rp: e.registro_patronal };
        }
      } else {
        // discharge: el salario de la baja es el salario FINAL del tramo
        // (los eventos de reentry traen el salario del alta; guardar ambos
        // permite interpolar la trayectoria cuando no hay modificaciones).
        if (abierto) {
          segmentos.push(seg(abierto, e.fecha, e.salario_base));
          abierto = null;
        }
      }
    }
    if (abierto) segmentos.push(seg(abierto, null)); // sigue activo
  }
  return segmentos;

  function seg(
    a: { inicio: string; salario: number | null; empleador: string | null; rp: string | null },
    fin: string | null,
    salarioFin?: number | null,
  ): EmpleoHistorial {
    const sFin = salarioFin && salarioFin > 0 ? salarioFin : null;
    return {
      empleador: a.empleador,
      fecha_inicio: a.inicio,
      fecha_fin: fin,
      salario_base: sFin ?? a.salario,
      salario_inicial: a.salario,
      registro_patronal: a.rp,
      entidad_federativa: null,
    };
  }
}

/**
 * Asigna salario FINAL a los segmentos abiertos (empleo activo) usando los
 * empleos de otra fuente (Belvo trae el salario actual): match por registro
 * patronal, luego por empleador, y si solo hay un abierto en cada lado, ese.
 * Con salario de alta (eventos) + salario actual (empleos) el tramo abierto
 * se puede interpolar en lugar de asumir el salario del alta todos los años.
 */
export function cerrarSegmentosAbiertos(
  segs: EmpleoHistorial[],
  empleos: EmpleoHistorial[],
): EmpleoHistorial[] {
  if (!empleos.length) return segs;
  const norm = (s: string | null | undefined) => (s ?? '').trim().toUpperCase();
  const abiertos = segs.filter((s) => !s.fecha_fin);
  const empleosAbiertos = empleos.filter((e) => !e.fecha_fin);
  return segs.map((s) => {
    if (s.fecha_fin) return s;
    const m =
      empleos.find((e) => e.registro_patronal && s.registro_patronal && norm(e.registro_patronal) === norm(s.registro_patronal)) ??
      empleos.find((e) => e.empleador && s.empleador && norm(e.empleador) === norm(s.empleador)) ??
      (abiertos.length === 1 && empleosAbiertos.length === 1 ? empleosAbiertos[0] : undefined);
    const sFin = m?.salario_base ?? null;
    if (!sFin || sFin <= 0) return s;
    return { ...s, salario_inicial: s.salario_inicial ?? s.salario_base, salario_base: sFin };
  });
}

/**
 * Fallback Belvo: interpola linealmente el salario entre initial_salary y
 * base_salary (final) de cada empleo, en cortes anuales. Si no hay
 * initial_salary o es igual al final, devuelve el empleo tal cual.
 */
export function empleosInterpolados(
  empleos: Array<EmpleoHistorial & { salario_inicial?: number | null }>,
  hastaISO?: string,
): EmpleoHistorial[] {
  const out: EmpleoHistorial[] = [];
  for (const e of empleos) {
    const s0 = e.salario_inicial ?? null;
    const s1 = e.salario_base ?? null;
    // Empleos abiertos: se interpola hasta hastaISO (hoy) y el último tramo
    // conserva fecha_fin = null (sigue activo).
    const finISO = e.fecha_fin ?? hastaISO ?? null;
    if (!e.fecha_inicio || !finISO || !s0 || !s1 || s0 <= 0 || s0 === s1) {
      out.push(e);
      continue;
    }
    const ini = new Date(e.fecha_inicio);
    const fin = new Date(finISO);
    const anios = Math.max(1, Math.round((fin.getTime() - ini.getTime()) / (365.25 * 86_400_000)));
    if (anios <= 1) {
      out.push(e);
      continue;
    }
    // crecimiento geométrico anual de s0 a s1 en `anios` pasos
    const g = Math.pow(s1 / s0, 1 / anios);
    for (let k = 0; k < anios; k++) {
      const segIni = new Date(ini.getTime() + (k * (fin.getTime() - ini.getTime())) / anios);
      const segFin = new Date(ini.getTime() + ((k + 1) * (fin.getTime() - ini.getTime())) / anios);
      out.push({
        ...e,
        fecha_inicio: segIni.toISOString().slice(0, 10),
        fecha_fin: k === anios - 1 ? e.fecha_fin : segFin.toISOString().slice(0, 10),
        salario_base: s0 * Math.pow(g, k),
      });
    }
  }
  return out;
}

/**
 * Deflacta un empleo que solo trae salario FINAL: parte del salario final en
 * el último año del empleo y camina hacia atrás dividiendo por el crecimiento
 * salarial mediano observado en la propia base (CURVA_SALARIAL_ANUAL).
 * Genera un segmento por año calendario. `hastaISO` acota empleos abiertos.
 */
export function empleosDeflactados(
  empleos: EmpleoHistorial[],
  curva: Record<number, number>,
  hastaISO?: string,
): EmpleoHistorial[] {
  const anios = Object.keys(curva).map(Number).sort((a, b) => a - b);
  const factor = (anio: number): number => {
    const a = anio < anios[0] ? anios[0] : anio > anios[anios.length - 1] ? anios[anios.length - 1] : anio;
    return 1 + (curva[a] ?? 0);
  };

  const out: EmpleoHistorial[] = [];
  for (const e of empleos) {
    const s1 = e.salario_base ?? null;
    if (!e.fecha_inicio || !s1 || s1 <= 0) {
      out.push(e);
      continue;
    }
    const finISO = e.fecha_fin ?? hastaISO ?? null;
    if (!finISO) {
      out.push(e);
      continue;
    }
    const y0 = Number(e.fecha_inicio.slice(0, 4));
    const y1 = Number(finISO.slice(0, 4));
    if (y1 - y0 < 2) {
      out.push(e);
      continue;
    }
    // salario por año: s(y1) = s1; s(y) = s(y+1) / factor(y+1)
    let s = s1;
    const porAnio: Record<number, number> = { [y1]: s1 };
    for (let y = y1 - 1; y >= y0; y--) {
      s = s / factor(y + 1);
      porAnio[y] = s;
    }
    for (let y = y0; y <= y1; y++) {
      const ini = y === y0 ? e.fecha_inicio : `${y}-01-01`;
      const fin = y === y1 ? (e.fecha_fin ?? null) : `${y}-12-31`;
      out.push({ ...e, fecha_inicio: ini, fecha_fin: fin, salario_base: porAnio[y] });
    }
  }
  return out;
}

/**
 * Historia laboral con la mejor precisión disponible.
 * Devuelve además la fuente usada, para documentarla en los supuestos.
 * Prioridad: eventos SISEC (trayectoria real) > eventos Belvo > empleos
 * interpolados (initial→final) > empleos deflactados con la curva salarial
 * de la base > empleos planos.
 */
export function getHistoriaPrecisa(
  fuentes: {
    json_sisec?: unknown;
    json_belvo?: unknown;
    empleos?: EmpleoHistorial[];
  },
  opts?: { curvaSalarial?: Record<number, number>; hastaISO?: string },
): {
  historia: EmpleoHistorial[];
  fuente:
    | 'eventos_sisec'
    | 'eventos_belvo'
    | 'eventos_interpolados'
    | 'empleos_interpolados'
    | 'empleos_deflactados'
    | 'empleos';
} {
  const evSisec = getEventosLaborales(fuentes.json_sisec);
  if (evSisec.some((e) => e.tipo === 'salary_modification')) {
    // Trayectoria exacta por modificaciones; interpolación solo refina el
    // interior de tramos cuyo salario de baja difiere del último conocido.
    return { historia: empleosInterpolados(eventosASegmentos(evSisec)), fuente: 'eventos_sisec' };
  }
  const evBelvo = getEventosLaborales(fuentes.json_belvo);
  if (evBelvo.some((e) => e.tipo === 'salary_modification')) {
    return { historia: empleosInterpolados(eventosASegmentos(evBelvo)), fuente: 'eventos_belvo' };
  }
  // Eventos SIN modificaciones (el caso más común, ~87% de la base 19-jul):
  // aún así traen fechas exactas de alta/baja y el salario del alta de CADA
  // empleo (+ salario de baja en discharge). Se interpola alta→baja por
  // empleo, y el empleo abierto se cierra con el salario actual de empleos.
  const evs = evSisec.length ? evSisec : evBelvo;
  if (evs.length) {
    const segs = cerrarSegmentosAbiertos(eventosASegmentos(evs), fuentes.empleos ?? []);
    return { historia: empleosInterpolados(segs, opts?.hastaISO), fuente: 'eventos_interpolados' };
  }
  if (fuentes.empleos?.length) {
    // 1) interpola los que traen salario inicial
    const interp = empleosInterpolados(fuentes.empleos, opts?.hastaISO);
    const interpolo = interp.length > fuentes.empleos.length;
    // 2) deflacta con la curva los que quedaron planos (solo salario final)
    if (opts?.curvaSalarial) {
      const deflactados = empleosDeflactados(interp, opts.curvaSalarial, opts.hastaISO);
      const deflacto = deflactados.length > interp.length;
      return {
        historia: deflactados,
        fuente: interpolo ? 'empleos_interpolados' : deflacto ? 'empleos_deflactados' : 'empleos',
      };
    }
    return { historia: interp, fuente: interpolo ? 'empleos_interpolados' : 'empleos' };
  }
  return { historia: [], fuente: 'empleos' };
}
