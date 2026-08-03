import { describe, it, expect } from 'vitest';
import {
  getEventosLaborales,
  eventosASegmentos,
  empleosInterpolados,
  getHistoriaPrecisa,
  type EventoLaboral,
} from '../eventos-laborales';

const EV = (fecha: string, tipo: EventoLaboral['tipo'], salario: number, rp = 'RP1'): EventoLaboral => ({
  empleador: 'ACME',
  registro_patronal: rp,
  fecha,
  tipo,
  salario_base: salario,
});

describe('eventosASegmentos', () => {
  it('alta → modificación → baja produce segmentos con la trayectoria salarial', () => {
    const segs = eventosASegmentos([
      EV('2015-01-10', 'reentry', 100),
      EV('2018-03-01', 'salary_modification', 200),
      EV('2021-06-15', 'salary_modification', 300),
      EV('2023-09-30', 'discharge', 300),
    ]);
    expect(segs).toHaveLength(3);
    expect(segs[0]).toMatchObject({ fecha_inicio: '2015-01-10', fecha_fin: '2018-02-28', salario_base: 100 });
    expect(segs[1]).toMatchObject({ fecha_inicio: '2018-03-01', fecha_fin: '2021-06-14', salario_base: 200 });
    expect(segs[2]).toMatchObject({ fecha_inicio: '2021-06-15', fecha_fin: '2023-09-30', salario_base: 300 });
  });

  it('empleo sin baja queda abierto (activo)', () => {
    const segs = eventosASegmentos([EV('2020-01-01', 'reentry', 500)]);
    expect(segs).toHaveLength(1);
    expect(segs[0].fecha_fin).toBeNull();
  });

  it('reentry sobre segmento abierto implica baja el día anterior', () => {
    const segs = eventosASegmentos([
      EV('2010-01-01', 'reentry', 100),
      EV('2012-05-10', 'reentry', 150),
      EV('2013-01-01', 'discharge', 150),
    ]);
    expect(segs).toHaveLength(2);
    expect(segs[0].fecha_fin).toBe('2012-05-09');
  });

  it('patrones distintos generan segmentos paralelos', () => {
    const segs = eventosASegmentos([
      EV('2020-01-01', 'reentry', 100, 'RP1'),
      EV('2020-06-01', 'reentry', 200, 'RP2'),
      EV('2021-01-01', 'discharge', 100, 'RP1'),
    ]);
    expect(segs).toHaveLength(2);
    const rp2 = segs.find((s) => s.registro_patronal === 'RP2')!;
    expect(rp2.fecha_fin).toBeNull();
  });
});

describe('getEventosLaborales', () => {
  it('acepta wrapper json_sisec y array directo', () => {
    const raw = {
      employment_history_json: {
        data: {
          employment_events: [
            { employer: 'X', event_date: '2020-01-01T00:00:00+00:00', event_type: 'reentry', base_salary: 100, registro_patronal: 'R' },
          ],
        },
      },
    };
    expect(getEventosLaborales(raw)).toHaveLength(1);
    expect(getEventosLaborales(raw.employment_history_json.data.employment_events)).toHaveLength(1);
    expect(getEventosLaborales(null)).toHaveLength(0);
  });
});

describe('empleosInterpolados', () => {
  it('interpola geométricamente entre salario inicial y final', () => {
    const out = empleosInterpolados([
      {
        empleador: 'A', fecha_inicio: '2014-01-01', fecha_fin: '2024-01-01',
        salario_base: 800, salario_inicial: 200, registro_patronal: null, entidad_federativa: null,
      },
    ]);
    expect(out.length).toBe(10); // 10 años → 10 tramos
    expect(out[0].salario_base).toBeCloseTo(200, 1);
    // último tramo: 200 × (800/200)^(9/10)
    expect(out[9].salario_base!).toBeGreaterThan(600);
    expect(out[9].salario_base!).toBeLessThan(800);
    expect(out[9].fecha_fin).toBe('2024-01-01');
  });

  it('sin salario inicial (o igual) deja el empleo intacto', () => {
    const e = {
      empleador: 'A', fecha_inicio: '2020-01-01', fecha_fin: '2022-01-01',
      salario_base: 500, registro_patronal: null, entidad_federativa: null,
    };
    expect(empleosInterpolados([e])).toHaveLength(1);
  });
});

