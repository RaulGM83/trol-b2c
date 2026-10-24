// ============================================================================
// Régimen de Mod 40 tras el acuerdo del Consejo Técnico (DOF 21-oct-2026).
// Spec: claude/106. Corte: 22-oct-2026.
//
// Lo que se protege aquí:
//  1. Con `hoy` antes del corte NADA cambia (los goldens MOJA/CAFE/MALG viven
//     en 2026-06 y siguen midiendo el mundo viejo).
//  2. Después del corte: sin retro, salario topado, una sola modalidad, Mod 10
//     previa cierra la Mod 40, hueco para el empleado.
//  3. `caminosLey73` presenta los tres caminos y `sugerirInicio` encuentra el
//     arranque barato (caso Raúl: 53 años con muchas semanas).
// ============================================================================

import { describe, expect, it } from 'vitest';
import { computeLey73 } from '../ley73';
import { computeProyectoMod40, proyectoMod40Disponible } from '../mod40-proyecto';
import { regimenMod40, MOD40_CORTE_REGIMEN } from '../mod40-ventana';
import { caminosLey73, sugerirInicio, MOD10_ESCALON_MESES } from '../caminos-ley73';
import { SALARIO_MINIMO, UMA } from '../tablas';
import type { EntradaCalculo, Palancas, PerfilSemilla, SaldosSemilla, SalarioMes } from '../types';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const HOY = d('2026-10-22'); // el día del corte
const UMA26 = UMA[2026]; // 117.31
const SM26 = SALARIO_MINIMO[2026]; // 315.04

const palancas: Palancas = {
  edadRetiro: 60,
  pctTiempoCotizando: 1,
  salarioMod40: 25 * UMA[2026], // 25 UMA: el asesor pide el máximo
  recuperarSemanasDescontadas: false,
  recuperarSemanasMod40Retro: true, // ya no debe surtir efecto
  salarioCotizacionRetro: 'MAXIMO',
  usaCreditoInfonavit: false,
  ahorroVoluntarioMensual: 0,
};

const saldos: SaldosSemilla = { rcv97: 100000, sar92: 50000, infonavit: 300000, ahorro_voluntario: 0, credito_infonavit_vigente: false };

function salario60m(sd: number): SalarioMes[] {
  return Array.from({ length: 60 }, (_, i) => ({ mes: i + 1, salario_diario: sd, salario_minimo: 278.88 }));
}

function perfil(p: Omit<Partial<PerfilSemilla>, 'semanas'> & { nacimiento: string; sd: number; semanas: number; ultima: string; empleado?: boolean }): PerfilSemilla {
  const { nacimiento, sd, semanas, ultima, empleado, ...resto } = p;
  return {
    nombre: 'Golden',
    curp: 'XXXX000000HDFXXX00',
    nss: '00000000000',
    sexo: 'H',
    fecha_nacimiento: nacimiento,
    ley: 'Ley73',
    status_empleo: empleado ? 'empleado' : 'desempleado',
    salario_diario_registrado: sd,
    salario_promedio_250: sd,
    ratio_historico_salario_uma: sd / UMA26,
    semanas: { cotizadas: semanas, descontadas: 0, recuperadas: 0, netas: semanas },
    fechas: {
      primera_cotizacion: '1990-01-01',
      ultima_cotizacion_valida: ultima,
      ultima_cotizacion_mod40: null,
      limite_inscripcion_mod40: null,
      fin_conservacion_derechos: null,
    },
    conserva_derechos: true,
    aplica_mod40: true,
    gap_meses: empleado ? 0 : Math.max(0, Math.round((HOY.getTime() - d(ultima).getTime()) / (30.4375 * 86_400_000))),
    ...resto,
  };
}

function entrada(pf: PerfilSemilla, extra: Partial<EntradaCalculo> = {}): EntradaCalculo {
  return { perfil: pf, saldos, salario_60m: salario60m(pf.salario_diario_registrado), palancas, hoy: HOY, ...extra };
}

// ---------------------------------------------------------------------------
// regimenMod40 — la función espejo de trol3.regimen_mod40
// ---------------------------------------------------------------------------

