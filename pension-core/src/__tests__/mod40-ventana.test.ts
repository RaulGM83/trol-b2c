// ============================================================================
// Fecha de trámite libre + ventana de reingreso a Mod 40 (art. 219 / 220 LSS).
// Spec: claude/20-fecha-tramite-mod40-spec.md (24-ago-2026).
//
// Lo que se protege aquí:
//  1. Los goldens NO se mueven: sin `fechaTramite`, el resultado es el de siempre.
//  2. Mover la fecha mueve la ventana, los meses de pago y la edad.
//  3. La detección de modalidad es la misma que la de Supabase (nombre O RP).
// ============================================================================

import { describe, expect, it } from 'vitest';
import { computeProyectoMod40 } from '../mod40-proyecto';
import { modalidadDeRegistro, ventanaMod40, type RegistroHistorialMod40 } from '../mod40-ventana';
import type { EntradaCalculo, Palancas } from '../types';
import { HOY_EXCEL, perfilMoja, saldosMoja, salario60mMoja } from './fixture-moja';

const palancasExcel73: Palancas = {
  edadRetiro: 60,
  pctTiempoCotizando: 1,
  salarioMod40: 2933.75,
  recuperarSemanasDescontadas: true,
  recuperarSemanasMod40Retro: true,
  salarioCotizacionRetro: 'MAXIMO',
  usaCreditoInfonavit: false,
  ahorroVoluntarioMensual: 0,
};

const base: EntradaCalculo = {
  perfil: perfilMoja,
  saldos: saldosMoja,
  salario_60m: salario60mMoja,
  palancas: palancasExcel73,
  hoy: HOY_EXCEL,
};

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// ============================================================================
// 1. Goldens intactos
// ============================================================================

describe('fechaTramite — compatibilidad con los goldens', () => {
  const sinFecha = computeProyectoMod40({ ...base })!;
  const conFechaIgualAHoy = computeProyectoMod40({ ...base, fechaTramite: HOY_EXCEL })!;

  it('omitir fechaTramite deja el cálculo idéntico al de "hoy"', () => {
    // Bit a bit: todo el bloque numérico, no solo la pensión.
    const num = (r: typeof sinFecha) => ({
      sinProyecto: r.sinProyecto,
      conProyecto: r.conProyecto,
      pagoImss: r.pagoImss,
      costos: r.costos,
      financiamiento: r.financiamiento,
      totalAPagar: r.totalAPagar,
      creditoDxn: r.creditoDxn,
      efectivo: r.efectivo,
      multiplicadorPension: r.multiplicadorPension,
      multiplicadorValor: r.multiplicadorValor,
    });
    expect(num(sinFecha)).toEqual(num(conFechaIgualAHoy));
  });

  it('fechaTramite = hoy es equivalente a pasar `hoy`', () => {
    expect(sinFecha.fechaTramite.getTime()).toBe(HOY_EXCEL.getTime());
  });
});

// ============================================================================
// 2. Mover la fecha mueve el proyecto
// ============================================================================

describe('fechaTramite — mover la fecha', () => {
  // Modo "a día de hoy" de la Mesa Viraal (edadRetiro = 0): la edad de
  // proyecto la marca la fecha de trámite, no una meta fija. Con una edad de
  // retiro FIJA (60, 62…) la fecha de retiro es la misma se tramite cuando se
  // tramite, y por diseño el retro tampoco se mueve.
  const aHoy = { ...palancasExcel73, edadRetiro: 0 };
  const enFecha = (iso: string | undefined) =>
    computeProyectoMod40({
      ...base,
      palancas: aHoy,
      ...(iso ? { fechaTramite: d(iso) } : {}),
    })!;

  const hoy = enFecha(undefined); // 2026-06-08, aún con 59.6 años
  const enUnAnio = enFecha('2027-06-08');
  const enDosAnios = enFecha('2028-06-08');

  it('adelantar la fecha alarga el periodo retroactivo', () => {
    expect(enUnAnio.pagoImss.meses).toBeGreaterThan(hoy.pagoImss.meses);
    expect(enUnAnio.pagoImss.total).toBeGreaterThan(hoy.pagoImss.total);
    expect(enDosAnios.pagoImss.meses).toBeGreaterThan(enUnAnio.pagoImss.meses);
  });

  it('el año de la fecha de trámite es el que rige (UMA, tope)', () => {
    expect(hoy.fechaTramite.getUTCFullYear()).toBe(2026);
    expect(enUnAnio.fechaTramite.getUTCFullYear()).toBe(2027);
    expect(enDosAnios.fechaTramite.getUTCFullYear()).toBe(2028);
  });

  it('el escenario base se mide a la misma fecha (no compara contra hoy)', () => {
    // Sin fijar pensionEscenarioBase, la base se recalcula con computeLey73 a
    // la fecha de trámite: más edad ⇒ menos años de anualidad ⇒ menor valor
    // vitalicio de la MISMA pensión. (El monto mensual está redondeado a
    // centenas y no siempre se mueve; el valor de la pensión sí.)
    expect(enFecha('2030-06-08').sinProyecto.valorPension).toBeLessThan(
      enUnAnio.sinProyecto.valorPension,
    );
  });

  it('avisa (no bloquea) cuando a la fecha aún no cumple 60', () => {
    // MOJA nace 1966-11-08: al 2026-06-08 tiene 59.6.
    expect(hoy.conProyecto.pensionMensual).toBeGreaterThan(0);
    expect(hoy.avisos.some((a) => a.includes('la pensión Ley 73 arranca a los 60'))).toBe(true);
  });

  it('ya cumplidos los 60 el aviso desaparece', () => {
    expect(enUnAnio.avisos.some((a) => a.includes('arranca a los 60'))).toBe(false);
  });
});

