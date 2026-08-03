// Validación del motor IMSS contra el Excel CALCULADORA_MOJA661108HMNRNL05.xlsx
// (valores calculados con TODAY() = 2026-06-08). Tolerancias:
//  - cálculos trazados 1:1 → 0.5%
//  - series mensuales con quirks de borde en el Excel → 2%
import { describe, expect, it } from 'vitest';
import { computeLey73 } from '../ley73';
import { computeLey97 } from '../ley97';
import { computeProyectoMod40 } from '../mod40-proyecto';
import { computeTransicion } from '../transicion';
import type { EntradaCalculo, Palancas } from '../types';
import { HOY_EXCEL, perfilMoja, saldosMoja, salario60mMoja } from './fixture-moja';

const cerca = (actual: number, esperado: number, pct = 0.005) => {
  expect(Math.abs(actual - esperado)).toBeLessThanOrEqual(Math.abs(esperado) * pct + 0.01);
};

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

describe('Ley 73 (hoja Calculadora 73)', () => {
  const r = computeLey73(base);

  it('perfil y semanas', () => {
    cerca(r.detalle.edadActual, 59.58110883);
    cerca(r.detalle.semanasRetiro, 1908.01122);
    cerca(r.semanasRecuperablesRetro, 142.2857143);
    expect(r.aplicaRetroHoy).toBe(true);
  });

  it('salarios ponderados y factor (K8/K12/K13)', () => {
    cerca(r.detalle.salarioCot250, 1789.72193);
    cerca(r.detalle.salarioMin250, 228.0982601);
    cerca(r.detalle.factorSalarial, 7.846276115);
  });

  it('cuantías y pensión (D38..D43)', () => {
    cerca(r.detalle.cuantiaBasica, 94263.75918);
    cerca(r.detalle.incrementos, 479657.5131);
    cerca(r.detalle.asignaciones, 86088.19084);
    expect(r.detalle.ajusteEdad).toBe(0.75);
    cerca(r.detalle.pensionMinima, 10600);
    cerca(r.detalle.pensionMaxima, 88305.875);
    expect(r.pensionMensual).toBe(41300);
  });

  it('costo Mod40 retroactivo (D47..D49)', () => {
    expect(r.retro).not.toBeNull();
    cerca(r.retro!.cuotaBase, 345876.6812, 0.02);
    cerca(r.retro!.actualizaciones, 17924.26648, 0.02);
    cerca(r.retro!.recargos, 87043.38976, 0.02);
  });

  it('costo estrategia futura (D50/D53/D54)', () => {
    cerca(r.costoEstrategiaFutura, 38974.282, 0.02);
    cerca(r.costoMensualPrimerMes, 13132.6385, 0.02);
    expect(r.modalidadPrimerMes).toBe(40);
    cerca(r.costoTotal, 489818.6194, 0.02);
  });

  it('pensión negativa con pocas semanas', () => {
    const r2 = computeLey73({
      ...base,
      perfil: {
        ...perfilMoja,
        semanas: { cotizadas: 300, descontadas: 0, recuperadas: 0, netas: 300 },
      },
      palancas: {
        ...palancasExcel73,
        pctTiempoCotizando: 0,
        recuperarSemanasDescontadas: false,
        recuperarSemanasMod40Retro: false,
      },
    });
    expect(r2.negativa).toBe(true);
    expect(r2.pensionMensual).toBeNull();
  });
});

