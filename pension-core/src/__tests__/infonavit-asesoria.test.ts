// Validación del motor de asesoría Infonavit.
//
// Dos capas:
//  1. Los casos golden del Excel v4_2 (celda a celda). Si uno falla, el puerto se rompió.
//  2. Un test por cada error del Producto_Infonavit_Contexto.md §4 que ya costó dinero
//     en una propuesta real. No son hipótesis: todos ocurrieron al menos una vez.
import { describe, expect, it } from 'vitest';
import {
  calcular, tasaInfonavit, SUPUESTOS_DEFAULT,
  type ClienteInfonavit, type InmuebleInfonavit, type TitularInfonavit,
} from '../infonavit-asesoria';
import { CASOS_GOLDEN } from './fixture-infonavit-goldens';
import { conservaValorSSV } from '../ley97';
import type { ResultadoLey97 } from '../types';

/** Tolerancias del kit: 0.05 absoluto en montos, 1e-5 en tasas. */
const montoCerca = (actual: number, esperado: number) =>
  expect(Math.abs(actual - esperado)).toBeLessThanOrEqual(0.05);
const tasaCerca = (actual: number, esperado: number) =>
  expect(Math.abs(actual - esperado)).toBeLessThanOrEqual(1e-5);

describe('casos golden contra Trol_Asesoria_Infonavit_v4_2.xlsx', () => {
  for (const caso of CASOS_GOLDEN) {
    it(caso.nombre, () => {
      const r = calcular(caso.entrada.cliente, caso.entrada.inmueble, caso.entrada.supuestos, caso.entrada.palancas);
      const e = caso.esperado;
      montoCerca(r.operacion.credito, e.credito);
      montoCerca(r.operacion.pmt, e.pmt);
      montoCerca(r.operacion.remanente, e.remanente);
      montoCerca(r.operacion.not_cliente, e.notariales_cliente);
      montoCerca(r.contrafactual_corte, e.contrafactual_corte);
      e.ventaja_venta.forEach((v, i) => montoCerca(r.tabla[i].ventaja_venta, v));
      e.ventaja_corte.forEach((v, i) => montoCerca(r.tabla[i].ventaja_corte, v));
      e.efectivo.forEach((v, i) => montoCerca(r.tabla[i].efectivo, v));
      e.plusvalia_equilibrio.forEach((v, i) => tasaCerca(r.tabla[i].plusvalia_equilibrio, v));
      expect(r.veredicto.mejor_horizonte).toBe(e.mejor_horizonte);
      expect(r.veredicto.fuente_dominante).toBe(e.fuente_dominante);
    });
  }
});

// ---------------------------------------------------------------------------
// Fixtures de trabajo
// ---------------------------------------------------------------------------
const titular = (over: Partial<TitularInfonavit> = {}): TitularInfonavit => ({
  regimen: 73, edad: 50, salario_imss: 30000, ssv: 600000,
  meses_cotizando: 60, ingreso_real: 0, deducciones_usadas: 0, conserva_valor: 1, ...over,
});
const inmueble = (over: Partial<InmuebleInfonavit> = {}): InmuebleInfonavit => ({
  avaluo: 1_500_000, escrituracion: 1_500_000, costo_aliado: 1_400_000, renta: 9_000,
  plusvalia: 0.06, notariales_credito: 30_000, notariales_adicionales: 50_000,
  comision_desarrollador: 0.05, aliado_cubre_notariales: true, ...over,
});
const cliente = (...t: TitularInfonavit[]): ClienteInfonavit => ({ titulares: t });

