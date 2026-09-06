// ============================================================================
// De dónde sale cada peso de la pensión.
//
// La pensión de Ley 97 es la suma de lo que aporta cada bolsa de dinero, y esa
// suma tiene que cuadrar exactamente — si el desglose que ve el cliente no da
// el total que ve arriba, el desglose no sirve para nada.
//
// Dos reglas de negocio quedan clavadas aquí:
//
//   · El castigo actuarial (0.81) aplica SÓLO al RCV, que es el saldo que
//     obligatoriamente compra la renta vitalicia del IMSS con su seguro de
//     sobrevivencia. La vivienda, el ahorro voluntario y los planes privados
//     no pagan esa cobertura y convierten limpio. (Raúl, 6-sep-2026.)
//
//   · Bajo la mínima garantizada, cada peso de vivienda le quita un peso al
//     complemento del gobierno. El Infonavit aporta, pero la pensión no se
//     mueve — y eso hay que poder decirlo con números, no con un asterisco.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { computeLey97 } from '../ley97';
import type { EntradaCalculo, Palancas, ResultadoLey97 } from '../types';
import { HOY_EXCEL, perfilMoja, saldosMoja, salario60mMoja } from './fixture-moja';

const palancas: Palancas = {
  edadRetiro: 65,
  pctTiempoCotizando: 1,
  salarioMod40: 2933.75,
  recuperarSemanasDescontadas: false,
  recuperarSemanasMod40Retro: false,
  salarioCotizacionRetro: 'MAXIMO',
  usaCreditoInfonavit: false,
  ahorroVoluntarioMensual: 0,
};

const base: EntradaCalculo = {
  perfil: { ...perfilMoja, ley: 'Ley97' },
  saldos: saldosMoja,
  salario_60m: salario60mMoja,
  palancas,
  hoy: HOY_EXCEL,
};

const correr = (overrides?: Palancas['overrides'], extra?: Partial<Palancas>) =>
  computeLey97({ ...base, palancas: { ...palancas, ...extra, overrides } });

const suma = (r: ResultadoLey97, capa?: 'cuenta_individual' | 'encima') =>
  r.fuentes
    .filter((f) => (capa ? f.capa === capa : true))
    .reduce((a, f) => a + f.pensionMensual, 0);

const fuente = (r: ResultadoLey97, id: string) => r.fuentes.find((f) => f.id === id)!;

// Los pesos se comparan al centavo: la aritmética es de punto flotante y la
// promesa es que cuadre, no que sea idéntica bit a bit.
const CENTAVO = 0.01;

describe('el desglose cuadra con el total', () => {
  it('las seis fuentes suman la pensión total', () => {
    const r = correr({
      ahorroVoluntario: 200_000,
      planCorporativo: 300_000,
      otrosPlanes: 100_000,
    });
    expect(suma(r)).toBeCloseTo(r.pensionTotal!, 2);
  });

  it('las de cuenta individual suman la pensión de AFORE + Infonavit', () => {
    const r = correr({ ahorroVoluntario: 200_000, planCorporativo: 300_000 });
    expect(suma(r, 'cuenta_individual')).toBeCloseTo(r.pensionAforeInfonavit!, 2);
  });

  it('las de encima son exactamente la diferencia con el total', () => {
    const r = correr({ ahorroVoluntario: 200_000, otrosPlanes: 50_000 });
    expect(suma(r, 'encima')).toBeCloseTo(r.pensionTotal! - r.pensionAforeInfonavit!, 2);
  });

  it('con aportaciones mensuales también cuadra', () => {
    const r = correr(
      { ahorroVoluntario: 100_000 },
      { ahorroVoluntarioMensual: 3_000, planCorporativoMensual: 2_000, otrosPlanesMensual: 1_000 },
    );
    expect(suma(r)).toBeCloseTo(r.pensionTotal!, 2);
  });

  it('una fuente excluida aporta cero y el total lo refleja', () => {
    const dentro = correr({ planCorporativo: 400_000 });
    const fuera = computeLey97({
      ...base,
      palancas: {
        ...palancas,
        overrides: { planCorporativo: 400_000 },
        incluir: { planCorporativo: false },
      },
    });
    expect(fuente(fuera, 'plan_corporativo').pensionMensual).toBe(0);
    expect(fuente(fuera, 'plan_corporativo').incluida).toBe(false);
    expect(fuera.pensionTotal!).toBeLessThan(dentro.pensionTotal!);
    expect(suma(fuera)).toBeCloseTo(fuera.pensionTotal!, 2);
  });

  it('una negativa no reparte nada', () => {
    const r = computeLey97({
      ...base,
      perfil: {
        ...perfilMoja,
        ley: 'Ley97',
        semanas: { cotizadas: 200, descontadas: 0, recuperadas: 0, netas: 200 },
      },
      palancas: { ...palancas, pctTiempoCotizando: 0 },
    });
    expect(r.negativa).toBe(true);
    expect(r.fuentes).toEqual([]);
  });
});