// La Ley 73 pide DOS cosas: 500 semanas y conservación de derechos vigente
// (Art. 150). El motor solo miraba las semanas.
describe('Ley 73 — conservación de derechos (Art. 150/151)', () => {
  // Perfil con semanas de sobra (1583 netas) pero sin conservación vigente.
  const sinConservacion = (gap_meses: number) => ({
    ...perfilMoja,
    conserva_derechos: false,
    gap_meses,
  });
  const sinCotizarMas = { ...palancasExcel73, pctTiempoCotizando: 0 as const };

  it('pierde conservación y no cotiza más → negativa_sin_reactivacion', () => {
    const r = computeLey73({ ...base, perfil: sinConservacion(120), palancas: sinCotizarMas });

    expect(r.status).toBe('negativa_sin_reactivacion');
    expect(r.negativa).toBe(true);
    expect(r.pensionMensual).toBeNull();
    // Le sobran semanas: el bloqueo es SOLO la conservación.
    expect(r.razon!.faltanSemanas).toBe(false);
    expect(r.razon!.pierdeConservacion).toBe(true);
    // Y sabemos cuánto le tocaría si reactiva.
    expect(r.pensionSiReactiva).not.toBeNull();
    expect(r.pensionSiReactiva!).toBeGreaterThan(0);
  });

  it('Art. 151: las semanas para reactivar dependen del gap', () => {
    // Fracc. I — interrupción ≤ 3 años: reconocimiento inmediato al reingresar.
    expect(
      computeLey73({ ...base, perfil: sinConservacion(30), palancas: sinCotizarMas }).razon!
        .semanasParaReactivar,
    ).toBe(0);
    // Fracc. II — > 3 y ≤ 6 años: 26 semanas.
    expect(
      computeLey73({ ...base, perfil: sinConservacion(60), palancas: sinCotizarMas }).razon!
        .semanasParaReactivar,
    ).toBe(26);
    // Fracc. III — > 6 años: 52 semanas.
    expect(
      computeLey73({ ...base, perfil: sinConservacion(120), palancas: sinCotizarMas }).razon!
        .semanasParaReactivar,
    ).toBe(52);
  });

  it('cotizar hasta el retiro reactiva y devuelve la Ley 73', () => {
    // pct=1 con retiro a los 65 cubre de sobra las 52 semanas del Art. 151.
    const r = computeLey73({
      ...base,
      perfil: sinConservacion(120),
      palancas: { ...palancasExcel73, pctTiempoCotizando: 1, edadRetiro: 65 },
    });
    expect(r.status).toBe('viable');
    expect(r.pensionMensual).not.toBeNull();
    expect(r.pensionSiReactiva).toBeNull(); // ya no aplica: no hay obstáculo
  });

  it('faltan semanas → negativa, no negativa_sin_reactivacion', () => {
    // Reactivar no resuelve un caso al que le faltan semanas.
    const r = computeLey73({
      ...base,
      perfil: { ...perfilMoja, semanas: { cotizadas: 300, descontadas: 0, recuperadas: 0, netas: 300 } },
      palancas: { ...sinCotizarMas, recuperarSemanasDescontadas: false, recuperarSemanasMod40Retro: false },
    });
    expect(r.status).toBe('negativa');
    expect(r.razon!.faltanSemanas).toBe(true);
    expect(r.razon!.pierdeConservacion).toBe(false);
    expect(r.pensionSiReactiva).toBeNull();
  });
});

describe('Transición: Ley 73 caída → Ley 97', () => {
  const sinCotizarMas = { ...palancasExcel73, pctTiempoCotizando: 0 as const };

  it('sin conservación pero con semanas Ley 97 → se pensiona por Ley 97', () => {
    const r = computeTransicion({
      ...base,
      perfil: { ...perfilMoja, conserva_derechos: false, gap_meses: 120 },
      palancas: sinCotizarMas,
    });
    // 1583 semanas > 875 del umbral 2026.
    expect(r.regimenEfectivo).toBe('Ley97');
    expect(r.status).toBe('negativa_sin_reactivacion'); // la Ley 73 sigue recuperable
    expect(r.pensionMensual).not.toBeNull();
    expect(r.ley97Alterna!.status).toBe('viable');
    expect(r.ley73.status).toBe('negativa_sin_reactivacion');
  });

  it('sin conservación y sin semanas Ley 97 → no se pensiona', () => {
    const r = computeTransicion({
      ...base,
      perfil: {
        ...perfilMoja,
        conserva_derechos: false,
        gap_meses: 120,
        semanas: { cotizadas: 600, descontadas: 0, recuperadas: 0, netas: 600 },
      },
      palancas: { ...sinCotizarMas, recuperarSemanasDescontadas: false, recuperarSemanasMod40Retro: false },
    });
    // 600 alcanza las 500 de Ley 73 pero no las 875 de Ley 97 en 2026.
    expect(r.ley73.razon!.faltanSemanas).toBe(false);
    expect(r.ley97Alterna!.status).toBe('negativa');
    expect(r.regimenEfectivo).toBe('ninguno');
    expect(r.pensionMensual).toBeNull();
  });

  it('con conservación vigente no se evalúa la ruta alterna', () => {
    const r = computeTransicion({ ...base, palancas: sinCotizarMas });
    expect(r.regimenEfectivo).toBe('Ley73');
    expect(r.ley97Alterna).toBeNull();
    expect(r.status).toBe('viable');
  });
});

