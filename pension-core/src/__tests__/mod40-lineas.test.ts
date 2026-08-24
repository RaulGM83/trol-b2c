// ============================================================================
// Líneas de captura Mod 40 con precisión diaria.
//
// Los seis goldens salen del Excel `Calculadora_lineas_IMSS.xlsx`, que a su vez
// está validado contra líneas de captura REALES del IMSS. Van al centavo a
// propósito: si un cambio los mueve, movió dinero que el cliente va a pagar.
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  lineasCapturaMod40,
  mesesDelTramo,
  type EntradaLineasCaptura,
} from '../mod40-lineas';
import { INPC_MENSUAL, serieINPCDesdeFilas, type SerieINPC } from '../inpc';
import { parseISO } from '../util';

/**
 * Corrida del motor tal como corre en producción: con el tope del art. 219
 * (60 meses) que trae por default.
 */
const corre = (
  ultima: string,
  tramite: string,
  umas: number,
  extra: Partial<EntradaLineasCaptura> = {},
) =>
  lineasCapturaMod40({
    ultimaCotizacion: parseISO(ultima),
    fechaTramite: parseISO(tramite),
    umas,
    ...extra,
  });

/**
 * Corrida de REFERENCIA, sin tope: es la que reproduce el Excel validado, que
 * cobra 62 y 63 meses. Sirve para anclar la mecánica diaria al centavo,
 * separada de la regla de negocio del tope.
 */
const excel = (
  ultima: string,
  tramite: string,
  umas: number,
  extra: Partial<EntradaLineasCaptura> = {},
) => corre(ultima, tramite, umas, { mesesMax: null, ...extra });

/** Al centavo: el redondeo a 2 decimales tiene que dar exacto. */
const centavos = (v: number) => Math.round(v * 100) / 100;

// ============================================================================
// 1. Goldens del Excel validado
// ============================================================================

interface Golden {
  nombre: string;
  ultima: string;
  tramite: string;
  umas: number;
  meses: number;
  retro: number;
  actualizaciones: number;
  recargos: number;
  total: number;
}

const GOLDENS: Golden[] = [
  { nombre: 'base_excel', ultima: '2021-06-23', tramite: '2026-07-03', umas: 25, meses: 62, retro: 486_152.65, actualizaciones: 56_032.16, recargos: 236_842.34, total: 779_027.15 },
  { nombre: 'mas_1_semana', ultima: '2021-06-23', tramite: '2026-07-10', umas: 25, meses: 62, retro: 488_417.35, actualizaciones: 56_032.16, recargos: 236_842.34, total: 781_291.84 },
  { nombre: 'fin_de_mes', ultima: '2021-06-23', tramite: '2026-07-31', umas: 25, meses: 62, retro: 495_211.44, actualizaciones: 56_032.16, recargos: 236_842.34, total: 788_085.94 },
  { nombre: 'cruza_mes', ultima: '2021-06-23', tramite: '2026-08-01', umas: 25, meses: 63, retro: 495_534.97, actualizaciones: 57_836.51, recargos: 245_897.63, total: 799_269.11 },
  { nombre: 'baja_fin_de_mes', ultima: '2023-01-31', tramite: '2026-09-15', umas: 25, meses: 45, retro: 436_128.41, actualizaciones: 32_846.35, recargos: 146_121.77, total: 615_096.53 },
  { nombre: 'umas_15', ultima: '2021-06-23', tramite: '2026-07-03', umas: 15, meses: 62, retro: 291_691.59, actualizaciones: 33_619.29, recargos: 142_105.40, total: 467_416.29 },
];

describe('lineasCapturaMod40 — goldens del Excel (sin tope), al centavo', () => {
  for (const g of GOLDENS) {
    it(`${g.nombre}: ${g.ultima} → ${g.tramite}, ${g.umas} UMAs`, () => {
      const r = excel(g.ultima, g.tramite, g.umas);
      expect(r.meses).toBe(g.meses);
      expect(centavos(r.retro)).toBe(g.retro);
      expect(centavos(r.actualizaciones)).toBe(g.actualizaciones);
      expect(centavos(r.recargos)).toBe(g.recargos);
      expect(centavos(r.total)).toBe(g.total);
    });
  }

  it('el total es la suma de las tres piezas y del detalle', () => {
    const r = excel('2021-06-23', '2026-07-03', 25);
    expect(centavos(r.total)).toBe(centavos(r.retro + r.actualizaciones + r.recargos));
    expect(r.detalle).toHaveLength(r.meses);
    const sumaDetalle = r.detalle.reduce((a, d) => a + d.total, 0);
    expect(centavos(sumaDetalle)).toBe(centavos(r.total));
  });

  it('el SDI se ancla al año de la ÚLTIMA COTIZACIÓN, no al del trámite', () => {
    // UMA(2021) = 89.62 → 25 UMAs = 2,240.50 diarios para todo el tramo.
    expect(excel('2021-06-23', '2026-07-03', 25).sdi).toBeCloseTo(2240.5, 6);
    // UMA(2023) = 103.74 → 2,593.50
    expect(corre('2023-01-31', '2026-09-15', 25).sdi).toBeCloseTo(2593.5, 6);
  });

  it('el escalón de UMAs es lineal: 15 UMAs es 15/25 de 25 UMAs', () => {
    const a = excel('2021-06-23', '2026-07-03', 25);
    const b = excel('2021-06-23', '2026-07-03', 15);
    expect(b.total / a.total).toBeCloseTo(15 / 25, 9);
  });
});