// Ojo al comparar saldos: el RCV crece al 3% y recibe las aportaciones
// futuras, la vivienda al 0% mientras va a la pensión. Dos overrides iguales
// NO dan dos saldos iguales, así que la comparación honesta es peso proyectado
// contra peso proyectado.
const porPeso = (r: ResultadoLey97, id: string) => {
  const f = fuente(r, id);
  return f.pensionMensual / f.saldoAlRetiro!;
};

describe('quién paga el seguro de sobrevivencia', () => {
  it('lo paga todo lo que compra la renta del IMSS: RCV y vivienda a la pensión', () => {
    const r = correr({ rcv97: 2_000_000, infonavit: 2_000_000 });
    expect(porPeso(r, 'infonavit')).toBeCloseTo(porPeso(r, 'rcv'), 10);
  });

  it('el ahorro voluntario no lo paga, y por eso rinde más por peso', () => {
    const r = correr({ rcv97: 2_000_000, ahorroVoluntario: 500_000 });
    expect(porPeso(r, 'ahorro_voluntario')).toBeGreaterThan(porPeso(r, 'rcv'));
    expect(porPeso(r, 'rcv')).toBeCloseTo(porPeso(r, 'ahorro_voluntario') * 0.81, 10);
  });

  it('los planes privados tampoco lo pagan', () => {
    const r = correr({
      rcv97: 2_000_000,
      ahorroVoluntario: 400_000,
      planCorporativo: 400_000,
      otrosPlanes: 400_000,
    });
    expect(porPeso(r, 'plan_corporativo')).toBeCloseTo(porPeso(r, 'ahorro_voluntario'), 10);
    expect(porPeso(r, 'otros_planes')).toBeCloseTo(porPeso(r, 'ahorro_voluntario'), 10);
  });
});

// --------------------------------------------------------------------------
// Rescate Infonavit.
//
// Dentro de la cuenta individual la subcuenta de vivienda es el peor lugar
// donde puede estar ese dinero: rinde 0% real, paga una cobertura que el
// cliente no eligió, y si cae en la mínima garantizada no aporta nada.
// Rescatarla arregla las tres cosas de un golpe, y eso es exactamente lo que
// tienen que demostrar estas pruebas.
// --------------------------------------------------------------------------
describe('rescatar la subcuenta de vivienda', () => {
  const conDestino = (rescatar: boolean, extra?: Partial<Palancas>) =>
    computeLey97({
      ...base,
      palancas: { ...palancas, ...extra, rescatarInfonavit: rescatar, overrides: { rcv97: 2_000_000 } },
    });

  it('el destino queda registrado en el detalle', () => {
    expect(conDestino(false).detalle.destinoInfonavit).toBe('pension');
    expect(conDestino(true).detalle.destinoInfonavit).toBe('rescate');
    expect(
      conDestino(true, { usaCreditoInfonavit: true }).detalle.destinoInfonavit,
    ).toBe('vivienda');
  });

  it('la casa manda: con crédito vigente no hay nada que rescatar', () => {
    const r = conDestino(true, { usaCreditoInfonavit: true });
    expect(fuente(r, 'infonavit').saldoAlRetiro).toBe(0);
    expect(fuente(r, 'infonavit').incluida).toBe(false);
  });

  it('cambia de capa: deja la cuenta individual y se va encima', () => {
    expect(fuente(conDestino(false), 'infonavit').capa).toBe('cuenta_individual');
    expect(fuente(conDestino(true), 'infonavit').capa).toBe('encima');
  });

  it('capitaliza al 3% en vez de al 0%, así que el saldo al retiro es mayor', () => {
    expect(fuente(conDestino(true), 'infonavit').saldoAlRetiro!).toBeGreaterThan(
      fuente(conDestino(false), 'infonavit').saldoAlRetiro!,
    );
  });

  it('el 3% alcanza también a las aportaciones patronales futuras', () => {
    // Dos clientes con el mismo saldo de hoy (arriba del umbral, para que el
    // costo no enturbie): el que sigue cotizando gana MÁS al rescatar, porque
    // el 3% también alcanza a lo que su patrón siga depositando.
    const gana = (pct: Palancas['pctTiempoCotizando']) => {
      const con = (rescatar: boolean) =>
        computeLey97({
          ...base,
          palancas: {
            ...palancas,
            pctTiempoCotizando: pct,
            rescatarInfonavit: rescatar,
            overrides: { infonavit: 300_000 },
          },
        });
      return (
        fuente(con(true), 'infonavit').saldoAlRetiro! -
        fuente(con(false), 'infonavit').saldoAlRetiro!
      );
    };
    expect(gana(1)).toBeGreaterThan(gana(0));
  });

  it('deja de pagar el seguro de sobrevivencia: rinde más por peso', () => {
    expect(porPeso(conDestino(true), 'infonavit')).toBeGreaterThan(
      porPeso(conDestino(false), 'infonavit'),
    );
    expect(porPeso(conDestino(true), 'infonavit')).toBeCloseTo(
      porPeso(conDestino(true), 'rcv') / 0.81,
      10,
    );
  });

  it('sube la pensión total', () => {
    expect(conDestino(true).pensionTotal!).toBeGreaterThan(conDestino(false).pensionTotal!);
  });

  it('y el desglose sigue cuadrando', () => {
    expect(suma(conDestino(true))).toBeCloseTo(conDestino(true).pensionTotal!, 2);
  });
});