describe('Ley 97 (hoja Calculadora 97)', () => {
  const r = computeLey97({
    ...base,
    palancas: { ...palancasExcel73, salarioMod40: 2829, ahorroVoluntarioMensual: 1000 },
  });

  it('semanas y PMG (K10/K11/K16/K17)', () => {
    cerca(r.detalle.semanasRetiro, 1765.725506);
    expect(r.detalle.semanasMinimasPMG).toBe(875);
    cerca(r.detalle.pmg, 9548.25556);
    cerca(r.detalle.urv, 13.0321);
  });

  it('saldos proyectados (K19/K20)', () => {
    cerca(r.detalle.saldoAforeProyectado, 504070.1267, 0.02);
    cerca(r.detalle.saldoInfonavitProyectado, 266141.1147, 0.02);
  });

  it('pensiones (K22/K23)', () => {
    cerca(r.pensionAfore!, 9548.25556);
    cerca(r.pensionAforeInfonavit!, 9548.25556);
  });

  it('escenario viable: sin razón ni salida de negativa', () => {
    expect(r.status).toBe('viable');
    expect(r.razon).toBeNull();
    expect(r.salida).toBeNull();
  });

  it('negativa: estatus explícito, con razón y salida (no un monto vacío)', () => {
    const r2 = computeLey97({
      ...base,
      perfil: {
        ...perfilMoja,
        semanas: { cotizadas: 300, descontadas: 0, recuperadas: 0, netas: 300 },
      },
      palancas: {
        ...palancasExcel73,
        salarioMod40: 2829,
        pctTiempoCotizando: 0,
        recuperarSemanasDescontadas: false,
      },
    });

    expect(r2.status).toBe('negativa');
    expect(r2.negativa).toBe(true);
    expect(r2.pensionAfore).toBeNull();

    // La razón se compara contra el umbral de SU año de retiro (tabla por año),
    // nunca contra un 1000 fijo.
    expect(r2.razon).not.toBeNull();
    expect(r2.razon!.semanasRequeridas).toBe(r2.detalle.semanasMinimasPMG);
    expect(r2.razon!.semanasActuales).toBe(300);
    expect(r2.razon!.semanasAlRetiro).toBe(300); // pct=0 → sin cotización futura
    expect(r2.razon!.semanasFaltantes).toBe(r2.detalle.semanasMinimasPMG - 300);
    expect(r2.razon!.anioRetiro).toBe(r2.detalle.fechaRetiro.getUTCFullYear());

    // La salida es dinero real: lo que se lleva si acepta la negativa.
    expect(r2.salida).not.toBeNull();
    expect(r2.salida!.retiroUnaExhibicion).toBe(r2.detalle.saldoAforeProyectado);
    expect(r2.salida!.devolucionVivienda).toBe(r2.detalle.saldoInfonavitProyectado);
    expect(r2.salida!.total).toBeGreaterThan(0);
    expect(r2.salida!.semanasFaltantes).toBe(r2.razon!.semanasFaltantes);
  });

  it('el umbral de semanas sale de la tabla por año de retiro, no de un 1000 fijo', () => {
    // Mismo perfil, retiros distintos → umbrales distintos (750→1000 por la
    // reforma 2020). Si estuviera hardcodeado, ambos darían el mismo número.
    const joven = computeLey97({
      ...base,
      perfil: { ...perfilMoja, fecha_nacimiento: '1980-06-08' },
      palancas: { ...palancasExcel73, edadRetiro: 65 },
    });
    expect(joven.detalle.semanasMinimasPMG).toBe(1000); // retiro 2045 → tope
    expect(r.detalle.semanasMinimasPMG).toBe(875); // retiro 2026
  });

  it('crédito Infonavit anula el saldo Infonavit', () => {
    const r2 = computeLey97({
      ...base,
      palancas: {
        ...palancasExcel73,
        salarioMod40: 2829,
        ahorroVoluntarioMensual: 0,
        usaCreditoInfonavit: true,
      },
    });
    expect(r2.detalle.saldoInfonavitProyectado).toBe(0);
  });
});