describe('errores que ya costaron en una propuesta real', () => {
  // §4.1 — el peor de todos: en el caso Enrique subestimaba $149,211 a 5 años
  // E INVERTÍA la recomendación de la ventana de salida.
  it('el flujo de renta usa la retención real: al liquidarse el crédito la renta queda íntegra', () => {
    // Sin plusvalía, sin comisión, sin ISR y sin remanente, el efectivo de vender
    // sólo se mueve por la renta acumulada. Si el motor restara la PMT nominal
    // después de liquidar el crédito, este delta saldría más chico.
    const sup = { comision_venta: 0, horizontes: [36, 60] };
    const pal = { plusvalia: 0 };
    const r = calcular(
      cliente(titular({ ssv: 1_000_000, salario_imss: 80_000, meses_cotizando: 96 })),
      inmueble({ escrituracion: 1_100_000, notariales_credito: 20_000 }),
      sup, pal,
    );
    expect(r.mes_liquida_credito).not.toBeNull();
    expect(r.mes_liquida_credito!).toBeLessThan(36); // ya liquidado en ambos horizontes
    const delta = r.tabla[1].efectivo - r.tabla[0].efectivo;
    montoCerca(delta, r.operacion.renta_neta * 24);
    expect(r.operacion.renta_neta).toBeGreaterThan(0);
  });

  // §4.3 — un SSV al 0% infla artificialmente la ventaja del esquema.
  it('el rendimiento del SSV nunca se asume en cero', () => {
    expect(SUPUESTOS_DEFAULT.r_ssv).toBeGreaterThan(0);
    const args = [cliente(titular()), inmueble()] as const;
    const conRendimiento = calcular(args[0], args[1]);
    const enCero = calcular(args[0], args[1], { r_ssv: 0 });
    // Con el SSV en cero el contrafactual se congela y la ventaja se ve mejor de lo que es.
    expect(enCero.contrafactual_corte).toBeLessThan(conRendimiento.contrafactual_corte);
    expect(enCero.tabla[0].ventaja_venta).toBeGreaterThan(conRendimiento.tabla[0].ventaja_venta);
  });

  // §4.4 — plusvalía capturada pero no conectada al cálculo de venta.
  it('la plusvalía de la palanca sí llega al efectivo de la venta', () => {
    const base = calcular(cliente(titular()), inmueble(), null, { plusvalia: 0.03 });
    const alta = calcular(cliente(titular()), inmueble(), null, { plusvalia: 0.09 });
    expect(alta.tabla[3].efectivo).toBeGreaterThan(base.tabla[3].efectivo);
    // y la plusvalía de equilibrio NO depende de la palanca: es la que deja la ventaja en cero
    tasaCerca(alta.tabla[3].plusvalia_equilibrio, base.tabla[3].plusvalia_equilibrio);
  });

  // §4.7 — saldo remanente ignorado cuando el SSV supera el precio del inmueble.
  it('el saldo remanente se queda en Infonavit y sigue rindiendo', () => {
    const r = calcular(
      cliente(titular({ ssv: 2_000_000 })),
      inmueble({ escrituracion: 1_500_000, notariales_credito: 30_000 }),
    );
    expect(r.operacion.credito).toBe(0);
    montoCerca(r.operacion.remanente, 2_000_000 - 1_500_000 - 30_000);
    // el remanente capitaliza al rendimiento del SSV dentro del efectivo de la venta
    const sinRemanente = calcular(
      cliente(titular({ ssv: 1_530_000 })),
      inmueble({ escrituracion: 1_500_000, notariales_credito: 30_000 }),
    );
    expect(r.tabla[3].efectivo - sinRemanente.tabla[3].efectivo)
      .toBeGreaterThan(r.operacion.remanente); // capitalizado, no plano
  });

  // §4.5 — datos cruzados entre titulares (la edad de uno en la columna del otro).
  it('en crédito conyugal el plazo lo manda el titular de MAYOR edad', () => {
    const r = calcular(
      cliente(titular({ edad: 45 }), titular({ edad: 58 })),
      inmueble({ escrituracion: 3_000_000 }),
    );
    expect(r.cliente_derivado.plazo).toBe(70 - 58);
  });

  // §4.2 y §4.6 — celdas desconectadas y rangos que no se extienden: la fila de
  // verificación interna debe dar cero SIEMPRE. Si algo se descuelga, `calcular` lanza.
  it('la verificación interna da cero en toda la batería de escenarios', () => {
    const edades = [35, 50, 64];
    const ssvs = [100_000, 900_000, 2_500_000];
    const plusvalias = [0, 0.06, 0.12];
    const regimenes = [73, 97];
    let corridas = 0;
    for (const edad of edades)
      for (const ssv of ssvs)
        for (const plusvalia of plusvalias)
          for (const regimen of regimenes)
            for (const cubre of [true, false])
              for (const cotiza of [0, 60]) {
                expect(() => calcular(
                  cliente(titular({ edad, ssv, regimen, meses_cotizando: cotiza, conserva_valor: regimen === 97 ? 0.6 : 1 })),
                  inmueble({ aliado_cubre_notariales: cubre }),
                  null, { plusvalia },
                )).not.toThrow();
                corridas++;
              }
    expect(corridas).toBe(216);
  });
});

