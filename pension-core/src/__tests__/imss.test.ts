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
import { INPC_MENSUAL } from '../inpc';
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

  // GOLDEN v2 (24-ago-2026), revisado con el tope de 60 meses: sin cambio (34
  // meses de periodo). El retro de la Ley 73 salió de su propia serie de
  // meses completos y pasó a `lineasCapturaMod40` — la MISMA función que usa el
  // proyecto Mod 40. Antes cada pestaña calculaba lo suyo y coincidían por
  // construcción; con el prorrateo diario habrían dejado de coincidir, así que
  // ahora comparten implementación. Valores viejos: 345,876.68 / 17,924.27 /
  // 87,043.39 (total 450,844.34 → 436,033.05, −3.3 %).
  it('costo Mod40 retroactivo (D47..D49) — v2 día a día', () => {
    expect(r.retro).not.toBeNull();
    expect(r.retro!.meses).toBe(34);
    cerca(r.retro!.cuotaBase, 333002.5471, 0.001);
    cerca(r.retro!.actualizaciones, 18957.6756, 0.001);
    cerca(r.retro!.recargos, 84072.8237, 0.001);
  });

  it('costo estrategia futura (D50/D53/D54) — v2', () => {
    // La cotización futura NO se tocó: sigue clavada en el valor del Excel.
    cerca(r.costoEstrategiaFutura, 38974.282, 0.02);
    cerca(r.costoMensualPrimerMes, 13132.6385, 0.02);
    expect(r.modalidadPrimerMes).toBe(40);
    cerca(r.costoTotal, 475007.3285, 0.001);
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

  it('las semanas faltantes cuadran con las que se muestran (sin residuo float)', () => {
    // semanasRetiro convierte a meses y regresa (×7/30.4 ×30.4/7), así que 862
    // sale como 861.9999…; con Math.ceil reportaba 139 faltantes y la resta en
    // pantalla no cuadraba: "862 de 1,000, faltan 139".
    const r = computeLey97({
      ...base,
      perfil: {
        ...perfilMoja,
        fecha_nacimiento: '1971-03-15', // cumple 60 en 2031 → umbral 1,000
        semanas: { cotizadas: 862, descontadas: 0, recuperadas: 0, netas: 862 },
      },
      palancas: { ...palancasExcel73, edadRetiro: 60, pctTiempoCotizando: 0 },
    });
    expect(r.razon!.semanasRequeridas).toBe(1000);
    expect(r.razon!.semanasAlRetiro).toBe(862);
    expect(r.razon!.semanasFaltantes).toBe(138);
    // Invariante: lo mostrado siempre debe sumar.
    expect(r.razon!.semanasAlRetiro + r.razon!.semanasFaltantes).toBe(r.razon!.semanasRequeridas);
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

  // ---- GOLDENS v2 (24-ago-2026, líneas de captura día a día) --------------
  // REVISADO tras restaurar el tope de 60 meses (Raúl, 24-ago noche): NO
  // vuelven a un valor intermedio. El periodo de MOJA son 34 meses, así que el
  // tope no muerde ni antes ni ahora — el tope nunca fue lo que los movió.
  //
  // El pago al IMSS y todo lo que cuelga de él (gastos admin, comisión,
  // financiamiento, total, efectivo neto) se movieron con `lineasCapturaMod40`.
  // Dos causas, las dos deliberadas:
  //  1. El tramo ya no llega al MES DE RETIRO sino al MES DE TRÁMITE. MOJA
  //     tiene 59.58 años y `edadRetiro: 60`, así que el retiro cae ~5 meses
  //     después: pasó de 39 meses cobrados a 34. Esos 5 meses no son retro —
  //     se cotizan mes a mes en Mod 40 y hoy salen sólo como aviso.
  //  2. Los extremos van prorrateados por días y el INPC sale de la serie de
  //     `trol3.inpc_mensual`, no de la del Excel de junio.
  // Los valores viejos (cuotaBase 403,175.40 · total 544,420.72 · totalAPagar
  // 1,040,194.36) quedan aquí escritos a propósito: si algún día se decide
  // volver a cobrar hasta el retiro, este es el número al que hay que regresar.
  it('pago al IMSS (I7..I10) — v2 día a día', () => {
    expect(r.pagoImss.meses).toBe(34);
    cerca(r.pagoImss.cuotaBase, 333002.5471, 0.001);
    cerca(r.pagoImss.actualizaciones, 18957.6756, 0.001);
    cerca(r.pagoImss.recargos, 84072.8237, 0.001);
    cerca(r.pagoImss.total, 436033.0465, 0.001);
  });

  it('el pago al IMSS es exactamente la línea de captura del desglose', () => {
    cerca(r.pagoImss.total, r.lineas.total, 0);
    expect(r.lineas.detalle).toHaveLength(r.pagoImss.meses);
    // Último mes del tramo = el de la baja (2023-09), prorrateado por los días
    // posteriores a ella (baja el 16 de un mes de 30).
    const ultimo = r.lineas.detalle[r.lineas.detalle.length - 1];
    expect(ultimo.mes).toBe('2023-09');
    expect(ultimo.prorrateo).toBeCloseTo((30 - 16) / 30, 9);
  });

  it('avisa que el hueco hasta el retiro NO está cobrado', () => {
    expect(r.avisos.some((a) => a.includes('cubre hasta la fecha de trámite'))).toBe(true);
  });

  it('costos del despacho (I13..I16) — v2', () => {
    expect(r.costos.gestorias).toBe(80000);
    cerca(r.costos.gastosAdministrativos, 130809.914, 0.001);
    cerca(r.costos.comisionApertura, 19405.2888, 0.001);
  });

  it('financiamiento y total a pagar (I21/I25) — v2', () => {
    cerca(r.financiamiento.interes, 187882.0063, 0.001);
    cerca(r.totalAPagar, 854136.3026, 0.001);
  });

  it('crédito DXN y efectivo (I26..I28) — v2', () => {
    cerca(r.creditoDxn.credito, 40600 * 9, 0.01); // I26 = L8 × 9 (antes ×8)
    cerca(r.creditoDxn.retroactivo, 243600, 0.01); // I27 = L8 × 6
    cerca(r.creditoDxn.efectivoNeto, 245136.3026, 0.001);
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

  it('la Ley 73 y el proyecto Mod 40 cobran EXACTAMENTE la misma línea', () => {
    // El asesor ve las dos pestañas en la misma pantalla. Si divergen, una de
    // las dos está mintiendo. Comparten `lineasCapturaMod40` justo por esto.
    const l73 = computeLey73({
      ...base,
      palancas: { ...palancasExcel73, recuperarSemanasDescontadas: true },
    });
    expect(l73.retro).not.toBeNull();
    expect(l73.retro!.meses).toBe(r.pagoImss.meses);
    cerca(l73.retro!.cuotaBase, r.pagoImss.cuotaBase, 0);
    cerca(l73.retro!.actualizaciones, r.pagoImss.actualizaciones, 0);
    cerca(l73.retro!.recargos, r.pagoImss.recargos, 0);
    cerca(l73.retro!.total, r.pagoImss.total, 0);
  });

  it('la paridad aguanta también con el tope mordiendo', () => {
    const perfilViejo = {
      ...perfilMoja,
      fechas: { ...perfilMoja.fechas, ultima_cotizacion_valida: '2018-03-14' },
    };
    const palancas = { ...palancasExcel73, recuperarSemanasDescontadas: true };
    const proy = computeProyectoMod40({ ...base, perfil: perfilViejo, palancas })!;
    const l73 = computeLey73({ ...base, perfil: perfilViejo, palancas });
    expect(proy.pagoImss.meses).toBe(60);
    expect(l73.retro!.meses).toBe(60);
    cerca(l73.retro!.total, proy.pagoImss.total, 0);
  });

  it('el tope de 60 meses muerde cuando la baja es vieja, y avisa', () => {
    // MOJA se dio de baja hace 34 meses: el tope no lo toca. Con una baja de
    // 2018 el periodo pasa de 8 años y el art. 219 corta.
    const viejo = computeProyectoMod40({
      ...base,
      perfil: {
        ...perfilMoja,
        fechas: { ...perfilMoja.fechas, ultima_cotizacion_valida: '2018-03-14' },
      },
      palancas: { ...palancasExcel73, recuperarSemanasDescontadas: true },
      pensionEscenarioBase: 7639,
      edadEscenarioBase: 60,
    })!;
    expect(viejo.lineas.mesesDelPeriodo).toBe(100);
    expect(viejo.pagoImss.meses).toBe(60);
    expect(viejo.lineas.topado).toBe(true);
    expect(viejo.lineas.mesesFueraDelTope).toBe(40);
    expect(
      viejo.avisos.some((a) => a.includes('Solo se cubren los últimos 60 meses; 40 meses anteriores quedan fuera.')),
    ).toBe(true);
    // Se conservan los MÁS RECIENTES: el último cobrado no es el de la baja.
    expect(viejo.lineas.detalle[viejo.lineas.detalle.length - 1].mes).toBe('2021-07');
    expect(viejo.lineas.detalle[viejo.lineas.detalle.length - 1].prorrateo).toBe(1);
  });

  it('el tope NO toca a MOJA: 34 meses de periodo', () => {
    expect(r.lineas.mesesDelPeriodo).toBe(34);
    expect(r.lineas.topado).toBe(false);
    expect(r.lineas.mesesFueraDelTope).toBe(0);
  });

  it('la serie INPC entra por parámetro y mueve las actualizaciones', () => {
    const conSerie = computeProyectoMod40({
      ...base,
      palancas: { ...palancasExcel73, recuperarSemanasDescontadas: true },
      pensionEscenarioBase: 7639,
      edadEscenarioBase: 60,
      // Sólo el mes del trámite 20 % arriba: sube el numerador de todas las
      // actualizaciones y no toca la cuota base.
      serieINPC: Object.fromEntries(
        Object.entries(INPC_MENSUAL).map(([m, p]) => [
          m,
          { indice: m === '2026-06' ? p.indice * 1.2 : p.indice, proyectado: p.proyectado },
        ]),
      ),
    })!;
    expect(conSerie.pagoImss.actualizaciones).toBeGreaterThan(r.pagoImss.actualizaciones);
    cerca(conSerie.pagoImss.cuotaBase, r.pagoImss.cuotaBase, 0);
  });

  it('mover la fecha de trámite por DÍAS mueve la línea (el bug que se arregló)', () => {
    const dia = (iso: string) =>
      computeProyectoMod40({
        ...base,
        fechaTramite: new Date(`${iso}T00:00:00.000Z`),
        palancas: { ...palancasExcel73, recuperarSemanasDescontadas: true },
        pensionEscenarioBase: 7639,
        edadEscenarioBase: 60,
      })!.pagoImss.total;
    const a = dia('2026-06-08');
    const b = dia('2026-06-15');
    expect(b).toBeGreaterThan(a);
    expect(b - a).toBeGreaterThan(1000);
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

  // GOLDEN v2, revisado con el tope de 60 meses: sin cambio (26 meses de
  // periodo). Mismo cambio que arriba. Valores viejos 284,727.27 / 11,109.05 /
  // 53,958.78 (total 349,795.10 → 327,044.31, −6.5 %). La pensión no se mueve.
  it('pensión (D43) y costos retro (D47..D51) — v2 día a día', () => {
    cerca(r.pensionMensual!, 21600, 0.01);
    expect(r.retro!.meses).toBe(26);
    cerca(r.retro!.cuotaBase, 266572.7353, 0.001);
    cerca(r.retro!.actualizaciones, 11047.4639, 0.001);
    cerca(r.retro!.recargos, 49424.111, 0.001);
    // Edad = 60 hoy → sin meses futuros → costo estrategia 0
    cerca(r.costoEstrategiaFutura, 0);
    cerca(r.costoTotal, 327044.3103, 0.001);
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

  // ---- GOLDENS v2 (24-ago-2026) ------------------------------------------
  // REVISADO con el tope de 60 meses restaurado: sin cambio. El periodo son 26
  // meses; el tope no lo toca.
  //
  // CAFE tiene 60.0 años exactos, así que el retiro cae en el mismo mes del
  // trámite: aquí NO se pierden meses (27 → 26, sólo por el corte del mes) y
  // la baja del 31-may-2024 deja prorrateo 0 en su mes. Lo que mueve el número
  // es el prorrateo de los extremos y la serie INPC nueva: total de
  // 349,795.10 → 327,044.31 (−6.5 %).
  it('pago al IMSS (I7..I10) — v2 día a día', () => {
    expect(r.pagoImss.meses).toBe(26);
    cerca(r.pagoImss.cuotaBase, 266572.7353, 0.001);
    cerca(r.pagoImss.actualizaciones, 11047.4639, 0.001);
    cerca(r.pagoImss.recargos, 49424.111, 0.001);
    cerca(r.pagoImss.total, 327044.3103, 0.001);
  });

  it('baja el último día del mes: ese mes no se cobra', () => {
    // ultima_cotizacion_valida = 2024-05-31 → no queda ningún día después.
    const ultimo = r.lineas.detalle[r.lineas.detalle.length - 1];
    expect(ultimo.mes).toBe('2024-05');
    expect(ultimo.prorrateo).toBe(0);
    expect(ultimo.total).toBe(0);
  });

  it('costos: gastos admin escalonado 35/30/25 + comisión (I14/I15) — v2', () => {
    // Pago IMSS 327,044 < 375,000 → sigue en el 35% (regla de negocio; el
    // Excel FAVH trae 30% plano por error)
    cerca(r.costos.gastosAdministrativos, 114465.5086, 0.001);
    cerca(r.costos.comisionApertura, 15645.2946, 0.001);
  });

  it('financiamiento, total y DXN (I21/I25/I26..I28) — v2', () => {
    cerca(r.financiamiento.interes, 151477.742, 0.001);
    cerca(r.totalAPagar, 688638.9024, 0.001);
    cerca(r.creditoDxn.credito, 21600 * 9, 0.01); // I26 = L8 × 9
    cerca(r.creditoDxn.retroactivo, 129600, 0.01); // I27 = L8 × 6
    cerca(r.creditoDxn.efectivoNeto, 364638.9024, 0.001);
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
