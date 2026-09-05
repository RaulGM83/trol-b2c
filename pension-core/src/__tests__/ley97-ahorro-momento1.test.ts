// ============================================================================
// Ahorro en el momento 1: voluntario (AFORE) y externo (plan privado).
//
// El ahorro voluntario ya existía como entrada pero nunca se capturaba, y el
// dinero que el cliente tiene FUERA de la AFORE — planes corporativos, cajas
// de ahorro — no existía en el modelo (caso Eva Santos, con saldo en Infonavit
// y en el plan de Pepsico). Regla (Raúl, 5-sep-2026): los dos se suman como
// saldo en el momento 1, pero se reportan por separado.
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

describe('ahorro en el momento 1', () => {
  it('sin ahorro externo el saldo es cero', () => {
    expect(con(undefined).detalle.saldoAhorroExterno).toBe(0);
  });

  it('el ahorro externo se proyecta al retiro y sube la pensión total', () => {
    const sin = con(undefined);
    const conPlan = con({ ahorroExterno: 500_000 });
    expect(conPlan.detalle.saldoAhorroExterno).toBeGreaterThan(500_000);
    if (sin.pensionTotal !== null && conPlan.pensionTotal !== null) {
      expect(conPlan.pensionTotal).toBeGreaterThan(sin.pensionTotal);
    }
  });

  it('el externo NO se mezcla con el voluntario de la AFORE', () => {
    const r = con({ ahorroVoluntario: 100_000, ahorroExterno: 400_000 });
    expect(r.detalle.saldoAhorroExterno).toBeGreaterThan(r.detalle.saldoAhorroVoluntario);
    // Cada uno conserva su proporción: 4 a 1 antes de proyectar.
    const ratio = r.detalle.saldoAhorroExterno / r.detalle.saldoAhorroVoluntario;
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(4.5);
  });

  it('el plan privado rinde 2% real, por debajo del 3% de la AFORE', () => {
    const r = con({ ahorroVoluntario: 100_000, ahorroExterno: 100_000 });
    // Mismo monto y mismo horizonte: el de la AFORE termina más alto.
    expect(r.detalle.saldoAhorroVoluntario).toBeGreaterThan(r.detalle.saldoAhorroExterno);
  });

  // --------------------------------------------------------------------------
  // Quién sí y quién no mueve la aguja cuando el cliente cae en PMG.
  // Regla (Raúl, 5-sep-2026): el ahorro voluntario y el plan privado SIEMPRE
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

    it('el plan privado sí aporta, aun en PMG', () => {
      const sin = pobre(undefined);
      const conPlan = pobre({ ahorroExterno: 300_000 });
      expect(conPlan.pensionTotal!).toBeGreaterThan(sin.pensionTotal!);
    });
  });

  it('el externo no toca las pensiones de AFORE ni de AFORE+Infonavit', () => {
    const sin = con(undefined);
    const conPlan = con({ ahorroExterno: 1_000_000 });
    expect(conPlan.pensionAfore).toBe(sin.pensionAfore);
    expect(conPlan.pensionAforeInfonavit).toBe(sin.pensionAforeInfonavit);
  });
});