// ============================================================================
// 1b. Goldens CON el tope del art. 219 (lo que corre en producción)
//
// Decisión de Raúl (24-ago-2026): el tope de 60 meses SÍ aplica al costo. Los
// goldens de arriba siguen sin tope porque validan la mecánica diaria contra el
// Excel; estos validan la regla de negocio encima de esa mecánica.
// ============================================================================

const GOLDENS_TOPADOS: Array<Golden & { periodo: number; fuera: number; ultimoMes: string }> = [
  {
    nombre: 'base_excel topado',
    ultima: '2021-06-23', tramite: '2026-07-03', umas: 25,
    meses: 60, periodo: 62, fuera: 2, ultimoMes: '2021-08',
    retro: 477_570.64, actualizaciones: 53_462.60, recargos: 226_978.10, total: 758_011.34,
  },
  {
    nombre: 'cruza_mes topado',
    ultima: '2021-06-23', tramite: '2026-08-01', umas: 25,
    meses: 60, periodo: 63, fuera: 3, ultimoMes: '2021-09',
    retro: 479_951.84, actualizaciones: 53_131.70, recargos: 227_808.61, total: 760_892.16,
  },
];

describe('lineasCapturaMod40 — goldens con el tope de 60 meses (default)', () => {
  for (const g of GOLDENS_TOPADOS) {
    it(`${g.nombre}: ${g.periodo} meses de periodo → cobra ${g.meses}`, () => {
      const r = corre(g.ultima, g.tramite, g.umas);
      expect(r.meses).toBe(g.meses);
      expect(r.mesesDelPeriodo).toBe(g.periodo);
      expect(r.mesesFueraDelTope).toBe(g.fuera);
      expect(r.topado).toBe(true);
      expect(centavos(r.retro)).toBe(g.retro);
      expect(centavos(r.actualizaciones)).toBe(g.actualizaciones);
      expect(centavos(r.recargos)).toBe(g.recargos);
      expect(centavos(r.total)).toBe(g.total);
    });

    it(`${g.nombre}: conserva los meses MÁS RECIENTES`, () => {
      const r = corre(g.ultima, g.tramite, g.umas);
      const sinTope = excel(g.ultima, g.tramite, g.umas);
      // El primero es el mismo (el mes del trámite); lo que se cae es la cola.
      expect(r.detalle[0].mes).toBe(sinTope.detalle[0].mes);
      expect(r.detalle[r.detalle.length - 1].mes).toBe(g.ultimoMes);
      // Y son literalmente los primeros `meses` del tramo sin tope.
      expect(r.detalle.map((d) => d.mes)).toEqual(
        sinTope.detalle.slice(0, g.meses).map((d) => d.mes),
      );
    });

    it(`${g.nombre}: el mes cortado NO se prorratea como si fuera el de la baja`, () => {
      const r = corre(g.ultima, g.tramite, g.umas);
      const ultimo = r.detalle[r.detalle.length - 1];
      expect(ultimo.prorrateo).toBe(1);
      // El mes de la baja quedó fuera del corte.
      expect(r.detalle.some((d) => d.mes === '2021-06')).toBe(false);
    });

    it(`${g.nombre}: avisa cuántos meses quedaron fuera`, () => {
      const r = corre(g.ultima, g.tramite, g.umas);
      expect(
        r.avisos.some((a) => a.includes(`Solo se cubren los últimos 60 meses; ${g.fuera} meses anteriores quedan fuera.`)),
      ).toBe(true);
    });

    it(`${g.nombre}: topado cuesta menos que sin tope`, () => {
      expect(corre(g.ultima, g.tramite, g.umas).total).toBeLessThan(
        excel(g.ultima, g.tramite, g.umas).total,
      );
    });
  }

  it('un tramo de 45 meses no lo toca el tope: mismo número con y sin él', () => {
    const conTope = corre('2023-01-31', '2026-09-15', 25);
    const sinTope = excel('2023-01-31', '2026-09-15', 25);
    expect(conTope.meses).toBe(45);
    expect(conTope.topado).toBe(false);
    expect(conTope.mesesFueraDelTope).toBe(0);
    expect(conTope.total).toBe(sinTope.total);
    expect(conTope.avisos.some((a) => a.includes('Solo se cubren'))).toBe(false);
    // Y el prorrateo del mes de la baja sigue vivo (baja el 31 → 0).
    expect(conTope.detalle[conTope.detalle.length - 1].prorrateo).toBe(0);
  });

  it('exactamente 60 meses de periodo: no se topa ni avisa', () => {
    // 2021-08-15 → 2026-07-03 son 60 meses justos.
    const r = corre('2021-08-15', '2026-07-03', 25);
    expect(r.meses).toBe(60);
    expect(r.mesesDelPeriodo).toBe(60);
    expect(r.topado).toBe(false);
    expect(r.total).toBe(excel('2021-08-15', '2026-07-03', 25).total);
    // El mes de la baja sobrevive: se prorratea.
    expect(r.detalle[r.detalle.length - 1].mes).toBe('2021-08');
    expect(r.detalle[r.detalle.length - 1].prorrateo).toBeCloseTo((31 - 15) / 31, 9);
  });

  it('61 meses de periodo: cae UNO y el aviso va en singular', () => {
    const r = corre('2021-07-15', '2026-07-03', 25);
    expect(r.mesesDelPeriodo).toBe(61);
    expect(r.meses).toBe(60);
    expect(r.mesesFueraDelTope).toBe(1);
    expect(r.avisos.some((a) => a.includes('1 mes anterior queda fuera'))).toBe(true);
  });

  it('mesesMax explícito gana sobre el default', () => {
    expect(corre('2021-06-23', '2026-07-03', 25, { mesesMax: 12 }).meses).toBe(12);
    expect(corre('2021-06-23', '2026-07-03', 25, { mesesMax: 0 }).meses).toBe(0);
    expect(corre('2021-06-23', '2026-07-03', 25, { mesesMax: 0 }).total).toBe(0);
    expect(corre('2021-06-23', '2026-07-03', 25, { mesesMax: null }).meses).toBe(62);
  });

  it('sigue moviéndose por día con el tope puesto', () => {
    const a = corre('2021-06-23', '2026-07-03', 25);
    const b = corre('2021-06-23', '2026-07-10', 25);
    expect(a.meses).toBe(b.meses);
    expect(b.total).toBeGreaterThan(a.total);
    expect(centavos(b.total) - centavos(a.total)).toBeCloseTo(2264.70, 2);
  });
});

