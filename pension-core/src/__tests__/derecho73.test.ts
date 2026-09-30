// ============================================================================
// Regla de la fecha del derecho (motor v5.7, claude/90). Casos de nómina IMSS
// (Credifintech, sep-2026): la calculadora debe dar lo mismo que el motor que
// llena el Escenario Base (Sergio 39,511 · Beatriz 88,306, al 28-sep-2026).
// ============================================================================
import { describe, expect, it } from 'vitest';
import { computeLey73 } from '../ley73';
import { computeProyectoMod40 } from '../mod40-proyecto';
import { factorIncrementosFebrero, fechaDelDerecho } from '../derecho73';
import type { EntradaCalculo, Palancas, PerfilSemilla } from '../types';
import { HOY_EXCEL_CAFE, perfilCafe, saldosCafe, salario60mCafe } from './fixture-cafe';

const HOY = new Date(Date.UTC(2026, 8, 28));
const d = (s: string) => new Date(s + 'T00:00:00Z');
const edadHoy = (fnac: string) => (HOY.getTime() - d(fnac).getTime()) / 86400000 / 365.25;
const palancas = (edadRetiro: number, extra: Partial<Palancas> = {}): Palancas => ({
  edadRetiro,
  pctTiempoCotizando: 0,
  salarioMod40: 0,
  recuperarSemanasDescontadas: false,
  recuperarSemanasMod40Retro: false,
  salarioCotizacionRetro: 'MINIMO',
  usaCreditoInfonavit: false,
  ahorroVoluntarioMensual: 0,
  ...extra,
});