describe('Proyecto Mod40 Retroactivo (hoja Mod40 Retroactivo)', () => {
  const r = computeProyectoMod40({
    ...base,
    palancas: { ...palancasExcel73, recuperarSemanasDescontadas: true },
    pensionEscenarioBase: 7639,
    edadEscenarioBase: 60,
  })!;

  it('aplica y pensión con proyecto (L8)', () => {
    expect(r).not.toBeNull();
    cerca(r.conProyecto.pensionMensual, 40600, 0.01);
  });

  it('pago al IMSS (I7..I10)', () => {
    cerca(r.pagoImss.cuotaBase, 403175.3954, 0.03);
    cerca(r.pagoImss.actualizaciones, 23598.14867, 0.06);
    cerca(r.pagoImss.recargos, 117647.1721, 0.04);
    cerca(r.pagoImss.total, 544420.7162, 0.03);
  });

  it('costos del despacho (I13..I16)', () => {
    expect(r.costos.gestorias).toBe(80000);
    cerca(r.costos.gastosAdministrativos, 163326.2148, 0.03);
    cerca(r.costos.comisionApertura, 23632.40793, 0.03);
  });

  it('financiamiento y total a pagar (I21/I25)', () => {
    cerca(r.financiamiento.interes, 228808.9736, 0.03);
    cerca(r.totalAPagar, 1040194.36, 0.03);
  });

  it('crédito DXN y efectivo (I26..I28)', () => {
    cerca(r.creditoDxn.credito, 40600 * 9, 0.01); // I26 = L8 × 9 (antes ×8)
    cerca(r.creditoDxn.retroactivo, 243600, 0.01); // I27 = L8 × 6
    // efectivoNeto del Excel viejo (471,794) − 1 mes de pensión por el ×9
    cerca(r.creditoDxn.efectivoNeto, 431194.36, 0.05);
  });

  it('comparativo sin/con proyecto (F8/F9/F10/L9/M8)', () => {
    expect(r.sinProyecto.pensionMensual).toBe(7600);
    cerca(r.sinProyecto.valorPension, 1500000, 0.07);
    cerca(r.conProyecto.valorPension, 7900000, 0.02);
    cerca(r.multiplicadorPension, 5.342105263, 0.01);
  });

  it('sin pensionEscenarioBase calcula la base internamente (≈ Escenario Base 7639)', () => {
    const r2 = computeProyectoMod40({
      ...base,
      palancas: { ...palancasExcel73, recuperarSemanasDescontadas: true },
    })!;
    expect(r2).not.toBeNull();
    // La base interna (pct=0, edad 60) debe parecerse al Escenario Base de n8n (7639)
    cerca(r2.sinProyecto.pensionMensual, 7600, 0.05);
    cerca(r2.conProyecto.pensionMensual, 40600, 0.01);
  });

  it('umasProyecto reduce el costo del proyecto', () => {
    const r10 = computeProyectoMod40({
      ...base,
      umasProyecto: 10,
      palancas: { ...palancasExcel73, recuperarSemanasDescontadas: true },
    })!;
    expect(r10.pagoImss.total).toBeLessThanOrEqual(r.pagoImss.total);
  });
});

