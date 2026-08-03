import { describe, it, expect } from 'vitest';
import {
  calcularContrafactual,
  sbcMensual,
  semillaSar92,
  tasaRcv,
  cuotaSocialDiaria,
  definirCanastas,
  rankingPorCagr,
  type SerieAfore,
} from '../contrafactual';
import type { EmpleoHistorial } from '../historia-laboral';

// ----------------------------------------------------------------------------
// Series sintéticas: precios con crecimiento mensual constante conocido.
// ----------------------------------------------------------------------------

function serieConstante(
  afore: string,
  desde: string,
  hasta: string,
  tasaMensual: number,
  primerMesPropio?: string,
): SerieAfore {
  const [y0, m0] = desde.split('-').map(Number);
  const [y1, m1] = hasta.split('-').map(Number);
  const n = (y1 - y0) * 12 + (m1 - m0);
  const precios = [];
  let p = 1;
  for (let i = 0; i <= n; i++) {
    const y = y0 + Math.floor((m0 - 1 + i) / 12);
    const m = ((m0 - 1 + i) % 12) + 1;
    precios.push({ mes: `${y}-${String(m).padStart(2, '0')}`, precio: p });
    p *= 1 + tasaMensual;
  }
  return { afore, precios, primerMesPropio: primerMesPropio ?? desde };
}

const HISTORIA_SIMPLE: EmpleoHistorial[] = [
  {
    empleador: 'ACME',
    fecha_inicio: '2000-01-01',
    fecha_fin: null, // sigue activo
    salario_base: 500,
    registro_patronal: null,
    entidad_federativa: null,
  },
];

describe('sbcMensual', () => {
  it('mes completo de un empleo activo cotiza todos los días del mes', () => {
    const meses = sbcMensual(HISTORIA_SIMPLE, '2020-01', '2020-03', null);
    expect(meses).toHaveLength(3);
    expect(meses[0]).toMatchObject({ mes: '2020-01', dias: 31, sbcDiario: 500 });
    expect(meses[1].dias).toBe(29); // feb 2020 bisiesto
  });

  it('empleo que empieza a mitad de mes cotiza proporcional', () => {
    const h: EmpleoHistorial[] = [{ ...HISTORIA_SIMPLE[0], fecha_inicio: '2020-01-16' }];
    const meses = sbcMensual(h, '2020-01', '2020-01', null);
    expect(meses[0].dias).toBe(16); // 16..31
  });

  it('sin salario en el evento imputa ratio × UMA del año', () => {
    const h: EmpleoHistorial[] = [{ ...HISTORIA_SIMPLE[0], salario_base: null }];
    const meses = sbcMensual(h, '2024-06', '2024-06', 2.0);
    expect(meses[0].sbcDiario).toBeCloseTo(2.0 * 108.57, 2); // UMA 2024
  });

  it('empleos simultáneos suman salario y topan a 25 UMA', () => {
    const h: EmpleoHistorial[] = [
      { ...HISTORIA_SIMPLE[0], salario_base: 2000 },
      { ...HISTORIA_SIMPLE[0], salario_base: 2000 },
    ];
    const meses = sbcMensual(h, '2024-06', '2024-06', null);
    expect(meses[0].sbcDiario).toBeCloseTo(25 * 108.57, 2); // topado
  });

  it('meses sin empleo no aparecen', () => {
    const h: EmpleoHistorial[] = [
      { ...HISTORIA_SIMPLE[0], fecha_inicio: '2020-01-01', fecha_fin: '2020-02-29' },
    ];
    const meses = sbcMensual(h, '2020-01', '2020-06', null);
    expect(meses.map((m) => m.mes)).toEqual(['2020-01', '2020-02']);
  });
});

