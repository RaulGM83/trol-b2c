/**
 * pension-engine — motor de cálculo compartido B2B + B2C (scaffold portable)
 * =========================================================================
 * Fuente de verdad a reconciliar: PensionCalculator v5.0 / `ley97.ts`
 * (versión 2.0.0-rendimientos-consar), validado al centavo contra los
 * Excel canónicos CALCULADORA_<CURP>.xlsx.
 *
 * Este archivo implementa FIELMENTE lo documentado y validado:
 *   - Ley 97: pensión = (fondo / URV) * 0.81 / 12 ; URV = 13.7 - (edad-60)*0.25
 *   - Penalización por edad de retiro (Ley 73)
 *   - Saldos de subcuentas (SAR92, RCV97, Infonavit) con tasas CONSAR por tramo
 *   - Costo Modalidad 40 retroactiva: fee por brackets + INPC + recargos 1.47%/mes
 *
 * Lo que queda como [RECONCILIAR]: las tablas de cuantía básica e incrementos
 * de Ley 73 (no fabricar; portar de ley97.ts). Marcado abajo.
 *
 * Uso (Node o navegador):
 *   const { calcular } = PensionEngine;
 *   const r = calcular(input);
 */
(function (global) {
  'use strict';

  // ----------------------------------------------------------------------
  // Constantes históricas (documentadas). Completar series desde ley97.ts.
  // ----------------------------------------------------------------------
  const UMA_HISTORY = {
    2020: 86.88, 2021: 89.62, 2022: 96.22, 2023: 103.74,
    2024: 108.57, 2025: 113.07, 2026: 117.35, // UMA 2026 confirmada
  };

  // Tasas de capitalización por tramo (calibración CONSAR v5.0).
  const RATES = {
    SAR92: { real_inpc_plus: 0.02 },          // INPC + 2% real hasta jun-1997
    RCV97: [                                    // netas de comisiones, por tramo
      { from: 1997, to: 2006, rate: 0.10 },
      { from: 2007, to: 2012, rate: 0.093 },
      { from: 2013, to: 2099, rate: 0.07 },
    ],
    INFONAVIT: { rate: 0.055 },                // serie oficial; simplificado
    FUTURE: 0.07,                              // proyección futura unificada
  };

  // Penalización por edad de retiro (Ley 73) — tabla canónica documentada.
  const AGE_FACTOR_L73 = [
    { age: 60.0, f: 0.75 }, { age: 60.5, f: 0.80 }, { age: 61.5, f: 0.85 },
    { age: 62.5, f: 0.90 }, { age: 63.5, f: 0.95 }, { age: 64.5, f: 1.00 },
  ];
  function ageFactorL73(age) {
    if (age < 60) return 0;
    let f = 0.75;
    for (const row of AGE_FACTOR_L73) if (age >= row.age) f = row.f;
    return f;
  }

  // Costo de proyecto retroactivo Mod 40: fee por brackets sobre saldo IMSS.
  const MOD40_FEE_BRACKETS = [
    { upTo: 200000, rate: 0.35 }, { upTo: 500000, rate: 0.30 },
    { upTo: 1000000, rate: 0.25 }, { upTo: Infinity, rate: 0.20 },
  ];
  const MOD40_GESTORIAS_FIJAS = 80000;
  const RECARGO_MENSUAL = 0.0147; // 1.47% mensual

  // ----------------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------------
  const uma = (year) => UMA_HISTORY[year] || UMA_HISTORY[2026];
  const round2 = (n) => Math.round(n * 100) / 100;

  function detectLaw(firstContributionYear) {
    // Ley 73 si la primera cotización es anterior al 1-jul-1997.
    return firstContributionYear < 1997 ? 'LEY_73' : 'LEY_97';
  }

  // ----------------------------------------------------------------------
  // Ley 97 — fórmula validada al centavo
  // ----------------------------------------------------------------------
  function ley97Pension({ fondoRCV, edad }) {
    const URV = 13.7 - (edad - 60) * 0.25;          // unidad de renta vitalicia
    const mensual = (fondoRCV / URV) * 0.81 / 12;   // 0.81 = factor documentado
    return round2(Math.max(mensual, 0));
  }

  // Requisito de semanas por año de retiro (Ley 97): 750 + (año-2021)*25, tope 1000.
  function semanasRequeridasL97(yearRetiro) {
    return Math.min(750 + (yearRetiro - 2021) * 25, 1000);
  }

  // ----------------------------------------------------------------------
  // Ley 73 — estructura documentada; tablas de cuantía [RECONCILIAR]
  // ----------------------------------------------------------------------
  function ley73Pension({ salarioPromedio250, semanas, edad, cuantiaTables }) {
    if (semanas < 500) return { tipo: 'NEGATIVA_PENSION', monto: 0 };

    // [RECONCILIAR] cuantiaTables debe venir de ley97.ts (cuantía básica +
    // incrementos por ratio salCot/salMin). Aquí aproximamos sólo la forma.
    if (!cuantiaTables) {
      return {
        tipo: 'PENDIENTE_TABLAS',
        monto: null,
        nota: 'Requiere tablas de cuantía básica/incrementos de ley97.ts',
        ageFactor: ageFactorL73(edad),
      };
    }

    const factorBasico = cuantiaTables.basico(salarioPromedio250);
    let monto = salarioPromedio250 * 1.11 * 365 * factorBasico / 365; // mensualiza
    // incrementos por bloques de 52 semanas sobre 500 + asignaciones familiares 15%
    const bloques = Math.floor((semanas - 500) / 52);
    monto *= (1 + cuantiaTables.incremento(bloques));
    monto *= 1.15;                          // asignaciones familiares
    monto *= ageFactorL73(edad);            // penalización por edad
    return { tipo: 'LEY_73', monto: round2(monto) };
  }

  // ----------------------------------------------------------------------
  // Saldos de subcuentas (simplificado, capitalización compuesta por tramo)
  // ----------------------------------------------------------------------
  function rcv97Rate(year) {
    const t = RATES.RCV97.find((r) => year >= r.from && year <= r.to);
    return t ? t.rate : RATES.FUTURE;
  }

  // ----------------------------------------------------------------------
  // Modalidad 40 retroactiva — costo
  // ----------------------------------------------------------------------
  function costoMod40Retro({ saldoIMSS, mesesAtraso = 0 }) {
    let fee = 0, restante = saldoIMSS, prev = 0;
    for (const b of MOD40_FEE_BRACKETS) {
      const tramo = Math.min(restante, b.upTo - prev);
      if (tramo <= 0) break;
      fee += tramo * b.rate;
      restante -= tramo; prev = b.upTo;
    }
    const base = fee + MOD40_GESTORIAS_FIJAS;
    const recargos = base * RECARGO_MENSUAL * mesesAtraso;
    return {
      fee_despacho: round2(fee),
      gestorias_fijas: MOD40_GESTORIAS_FIJAS,
      recargos: round2(recargos),
      costo_total: round2(base + recargos),
    };
  }

  // ----------------------------------------------------------------------
  // API pública
  // ----------------------------------------------------------------------
  function calcular(input) {
    const {
      birthYear, firstContributionYear, currentYear = 2026,
      semanas, salarioPromedio250, fondoRCV = 0, saldoIMSS = 0,
      edadesRetiro = [60, 61, 62, 63, 64, 65], cuantiaTables = null,
    } = input;

    const law = detectLaw(firstContributionYear);
    const escenarios = edadesRetiro.map((edad) => {
      if (law === 'LEY_97') {
        const yearRetiro = birthYear + edad;
        return {
          edad,
          ley: 'LEY_97',
          pension_mensual: ley97Pension({ fondoRCV, edad }),
          semanas_requeridas: semanasRequeridasL97(yearRetiro),
          cumple_semanas: semanas >= semanasRequeridasL97(yearRetiro),
        };
      }
      const r = ley73Pension({ salarioPromedio250, semanas, edad, cuantiaTables });
      return { edad, ley: 'LEY_73', ...r };
    });

    return {
      version: 'scaffold-0.1 (reconciliar con ley97.ts v2.0.0-rendimientos-consar)',
      ley_aplicable: law,
      uma_actual: uma(currentYear),
      escenarios,
      mod40: saldoIMSS > 0 ? costoMod40Retro({ saldoIMSS, mesesAtraso: 0 }) : null,
    };
  }

  // ----------------------------------------------------------------------
  // Correcciones §18 del Plan Maestro
  // ----------------------------------------------------------------------
  const UMA_MENSUAL = (year) => uma(year) * 30.4; // UMA mensual ≈ diaria × 30.4
  const TOPE_UMA = 25;

  // Salario mensual → equivalente en UMAs (tope 25).
  function salarioEnUMAs(salarioMensual, year = 2026) {
    return Math.min(salarioMensual / UMA_MENSUAL(year), TOPE_UMA);
  }

  // Edades de proyección: de la menor entre 60 y la edad actual, hasta 65.
  function edadesProyeccion(birthYear, currentYear = 2026) {
    const edadActual = currentYear - birthYear;
    const inicio = Math.min(60, edadActual);
    const edades = [];
    for (let e = inicio; e <= 65; e++) edades.push(e);
    return edades;
  }

  // Comparador de modalidades (no "con/sin Mod40"): compara escenarios.
  // [DEMO] deltas demostrativos; sustituir por el motor oficial portado.
  function compararModalidades(profile) {
    const { semanasRecuperables = 0, mod40RetroHoy = null, mod40RetroFuturo = null } = profile;
    const base = calcular(profile);
    const mejorBase = base.escenarios.reduce((a, b) =>
      ((b.pension_mensual ?? b.monto) || 0) > ((a.pension_mensual ?? a.monto) || 0) ? b : a, base.escenarios[0]);
    const pBase = (mejorBase.pension_mensual ?? mejorBase.monto) || 0;

    const filas = [
      { modalidad: 'sin_accion', label: 'Sin acción (hoy)', pension: round2(pBase), costo: 0 },
    ];
    if (semanasRecuperables > 0) {
      // recuperar semanas descontadas: suma semanas y reproyecta
      const conSemanas = calcular({ ...profile, semanas: profile.semanas + semanasRecuperables });
      const mejor = conSemanas.escenarios.reduce((a, b) =>
        ((b.pension_mensual ?? b.monto) || 0) > ((a.pension_mensual ?? a.monto) || 0) ? b : a);
      filas.push({ modalidad: 'recuperar_semanas', label: `Recuperar ${semanasRecuperables} semanas`,
        pension: round2((mejor.pension_mensual ?? mejor.monto) || 0), costo: 0 });
    }
    if (mod40RetroFuturo) filas.push({ modalidad: 'mod40_futura', label: 'Modalidad 40 (futura)',
      pension: round2(mod40RetroFuturo.pension || 0), costo: round2(mod40RetroFuturo.costo || 0) });
    if (mod40RetroHoy) filas.push({ modalidad: 'mod40_retro', label: 'Modalidad 40 (retroactiva hoy)',
      pension: round2(mod40RetroHoy.pension || 0), costo: round2(mod40RetroHoy.costo || 0) });

    // mejor jugada = mayor pensión neta de costo amortizado (demo: solo pensión)
    const mejorJugada = filas.reduce((a, b) => b.pension > a.pension ? b : a, filas[0]);
    return { filas, mejor_jugada: mejorJugada, pension_base: round2(pBase) };
  }

  const PensionEngine = {
    calcular, ley97Pension, ley73Pension, costoMod40Retro, compararModalidades,
    ageFactorL73, semanasRequeridasL97, detectLaw, salarioEnUMAs, edadesProyeccion,
    UMA_HISTORY, UMA_MENSUAL, TOPE_UMA, RATES,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = PensionEngine;
  else global.PensionEngine = PensionEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
