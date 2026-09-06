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

describe('el castigo de 0.81 vive sólo en el RCV', () => {
  // Ojo al comparar: el RCV crece al 3% y recibe las aportaciones futuras,
  // la vivienda al 0%. Dos overrides iguales NO dan dos saldos iguales, así
  // que la comparación honesta es peso proyectado contra peso proyectado.
  const porPeso = (r: ResultadoLey97, id: string) => {
    const f = fuente(r, id);
    return f.pensionMensual / f.saldoAlRetiro!;
  };

  it('un peso de vivienda al retiro rinde más que un peso de RCV', () => {
    const r = correr({ rcv97: 2_000_000, infonavit: 2_000_000 });
    expect(porPeso(r, 'infonavit')).toBeGreaterThan(porPeso(r, 'rcv'));
  });

  it('la vivienda convierte al mismo factor que el ahorro voluntario', () => {
    const r = correr({ rcv97: 2_000_000, infonavit: 500_000, ahorroVoluntario: 500_000 });
    expect(porPeso(r, 'infonavit')).toBeCloseTo(porPeso(r, 'ahorro_voluntario'), 10);
  });

  it('los planes privados convierten igual de limpio que la vivienda', () => {
    const r = correr({ rcv97: 2_000_000, planCorporativo: 400_000, otrosPlanes: 400_000 });
    expect(porPeso(r, 'plan_corporativo')).toBeCloseTo(porPeso(r, 'infonavit'), 10);
    expect(porPeso(r, 'otros_planes')).toBeCloseTo(porPeso(r, 'infonavit'), 10);
  });

  it('el RCV rinde exactamente el 81% por peso', () => {
    const r = correr({ rcv97: 2_000_000, infonavit: 2_000_000 });
    expect(porPeso(r, 'rcv')).toBeCloseTo(porPeso(r, 'infonavit') * 0.81, 10);
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