describe('tasaRcv', () => {
  it('pre-2023 es 6.5% para cualquier salario', () => {
    expect(tasaRcv(2010, 500)).toBeCloseTo(0.065, 6);
    expect(tasaRcv(2022, 3000)).toBeCloseTo(0.065, 6);
  });

  it('post-2023: banda 1 SM fija en 3.150 y sin 0.225% estatal (fracc. III derogada)', () => {
    // ≤ 1 SM (2023: SM=207.44): 2% + 3.150% + 1.125% = 6.275% — MENOR que el
    // 6.5% histórico porque el 0.225% estatal ya no existe (va vía cuota social).
    expect(tasaRcv(2023, 200)).toBeCloseTo(0.06275, 5);
    expect(tasaRcv(2030, 200)).toBeCloseTo(0.06275, 5); // fija todos los años
  });

  it('post-2023 crece con el año y con el nivel salarial', () => {
    const t2023medio = tasaRcv(2023, 210); // ~2.02 UMA (justo arriba del SM) → fila C
    const t2023alto = tasaRcv(2023, 1200); // >4 UMA → fila G
    const t2030alto = tasaRcv(2030, 1200);
    expect(t2023medio).toBeGreaterThan(tasaRcv(2023, 200)); // banda SM
    expect(t2023alto).toBeGreaterThan(t2023medio);
    expect(t2030alto).toBeGreaterThan(t2023alto);
    // techo 2030 fila G: 2% + 11.875% + 1.125% = 15.0% (sin Estado)
    expect(t2030alto).toBeCloseTo(0.15, 4);
    // fila C 2023: 2% + 3.751% + 1.125% = 6.876%
    expect(t2023medio).toBeCloseTo(0.06876, 5);
  });

  it('la semilla SAR-92 usa la serie mensual real de CETES (crisis 95 pesa)', () => {
    const h: EmpleoHistorial[] = [
      { ...HISTORIA_SIMPLE[0], fecha_inicio: '1992-05-01', fecha_fin: '1994-12-31', salario_base: 100 },
    ];
    const meses = sbcMensual(h, '1992-05', '1997-06', null);
    const b92 = semillaSar92(meses);
    const nominal = meses.reduce((s, m) => s + 0.02 * 100 * m.dias, 0);
    // Aportó solo hasta dic-94; la crisis del 95 (tasas 33-75%) capitaliza
    // fuerte el saldo acumulado: debe llegar a jun-97 muy por encima del nominal.
    expect(b92).toBeGreaterThan(nominal * 1.8);
  });
});

describe('cuotaSocialDiaria', () => {
  it('aplica a salarios bajos y no a altos (post-2021 tope 4.01 UMA)', () => {
    expect(cuotaSocialDiaria(2024, 200)).toBeGreaterThan(0); // ~1.8 UMA
    expect(cuotaSocialDiaria(2024, 800)).toBe(0); // ~7.4 UMA
  });

  it('pre-2021 el tope es 15 UMA', () => {
    expect(cuotaSocialDiaria(2019, 800)).toBeGreaterThan(0); // ~9.5 UMA < 15
  });
});

describe('semillaSar92', () => {
  it('sin cotización pre-97 la semilla es 0', () => {
    const meses = sbcMensual(HISTORIA_SIMPLE, '1992-05', '1997-06', null);
    expect(meses).toHaveLength(0);
    expect(semillaSar92(meses)).toBe(0);
  });

  it('acumula 2% del SBC y capitaliza', () => {
    const h: EmpleoHistorial[] = [
      { ...HISTORIA_SIMPLE[0], fecha_inicio: '1996-01-01', fecha_fin: '1996-12-31', salario_base: 100 },
    ];
    const meses = sbcMensual(h, '1992-05', '1997-06', null);
    const b92 = semillaSar92(meses);
    // 12 meses × 2% × 100 × ~30.4 días ≈ 730 nominal, más CETES 96-97 → > nominal
    const nominal = meses.reduce((s, m) => s + 0.02 * 100 * m.dias, 0);
    expect(b92).toBeGreaterThan(nominal);
    expect(b92).toBeLessThan(nominal * 1.5);
  });
});