describe('reglas de negocio', () => {
  it('plazo = MIN(30, 70 − edad)', () => {
    const plazo = (edad: number) =>
      calcular(cliente(titular({ edad })), inmueble()).cliente_derivado.plazo;
    expect(plazo(30)).toBe(30); // topado en 30 aunque 70−30 = 40
    expect(plazo(50)).toBe(20);
    expect(plazo(64)).toBe(6);  // el caso Enrique
  });

  it('Infonavit suma el monto máximo de cada titular en crédito conyugal', () => {
    const individual = calcular(cliente(titular()), inmueble()).cliente_derivado.monto_max;
    const conyugal = calcular(cliente(titular(), titular()), inmueble()).cliente_derivado.monto_max;
    expect(individual).toBe(SUPUESTOS_DEFAULT.monto_max_credito);
    expect(conyugal).toBe(SUPUESTOS_DEFAULT.monto_max_credito * 2);
  });

  it('la aportación patronal del 5% se detiene cuando deja de cotizar', () => {
    const cotizando = calcular(cliente(titular({ meses_cotizando: 60 })), inmueble());
    const pensionado = calcular(cliente(titular({ meses_cotizando: 0 })), inmueble());
    montoCerca(cotizando.cliente_derivado.aport_mensual, 30_000 * 0.05);
    expect(pensionado.cliente_derivado.aport_mensual).toBe(0);
  });

  it('la tasa Infonavit sale de la tabla oficial por nivel salarial', () => {
    expect(tasaInfonavit(0)).toBe(0);
    expect(tasaInfonavit(5_000)).toBe(0.0369);
    expect(tasaInfonavit(9_272.19)).toBe(0.0388);
    expect(tasaInfonavit(100_000)).toBe(0.1045); // topa en el último tramo
  });

  it('las señales son informativas y nunca bloquean el cálculo', () => {
    // Crédito enorme, retención sobre el 30% y edad de término arriba de 70.
    const r = calcular(
      cliente(titular({ edad: 64, ssv: 50_000, salario_imss: 12_000 })),
      inmueble({ escrituracion: 4_000_000, aliado_cubre_notariales: false }),
    );
    expect(r.senales).toContain('credito_excede_monto_maximo');
    expect(r.senales).toContain('retencion_arriba_30pct');
    expect(r.senales.some((s) => s.startsWith('edad_al_termino:'))).toBe(true);
    expect(r.tabla).toHaveLength(4); // calculó igual
  });

  it('Ley 97 bajo PMG: lo que el sistema consumiría se rescata en el bloque IV', () => {
    const sobrePmg = calcular(cliente(titular({ regimen: 97, conserva_valor: 1 })), inmueble());
    const bajoPmg = calcular(cliente(titular({ regimen: 97, conserva_valor: 0.4 })), inmueble());
    expect(sobrePmg.tabla[0].bloques.IV_rescate).toBe(0);
    expect(bajoPmg.tabla[0].bloques.IV_rescate).toBeGreaterThan(0);
    // rescatar saldo que se iba a consumir mejora la ventaja del esquema
    expect(bajoPmg.tabla[0].ventaja_venta).toBeGreaterThan(sobrePmg.tabla[0].ventaja_venta);
  });
});