// ============================================================================
// 2. Prorrateo de los extremos
// ============================================================================

describe('prorrateo de los meses extremos', () => {
  it('el mes del trámite cobra sólo los días transcurridos', () => {
    const r = excel('2021-06-23', '2026-07-10', 25);
    expect(r.detalle[0].mes).toBe('2026-07');
    expect(r.detalle[0].prorrateo).toBeCloseTo(10 / 31, 9);
  });

  it('el mes de la baja cobra sólo los días posteriores a ella', () => {
    const r = excel('2021-06-23', '2026-07-03', 25);
    const ultimo = r.detalle[r.detalle.length - 1];
    expect(ultimo.mes).toBe('2021-06');
    expect(ultimo.prorrateo).toBeCloseTo((30 - 23) / 30, 9);
  });

  it('baja el ÚLTIMO día del mes: prorrateo 0, no cobra ese mes ni truena', () => {
    const r = corre('2023-01-31', '2026-09-15', 25);
    const ultimo = r.detalle[r.detalle.length - 1];
    expect(ultimo.mes).toBe('2023-01');
    expect(ultimo.prorrateo).toBe(0);
    expect(ultimo.retro).toBe(0);
    expect(ultimo.actualizacion).toBe(0);
    expect(ultimo.recargo).toBe(0);
    expect(Number.isFinite(r.total)).toBe(true);
  });

  it('baja el día 1: se cobra casi todo el mes', () => {
    const r = corre('2023-03-01', '2026-09-15', 25);
    const ultimo = r.detalle[r.detalle.length - 1];
    expect(ultimo.mes).toBe('2023-03');
    expect(ultimo.prorrateo).toBeCloseTo(30 / 31, 9);
  });

  it('los meses intermedios van completos', () => {
    const r = excel('2021-06-23', '2026-07-03', 25);
    for (const d of r.detalle.slice(1, -1)) expect(d.prorrateo).toBe(1);
  });

  it('trámite el día 1: el mes del trámite pesa un solo día', () => {
    const r = excel('2021-06-23', '2026-08-01', 25);
    expect(r.detalle[0].prorrateo).toBeCloseTo(1 / 31, 9);
  });

  it('un solo mes (baja y trámite en el mismo mes) no dobla el prorrateo', () => {
    // i === 1 gana: se cobra por los días transcurridos hasta el trámite.
    const r = corre('2026-03-05', '2026-03-20', 25);
    expect(r.meses).toBe(1);
    expect(r.detalle[0].prorrateo).toBeCloseTo(20 / 31, 9);
  });

  it('año bisiesto: febrero de 2024 cuenta 29 días', () => {
    const r = excel('2023-06-15', '2026-07-03', 25);
    const feb = r.detalle.find((d) => d.mes === '2024-02')!;
    expect(feb.dias).toBe(29);
    const feb23 = r.detalle.find((d) => d.mes === '2023-02');
    expect(feb23).toBeUndefined(); // fuera del tramo
    const rr = excel('2022-06-15', '2026-07-03', 25);
    expect(rr.detalle.find((d) => d.mes === '2023-02')!.dias).toBe(28);
  });
});