describe('calcularContrafactual', () => {
  // Tres AFOREs: buena (0.8%/mes), media (0.6%/mes), mala (0.4%/mes), 2000-2025.
  const series = [
    serieConstante('buena', '2000-01', '2025-12', 0.008),
    serieConstante('media', '2000-01', '2025-12', 0.006),
    serieConstante('mala', '2000-01', '2025-12', 0.004),
  ];
  const canastas = { superior: ['buena'], baja: ['mala'] };

  it('ordena saldos por rendimiento y las brechas internas son positivas', () => {
    const r = calcularContrafactual({
      fecha_nacimiento: '1980-01-01',
      historia: HISTORIA_SIMPLE,
      series,
      canastas,
      estimado_previo: 100_000,
    });
    expect(r.saldos_por_afore.map((s) => s.afore)).toEqual(['buena', 'media', 'mala']);
    expect(r.canasta_superior.promedio).toBeGreaterThan(r.mediana_sistema);
    expect(r.mediana_sistema).toBeGreaterThan(r.canasta_baja.promedio);
    expect(r.brecha_top_vs_mediana).toBeGreaterThan(0);
    expect(r.brecha_top_vs_baja).toBeGreaterThan(r.brecha_top_vs_mediana);
    // el estimado previo queda como referencia, no como benchmark
    expect(r.referencia_previa.estimado).toBe(100_000);
    expect(r.precios_corte).toBe('2025-12');
  });

  it('sin cotización pre-97, sar92 = 0 en el desglose', () => {
    const r = calcularContrafactual({
      fecha_nacimiento: '1980-01-01',
      historia: HISTORIA_SIMPLE,
      series,
      canastas,
    });
    expect(r.sar92_semilla).toBe(0);
    expect(r.desglose_referencia.sar92).toBe(0);
    expect(r.desglose_referencia.rcv97).toBe(r.canasta_superior.promedio);
  });

  it('con cotización pre-97 el SAR-92 entra y crece con la serie', () => {
    const h: EmpleoHistorial[] = [
      { ...HISTORIA_SIMPLE[0], fecha_inicio: '1993-01-01', fecha_fin: null, salario_base: 300 },
    ];
    const seriesLargas = [
      serieConstante('buena', '1997-07', '2025-12', 0.008),
      serieConstante('media', '1997-07', '2025-12', 0.006),
      serieConstante('mala', '1997-07', '2025-12', 0.004),
    ];
    const r = calcularContrafactual({
      fecha_nacimiento: '1970-01-01',
      historia: h,
      series: seriesLargas,
      canastas,
    });
    expect(r.sar92_semilla).toBeGreaterThan(0);
    expect(r.desglose_referencia.sar92).toBeGreaterThan(r.sar92_semilla); // creció 28 años
    expect(r.desglose_referencia.rcv97 + r.desglose_referencia.sar92).toBe(
      r.canasta_superior.promedio,
    );
  });

  it('flag_publicable: por cobertura de historia vs semanas SISEC (no por estimado previo)', () => {
    const base = {
      fecha_nacimiento: '1980-01-01',
      historia: HISTORIA_SIMPLE, // cotiza 2000-01 → hoy ≈ 312 meses
      series,
      canastas,
    };
    // cobertura ~100%: semanas ≈ meses × 4.345
    const rOk = calcularContrafactual({ ...base, semanas_cotizadas: 312 * 4.345 });
    expect(rOk.cobertura_historia).toBeGreaterThan(0.9);
    expect(rOk.flag_publicable).toBe(true);
    // historia cubre solo la mitad de las semanas reales → no publicable
    const rBaja = calcularContrafactual({ ...base, semanas_cotizadas: 312 * 4.345 * 2 });
    expect(rBaja.flag_publicable).toBe(false);
    // sin dato de semanas → no publicable (conservador)
    const rSin = calcularContrafactual({ ...base, semanas_cotizadas: null });
    expect(rSin.cobertura_historia).toBeNull();
    expect(rSin.flag_publicable).toBe(false);
    // el estimado previo NO afecta el flag
    const rConPrevio = calcularContrafactual({
      ...base,
      semanas_cotizadas: 312 * 4.345,
      estimado_previo: 10, // absurdo a propósito
    });
    expect(rConPrevio.flag_publicable).toBe(true);
  });

  it('aportado_nominal es consistente con 6.5%+CS del SBC (pre-reforma)', () => {
    const h: EmpleoHistorial[] = [
      { ...HISTORIA_SIMPLE[0], fecha_inicio: '2010-01-01', fecha_fin: '2010-12-31', salario_base: 500 },
    ];
    const r = calcularContrafactual({
      fecha_nacimiento: '1980-01-01',
      historia: h,
      series,
      canastas,
    });
    const nominalMin = 0.065 * 500 * 365; // sin CS
    expect(r.aportado_nominal).toBeGreaterThanOrEqual(Math.floor(nominalMin));
    expect(r.aportado_nominal).toBeLessThan(nominalMin * 1.15); // CS es chica a ese salario
    expect(r.meses_cotizados).toBe(12);
  });
});

