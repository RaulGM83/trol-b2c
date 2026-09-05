// ============================================================================
// Ahorro en el momento 1: los cinco vehículos que el asesor captura.
//
// El ahorro voluntario ya existía como entrada pero nunca se capturaba, y el
// dinero que el cliente tiene FUERA de la AFORE no existía en el modelo (caso
// Eva Santos, con saldo en Infonavit y en el plan corporativo de Pepsico).
// Regla (Raúl, 5-sep-2026): cada vehículo se captura por separado, se proyecta
// con su propio rendimiento real y se puede excluir del cálculo:
//
//   AFORE (RCV + voluntario)  3% real
//   Plan corporativo          2% real
//   Otros planes (PPR, fondos) 1% real
//   Infonavit                 0% real, y fuera del cálculo por default
//
// El voluntario, el corporativo y los otros planes SIEMPRE suman a la pensión
// porque van encima. El único que puede no aportar nada es el Infonavit,
// porque entra ANTES del piso de la mínima garantizada.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { computeLey97 } from '../ley97';
import type { EntradaCalculo, Palancas } from '../types';
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

const con = (overrides: Palancas['overrides']) =>
  computeLey97({ ...base, palancas: { ...palancas, overrides } });

const conPalancas = (extra: Partial<Palancas>) =>
  computeLey97({ ...base, palancas: { ...palancas, ...extra } });

describe('saldos en el momento 1', () => {
  it('sin capturar nada, corporativo y otros planes valen cero', () => {
    const r = con(undefined);
    expect(r.detalle.saldoPlanCorporativo).toBe(0);
    expect(r.detalle.saldoOtrosPlanes).toBe(0);
  });

  it('el plan corporativo se proyecta al retiro y sube la pensión total', () => {
    const sin = con(undefined);
    const conPlan = con({ planCorporativo: 500_000 });
    expect(conPlan.detalle.saldoPlanCorporativo).toBeGreaterThan(500_000);
    expect(conPlan.pensionTotal!).toBeGreaterThan(sin.pensionTotal!);
  });

  it('otros planes se proyectan al retiro y suben la pensión total', () => {
    const sin = con(undefined);
    const conOtros = con({ otrosPlanes: 500_000 });
    expect(conOtros.detalle.saldoOtrosPlanes).toBeGreaterThan(500_000);
    expect(conOtros.pensionTotal!).toBeGreaterThan(sin.pensionTotal!);
  });

  it('cada vehículo conserva su propio saldo, no se mezclan', () => {
    const r = con({ ahorroVoluntario: 100_000, planCorporativo: 400_000, otrosPlanes: 200_000 });
    expect(r.detalle.saldoPlanCorporativo).toBeGreaterThan(r.detalle.saldoAhorroVoluntario);
    expect(r.detalle.saldoAhorroVoluntario).toBeGreaterThan(0);
    expect(r.detalle.saldoOtrosPlanes).toBeGreaterThan(0);
    // 4 a 1 antes de proyectar; los rendimientos distintos no rompen la proporción
    const ratio = r.detalle.saldoPlanCorporativo / r.detalle.saldoAhorroVoluntario;
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(4.5);
  });
});

describe('rendimientos reales por vehículo', () => {
  it('mismo monto: AFORE 3% > corporativo 2% > otros planes 1%', () => {
    const r = con({ ahorroVoluntario: 100_000, planCorporativo: 100_000, otrosPlanes: 100_000 });
    expect(r.detalle.saldoAhorroVoluntario).toBeGreaterThan(r.detalle.saldoPlanCorporativo);
    expect(r.detalle.saldoPlanCorporativo).toBeGreaterThan(r.detalle.saldoOtrosPlanes);
  });
});

describe('aportaciones mensuales', () => {
  it('la aportación al plan corporativo levanta su saldo proyectado', () => {
    const sin = conPalancas({});
    const conAporta = conPalancas({ planCorporativoMensual: 5_000 });
    expect(conAporta.detalle.saldoPlanCorporativo).toBeGreaterThan(
      sin.detalle.saldoPlanCorporativo,
    );
    expect(conAporta.pensionTotal!).toBeGreaterThan(sin.pensionTotal!);
  });

  it('la aportación a otros planes levanta su saldo proyectado', () => {
    const sin = conPalancas({});
    const conAporta = conPalancas({ otrosPlanesMensual: 5_000 });
    expect(conAporta.detalle.saldoOtrosPlanes).toBeGreaterThan(sin.detalle.saldoOtrosPlanes);
    expect(conAporta.pensionTotal!).toBeGreaterThan(sin.pensionTotal!);
  });

  it('la misma aportación rinde más en la AFORE que en otros planes', () => {
    const enAfore = conPalancas({ ahorroVoluntarioMensual: 5_000 });
    const enOtros = conPalancas({ otrosPlanesMensual: 5_000 });
    expect(enAfore.detalle.saldoAhorroVoluntario).toBeGreaterThan(
      enOtros.detalle.saldoOtrosPlanes,
    );
  });
});