const sergio = { ...{"ley": "Ley73", "sexo": "H", "fechas": {"primera_cotizacion": "1980-03-03", "ultima_cotizacion_mod40": null, "limite_inscripcion_mod40": "2026-08-31", "ultima_cotizacion_valida": "2021-09-01", "fin_conservacion_derechos": "2027-03-17"}, "semanas": {"netas": 1157, "cotizadas": 1157, "descontadas": 0, "recuperadas": 0}, "gap_meses": 60.9, "aplica_mod40": false, "status_empleo": "desempleado", "fecha_nacimiento": "1956-10-26", "conserva_derechos": true, "salario_promedio_250": 1733.2, "salario_diario_registrado": 762.6}, nombre: 'Sergio', nss: '', curp: 'DUNS561026HDFRXR05' } as unknown as PerfilSemilla;
const beatriz = { ...{"ley": "Ley73", "sexo": "M", "fechas": {"primera_cotizacion": "1982-07-03", "ultima_cotizacion_mod40": null, "limite_inscripcion_mod40": "2026-07-30", "ultima_cotizacion_valida": "2021-07-31", "fin_conservacion_derechos": "2031-05-03"}, "semanas": {"netas": 2039, "cotizadas": 2039, "descontadas": 0, "recuperadas": 0}, "gap_meses": 62, "aplica_mod40": false, "status_empleo": "desempleado", "fecha_nacimiento": "1956-10-31", "conserva_derechos": true, "salario_promedio_250": 2060.24, "salario_diario_registrado": 2240.5}, nombre: 'Beatriz', nss: '', curp: 'SEPB561031MDFRRT01' } as unknown as PerfilSemilla;
const salSergio = [{"mes": 1, "salario_diario": 834.93, "salario_minimo": 141.7}, {"mes": 2, "salario_diario": 834.93, "salario_minimo": 141.7}, {"mes": 3, "salario_diario": 1965.2, "salario_minimo": 141.7}, {"mes": 4, "salario_diario": 2045.93, "salario_minimo": 141.7}, {"mes": 5, "salario_diario": 2221.04, "salario_minimo": 141.7}, {"mes": 6, "salario_diario": 2240.5, "salario_minimo": 141.7}, {"mes": 7, "salario_diario": 1317.38, "salario_minimo": 141.7}, {"mes": 8, "salario_diario": 1441.13, "salario_minimo": 141.7}, {"mes": 9, "salario_diario": 2172, "salario_minimo": 125.07}, {"mes": 10, "salario_diario": 2172, "salario_minimo": 123.22}, {"mes": 11, "salario_diario": 2172, "salario_minimo": 123.22}, {"mes": 12, "salario_diario": 2172, "salario_minimo": 123.22}, {"mes": 13, "salario_diario": 2172, "salario_minimo": 123.22}, {"mes": 14, "salario_diario": 2172, "salario_minimo": 123.22}, {"mes": 15, "salario_diario": 1336.13, "salario_minimo": 123.22}, {"mes": 16, "salario_diario": 1081.73, "salario_minimo": 123.22}, {"mes": 17, "salario_diario": 1766.25, "salario_minimo": 123.22}, {"mes": 18, "salario_diario": 2015.17, "salario_minimo": 123.22}, {"mes": 19, "salario_diario": 1925.51, "salario_minimo": 123.22}, {"mes": 20, "salario_diario": 1887.08, "salario_minimo": 123.22}, {"mes": 21, "salario_diario": 1872.32, "salario_minimo": 108.84}, {"mes": 22, "salario_diario": 1866, "salario_minimo": 102.68}, {"mes": 23, "salario_diario": 1561.37, "salario_minimo": 102.68}, {"mes": 24, "salario_diario": 1409.06, "salario_minimo": 102.68}, {"mes": 25, "salario_diario": 1745.37, "salario_minimo": 102.68}, {"mes": 26, "salario_diario": 1940.08, "salario_minimo": 102.68}, {"mes": 27, "salario_diario": 2037.64, "salario_minimo": 102.68}, {"mes": 28, "salario_diario": 2112.25, "salario_minimo": 102.68}, {"mes": 29, "salario_diario": 1750.75, "salario_minimo": 102.68}, {"mes": 30, "salario_diario": 1434.44, "salario_minimo": 102.68}, {"mes": 31, "salario_diario": 1488.43, "salario_minimo": 102.68}, {"mes": 32, "salario_diario": 1542.42, "salario_minimo": 102.68}, {"mes": 33, "salario_diario": 1579.44, "salario_minimo": 95.04}, {"mes": 34, "salario_diario": 1611.83, "salario_minimo": 88.36}, {"mes": 35, "salario_diario": 1376.85, "salario_minimo": 88.36}, {"mes": 36, "salario_diario": 1141.86, "salario_minimo": 88.36}, {"mes": 37, "salario_diario": 1339.2, "salario_minimo": 88.36}, {"mes": 38, "salario_diario": 1564.73, "salario_minimo": 88.36}, {"mes": 39, "salario_diario": 1744.84, "salario_minimo": 88.36}, {"mes": 40, "salario_diario": 2015, "salario_minimo": 88.36}, {"mes": 41, "salario_diario": 2015, "salario_minimo": 88.36}, {"mes": 42, "salario_diario": 2015, "salario_minimo": 88.36}, {"mes": 43, "salario_diario": 1869.49, "salario_minimo": 88.36}, {"mes": 44, "salario_diario": 1578.46, "salario_minimo": 88.36}, {"mes": 45, "salario_diario": 1679.51, "salario_minimo": 85.31}, {"mes": 46, "salario_diario": 1852.21, "salario_minimo": 80.04}, {"mes": 47, "salario_diario": 1785.14, "salario_minimo": 80.04}, {"mes": 48, "salario_diario": 1658.29, "salario_minimo": 80.04}, {"mes": 49, "salario_diario": 1726.98, "salario_minimo": 80.04}, {"mes": 50, "salario_diario": 1887.25, "salario_minimo": 80.04}, {"mes": 51, "salario_diario": 1887.25, "salario_minimo": 80.04}, {"mes": 52, "salario_diario": 1887.25, "salario_minimo": 80.04}, {"mes": 53, "salario_diario": 1827.55, "salario_minimo": 80.04}, {"mes": 54, "salario_diario": 1588.74, "salario_minimo": 80.04}, {"mes": 55, "salario_diario": 1551.34, "salario_minimo": 80.04}, {"mes": 56, "salario_diario": 1364.32, "salario_minimo": 80.04}, {"mes": 57, "salario_diario": 1451.38, "salario_minimo": 78.64}, {"mes": 58, "salario_diario": 1799.62, "salario_minimo": 73.04}, {"mes": 59, "salario_diario": 1772.67, "salario_minimo": 73.04}, {"mes": 60, "salario_diario": 1637.9, "salario_minimo": 73.04}];
const salBeatriz = [{"mes": 1, "salario_diario": 2240.5, "salario_minimo": 141.7}, {"mes": 2, "salario_diario": 2240.5, "salario_minimo": 141.7}, {"mes": 3, "salario_diario": 2240.5, "salario_minimo": 141.7}, {"mes": 4, "salario_diario": 2240.5, "salario_minimo": 141.7}, {"mes": 5, "salario_diario": 2240.5, "salario_minimo": 141.7}, {"mes": 6, "salario_diario": 2240.5, "salario_minimo": 141.7}, {"mes": 7, "salario_diario": 2240.5, "salario_minimo": 141.7}, {"mes": 8, "salario_diario": 2174.28, "salario_minimo": 123.84}, {"mes": 9, "salario_diario": 2172, "salario_minimo": 123.22}, {"mes": 10, "salario_diario": 2172, "salario_minimo": 123.22}, {"mes": 11, "salario_diario": 2172, "salario_minimo": 123.22}, {"mes": 12, "salario_diario": 2172, "salario_minimo": 123.22}, {"mes": 13, "salario_diario": 2172, "salario_minimo": 123.22}, {"mes": 14, "salario_diario": 2172, "salario_minimo": 123.22}, {"mes": 15, "salario_diario": 2172, "salario_minimo": 123.22}, {"mes": 16, "salario_diario": 2172, "salario_minimo": 123.22}, {"mes": 17, "salario_diario": 2172, "salario_minimo": 123.22}, {"mes": 18, "salario_diario": 2172, "salario_minimo": 123.22}, {"mes": 19, "salario_diario": 2172, "salario_minimo": 123.22}, {"mes": 20, "salario_diario": 2126.19, "salario_minimo": 107.47}, {"mes": 21, "salario_diario": 2112.25, "salario_minimo": 102.68}, {"mes": 22, "salario_diario": 2112.25, "salario_minimo": 102.68}, {"mes": 23, "salario_diario": 2112.25, "salario_minimo": 102.68}, {"mes": 24, "salario_diario": 2112.25, "salario_minimo": 102.68}, {"mes": 25, "salario_diario": 2112.25, "salario_minimo": 102.68}, {"mes": 26, "salario_diario": 2112.25, "salario_minimo": 102.68}, {"mes": 27, "salario_diario": 2112.25, "salario_minimo": 102.68}, {"mes": 28, "salario_diario": 2112.25, "salario_minimo": 102.68}, {"mes": 29, "salario_diario": 2112.25, "salario_minimo": 102.68}, {"mes": 30, "salario_diario": 2112.25, "salario_minimo": 102.68}, {"mes": 31, "salario_diario": 2112.25, "salario_minimo": 102.68}, {"mes": 32, "salario_diario": 2053.9, "salario_minimo": 94.09}, {"mes": 33, "salario_diario": 2015, "salario_minimo": 88.36}, {"mes": 34, "salario_diario": 2015, "salario_minimo": 88.36}, {"mes": 35, "salario_diario": 2015, "salario_minimo": 88.36}, {"mes": 36, "salario_diario": 2015, "salario_minimo": 88.36}, {"mes": 37, "salario_diario": 2015, "salario_minimo": 88.36}, {"mes": 38, "salario_diario": 2015, "salario_minimo": 88.36}, {"mes": 39, "salario_diario": 2015, "salario_minimo": 88.36}, {"mes": 40, "salario_diario": 2015, "salario_minimo": 88.36}, {"mes": 41, "salario_diario": 2015, "salario_minimo": 88.36}, {"mes": 42, "salario_diario": 2015, "salario_minimo": 88.36}, {"mes": 43, "salario_diario": 2015, "salario_minimo": 88.36}, {"mes": 44, "salario_diario": 1959.64, "salario_minimo": 84.75}, {"mes": 45, "salario_diario": 1887.25, "salario_minimo": 80.04}, {"mes": 46, "salario_diario": 1887.25, "salario_minimo": 80.04}, {"mes": 47, "salario_diario": 1887.25, "salario_minimo": 80.04}, {"mes": 48, "salario_diario": 1887.25, "salario_minimo": 80.04}, {"mes": 49, "salario_diario": 1887.25, "salario_minimo": 80.04}, {"mes": 50, "salario_diario": 1887.25, "salario_minimo": 80.04}, {"mes": 51, "salario_diario": 1887.25, "salario_minimo": 80.04}, {"mes": 52, "salario_diario": 1887.25, "salario_minimo": 80.04}, {"mes": 53, "salario_diario": 1887.25, "salario_minimo": 80.04}, {"mes": 54, "salario_diario": 1887.25, "salario_minimo": 80.04}, {"mes": 55, "salario_diario": 1887.25, "salario_minimo": 80.04}, {"mes": 56, "salario_diario": 1870.92, "salario_minimo": 78.17}, {"mes": 57, "salario_diario": 1826, "salario_minimo": 73.04}, {"mes": 58, "salario_diario": 1826, "salario_minimo": 73.04}, {"mes": 59, "salario_diario": 1826, "salario_minimo": 73.04}, {"mes": 60, "salario_diario": 1826, "salario_minimo": 73.04}];
const entrada = (perfil: PerfilSemilla, sal: typeof salSergio, p: Palancas): EntradaCalculo =>
  ({ perfil, saldos: {}, salario_60m: sal, palancas: p, hoy: HOY }) as unknown as EntradaCalculo;