// ============================================================================
// Validación con el Excel CORREGIDO (CAFE660610, hoja Mod40 jun-2026,
// TODAY() = 2026-06-10, edad exacta 60.0)
// ============================================================================
import { HOY_EXCEL_CAFE, perfilCafe, saldosCafe, salario60mCafe } from './fixture-cafe';

const baseCafe: EntradaCalculo = {
  perfil: perfilCafe,
  saldos: saldosCafe,
  salario_60m: salario60mCafe,
  palancas: palancasExcel73,
  hoy: HOY_EXCEL_CAFE,
};

describe('Ley 73 — cliente CAFE (Excel corregido)', () => {
  const r = computeLey73(baseCafe);

  it('semanas y salarios (D36/K8/K12/K13)', () => {
    cerca(r.detalle.semanasRetiro, 1425.571429);
    cerca(r.detalle.salarioCot250, 1298.048849, 0.01);
    cerca(r.detalle.salarioMin250, 214.9840517, 0.01);
    cerca(r.detalle.factorSalarial, 6.037884385, 0.01);
  });

  it('pensión (D43) y costos retro (D47..D51)', () => {
    cerca(r.pensionMensual!, 21600, 0.01);
    cerca(r.retro!.cuotaBase, 284727.2678, 0.03);
    cerca(r.retro!.actualizaciones, 11109.05092, 0.06);
    cerca(r.retro!.recargos, 53958.77972, 0.06);
    // Edad = 60 hoy → sin meses futuros → costo estrategia 0
    cerca(r.costoEstrategiaFutura, 0);
    cerca(r.costoTotal, 349795.0985, 0.03);
  });
});

describe('Proyecto Mod40 — cliente CAFE (Excel corregido)', () => {
  const r = computeProyectoMod40({
    ...baseCafe,
    palancas: { ...palancasExcel73, recuperarSemanasDescontadas: true },
  })!;

  it('pensiones sin/con proyecto (F8/L8)', () => {
    expect(r).not.toBeNull();
    cerca(r.sinProyecto.pensionMensual, 8800, 0.03);
    cerca(r.conProyecto.pensionMensual, 21600, 0.01);
    cerca(r.multiplicadorPension, 2.4545, 0.04);
  });

  it('pago al IMSS (I7..I10)', () => {
    cerca(r.pagoImss.cuotaBase, 284727.2678, 0.03);
    cerca(r.pagoImss.actualizaciones, 11109.05092, 0.08);
    cerca(r.pagoImss.recargos, 53958.77972, 0.06);
    cerca(r.pagoImss.total, 349795.0985, 0.03);
  });

  it('costos: gastos admin escalonado 35/30/25 + comisión (I14/I15)', () => {
    // Pago IMSS 349,795 < 375,000 → 35% (regla de negocio; el Excel FAVH trae
    // 30% plano por error)
    cerca(r.costos.gastosAdministrativos, 122428.28, 0.03);
    cerca(r.costos.comisionApertura, 16566.7, 0.03);
  });

  it('financiamiento, total y DXN (I21/I25/I26..I28)', () => {
    cerca(r.financiamiento.interes, 160398.8, 0.03);
    cerca(r.totalAPagar, 729194.93, 0.03);
    cerca(r.creditoDxn.credito, 21600 * 9, 0.01); // I26 = L8 × 9
    cerca(r.creditoDxn.retroactivo, 129600, 0.01); // I27 = L8 × 6
    cerca(r.creditoDxn.efectivoNeto, 405194.93, 0.05);
  });

  it('efectivo sin proyecto usa SAR92 + 30% RCV (regla de negocio, no el 9% del Excel)', () => {
    // F10 = sar92 24,834 + rcv×0.30 43,774.5 + infonavit 94,737 ≈ 163,346 → 200,000
    cerca(r.sinProyecto.valorTotal - r.sinProyecto.valorPension, 200000, 0.01);
    cerca(r.sinProyecto.valorPension, 1700000, 0.03);
    cerca(r.conProyecto.valorPension, 4200000, 0.02);
    // Identidad del flujo: resultado = disponible − neto a pagar
    cerca(
      r.efectivo.resultado,
      r.efectivo.totalDisponible - r.efectivo.efectivoNetoAPagar,
      0.001,
    );
  });

  it('override de SAR92 mueve el efectivo al retiro', () => {
    const r2 = computeProyectoMod40({
      ...baseCafe,
      palancas: {
        ...palancasExcel73,
        recuperarSemanasDescontadas: true,
        overrides: { sar92: 124834 }, // +100,000
      },
    })!;
    cerca(
      r2.sinProyecto.valorTotal - r.sinProyecto.valorTotal,
      100000,
      0.01,
    );
  });

  it('semanas extra suman al cálculo (C29 → R19)', () => {
    const r2 = computeProyectoMod40({
      ...baseCafe,
      semanasExtra: 100,
      palancas: { ...palancasExcel73, recuperarSemanasDescontadas: true },
    })!;
    expect(r.conProyecto.pensionMensual).toBeLessThanOrEqual(r2.conProyecto.pensionMensual);
  });

  it('semanas YA recuperadas no se vuelven a sumar (caso FAVH: 129 desc, 129 rec)', () => {
    const perfilFavh = {
      ...perfilCafe,
      semanas: { cotizadas: 2040, descontadas: 129, recuperadas: 129, netas: 2040 },
    };
    const con = computeProyectoMod40({
      ...baseCafe,
      perfil: perfilFavh,
      palancas: { ...palancasExcel73, recuperarSemanasDescontadas: true },
    })!;
    const sin = computeProyectoMod40({
      ...baseCafe,
      perfil: perfilFavh,
      palancas: { ...palancasExcel73, recuperarSemanasDescontadas: false },
    })!;
    // Recuperable = 129 − 129 = 0 → la palanca no cambia la pensión
    expect(con.conProyecto.pensionMensual).toBe(sin.conProyecto.pensionMensual);
  });
});

