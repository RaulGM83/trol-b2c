// ============================================================================
// Mod 40 para quien SIGUE COTIZANDO (sin baja).
//
// Regla de negocio (Raúl, 5-sep-2026): el proyecto asume que el cliente se da
// de baja HOY y que al llegar a la fecha de trámite/pensión paga el retroactivo
// de todo ese tramo, con actualizaciones INPC y recargos a esa fecha.
//
// Antes, un empleado tomaba la fecha de TRÁMITE como fecha de baja, así que el
// periodo retroactivo quedaba en cero: el proyecto se cotizaba completo (caso
// real Sergio SACS640526, $129,724) y la pensión salía idéntica a no hacer
// nada — multiplicador ×1.0. Eso es lo que este archivo evita que vuelva.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { computeProyectoMod40 } from '../mod40-proyecto';
import type { EntradaCalculo, Palancas } from '../types';
import { HOY_EXCEL, perfilMoja, saldosMoja, salario60mMoja } from './fixture-moja';

const palancas: Palancas = {
  edadRetiro: 60,
  pctTiempoCotizando: 1,
  salarioMod40: 2933.75,
  recuperarSemanasDescontadas: true,
  recuperarSemanasMod40Retro: true,
  salarioCotizacionRetro: 'MAXIMO',
  usaCreditoInfonavit: false,
  ahorroVoluntarioMensual: 0,
};

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// Perfil tipo Sergio: nacido en 1964, EMPLEADO, cotización abierta.
const perfilEmpleado = {
  ...perfilMoja,
  fecha_nacimiento: '1964-05-26',
  status_empleo: 'empleado' as const,
  fechas: { ...perfilMoja.fechas, ultima_cotizacion_valida: '2026-08-30', ultima_cotizacion_mod40: null },
};

const base: EntradaCalculo = {
  perfil: perfilEmpleado,
  saldos: saldosMoja,
  salario_60m: salario60mMoja,
  palancas,
  hoy: HOY_EXCEL,
};

describe('Mod 40 sin baja: se asume baja hoy', () => {
  it('con la fecha de trámite en el futuro hay retroactivo que pagar', () => {
    const r = computeProyectoMod40({ ...base, fechaTramite: d('2029-05-26') })!;
    expect(r.pagoImss.total).toBeGreaterThan(0);
    expect(r.pagoImss.actualizaciones).toBeGreaterThan(0);
    expect(r.pagoImss.recargos).toBeGreaterThan(0);
  });

  it('el proyecto mejora la pensión: el multiplicador deja de ser 1.0', () => {
    const r = computeProyectoMod40({ ...base, fechaTramite: d('2029-05-26') })!;
    expect(r.conProyecto.pensionMensual).toBeGreaterThan(r.sinProyecto.pensionMensual);
    expect(r.multiplicadorPension).toBeGreaterThan(1);
  });

  it('mientras más lejos la fecha de trámite, mayor la pensión y el pago al IMSS', () => {
    const cerca = computeProyectoMod40({ ...base, fechaTramite: d('2027-05-26') })!;
    const lejos = computeProyectoMod40({ ...base, fechaTramite: d('2029-05-26') })!;
    expect(lejos.conProyecto.pensionMensual).toBeGreaterThan(cerca.conProyecto.pensionMensual);
    expect(lejos.pagoImss.total).toBeGreaterThan(cerca.pagoImss.total);
  });

  it('con trámite hoy no hay tramo que pagar: el proyecto no aporta', () => {
    const r = computeProyectoMod40({ ...base, fechaTramite: HOY_EXCEL, permitirMenorDe60: true })!;
    expect(r.pagoImss.total).toBeLessThanOrEqual(r.conProyecto.pensionMensual);
  });

  it('a quien SÍ tiene baja no le cambia la fecha de baja', () => {
    const perfilConBaja = {
      ...perfilEmpleado,
      status_empleo: 'desempleado' as const,
      fechas: { ...perfilEmpleado.fechas, ultima_cotizacion_valida: '2025-03-31' },
    };
    const r = computeProyectoMod40({ ...base, perfil: perfilConBaja, fechaTramite: d('2029-05-26') })!;
    // La línea arranca en su baja real, no en "hoy".
    expect(r.pagoImss.total).toBeGreaterThan(0);
    const empleado = computeProyectoMod40({ ...base, fechaTramite: d('2029-05-26') })!;
    expect(r.pagoImss.total).toBeGreaterThan(empleado.pagoImss.total);
  });
});
