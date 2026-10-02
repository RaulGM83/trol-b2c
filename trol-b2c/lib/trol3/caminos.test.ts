// 209 · Ida y vuelta del snapshot de un camino (claude/94): lo que la calculadora guarda
// al cerrar, pasado por JSON como lo guarda Postgres, hidrata y recalcula igual.
import { describe, it, expect } from 'vitest';
import { computeLey73 } from '@trol/pension-core/ley73';
import { computeLey97 } from '@trol/pension-core/ley97';
import type { Palancas } from '@trol/pension-core/types';
import { perfilMalg, saldosMalg, salario60mMalg } from '@trol/pension-core/__tests__/fixture-malg';
import { perfilMoja, saldosMoja, salario60mMoja } from '@trol/pension-core/__tests__/fixture-moja';
import { hidratarCamino, revivirFechas, pensionPresentada, etiquetaOrigen } from './caminos';

// Lo que hace Postgres con el snapshot: JSON sin fechas.
const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const pal73: Palancas = { edadRetiro: 65, pctTiempoCotizando: 1, salarioMod40: 2933.75, recuperarSemanasDescontadas: true, recuperarSemanasMod40Retro: true, salarioCotizacionRetro: 'MAXIMO', usaCreditoInfonavit: false, ahorroVoluntarioMensual: 0 };

describe('camino Ley 73', () => {
  const fechaTramite = new Date(Date.UTC(2026, 10, 15));
  const r = computeLey73({ perfil: perfilMalg, saldos: saldosMalg, salario_60m: salario60mMalg, palancas: pal73, fechaTramite });
  const barrido = [63, 64, 65].map((edad) => ({ edad, pension: computeLey73({ perfil: perfilMalg, saldos: saldosMalg, salario_60m: salario60mMalg, palancas: { ...pal73, edadRetiro: edad }, fechaTramite }).pensionMensual, costo: 1 }));
  const row = json({ id: 'a', tipo: 'calc_ley73', creado_en: '2026-10-01T10:00:00Z', inputs: { motor_version: 'pension-core@x', resumen: { etiqueta: 'Plan A', pension_mensual: 1234, edad_retiro: 65 }, semilla: { meta: { generado_en: '2026-09-29T00:00:00Z' } }, palancas: pal73, barrido, cerrado_en: '2026-10-01T10:00:00Z' }, resultado: r });

  it('hidrata y revive fechas', () => {
    const c = hidratarCamino(row)!;
    expect(c.ley).toBe('Ley73');
    expect(c.palancas).toEqual(pal73);
    expect(c.barrido).toHaveLength(3);
    expect(c.fechaTramiteIso).toBe('2026-11-15');
    expect(c.resultado.detalle.fechaTramite).toBeInstanceOf(Date);
    expect(c.semillaGeneradaEn).toBe('2026-09-29T00:00:00Z');
    expect(pensionPresentada(c)).toBe(1234);
  });
  it('partir: recalcula igual con sus palancas', () => {
    const c = hidratarCamino(row)!;
    const r2 = computeLey73({ perfil: perfilMalg, saldos: saldosMalg, salario_60m: salario60mMalg, palancas: c.palancas, fechaTramite: new Date(c.fechaTramiteIso + 'T12:00:00Z') });
    expect(r2.pensionMensual).toBeCloseTo(r.pensionMensual!, 2);
    expect(c.resultado.pensionMensual).toBeCloseTo(r.pensionMensual!, 2);
  });
  it('mod40 no es camino', () => { expect(hidratarCamino({ ...row, tipo: 'calc_mod40' })).toBeNull(); });
});

describe('camino Ley 97', () => {
  const perfil = { ...perfilMoja, ley: 'Ley97' as const };
  const datos = { rcv97: 500000, infonavit: 120000, ahorro_voluntario_mensual: 1000 };
  const incluir = { rcv97: true, infonavit: true };
  const palancas: Palancas = { ...pal73, recuperarSemanasDescontadas: false, recuperarSemanasMod40Retro: false };
  const palancasConDatos: Palancas = { ...palancas, usaCreditoInfonavit: false, rescatarInfonavit: true, rescate: { pct: 0.1 } as any, ahorroVoluntarioMensual: 1000, planCorporativoMensual: 0, otrosPlanesMensual: 0, incluir, overrides: { rcv97: 500000, infonavit: 120000 } } as any;
  const r = computeLey97({ perfil, saldos: saldosMoja, salario_60m: salario60mMoja, palancas: palancasConDatos });
  const row = json({ id: 'b', tipo: 'calc_ley97', creado_en: '2026-10-01T10:00:00Z', inputs: { motor_version: 'pension-core@x', partio_de: 'a', resumen: { etiqueta: 'Plan B', pension_mensual: 999, edad_retiro: 65, destino_infonavit: 'rescate' }, semilla: null, palancas: palancasConDatos, datos, incluir, destino_infonavit: 'rescate', barrido: [], cerrado_en: '2026-10-01T10:00:00Z' }, resultado: r });

  it('hidrata: limpia montos, conserva decisiones', () => {
    const c = hidratarCamino(row)!;
    expect(c.ley).toBe('Ley97');
    expect(c.destinoInfonavit).toBe('rescate');
    expect(c.incluir).toEqual(incluir);
    expect(c.datos).toEqual(datos);
    expect(c.barrido).toBeNull();
    expect(c.partio_de).toBe('a');
    const p = c.palancas as any;
    expect(p.overrides).toBeUndefined(); expect(p.incluir).toBeUndefined(); expect(p.rescate).toBeUndefined();
    expect(p.ahorroVoluntarioMensual).toBeUndefined(); expect(p.rescatarInfonavit).toBeUndefined();
    expect(p.usaCreditoInfonavit).toBe(false);
    expect(p.edadRetiro).toBe(65); expect(p.pctTiempoCotizando).toBe(1);
    expect(etiquetaOrigen(c.partio_de, [{ id: 'a', etiqueta: 'Plan A' }])).toBe('Plan A');
    expect(etiquetaOrigen(c.partio_de, [])).toBe('otro camino');
  });
  it('partir: reinyectando datos+incluir+destino el motor da lo mismo', () => {
    const c = hidratarCamino(row)!;
    const re: Palancas = { ...c.palancas, usaCreditoInfonavit: c.destinoInfonavit === 'vivienda', rescatarInfonavit: c.destinoInfonavit === 'rescate', rescate: { pct: 0.1 } as any, ahorroVoluntarioMensual: c.datos.ahorro_voluntario_mensual ?? 0, planCorporativoMensual: 0, otrosPlanesMensual: 0, incluir: c.incluir, overrides: { rcv97: c.datos.rcv97, infonavit: c.datos.infonavit } } as any;
    const r2 = computeLey97({ perfil, saldos: saldosMoja, salario_60m: salario60mMoja, palancas: re });
    expect(r2.pensionTotal).toBeCloseTo(r.pensionTotal!, 2);
    expect(c.resultado.pensionTotal).toBeCloseTo(r.pensionTotal!, 2);
    expect(pensionPresentada(c)).toBe(999);
  });
});

describe('revivirFechas', () => {
  it('sólo toca ISO con hora', () => {
    const v = revivirFechas({ a: '2026-10-01', b: '2026-10-01T10:00:00.000Z', c: 'hola', d: [1, '2025-01-01T00:00:00Z'], e: null });
    expect(v.a).toBe('2026-10-01'); expect(v.b).toBeInstanceOf(Date); expect(v.c).toBe('hola'); expect(v.d[1]).toBeInstanceOf(Date); expect(v.e).toBeNull();
  });
});