describe('cuando el gobierno completa hasta la mínima', () => {
  const pobre = (overrides?: Palancas['overrides']) =>
    correr({ rcv97: 40_000, infonavit: 100_000, ...overrides });

  it('el complemento es lo que falta para el piso', () => {
    const r = pobre();
    const puestoPorSuSaldo = suma(r, 'cuenta_individual') - fuente(r, 'complemento_pmg').pensionMensual;
    expect(r.detalle.enPmg).toBe(true);
    expect(fuente(r, 'complemento_pmg').pensionMensual).toBeCloseTo(
      r.detalle.pmg - puestoPorSuSaldo,
      2,
    );
    expect(r.pensionAforeInfonavit!).toBeCloseTo(r.detalle.pmg, 2);
  });

  it('el complemento no tiene saldo: no es una bolsa de dinero', () => {
    expect(fuente(pobre(), 'complemento_pmg').saldoAlRetiro).toBeNull();
  });

  it('la vivienda queda marcada como absorbida por el piso', () => {
    const r = pobre({ infonavit: 300_000 });
    expect(fuente(r, 'infonavit').absorbidaPorPmg).toBe(true);
  });

  it('y esa marca es cierta: la pensión se queda clavada en el piso', () => {
    const poco = pobre({ infonavit: 100_000 });
    // 400k y no más: pasado cierto punto la vivienda SÍ rebasa el piso y ahí
    // deja de estar absorbida — que es justo el momento en que sí conviene
    // meterla al cálculo.
    const mucho = pobre({ infonavit: 400_000 });
    // Cuatro veces más vivienda y la misma pensión: es exactamente el piso.
    expect(fuente(mucho, 'infonavit').pensionMensual).toBeGreaterThan(
      fuente(poco, 'infonavit').pensionMensual,
    );
    expect(mucho.pensionAforeInfonavit!).toBeCloseTo(poco.pensionAforeInfonavit!, 2);
    expect(mucho.pensionAforeInfonavit!).toBeCloseTo(mucho.detalle.pmg, 2);
    // Lo que sube la vivienda es exactamente lo que baja el complemento.
    const sube = fuente(mucho, 'infonavit').pensionMensual - fuente(poco, 'infonavit').pensionMensual;
    const baja =
      fuente(poco, 'complemento_pmg').pensionMensual -
      fuente(mucho, 'complemento_pmg').pensionMensual;
    expect(baja).toBeCloseTo(sube, 2);
  });

  it('rescatada, la vivienda escapa del piso y sí suma', () => {
    const aLaPension = pobre({ infonavit: 400_000 });
    const rescatada = computeLey97({
      ...base,
      palancas: {
        ...palancas,
        rescatarInfonavit: true,
        overrides: { rcv97: 40_000, infonavit: 400_000 },
      },
    });
    expect(fuente(aLaPension, 'infonavit').absorbidaPorPmg).toBe(true);
    expect(fuente(rescatada, 'infonavit').absorbidaPorPmg).toBe(false);
    // El cliente sigue en el piso, pero ahora la vivienda va encima de él.
    expect(rescatada.detalle.enPmg).toBe(true);
    expect(rescatada.pensionTotal!).toBeGreaterThan(aLaPension.pensionTotal!);
  });

  it('arriba del piso no hay complemento ni nada absorbido', () => {
    const r = correr({ rcv97: 2_000_000, infonavit: 500_000 });
    expect(r.detalle.enPmg).toBe(false);
    expect(fuente(r, 'complemento_pmg').pensionMensual).toBe(0);
    expect(fuente(r, 'infonavit').absorbidaPorPmg).toBe(false);
  });

  it('el ahorro de encima sí mueve la pensión aunque esté en el piso', () => {
    const sin = pobre();
    const con = pobre({ ahorroVoluntario: 300_000 });
    expect(con.pensionTotal!).toBeGreaterThan(sin.pensionTotal!);
    expect(fuente(con, 'ahorro_voluntario').absorbidaPorPmg).toBe(false);
  });
});