describe('canastas por CAGR con datos propios', () => {
  it('el prefijo industria no cuenta para el ranking', () => {
    const series = [
      serieConstante('vieja-buena', '2000-01', '2025-12', 0.008),
      serieConstante('vieja-media', '2000-01', '2025-12', 0.006),
      serieConstante('vieja-mala', '2000-01', '2025-12', 0.004),
      // nueva con prefijo industria desde 2000 pero datos propios desde 2020:
      // su tramo propio rinde altísimo, pero no alcanza los 15 años → fuera del ranking
      serieConstante('nueva-estrella', '2000-01', '2025-12', 0.02, '2020-01'),
    ];
    const rk = rankingPorCagr(series, 15 * 12);
    expect(rk.map((r) => r.afore)).toEqual(['vieja-buena', 'vieja-media', 'vieja-mala']);
    const c = definirCanastas(series, 15 * 12);
    expect(c.superior).toEqual(['vieja-buena', 'vieja-media', 'vieja-mala']);
    expect(c.superior).not.toContain('nueva-estrella');
  });

  it('con historia suficiente, la nueva sí entra al ranking por su tramo propio', () => {
    const series = [
      serieConstante('a', '2000-01', '2025-12', 0.008),
      serieConstante('b', '2000-01', '2025-12', 0.006),
      serieConstante('c', '2000-01', '2025-12', 0.004, '2008-01'), // 17 años propios
    ];
    const rk = rankingPorCagr(series, 15 * 12);
    expect(rk.map((r) => r.afore)).toContain('c');
  });
});

describe('completarConIndiceIndustria', () => {
  it('rellena hacia atrás con el retorno mediano y respeta el tramo propio', async () => {
    const { completarConIndiceIndustria } = await import('../contrafactual');
    const a = serieConstante('a', '2000-01', '2005-12', 0.01);
    const b = serieConstante('b', '2000-01', '2005-12', 0.005);
    // c nace en 2003-01 con precio 1
    const c = { afore: 'c', precios: serieConstante('c', '2003-01', '2005-12', 0.007).precios };
    const out = completarConIndiceIndustria([
      { afore: 'a', precios: a.precios },
      { afore: 'b', precios: b.precios },
      c,
    ]);
    const sc = out.find((s) => s.afore === 'c')!;
    expect(sc.primerMesPropio).toBe('2003-01');
    // quedó completa desde 2000-01
    expect(sc.precios[0].mes).toBe('2000-01');
    // el tramo propio no cambió
    expect(sc.precios.find((p) => p.mes === '2003-01')!.precio).toBeCloseTo(1, 10);
    // el prefijo decrece hacia atrás con la mediana de a y b (~0.75%/mes)
    const p2000 = sc.precios[0].precio;
    const esperado = 1 / Math.pow(1 + 0.0075, 36);
    expect(p2000).toBeCloseTo(esperado, 3);
    // series largas quedan intactas
    const sa = out.find((s) => s.afore === 'a')!;
    expect(sa.precios.length).toBe(a.precios.length);
    expect(sa.precios[0].precio).toBeCloseTo(a.precios[0].precio, 10);
  });
});

describe('cobertura en ventanas iguales (fix 19-jul)', () => {
  const series = [
    serieConstante('buena', '2000-01', '2025-12', 0.008),
    serieConstante('media', '2000-01', '2025-12', 0.006),
    serieConstante('mala', '2000-01', '2025-12', 0.004),
  ];
  const canastas = { superior: ['buena'], baja: ['mala'] };

  it('los meses pre-1992 cuentan para cobertura aunque no generen RCV', () => {
    const h: EmpleoHistorial[] = [
      { empleador: 'A', fecha_inicio: '1986-01-01', fecha_fin: null, salario_base: 300, registro_patronal: null, entidad_federativa: null },
    ];
    // carrera 1986 → 2025-12 ≈ 480 meses ≈ 2085 semanas
    const r = calcularContrafactual({
      fecha_nacimiento: '1963-01-01', historia: h, series, canastas,
      semanas_cotizadas: 480 * 4.345,
    });
    expect(r.cobertura_historia).toBeGreaterThan(0.95);
    expect(r.flag_publicable).toBe(true);
    // pero el RCV solo simula desde jul-97
    expect(r.meses_cotizados).toBeLessThan(480);
  });

  it('vigente con SISEC viejo: la cobertura se corta a la fecha del SISEC', () => {
    const h: EmpleoHistorial[] = [
      { empleador: 'A', fecha_inicio: '2000-01-01', fecha_fin: null, salario_base: 300, registro_patronal: null, entidad_federativa: null },
    ];
    // SISEC de hace 2 años: semanas hasta 2024-01 (≈ 289 meses desde 2000)
    const semanas2024 = 289 * 4.345;
    const conCorte = calcularContrafactual({
      fecha_nacimiento: '1980-01-01', historia: h, series, canastas,
      semanas_cotizadas: semanas2024, fecha_corte_semanas: '2024-01-15',
    });
    expect(conCorte.cobertura_historia).toBeGreaterThan(0.95);
    expect(conCorte.cobertura_historia).toBeLessThan(1.05);
    expect(conCorte.flag_publicable).toBe(true);
  });
});