// ---------------------------------------------------------------------------
// conservaValorSSV: el puente entre el diagnóstico Ley 97 y el bloque IV.
// ---------------------------------------------------------------------------
describe('conservaValorSSV — Ley 97 y la PMG', () => {
  const base = (afore: number, inf: number, pmg: number, urv = 200): ResultadoLey97 => ({
    ley: 'Ley97', pensionAfore: null, pensionAforeInfonavit: null, pensionTotal: null,
    status: 'ok' as ResultadoLey97['status'], negativa: false, razon: null, salida: null,
    detalle: {
      edadActual: 60, fechaRetiro: new Date(0), semanasRetiro: 1250, semanasMinimasPMG: 1250,
      saldoAforeProyectado: afore, saldoInfonavitProyectado: inf, saldoAhorroVoluntario: 0,
      urv, pmg, aportacionesFuturas: 0,
    },
  });

  it('muy por encima de la PMG conserva el saldo completo', () => {
    // 3,000,000/200 × 0.81/12 = 1,012.5 mensuales, muy arriba de una PMG de 100
    expect(conservaValorSSV(base(3_000_000, 1_000_000, 100))).toBe(1);
  });

  it('muy por debajo de la PMG el saldo se consume entero', () => {
    // ni con Infonavit alcanza la PMG: el sistema lo consume pagando lo mismo
    expect(conservaValorSSV(base(50_000, 50_000, 5_000))).toBe(0);
  });

  it('a caballo de la PMG conserva sólo la parte que la levanta', () => {
    // sin Infonavit queda en PMG; con Infonavit la supera → conserva una fracción
    const cv = conservaValorSSV(base(1_000_000, 1_000_000, 500));
    expect(cv).toBeGreaterThan(0);
    expect(cv).toBeLessThan(1);
  });

  it('sin saldo Infonavit (crédito ya ejercido) no hay nada que rescatar', () => {
    expect(conservaValorSSV(base(1_000_000, 0, 5_000))).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Aportación patronal por titular. El Excel v4_2 colapsaba las dos ventanas de
// cotización en una sola (max de ambas) y aplicaba la aportación CONJUNTA todo
// ese tramo. El contexto §3 dice que el 5% se aplica "sólo mientras el titular
// sigue cotizando", en singular: cada quien tiene su propia ventana.
// ---------------------------------------------------------------------------
describe('la aportación de cada titular respeta su propia ventana', () => {
  const conVentanas = (m1: number, m2: number) => calcular(
    cliente(
      titular({ edad: 50, salario_imss: 40_000, ssv: 500_000, meses_cotizando: m1 }),
      titular({ edad: 52, salario_imss: 40_000, ssv: 500_000, meses_cotizando: m2 }),
    ),
    inmueble({ escrituracion: 2_000_000 }),
  );

  it('un titular que deja de cotizar antes no sigue aportando', () => {
    // Con el modelo colapsado ambas corridas darían IDÉNTICO (meses_cot = max = 96).
    const paraPronto = conVentanas(12, 96);
    const siguen = conVentanas(96, 96);
    expect(paraPronto.contrafactual_corte).toBeLessThan(siguen.contrafactual_corte);
    expect(paraPronto.tabla[3].bloques.detalle.aportaciones_netas)
      .not.toBeCloseTo(siguen.tabla[3].bloques.detalle.aportaciones_netas, 2);
  });

  it('si las dos ventanas cubren todo el periodo evaluado, nada cambia', () => {
    // Es el caso de los goldens (173 y 127 meses contra horizontes de 18 a 60):
    // por eso el puerto sigue cuadrando celda a celda con el Excel.
    const a = conVentanas(200, 200);
    const b = conVentanas(200, 150);
    expect(a.contrafactual_corte).toBeCloseTo(b.contrafactual_corte, 6);
    expect(a.tabla[3].ventaja_corte).toBeCloseTo(b.tabla[3].ventaja_corte, 6);
  });

  it('quien no cotiza no aporta, aunque el otro sí', () => {
    const soloUno = conVentanas(0, 96);
    expect(soloUno.cliente_derivado.aport_mensual).toBeCloseTo(40_000 * 0.05, 6);
  });
});

describe('acumulados expuestos para el escenario resumido', () => {
  it('el flujo neto acumulado es negativo cuando el cliente desembolsa', () => {
    // Crédito grande contra una renta chica: la retención se come la renta.
    const r = calcular(
      cliente(titular({ ssv: 100_000, salario_imss: 60_000 })),
      inmueble({ escrituracion: 2_500_000, renta: 6_000 }),
    );
    expect(r.operacion.flujo_mensual).toBeLessThan(0);
    expect(r.tabla[0].flujo_neto_acum).toBeLessThan(0);
    // a más meses, más pone de su bolsa
    expect(r.tabla[3].flujo_neto_acum).toBeLessThan(r.tabla[0].flujo_neto_acum);
  });

  it('sin crédito el flujo acumulado es la renta neta íntegra', () => {
    const r = calcular(
      cliente(titular({ ssv: 2_000_000 })),
      inmueble({ escrituracion: 1_500_000, notariales_credito: 30_000 }),
    );
    expect(r.operacion.credito).toBe(0);
    montoCerca(r.tabla[0].flujo_neto_acum, r.operacion.renta_neta * 18);
  });

  it('las aportaciones aplicadas paran cuando se acaba la ventana de cotización', () => {
    const corta = calcular(cliente(titular({ meses_cotizando: 6 })), inmueble({ escrituracion: 2_000_000 }));
    const larga = calcular(cliente(titular({ meses_cotizando: 60 })), inmueble({ escrituracion: 2_000_000 }));
    expect(corta.tabla[3].aportaciones_aplicadas).toBeLessThan(larga.tabla[3].aportaciones_aplicadas);
    expect(corta.tabla[3].aportaciones_aplicadas).toBeGreaterThan(0);
  });

  it('sin crédito no hay aportación que aplicar', () => {
    const r = calcular(cliente(titular({ ssv: 2_000_000 })), inmueble({ escrituracion: 1_000_000 }));
    expect(r.operacion.credito).toBe(0);
    expect(r.tabla[3].aportaciones_aplicadas).toBe(0);
  });
});