describe('regimenMod40', () => {
  it('antes del corte es el mundo viejo completo', () => {
    const r = regimenMod40(null, d('2026-10-21'), { ultimoSbc: 600 });
    expect(r.antesDelCorte).toBe(true);
    expect(r.retroAplica).toBe(true);
    expect(r.mod40Permitida).toBe(true);
  });

  it('hoy anterior al corte también reproduce el mundo viejo (goldens)', () => {
    const r = regimenMod40(null, d('2027-03-01'), { ultimoSbc: 600, hoy: d('2026-06-10') });
    expect(r.antesDelCorte).toBe(true);
  });

  it('nuevo: tope = último SBC + 1 UMA, piso 1 SM, techo 25 UMA; sin retro', () => {
    const r = regimenMod40(null, HOY, { ultimoSbc: 600 });
    expect(r.regimen).toBe('nuevo');
    expect(r.retroAplica).toBe(false);
    expect(r.sbcTopeMod40).toBeCloseTo(600 + UMA26, 2);
    expect(regimenMod40(null, HOY, { ultimoSbc: 100 }).sbcTopeMod40).toBeCloseTo(SM26, 2);
    expect(regimenMod40(null, HOY, { ultimoSbc: 2900 }).sbcTopeMod40).toBeCloseTo(25 * UMA26, 2);
  });

  it('Mod 10 previa cierra la Mod 40', () => {
    const r = regimenMod40(null, HOY, { ultimoSbc: 600, ultimaModalidad: 'independiente' });
    expect(r.mod40Permitida).toBe(false);
    expect(r.motivoNoPermitida).toBe('mod10_previa');
  });

  it('derechos perdidos cierran la Mod 40 (la vía es Mod 10); con derechos no cambia nada', () => {
    const sin = regimenMod40(null, HOY, { ultimoSbc: 400, ultimaModalidad: 'obligatorio', conservaDerechos: false });
    expect(sin.mod40Permitida).toBe(false);
    expect(sin.motivoNoPermitida).toBe('derechos_perdidos');
    expect(sin.avisos.join(' ')).toMatch(/conservación de derechos/);
    const con = regimenMod40(null, HOY, { ultimoSbc: 400, ultimaModalidad: 'obligatorio', conservaDerechos: true });
    expect(con.mod40Permitida).toBe(true);
    expect(con.motivoNoPermitida).toBe(null);
    // Mod 10 previa manda sobre derechos perdidos en el motivo.
    const ambos = regimenMod40(null, HOY, { ultimoSbc: 400, ultimaModalidad: 'independiente', conservaDerechos: false });
    expect(ambos.motivoNoPermitida).toBe('mod10_previa');
  });

  it('UMA 2026 = 117.31: tope 25 UMA = 2,932.75', () => {
    expect(UMA26).toBe(117.31);
    const r = regimenMod40(null, HOY, { ultimoSbc: 400, ultimaModalidad: 'obligatorio' });
    expect(r.sbcTopeMod10).toBeCloseTo(2932.75, 2);
    expect(r.sbcTopeMod40).toBeCloseTo(517.31, 2);
  });

  it('ventana vencida (expediente) cierra la Mod 40', () => {
    const r = regimenMod40(null, HOY, { ultimoSbc: 600, limiteExpediente: '2026-01-01' });
    expect(r.mod40Permitida).toBe(false);
    expect(r.motivoNoPermitida).toBe('ventana_vencida');
  });

  it('anterior: inscrito en Mod 40 desde antes del corte y sin baja; sin UMA extra', () => {
    const historial = [
      { empleador: 'CONTINUACION VOLUNTARIA EN EL REGIMEN OBLIGATORIO', registro_patronal: 'Z9999940', fecha_inicio: '2024-03-01', fecha_fin: null, salario_base: 2594 },
      { empleador: 'ACME SA', fecha_inicio: '2010-01-01', fecha_fin: '2024-02-15', salario_base: 800 },
    ];
    const r = regimenMod40(historial, HOY);
    expect(r.regimen).toBe('anterior');
    expect(r.retroAplica).toBe(false);
    expect(r.sbcTopeMod40).toBeCloseTo(2594, 2);
    expect(r.avisos.join(' ')).toMatch(/conservas tus condiciones/);
  });

  it('ex-Mod 40 con baja reciente queda en nuevo, con tope alto (D1)', () => {
    const historial = [
      { empleador: 'CONTINUACION VOLUNTARIA', registro_patronal: 'Z9999940', fecha_inicio: '2024-03-01', fecha_fin: '2026-02-28', salario_base: 2594 },
    ];
    const r = regimenMod40(historial, HOY);
    expect(r.regimen).toBe('nuevo');
    expect(r.sbcTopeMod40).toBeCloseTo(2594 + UMA26, 2);
  });

  it('Mod 40 dada de alta DESPUÉS del corte ya es régimen nuevo', () => {
    const historial = [
      { empleador: 'CONTINUACION VOLUNTARIA', registro_patronal: 'Z9999940', fecha_inicio: '2026-11-01', fecha_fin: null, salario_base: 700 },
    ];
    expect(regimenMod40(historial, d('2027-01-01')).regimen).toBe('nuevo');
  });
});