// ============================================================================
// 3. Monotonía: el efecto que motivó todo esto
// ============================================================================

describe('monotonía por día', () => {
  it('dentro del mismo mes, mover la fecha un día nunca baja el total', () => {
    let previo = -Infinity;
    for (let dia = 1; dia <= 31; dia++) {
      const r = excel('2021-06-23', `2026-07-${String(dia).padStart(2, '0')}`, 25);
      expect(r.meses).toBe(62);
      expect(r.total).toBeGreaterThanOrEqual(previo);
      previo = r.total;
    }
  });

  it('una semana de diferencia SÍ mueve el número (era el bug)', () => {
    const a = excel('2021-06-23', '2026-07-03', 25);
    const b = excel('2021-06-23', '2026-07-10', 25);
    expect(centavos(b.total) - centavos(a.total)).toBeCloseTo(2264.69, 2);
  });

  it('cruzar de mes salta: un día más, otro mes completo de retro', () => {
    const jul31 = excel('2021-06-23', '2026-07-31', 25);
    const ago01 = excel('2021-06-23', '2026-08-01', 25);
    expect(ago01.meses).toBe(jul31.meses + 1);
    expect(centavos(ago01.total) - centavos(jul31.total)).toBeCloseTo(11183.17, 2);
    // Actualizaciones y recargos también saltan: cambian inpcFin y los plazos.
    expect(ago01.actualizaciones).toBeGreaterThan(jul31.actualizaciones);
    expect(ago01.recargos).toBeGreaterThan(jul31.recargos);
  });

  it('a mayor tramo, mayor total', () => {
    const corto = corre('2025-06-23', '2026-07-03', 25);
    const largo = corre('2021-06-23', '2026-07-03', 25);
    expect(largo.total).toBeGreaterThan(corto.total);
  });
});

// ============================================================================
// 4. Serie INPC: parámetro, fallback y degradación
// ============================================================================