// ============================================================================
// 3. Detección de modalidad — espejo de trol3.derivar_ultima_modalidad
// ============================================================================

describe('modalidadDeRegistro', () => {
  it('clasifica Mod 40 por nombre de patrón', () => {
    expect(
      modalidadDeRegistro({ empleador: 'CONTINUACION VOLUNTARIA EN EL REGIMEN OBLIGATORIO' }),
    ).toBe('mod40');
  });

  it('clasifica Mod 40 por registro patronal aunque el patrón se llame distinto', () => {
    // Caso real: el nombre no delata nada, el RP sí.
    expect(
      modalidadDeRegistro({ empleador: 'SEGUROS ESPECIALES', registro_patronal: 'Y5419999940' }),
    ).toBe('mod40');
  });

  it('no confunde un RP que solo CONTIENE 9999940', () => {
    expect(
      modalidadDeRegistro({ empleador: 'ACME SA', registro_patronal: 'Y99999401' }),
    ).toBe('obligatorio');
  });

  it('distingue independientes y otras voluntarias', () => {
    expect(modalidadDeRegistro({ empleador: 'TRABAJADORAS INDEPENDIENTES' })).toBe('independiente');
    expect(modalidadDeRegistro({ empleador: 'INCORPORACION VOLUNTARIA AL REGIMEN' })).toBe('otra_voluntaria');
  });

  it('cualquier otro patrón es régimen obligatorio', () => {
    expect(modalidadDeRegistro({ empleador: 'CEMENTOS DEL NORTE SA DE CV' })).toBe('obligatorio');
    expect(modalidadDeRegistro({})).toBe('obligatorio');
  });
});

// ============================================================================
// 4. ventanaMod40
// ============================================================================

const mod40Baja = (fin: string, sbc = 2000): RegistroHistorialMod40 => ({
  empleador: 'CONTINUACION VOLUNTARIA EN EL REGIMEN OBLIGATORIO',
  registro_patronal: 'Y5419999940',
  fecha_inicio: '2023-01-01',
  fecha_fin: fin,
  salario_base: sbc,
});

const obligatorioBaja = (fin: string): RegistroHistorialMod40 => ({
  empleador: 'CEMENTOS DEL NORTE SA DE CV',
  registro_patronal: 'B1234567890',
  fecha_inicio: '2010-03-01',
  fecha_fin: fin,
  salario_base: 480,
});

describe('ventanaMod40 — última baja en Mod 40 (art. 220, 12 meses)', () => {
  it('dentro de los 12 meses: vigente, con la fecha límite siempre visible', () => {
    const v = ventanaMod40([mod40Baja('2026-03-31')], d('2026-06-08'));
    expect(v.ultimaModalidad).toBe('mod40');
    expect(v.plazo).toBe('12m');
    expect(v.fechaLimite?.toISOString().slice(0, 10)).toBe('2027-03-31');
    expect(v.estado).toBe('vigente');
    // El copy enseña el límite aunque la fecha elegida sea válida.
    expect(v.avisos.some((a) => a.includes('vence el'))).toBe(true);
  });

  it('fuera de los 12 meses: vencida y con la salida (52 semanas)', () => {
    const v = ventanaMod40([mod40Baja('2024-01-31')], d('2026-06-08'));
    expect(v.estado).toBe('vencida');
    expect(v.diasRestantes).toBeLessThan(0);
    expect(v.avisos.some((a) => a.includes('52 semanas'))).toBe(true);
  });

  it('a menos de 90 días del límite: por_vencer', () => {
    const v = ventanaMod40([mod40Baja('2025-08-31')], d('2026-06-08'));
    expect(v.estado).toBe('por_vencer');
    expect(v.avisos.some((a) => a.includes('Quedan'))).toBe(true);
  });

  it('mover la fecha de trámite cruza la ventana', () => {
    const h = [mod40Baja('2026-03-31')];
    expect(ventanaMod40(h, d('2027-03-30')).estado).not.toBe('vencida');
    expect(ventanaMod40(h, d('2027-04-01')).estado).toBe('vencida');
  });

  it('avisa si el SBC de reingreso es menor al último cotizado (art. 65 RLSS-ACRF)', () => {
    const v = ventanaMod40([mod40Baja('2026-03-31', 2500)], d('2026-06-08'), {
      sbcReingreso: 1800,
    });
    expect(v.avisos.some((a) => a.includes('no puede ser menor'))).toBe(true);
  });

  it('el SBC también se lee cuando viene como STRING (así llega en la semilla)', () => {
    // Caso real de producción: calculo_pensional.historial[].salario_base
    // llega como "2828.5", no como 2828.5. Con la comparación estricta el
    // aviso del art. 65 nunca disparaba.
    const v = ventanaMod40(
      [{ ...mod40Baja('2025-12-31'), salario_base: '2828.5' }],
      d('2026-08-24'),
      { sbcReingreso: 1500 },
    );
    expect(v.ultimoSbc).toBe(2828.5);
    expect(v.avisos.some((a) => a.includes('no puede ser menor'))).toBe(true);
  });

  it('no avisa cuando el SBC de reingreso es mayor o igual', () => {
    const v = ventanaMod40([mod40Baja('2026-03-31', 2500)], d('2026-06-08'), {
      sbcReingreso: 2933.75,
    });
    expect(v.avisos.some((a) => a.includes('no puede ser menor'))).toBe(false);
  });
});