describe('factorIncrementosFebrero', () => {
  it('cuenta los febreros después de D y hasta hoy', () => {
    // sep-2021 → sep-2026: feb-2022..feb-2026 (inflación 2021..2025)
    const f = factorIncrementosFebrero(d('2021-09-01'), HOY);
    expect(f).toBeCloseTo(1.0736 * 1.0782 * 1.0466 * 1.0421 * 1.0369, 6);
  });
  it('D en febrero no se actualiza ese mismo febrero', () => {
    expect(factorIncrementosFebrero(d('2025-02-01'), d('2025-12-31'))).toBe(1);
  });
  it('D = la más tardía entre última cotización y los 60', () => {
    expect(fechaDelDerecho(d('1956-10-26'), d('2021-09-01')).toISOString().slice(0, 10)).toBe('2021-09-01');
    expect(fechaDelDerecho(d('1966-06-10'), d('2024-05-31')).toISOString().slice(0, 10)).toBe('2026-06-10');
  });
});

describe('Ley 73 con el derecho ya ganado = motor v5.7', () => {
  it('Sergio Durán: 39,511 en el motor → 39,500', () => {
    const r = computeLey73(entrada(sergio, salSergio, palancas(edadHoy('1956-10-26'))));
    expect(r.derecho).not.toBeNull();
    expect(r.derecho!.fecha.toISOString().slice(0, 10)).toBe('2021-09-01');
    expect(r.derecho!.ajusteEdad).toBe(1); // 64.85 → regla del .5 → 65
    expect(r.pensionMensual).toBe(39500);
    // 12 meses: oct-2025..ene-2026 sin el incremento de feb-2026 y feb..sep con él
    expect(r.retroactivoAlPensionarse!.meses).toBe(12);
    expect(r.retroactivoAlPensionarse!.monto).toBeGreaterThan(39500 / 1.0369 * 12);
    expect(r.retroactivoAlPensionarse!.monto).toBeLessThan(39500 * 12);
  });
  it('Beatriz Serrano: tope de 25 UMA (88,306 en el motor)', () => {
    const r = computeLey73(entrada(beatriz, salBeatriz, palancas(edadHoy('1956-10-31'))));
    expect(r.pensionMensual).toBe(88300);
  });
  it('pensionarse más tarde sin cotizar no cambia el monto', () => {
    const a = computeLey73(entrada(sergio, salSergio, palancas(edadHoy('1956-10-26'))));
    const b = computeLey73(entrada(sergio, salSergio, palancas(72)));
    expect(b.pensionMensual).toBe(a.pensionMensual);
  });
  it('no aplica si vuelve a cotizar, si está empleado o sin la regla', () => {
    expect(computeLey73(entrada(sergio, salSergio, palancas(68, { pctTiempoCotizando: 1, salarioMod40: 2933 }))).derecho).toBeNull();
    expect(computeLey73(entrada({ ...sergio, status_empleo: 'empleado' }, salSergio, palancas(70))).derecho).toBeNull();
    const sin = computeLey73({ ...entrada(sergio, salSergio, palancas(edadHoy('1956-10-26'))), reglaDerecho: false });
    expect(sin.derecho).toBeNull();
    expect(sin.pensionMensual).toBe(30200); // v5.6.1: 30,182
  });
  it('derecho futuro (aún no cumple 60): cálculo de siempre', () => {
    const joven = { ...sergio, fecha_nacimiento: '1968-01-01' };
    expect(computeLey73(entrada(joven, salSergio, palancas(60))).derecho).toBeNull();
  });
});

describe('Proyecto Mod 40 — base "sin proyecto" con la regla del derecho', () => {
  it('CAFE: D = 60 años (jun-2026) → mínima del año de D', () => {
    const r = computeProyectoMod40({
      perfil: perfilCafe, saldos: saldosCafe, salario_60m: salario60mCafe, hoy: HOY_EXCEL_CAFE,
      palancas: { ...palancas(60), recuperarSemanasDescontadas: true },
    } as EntradaCalculo)!;
    expect(r.sinProyecto.pensionMensual).toBe(10600);
  });
});