describe('serie INPC', () => {
  it('el fallback embebido es el que reproduce los goldens', () => {
    const conDefault = excel('2021-06-23', '2026-07-03', 25);
    const explicita = excel('2021-06-23', '2026-07-03', 25, { serieINPC: INPC_MENSUAL });
    expect(explicita.total).toBe(conDefault.total);
  });

  it('acepta la serie de trol3.inpc_mensual tal como sale de PostgREST', () => {
    const filas = Object.entries(INPC_MENSUAL).map(([mes, p]) => ({
      mes: `${mes}-01`,
      indice: String(p.indice), // numeric → string
      proyectado: p.proyectado,
    }));
    const serie = serieINPCDesdeFilas(filas);
    const r = excel('2021-06-23', '2026-07-03', 25, { serieINPC: serie });
    expect(centavos(r.total)).toBe(779_027.15);
  });

  it('avisa cuando algún mes del tramo usa INPC proyectado', () => {
    // 2026-07 es proyectado (INEGI observado hasta 2026-03).
    const r = corre('2021-06-23', '2026-07-03', 25);
    expect(r.usaInpcProyectado).toBe(true);
    expect(r.avisos.some((a) => a.includes('INPC proyectado'))).toBe(true);
  });

  it('no avisa de proyección cuando todo el tramo es dato observado', () => {
    const r = corre('2024-06-15', '2026-01-10', 25);
    expect(r.usaInpcProyectado).toBe(false);
    expect(r.faltanMesesINPC).toBe(false);
    expect(r.avisos).toHaveLength(0);
  });

  it('serie sin el mes requerido: degrada con proyección y avisa, no truena', () => {
    const recortada: SerieINPC = Object.fromEntries(
      Object.entries(INPC_MENSUAL).filter(([mes]) => mes <= '2025-12'),
    );
    const r = excel('2021-06-23', '2026-07-03', 25, { serieINPC: recortada });
    expect(Number.isFinite(r.total)).toBe(true);
    expect(r.total).toBeGreaterThan(0);
    expect(r.faltanMesesINPC).toBe(true);
    expect(r.avisos.some((a) => a.includes('Faltan meses de INPC'))).toBe(true);
    // Se parece al bueno: la proyección no es exacta pero tampoco delira.
    expect(Math.abs(r.total / 779_027.15 - 1)).toBeLessThan(0.02);
  });

  it('serie vacía: no divide entre cero ni devuelve NaN', () => {
    const r = corre('2021-06-23', '2026-07-03', 25, { serieINPC: {} });
    expect(Number.isFinite(r.total)).toBe(true);
    expect(r.actualizaciones).toBe(0); // inpcFin / inpc = 1 → sin actualización
  });

  it('el detalle marca qué meses son proyectados (para congelar el snapshot)', () => {
    const r = excel('2021-06-23', '2026-07-03', 25);
    expect(r.detalle.find((d) => d.mes === '2026-07')!.inpcProyectado).toBe(true);
    expect(r.detalle.find((d) => d.mes === '2026-01')!.inpcProyectado).toBe(false);
    expect(mesesDelTramo(r)).toHaveLength(62);
    expect(mesesDelTramo(r)[0]).toBe('2026-07');
  });
});

// ============================================================================
// 5. Bordes
// ============================================================================

describe('bordes', () => {
  it('trámite ANTES de la última cotización: cero meses, cero pesos', () => {
    const r = corre('2026-07-03', '2021-06-23', 25);
    expect(r.meses).toBe(0);
    expect(r.total).toBe(0);
    expect(r.detalle).toHaveLength(0);
  });

  it('mesesMax: null desactiva el tope (es lo que hace el Excel: 62 y 63 meses)', () => {
    expect(excel('2021-06-23', '2026-07-03', 25).meses).toBe(62);
    expect(excel('2021-06-23', '2026-08-01', 25).meses).toBe(63);
  });

  it('sdi explícito manda sobre la UMA del año de la baja', () => {
    const r = excel('2021-06-23', '2026-07-03', 25, { sdi: 1000 });
    expect(r.sdi).toBe(1000);
    const base = excel('2021-06-23', '2026-07-03', 25);
    expect(r.total / base.total).toBeCloseTo(1000 / 2240.5, 9);
  });

  it('sdiPorMes manda sobre sdi, mes a mes (Ley 73 con salario MÍNIMO)', () => {
    const plano = excel('2023-06-15', '2026-07-03', 25, { sdi: 1000 });
    const porMes = excel('2023-06-15', '2026-07-03', 25, {
      sdi: 1000,
      sdiPorMes: (m) => (m.getUTCFullYear() >= 2025 ? 2000 : 1000),
    });
    expect(porMes.total).toBeGreaterThan(plano.total);
    expect(porMes.detalle.find((d) => d.mes === '2024-06')!.sdi).toBe(1000);
    expect(porMes.detalle.find((d) => d.mes === '2025-06')!.sdi).toBe(2000);
    // `sdi` de arriba sigue siendo el base; el del mes vive en el detalle.
    expect(porMes.sdi).toBe(1000);
  });

  it('la cuota por año usa VLOOKUP TRUE (2021 y 2022 caen en el tramo 2020)', () => {
    const r = excel('2021-06-23', '2026-07-03', 25);
    const cuotaDe = (mes: string) => r.detalle.find((d) => d.mes === mes)!.cuota;
    expect(cuotaDe('2021-12')).toBe(0.1008);
    expect(cuotaDe('2022-06')).toBe(0.1008);
    expect(cuotaDe('2023-06')).toBe(0.1117);
    expect(cuotaDe('2026-07')).toBe(0.1444);
  });

  it('el mes del trámite no lleva recargos (plazo cero)', () => {
    const r = excel('2021-06-23', '2026-07-03', 25);
    expect(r.detalle[0].recargo).toBe(0);
  });
});