describe('incluir o no incluir en el cálculo', () => {
  const todo = { ahorroVoluntario: 200_000, planCorporativo: 300_000, otrosPlanes: 100_000 };

  const conIncluir = (incluir: Palancas['incluir']) =>
    computeLey97({ ...base, palancas: { ...palancas, overrides: todo, incluir } });

  it('excluir el voluntario lo saca del saldo y baja la pensión', () => {
    const dentro = conIncluir(undefined);
    const fuera = conIncluir({ ahorroVoluntario: false });
    expect(fuera.detalle.saldoAhorroVoluntario).toBe(0);
    expect(fuera.pensionTotal!).toBeLessThan(dentro.pensionTotal!);
  });

  it('excluir el plan corporativo lo saca del saldo y baja la pensión', () => {
    const dentro = conIncluir(undefined);
    const fuera = conIncluir({ planCorporativo: false });
    expect(fuera.detalle.saldoPlanCorporativo).toBe(0);
    expect(fuera.pensionTotal!).toBeLessThan(dentro.pensionTotal!);
  });

  it('excluir otros planes los saca del saldo y baja la pensión', () => {
    const dentro = conIncluir(undefined);
    const fuera = conIncluir({ otrosPlanes: false });
    expect(fuera.detalle.saldoOtrosPlanes).toBe(0);
    expect(fuera.pensionTotal!).toBeLessThan(dentro.pensionTotal!);
  });

  it('excluir la AFORE vacía el saldo proyectado de la AFORE', () => {
    const fuera = conIncluir({ afore: false });
    expect(fuera.detalle.saldoAforeProyectado).toBe(0);
  });

  it('por default todo entra: no pasar incluir es igual a pasarlo en true', () => {
    const implicito = conIncluir(undefined);
    const explicito = conIncluir({
      afore: true,
      ahorroVoluntario: true,
      planCorporativo: true,
      otrosPlanes: true,
    });
    expect(explicito.pensionTotal).toBe(implicito.pensionTotal);
  });
});

// --------------------------------------------------------------------------
// Quién sí y quién no mueve la aguja cuando el cliente cae en PMG.
// Regla (Raúl, 5-sep-2026): el ahorro voluntario y los planes privados SIEMPRE
// suman, porque van encima de la pensión. El único que puede no aportar nada
// es el Infonavit, porque entra ANTES del piso de la mínima garantizada.
// --------------------------------------------------------------------------
describe('cuando la AFORE no alcanza la PMG', () => {
  const pobre = (overrides: Palancas['overrides']) =>
    computeLey97({
      ...base,
      palancas: { ...palancas, overrides: { rcv97: 40_000, infonavit: 300_000, ...overrides } },
    });

  it('la pensión se va al piso de la mínima garantizada', () => {
    const r = pobre(undefined);
    expect(r.pensionAfore).toBe(r.detalle.pmg);
  });

  it('el Infonavit no aporta nada: se lo come la PMG', () => {
    const r = pobre(undefined);
    expect(r.pensionAforeInfonavit).toBe(r.pensionAfore);
  });

  it('el ahorro voluntario sí aporta, aun en PMG', () => {
    const sin = pobre(undefined);
    const conAV = pobre({ ahorroVoluntario: 300_000 });
    expect(conAV.pensionTotal!).toBeGreaterThan(sin.pensionTotal!);
  });

  it('el plan corporativo sí aporta, aun en PMG', () => {
    const sin = pobre(undefined);
    const conPlan = pobre({ planCorporativo: 300_000 });
    expect(conPlan.pensionTotal!).toBeGreaterThan(sin.pensionTotal!);
  });

  it('otros planes sí aportan, aun en PMG', () => {
    const sin = pobre(undefined);
    const conOtros = pobre({ otrosPlanes: 300_000 });
    expect(conOtros.pensionTotal!).toBeGreaterThan(sin.pensionTotal!);
  });
});

describe('lo que va encima no toca las pensiones de abajo', () => {
  it('el corporativo y los otros planes no mueven AFORE ni AFORE+Infonavit', () => {
    const sin = con(undefined);
    const conPlanes = con({ planCorporativo: 1_000_000, otrosPlanes: 1_000_000 });
    expect(conPlanes.pensionAfore).toBe(sin.pensionAfore);
    expect(conPlanes.pensionAforeInfonavit).toBe(sin.pensionAforeInfonavit);
  });
});