describe('getHistoriaPrecisa', () => {
  const wrapper = (events: unknown[]) => ({ employment_history_json: { data: { employment_events: events } } });

  it('prefiere eventos SISEC cuando traen salary_modification', () => {
    const r = getHistoriaPrecisa({
      json_sisec: wrapper([
        { employer: 'X', event_date: '2015-01-01', event_type: 'reentry', base_salary: 100, registro_patronal: 'R' },
        { employer: 'X', event_date: '2018-01-01', event_type: 'salary_modification', base_salary: 300, registro_patronal: 'R' },
      ]),
      empleos: [{ empleador: 'X', fecha_inicio: '2015-01-01', fecha_fin: null, salario_base: 300, registro_patronal: 'R', entidad_federativa: null }],
    });
    expect(r.fuente).toBe('eventos_sisec');
    expect(r.historia).toHaveLength(2);
    expect(r.historia[0].salario_base).toBe(100); // trayectoria, no salario final
  });

  it('cae a empleos interpolados si no hay eventos', () => {
    const r = getHistoriaPrecisa({
      empleos: [{
        empleador: 'X', fecha_inicio: '2014-01-01', fecha_fin: '2024-01-01',
        salario_base: 800, salario_inicial: 200, registro_patronal: 'R', entidad_federativa: null,
      }],
    });
    expect(r.fuente).toBe('empleos_interpolados');
    expect(r.historia.length).toBeGreaterThan(1);
  });

  it('eventos SIN salary_modification: interpola alta→baja (eventos_interpolados)', () => {
    const r = getHistoriaPrecisa({
      json_sisec: wrapper([
        { employer: 'X', event_date: '2010-01-01', event_type: 'reentry', base_salary: 100, registro_patronal: 'R' },
        { employer: 'X', event_date: '2020-01-01', event_type: 'discharge', base_salary: 400, registro_patronal: 'R' },
      ]),
    });
    expect(r.fuente).toBe('eventos_interpolados');
    expect(r.historia.length).toBe(10); // 10 años interpolados
    expect(r.historia[0].salario_base).toBeCloseTo(100, 1); // arranca en el salario del ALTA
    expect(r.historia[9].salario_base!).toBeLessThan(400);
    expect(r.historia[9].salario_base!).toBeGreaterThan(300);
  });

  it('empleo abierto se cierra con el salario actual de empleos (match por RP)', () => {
    const r = getHistoriaPrecisa(
      {
        json_sisec: wrapper([
          { employer: 'X', event_date: '2016-07-15', event_type: 'reentry', base_salary: 200, registro_patronal: 'R' },
        ]),
        empleos: [{
          empleador: 'X', fecha_inicio: '2016-07-15', fecha_fin: null,
          salario_base: 900, registro_patronal: 'R', entidad_federativa: null,
        }],
      },
      { hastaISO: '2026-07-15' },
    );
    expect(r.fuente).toBe('eventos_interpolados');
    expect(r.historia.length).toBe(10); // interpolado hasta hoy
    expect(r.historia[0].salario_base).toBeCloseTo(200, 1); // salario real del alta
    expect(r.historia[r.historia.length - 1].fecha_fin).toBeNull(); // sigue activo
    expect(r.historia[r.historia.length - 1].salario_base!).toBeLessThanOrEqual(900);
  });

  it('sin match de empleos, el abierto queda plano al salario del alta', () => {
    const r = getHistoriaPrecisa(
      {
        json_sisec: wrapper([
          { employer: 'X', event_date: '2016-07-15', event_type: 'reentry', base_salary: 200, registro_patronal: 'R' },
        ]),
      },
      { hastaISO: '2026-07-15' },
    );
    expect(r.fuente).toBe('eventos_interpolados');
    expect(r.historia).toHaveLength(1);
    expect(r.historia[0].salario_base).toBe(200);
  });
});

describe('empleosDeflactados (curva salarial de la base)', () => {
  const CURVA = { 2020: 0.05, 2021: 0.08, 2022: 0.12, 2023: 0.13, 2024: 0.12, 2025: 0.07 };

  it('deflacta hacia atrás desde el salario final con los factores anuales', async () => {
    const { empleosDeflactados } = await import('../eventos-laborales');
    const out = empleosDeflactados(
      [{
        empleador: 'A', fecha_inicio: '2021-03-01', fecha_fin: '2024-10-31',
        salario_base: 500, registro_patronal: null, entidad_federativa: null,
      }],
      CURVA,
    );
    expect(out).toHaveLength(4); // 2021, 2022, 2023, 2024
    const s2024 = out.find((s) => s.fecha_inicio === '2024-01-01')!;
    const s2023 = out.find((s) => s.fecha_inicio === '2023-01-01')!;
    const s2021 = out.find((s) => s.fecha_inicio === '2021-03-01')!;
    expect(s2024.salario_base).toBeCloseTo(500, 5);
    expect(s2023.salario_base).toBeCloseTo(500 / 1.12, 4);
    expect(s2021.salario_base).toBeCloseTo(500 / 1.12 / 1.13 / 1.12, 4);
    expect(s2021.salario_base!).toBeLessThan(360);
  });

  it('empleo abierto usa hastaISO como fin', async () => {
    const { empleosDeflactados } = await import('../eventos-laborales');
    const out = empleosDeflactados(
      [{
        empleador: 'A', fecha_inicio: '2021-01-01', fecha_fin: null,
        salario_base: 500, registro_patronal: null, entidad_federativa: null,
      }],
      CURVA,
      '2025-07-19',
    );
    expect(out.length).toBe(5); // 2021..2025
    expect(out[out.length - 1].fecha_fin).toBeNull(); // el último tramo sigue abierto
  });

  it('empleos cortos (<2 años) no se deflactan', async () => {
    const { empleosDeflactados } = await import('../eventos-laborales');
    const out = empleosDeflactados(
      [{
        empleador: 'A', fecha_inicio: '2023-01-01', fecha_fin: '2024-06-30',
        salario_base: 500, registro_patronal: null, entidad_federativa: null,
      }],
      CURVA,
    );
    expect(out).toHaveLength(1);
    expect(out[0].salario_base).toBe(500);
  });

  it('getHistoriaPrecisa reporta fuente empleos_deflactados', async () => {
    const { getHistoriaPrecisa } = await import('../eventos-laborales');
    const r = getHistoriaPrecisa(
      {
        empleos: [{
          empleador: 'A', fecha_inicio: '2015-01-01', fecha_fin: '2024-01-01',
          salario_base: 700, registro_patronal: null, entidad_federativa: null,
        }],
      },
      { curvaSalarial: CURVA },
    );
    expect(r.fuente).toBe('empleos_deflactados');
    expect(r.historia.length).toBeGreaterThan(5);
    // el primer tramo debe tener salario menor al final
    expect(r.historia[0].salario_base!).toBeLessThan(700);
  });
});