describe('el Infonavit destinado a la casa', () => {
  it('sale del cálculo y se marca como no incluido', () => {
    const r = correr({ rcv97: 2_000_000, infonavit: 500_000 }, { usaCreditoInfonavit: true });
    const inf = fuente(r, 'infonavit');
    expect(inf.incluida).toBe(false);
    expect(inf.saldoAlRetiro).toBe(0);
    expect(inf.pensionMensual).toBe(0);
    expect(suma(r)).toBeCloseTo(r.pensionTotal!, 2);
  });
});

// --------------------------------------------------------------------------
// Lo que cuesta rescatar.
//
// En el caso normal, nada para el cliente: el beneficio lo paga la
// constructora y cada plan se arma para que salga sin costo. Lo que sí cuesta
// es trámite y confianza, y eso no cabe en un número.
//
// La excepción son los saldos chicos: por debajo de $169,000 no alcanza para
// armar ese plan y el rescate se hace por otra vía que cobra el 20%. El umbral
// mira el saldo de HOY, que es el tamaño de la transacción que se arma.
// --------------------------------------------------------------------------
describe('el costo del rescate', () => {
  const rescatando = (saldoHoy: number) =>
    computeLey97({
      ...base,
      palancas: { ...palancas, rescatarInfonavit: true, overrides: { infonavit: saldoHoy } },
    });

  it('arriba del umbral no cuesta nada: lo cubre el plan', () => {
    const r = rescatando(200_000);
    expect(r.detalle.costoRescatePct).toBe(0);
    expect(r.detalle.costoRescate).toBe(0);
  });

  it('debajo del umbral cobra el 20%', () => {
    const r = rescatando(100_000);
    expect(r.detalle.costoRescatePct).toBe(0.2);
    expect(r.detalle.costoRescate).toBeGreaterThan(0);
  });

  it('justo en el umbral todavía es gratis', () => {
    expect(rescatando(169_000).detalle.costoRescatePct).toBe(0);
    expect(rescatando(168_999).detalle.costoRescatePct).toBe(0.2);
  });

  it('el costo se descuenta de lo que sale: el saldo queda al 80%', () => {
    const r = rescatando(100_000);
    const inf = fuente(r, 'infonavit');
    const bruto = inf.saldoAlRetiro! + r.detalle.costoRescate;
    expect(r.detalle.costoRescate).toBeCloseTo(bruto * 0.2, 2);
    expect(inf.saldoAlRetiro!).toBeCloseTo(bruto * 0.8, 2);
  });

  it('sin rescate no hay costo, aunque el saldo sea chico', () => {
    const aLaPension = computeLey97({
      ...base,
      palancas: { ...palancas, overrides: { infonavit: 100_000 } },
    });
    const aLaCasa = computeLey97({
      ...base,
      palancas: { ...palancas, usaCreditoInfonavit: true, overrides: { infonavit: 100_000 } },
    });
    expect(aLaPension.detalle.costoRescate).toBe(0);
    expect(aLaCasa.detalle.costoRescate).toBe(0);
  });

  // El 20% se paga contra dos cosas que el rescate gana: quitarse el castigo
  // del 0.81 (19% de una) y capitalizar al 3% en vez del 0%. Lo primero es
  // inmediato, lo segundo necesita tiempo — así que el costo se justifica casi
  // siempre, y deja de hacerlo justo cuando ya no queda horizonte.
  const chico = (rescatar: boolean, edadRetiro: number) =>
    computeLey97({
      ...base,
      palancas: {
        ...palancas,
        edadRetiro,
        rescatarInfonavit: rescatar,
        overrides: { rcv97: 2_000_000, infonavit: 20_000 },
      },
    });

  it('con horizonte, el 20% se paga solo', () => {
    expect(chico(true, 65).pensionTotal!).toBeGreaterThan(chico(false, 65).pensionTotal!);
  });

  it('al filo del retiro ya no alcanza a pagarse', () => {
    // Retirándose en meses, el 3% no tiene dónde trabajar y el 20% se come
    // justo lo que se ahorró del castigo actuarial.
    expect(chico(true, 60).pensionTotal!).toBeLessThanOrEqual(chico(false, 60).pensionTotal!);
  });

  it('y el desglose sigue cuadrando con costo de por medio', () => {
    const r = rescatando(100_000);
    expect(suma(r)).toBeCloseTo(r.pensionTotal!, 2);
  });
});