// ---------------------------------------------------------------------------
// computeLey73 después del corte
// ---------------------------------------------------------------------------

describe('computeLey73 — régimen nuevo', () => {
  // Golden 3: baja de obligatorio hace 14 meses, SBC $600, 61 años.
  const g3 = perfil({ nacimiento: '1965-06-15', sd: 600, semanas: 1100, ultima: '2025-08-20' });

  // Con 61 años la palanca `edadRetiro: 60` no deja meses por cotizar: se pide 63.
  const a63 = { ...palancas, edadRetiro: 63 };

  it('golden 3: sin retro aunque la palanca lo pida; Mod 40 topada a SBC + 1 UMA', () => {
    const r = computeLey73(entrada(g3, { palancas: a63 }));
    expect(r.detalle.antesDelCorte).toBe(false);
    expect(r.detalle.regimenMod40).toBe('nuevo');
    expect(r.aplicaRetroHoy).toBe(false);
    expect(r.retro).toBeNull();
    expect(r.semanasRecuperablesRetro).toBe(0);
    expect(r.detalle.modalidadFutura).toBe('mod40');
    expect(r.detalle.sbcTope).toBeCloseTo(600 + UMA26, 2);
    expect(r.detalle.salarioFuturo).toBeCloseTo(600 + UMA26, 2);
    expect(r.modalidadPrimerMes).toBe(40);
    expect(r.detalle.avisosRegimen.join(' ')).toMatch(/se recortó al tope de la Modalidad 40/);
  });

  it('golden 3 en Mod 10: hasta 25 UMA, cuesta más por mes', () => {
    const m40 = computeLey73(entrada(g3, { palancas: a63 }));
    const m10 = computeLey73(entrada(g3, { palancas: { ...a63, modalidadFutura: 'mod10' } }));
    expect(m10.detalle.modalidadFutura).toBe('mod10');
    expect(m10.detalle.salarioFuturo).toBeCloseTo(25 * UMA26, 2);
    expect(m10.modalidadPrimerMes).toBe(10);
    expect(m10.costoMensualPrimerMes).toBeGreaterThan(m40.costoMensualPrimerMes);
    expect(m10.pensionMensual!).toBeGreaterThan(m40.pensionMensual!);
  });

  it('golden 7: el mismo perfil con trámite el 21-oct es mundo viejo', () => {
    const r = computeLey73(entrada(g3, { fechaTramite: d('2026-10-21'), hoy: d('2026-10-21') }));
    expect(r.detalle.antesDelCorte).toBe(true);
    expect(r.aplicaRetroHoy).toBe(true);
    expect(r.retro).not.toBeNull();
  });

  it('golden 4: SBC cerca del techo: el tope de 25 UMA manda', () => {
    const g4 = perfil({ nacimiento: '1965-06-15', sd: 2900, semanas: 1100, ultima: '2025-08-20' });
    const r = computeLey73(entrada(g4));
    expect(r.detalle.sbcTope).toBeCloseTo(25 * UMA26, 2);
    expect(r.detalle.salarioFuturo).toBeCloseTo(25 * UMA26, 2);
  });

  it('golden 5: última cotización en Mod 10 → sólo Mod 10, con aviso', () => {
    const g5 = perfil({ nacimiento: '1965-06-15', sd: 400, semanas: 900, ultima: '2026-07-31' });
    const r = computeLey73(entrada(g5, { ultimaModalidad: 'independiente', palancas: a63 }));
    expect(r.detalle.mod40Permitida).toBe(false);
    expect(r.detalle.modalidadFutura).toBe('mod10');
    expect(r.modalidadPrimerMes).toBe(10);
    expect(r.detalle.avisosRegimen.join(' ')).toMatch(/independiente \(Modalidad 10\)/);
  });

  it('golden 6: empleado, SBC $400, sin hueco: baja = arranque, Mod 40 a $517.31', () => {
    const g6 = perfil({ nacimiento: '1968-01-10', sd: 400, semanas: 1300, ultima: '2026-10-20', empleado: true });
    const r = computeLey73(entrada(g6));
    expect(r.detalle.fechaBaja.getTime()).toBe(r.detalle.fechaTramite.getTime());
    expect(r.detalle.huecoMeses).toBe(0);
    expect(r.detalle.salarioFuturo).toBeCloseTo(400 + UMA26, 2);
  });

  it('golden 6b: empleado con hueco: sigue sumando semanas con su patrón hasta la baja y no cotiza en el hueco', () => {
    const g6 = perfil({ nacimiento: '1968-01-10', sd: 400, semanas: 1300, ultima: '2026-10-20', empleado: true });
    const sinHueco = computeLey73(entrada(g6, { fechaTramite: d('2027-10-22'), fechaBaja: d('2027-10-22') }));
    const conHueco = computeLey73(entrada(g6, { fechaTramite: d('2027-10-22'), fechaBaja: d('2026-10-22') }));
    expect(conHueco.detalle.huecoMeses).toBeCloseTo(12, 0);
    // Un año menos de semanas (las del patrón) y el mismo costo de cuotas.
    expect(sinHueco.detalle.semanasRetiro - conHueco.detalle.semanasRetiro).toBeCloseTo(52, 0);
    expect(conHueco.costoEstrategiaFutura).toBeCloseTo(sinHueco.costoEstrategiaFutura, 0);
  });

  it('la serie futura no combina modalidades: con 8 años al retiro sigue toda en Mod 40', () => {
    const joven = perfil({ nacimiento: '1974-05-01', sd: 800, semanas: 1200, ultima: '2026-06-30' });
    const r = computeLey73(entrada(joven));
    // Antes del corte el primer mes habría sido Mod 10 al salario mínimo (x > 60).
    expect(r.modalidadPrimerMes).toBe(40);
    expect(r.detalle.salarioFuturo).toBeCloseTo(800 + UMA26, 2);
  });

  it('el proyecto Mod 40 retroactivo no existe después del corte', () => {
    expect(proyectoMod40Disponible(HOY)).toBe(false);
    expect(proyectoMod40Disponible(d('2026-10-21'))).toBe(true);
    expect(proyectoMod40Disponible(d('2027-01-01'), MOD40_CORTE_REGIMEN, d('2026-06-10'))).toBe(true);
    expect(computeProyectoMod40(entrada(g3))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// caminosLey73 — pensión hoy · Mod 40 · Mod 10
// ---------------------------------------------------------------------------

describe('Mod 10 escalonada', () => {
  // 50 años, 1,100 semanas, SBC $450, desempleado: retiro a los 60 = ~10 años de Mod 10.
  const g = perfil({ nacimiento: '1976-05-10', sd: 450, semanas: 1100, ultima: '2026-06-30' });
  const pal = { ...palancas, edadRetiro: 60, modalidadFutura: 'mod10' as const };
  const plano = computeLey73(entrada(g, { palancas: pal }));
  const esc = computeLey73(entrada(g, { palancas: { ...pal, mod10EscalonMeses: MOD10_ESCALON_MESES } }));

  it('misma pensión que la Mod 10 al tope todo el tiempo: el promedio sólo ve los últimos meses', () => {
    expect(esc.detalle.mod10EscalonMeses).toBe(MOD10_ESCALON_MESES);
    expect(plano.detalle.mod10EscalonMeses).toBe(null);
    expect(esc.pensionMensual!).toBeCloseTo(plano.pensionMensual!, 0);
  });

  it('cuesta mucho menos: los años de más se pagan al salario mínimo', () => {
    expect(esc.costoEstrategiaFutura).toBeLessThan(plano.costoEstrategiaFutura * 0.7);
    expect(esc.costoMensualPrimerMes).toBeLessThan(plano.costoMensualPrimerMes);
  });

  it('con un escalón más corto que el promedio la pensión baja', () => {
    const corto = computeLey73(entrada(g, { palancas: { ...pal, mod10EscalonMeses: 24 } }));
    expect(corto.pensionMensual!).toBeLessThan(esc.pensionMensual!);
  });

  it('en Mod 40 se ignora', () => {
    const m40 = computeLey73(entrada(g, { palancas: { ...pal, modalidadFutura: 'mod40', mod10EscalonMeses: 58 } }));
    expect(m40.detalle.mod10EscalonMeses).toBe(null);
  });
});

describe('caminosLey73', () => {
  it('61 años con derecho: tres caminos, Mod 10 sube más que Mod 40 y cuesta más', () => {
    const g3 = perfil({ nacimiento: '1965-06-15', sd: 600, semanas: 1100, ultima: '2025-08-20' });
    const c = caminosLey73(entrada(g3));
    expect(c.pensionHoy.tramitable).toBe(true);
    expect(c.pensionHoy.pension).toBeGreaterThan(0);
    expect(c.mod40.aplica).toBe(true);
    expect(c.mod10.aplica).toBe(true);
    expect(c.mod40.opciones.map((o) => o.meses)).toEqual([12, 24]);
    const m40 = c.mod40.opciones[0];
    const m10 = c.mod10.opciones[0];
    expect(m10.costoCuotas).toBeGreaterThan(m40.costoCuotas);
    expect(m10.pension!).toBeGreaterThan(m40.pension!);
    // Seguir cotizando deja de cobrar 12 mensualidades: cuenta en la recuperación.
    expect(m40.pensionNoCobrada).toBeCloseTo(c.pensionHoy.pension! * 12, 0);
    expect(['pension_hoy', 'mod40', 'mod10']).toContain(c.recomendacion);
  });

  it('viene de Mod 10: el camino Mod 40 no aplica y lo dice', () => {
    const g5 = perfil({ nacimiento: '1965-06-15', sd: 400, semanas: 900, ultima: '2026-07-31' });
    const c = caminosLey73(entrada(g5, { ultimaModalidad: 'independiente' }));
    expect(c.mod40.aplica).toBe(false);
    expect(c.mod40.motivo).toMatch(/Modalidad 10/);
    expect(c.mod10.opciones.length).toBe(2);
  });

  it('derechos perdidos con ventana abierta: el camino Mod 40 no aplica, la Mod 10 sí', () => {
    // 61 años, 547 semanas, baja en 2022: perdió la conservación pero el art. 218 (5 años) sigue abierto.
    const g = perfil({ nacimiento: '1965-03-15', sd: 400, semanas: 547, ultima: '2022-06-30', conserva_derechos: false });
    const c = caminosLey73(entrada(g));
    expect(c.mod40.aplica).toBe(false);
    expect(c.mod40.motivo).toMatch(/conservación de derechos/);
    expect(c.mod40.opciones.length).toBe(0);
    expect(c.mod10.aplica).toBe(true);
    expect(c.mod10.opciones.length).toBe(2);
    const r = computeLey73(entrada(g));
    expect(r.detalle.mod40Permitida).toBe(false);
    expect(r.detalle.motivoNoPermitida).toBe('derechos_perdidos');
    expect(r.detalle.modalidadFutura).toBe('mod10');
  });

  it('57 años: pensión hoy es la de los 60 sin cotizar, y no es tramitable', () => {
    const g = perfil({ nacimiento: '1969-03-01', sd: 500, semanas: 900, ultima: '2026-01-31' });
    const c = caminosLey73(entrada(g));
    expect(c.pensionHoy.tramitable).toBe(false);
    expect(c.pensionHoy.pension).toBeGreaterThan(0);
    expect(c.avisos.join(' ')).toMatch(/Aún no cumple 60/);
  });
});

// ---------------------------------------------------------------------------
// sugerirInicio — caso Raúl
// ---------------------------------------------------------------------------

describe('sugerirInicio', () => {
  // Golden 8: 53 años, 1,400 semanas, SBC $1,500, empleado, retiro a 60.5.
  const g8 = perfil({ nacimiento: '1973-04-15', sd: 1500, semanas: 1400, ultima: '2026-10-20', empleado: true });
  const e8 = entrada(g8, { palancas: { ...palancas, edadRetiro: 60.5 } });

  it('golden 8: en Mod 40 el inicio recomendado deja hueco y cuesta mucho menos que arrancar hoy', () => {
    const s = sugerirInicio(e8);
    expect(s.mod40).not.toBeNull();
    const m = s.mod40!;
    expect(m.tabla.length).toBeGreaterThan(60);
    const hoyMismo = m.tabla[0];
    expect(m.recomendado).not.toBeNull();
    expect(m.recomendado!.huecoMeses).toBeGreaterThan(12);
    expect(m.recomendado!.costoCuotas).toBeLessThan(hoyMismo.costoCuotas * 0.5);
    // Pierde semanas, no promedio: la pensión baja menos que el costo.
    expect(m.recomendado!.pension!).toBeGreaterThan(hoyMismo.pension! * 0.75);
    // Dentro de la ventana de 5 años desde la baja.
    expect(m.recomendado!.permitida).toBe(true);
    expect(m.recomendado!.huecoMeses).toBeLessThanOrEqual(60);
    expect(m.avisos.join(' ')).toMatch(/5 años/);
  });

  it('golden 8: la mayor pensión es arrancar antes (más semanas) y se muestra aparte (D4)', () => {
    const s = sugerirInicio(e8);
    const m = s.mod40!;
    expect(m.maxPension).not.toBeNull();
    expect(m.maxPension!.pension!).toBeGreaterThanOrEqual(m.recomendado!.pension!);
    expect(m.maxPension!.fechaInicio.getTime()).toBeLessThanOrEqual(m.recomendado!.fechaInicio.getTime());
  });

  it('golden 8: con salario topado bajo, la Mod 10 tardía a 25 UMA recupera más rápido que cualquier Mod 40', () => {
    const s = sugerirInicio(e8);
    expect(s.mod10).not.toBeNull();
    expect(s.mejor).not.toBeNull();
    expect(s.mejor!.modalidad).toBe('mod10');
    expect(s.mejor!.punto.mesesRecuperacion!).toBeLessThan(s.mod40!.recomendado!.mesesRecuperacion!);
    // Y arranca tarde: pocos meses cotizando al salario alto.
    expect(s.mejor!.punto.mesesCotizando).toBeLessThan(36);
  });

  it('golden 9: con pocas semanas (600) la sugerencia se acerca a la baja', () => {
    const g9 = perfil({ nacimiento: '1973-04-15', sd: 1500, semanas: 600, ultima: '2026-10-20', empleado: true });
    const s9 = sugerirInicio(entrada(g9, { palancas: { ...palancas, edadRetiro: 60.5 } }));
    const s8 = sugerirInicio(e8);
    expect(s9.mod40!.recomendado).not.toBeNull();
    expect(s9.mod40!.recomendado!.huecoMeses).toBeLessThanOrEqual(s8.mod40!.recomendado!.huecoMeses);
  });

  it('viene de Mod 10: no hay barrido en Mod 40, sí en Mod 10', () => {
    const g = perfil({ nacimiento: '1970-01-01', sd: 800, semanas: 1200, ultima: '2026-06-30' });
    const s = sugerirInicio(entrada(g, { ultimaModalidad: 'independiente', palancas: { ...palancas, edadRetiro: 62 } }));
    expect(s.mod40).toBeNull();
    expect(s.mod10!.tabla.length).toBeGreaterThan(12);
    expect(s.avisos.join(' ')).toMatch(/Modalidad 10/);
  });
});