describe('ventanaMod40 — Mod 40 vigente (sin baja)', () => {
  const vigente: RegistroHistorialMod40 = {
    ...mod40Baja('2026-03-31'),
    fecha_fin: null,
  };

  it('sin fecha de fin no hay retro, solo prospectiva', () => {
    const v = ventanaMod40([vigente], d('2026-06-08'));
    expect(v.sinBaja).toBe(true);
    expect(v.retroAplica).toBe(false);
    expect(v.plazo).toBeNull();
    expect(v.fechaLimite).toBeNull();
    expect(v.estado).toBe('vigente');
    expect(v.avisos.some((a) => a.includes('sigue vigente'))).toBe(true);
  });

  it('el registro abierto gana sobre uno cerrado más reciente', () => {
    const v = ventanaMod40([obligatorioBaja('2026-05-31'), vigente], d('2026-06-08'));
    expect(v.ultimaModalidad).toBe('mod40');
    expect(v.sinBaja).toBe(true);
  });
});

describe('ventanaMod40 — última baja en régimen obligatorio (art. 219, 5 años)', () => {
  it('el plazo es de 5 años, no de 12 meses', () => {
    const v = ventanaMod40([obligatorioBaja('2024-05-31')], d('2026-06-08'));
    expect(v.ultimaModalidad).toBe('obligatorio');
    expect(v.plazo).toBe('5a');
    expect(v.fechaLimite?.toISOString().slice(0, 10)).toBe('2029-05-31');
    expect(v.estado).toBe('vigente');
  });
});

describe('ventanaMod40 — bordes', () => {
  it('sin historial avisa que no se pudo confirmar la modalidad', () => {
    const v = ventanaMod40([], d('2026-06-08'));
    expect(v.ultimaModalidad).toBeNull();
    expect(v.avisos.some((a) => a.includes('No podemos confirmar la modalidad'))).toBe(true);
  });

  it('sin historial pero con límite del expediente, lo respeta', () => {
    const v = ventanaMod40(null, d('2026-06-08'), { limiteExpediente: '2026-01-15' });
    expect(v.estado).toBe('vencida');
    expect(v.limiteDelExpediente).toBe(true);
  });

  it('el límite del expediente manda sobre el cálculo local (una sola verdad)', () => {
    const v = ventanaMod40([mod40Baja('2026-03-31')], d('2026-06-08'), {
      limiteExpediente: '2026-12-31',
    });
    expect(v.fechaLimite?.toISOString().slice(0, 10)).toBe('2026-12-31');
    expect(v.limiteDelExpediente).toBe(true);
  });

  it('baja el 31 recorta al último día del mes, como Postgres', () => {
    // 2025-08-31 + 12 meses = 2026-08-31; 2024-02-29 + 12 = 2025-02-28.
    expect(
      ventanaMod40([mod40Baja('2024-02-29')], d('2024-06-01')).fechaLimite?.toISOString().slice(0, 10),
    ).toBe('2025-02-28');
  });
});

// ============================================================================
// 5. Integración: computeProyectoMod40 emite la ventana
// ============================================================================

describe('computeProyectoMod40 — ventana y avisos', () => {
  it('sin historial devuelve ventana sin clasificar, pero calcula igual', () => {
    const r = computeProyectoMod40({ ...base })!;
    expect(r.ventana.ultimaModalidad).toBeNull();
    expect(r.conProyecto.pensionMensual).toBeGreaterThan(0);
  });

  it('una ventana vencida avisa pero NO anula los números', () => {
    const r = computeProyectoMod40({
      ...base,
      historial: [mod40Baja('2024-01-31')],
    })!;
    expect(r.ventana.estado).toBe('vencida');
    expect(r.conProyecto.pensionMensual).toBeGreaterThan(0);
    expect(r.avisos.some((a) => a.includes('ya no puedes inscribirte'))).toBe(true);
  });

  it('pasa el salario del proyecto como SBC de reingreso', () => {
    const r = computeProyectoMod40({
      ...base,
      umasProyecto: 5, // salario bajo a propósito
      historial: [mod40Baja('2026-03-31', 2500)],
    })!;
    expect(r.avisos.some((a) => a.includes('no puede ser menor'))).toBe(true);
  });
});