// ============================================================================
// Caso borde MALG: 63.5 años. La hoja Mod40 del Excel se rompe (>60 → semanas
// negativas y #VALUE!); el motor debe producir resultados válidos.
// ============================================================================
import { HOY_EXCEL_MALG, perfilMalg, saldosMalg, salario60mMalg } from './fixture-malg';

describe('Proyecto Mod40 — cliente MALG (caso borde edad > 60)', () => {
  const r = computeProyectoMod40({
    perfil: perfilMalg,
    saldos: saldosMalg,
    salario_60m: salario60mMalg,
    hoy: HOY_EXCEL_MALG,
    palancas: { ...palancasExcel73, edadRetiro: 60, recuperarSemanasDescontadas: true },
  })!;

  it('no produce valores degenerados (el Excel sí)', () => {
    expect(r).not.toBeNull();
    // Meses retro positivos (el Excel da R5 = −13)
    expect(0).toBeLessThanOrEqual(r.pagoImss.meses);
    expect(1).toBeLessThanOrEqual(r.pagoImss.total);
    // Pensión con proyecto válida y >= sin proyecto
    expect(r.sinProyecto.pensionMensual).toBeLessThanOrEqual(r.conProyecto.pensionMensual);
    // Efectivo y totales finitos (el Excel da #VALUE!)
    expect(Number.isFinite(r.conProyecto.valorTotal)).toBe(true);
    expect(Number.isFinite(r.creditoDxn.efectivoNeto)).toBe(true);
  });

  it('Ley 73 estándar también corre con edad > 60', () => {
    const r73 = computeLey73({
      perfil: perfilMalg,
      saldos: saldosMalg,
      salario_60m: salario60mMalg,
      hoy: HOY_EXCEL_MALG,
      palancas: { ...palancasExcel73, edadRetiro: 63.5 },
    });
    expect(r73.negativa).toBe(false);
    expect(Number.isFinite(r73.pensionMensual!)).toBe(true);
    expect(0).toBeLessThanOrEqual(r73.costoTotal);
  });
});
