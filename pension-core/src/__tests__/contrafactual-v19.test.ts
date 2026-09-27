// v1.9 (27-sep-2026) — calibración del saldo AFORE con saldos reales (claude/89).
import { describe, it, expect } from 'vitest';
import {
  comisionFlujo,
  aporteRcvDiario,
  tasaRcv,
  cuotaSocialDiaria,
  CS_REFORMA_DESDE,
  FACTOR_FUGAS_DEFAULT,
} from '../contrafactual';
import { eventosASegmentos, getHistoriaPrecisa, type EventoLaboral } from '../eventos-laborales';
import { SALARIO_MINIMO } from '../tablas';
import { CURVA_SALARIAL_ANUAL } from '../tablas-contrafactual';
import { porAnio } from '../util';

const EV = (fecha: string, tipo: EventoLaboral['tipo'], salario: number, rp = 'RP1'): EventoLaboral => ({
  empleador: 'ACME',
  registro_patronal: rp,
  fecha,
  tipo,
  salario_base: salario,
});

describe('v1.9 — aportación RCV neta', () => {
  it('comisión sobre flujo por época y 0 desde mar-2008', () => {
    expect(comisionFlujo(1998, 5)).toBe(0.014);
    expect(comisionFlujo(2003, 5)).toBe(0.012);
    expect(comisionFlujo(2007, 12)).toBe(0.01);
    expect(comisionFlujo(2008, 2)).toBe(0.009);
    expect(comisionFlujo(2008, 3)).toBe(0);
    expect(comisionFlujo(2015, 1)).toBe(0);
  });

  it('después de 2008 la aportación es la tasa RCV completa', () => {
    expect(aporteRcvDiario(2015, 6, 500)).toBeCloseTo(tasaRcv(2015, 500) * 500, 8);
  });

  it('antes de 2007 la Cesantía y Vejez topa en 15 SM + 1 por año; el Retiro no', () => {
    const sm = porAnio(SALARIO_MINIMO, 2000);
    const sbc = 25 * sm; // salario al tope de 25
    const capCV = 18 * sm; // 15 + (2000 - 1997)
    const esperado = 0.02 * sbc + (tasaRcv(2000, sbc) - 0.02) * capCV - 0.014 * sbc;
    expect(aporteRcvDiario(2000, 6, sbc)).toBeCloseTo(esperado, 8);
    expect(aporteRcvDiario(2000, 6, sbc)).toBeLessThan(tasaRcv(2000, sbc) * sbc);
  });

  it('cuota social: la tabla de la reforma aplica desde 2023, 2021-2022 sigue la de 2009', () => {
    expect(CS_REFORMA_DESDE).toBe(2023);
    // 1 SM: la tabla 2009 da ≈$3.87 indexado; la reforma da el especial de $10.75 indexado.
    const sm22 = porAnio(SALARIO_MINIMO, 2022);
    const sm23 = porAnio(SALARIO_MINIMO, 2023);
    expect(cuotaSocialDiaria(2022, sm22)).toBeLessThan(8);
    expect(cuotaSocialDiaria(2023, sm23)).toBeGreaterThan(10);
  });

  it('factor de fugas por default 0.95', () => {
    expect(FACTOR_FUGAS_DEFAULT).toBe(0.95);
  });
});

describe('v1.9 — eventos del mismo día y modificaciones huérfanas', () => {
  it('baja y reingreso del mismo patrón el mismo día: cierra el anterior y abre el nuevo', () => {
    // El parser puede entregar el reingreso ANTES que la baja del mismo día.
    const segs = eventosASegmentos([
      EV('2010-01-01', 'reentry', 100),
      EV('2015-06-01', 'reentry', 300),
      EV('2015-06-01', 'discharge', 200),
      EV('2016-01-01', 'salary_modification', 350),
      EV('2018-12-31', 'discharge', 350),
    ]);
    const abiertos = segs.filter((s) => s.fecha_fin === null);
    expect(abiertos).toHaveLength(0);
    expect(segs.some((s) => s.fecha_inicio === '2015-06-01' && s.salario_base === 300)).toBe(true);
    expect(segs.some((s) => s.fecha_inicio === '2016-01-01' && s.fecha_fin === '2018-12-31' && s.salario_base === 350)).toBe(true);
  });

  it('empleo de un día (alta = baja) no queda abierto aunque llegue la baja primero', () => {
    const segs = eventosASegmentos([EV('2008-08-01', 'discharge', 85), EV('2008-08-01', 'reentry', 85)]);
    expect(segs.filter((s) => s.fecha_fin === null)).toHaveLength(0);
  });

  it('una modificación después de la baja no abre un empleo sin fin', () => {
    const segs = eventosASegmentos([
      EV('2010-01-01', 'reentry', 100),
      EV('2012-01-01', 'discharge', 100),
      EV('2012-02-01', 'salary_modification', 120),
    ]);
    expect(segs.filter((s) => s.fecha_fin === null)).toHaveLength(0);
  });
});

describe('v1.9 — SISEC sin modificaciones: tramos planos deflactados', () => {
  it('con curva salarial, un empleo largo y plano se deflacta hacia atrás', () => {
    const r = getHistoriaPrecisa(
      { json_sisec: [
        { event_date: '1995-01-01', event_type: 'reentry', base_salary: 1000, registro_patronal: 'RP1', employer: 'X' },
        { event_date: '2014-09-15', event_type: 'discharge', base_salary: 1000, registro_patronal: 'RP1', employer: 'X' },
      ] },
      { curvaSalarial: CURVA_SALARIAL_ANUAL, hastaISO: '2026-09-27' },
    );
    expect(r.fuente).toBe('eventos_deflactados');
    const primero = r.historia.find((e) => e.fecha_inicio === '1995-01-01');
    const ultimo = r.historia.find((e) => e.fecha_fin === '2014-09-15');
    expect(ultimo?.salario_base).toBeCloseTo(1000, 6);
    expect(primero!.salario_base!).toBeLessThan(400);
  });
});
