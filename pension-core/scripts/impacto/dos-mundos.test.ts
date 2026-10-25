// Personas sintéticas (no son clientes): una por grupo del Informe Trol.
import { describe, expect, it } from 'vitest';
import { evaluarDosMundos, type FilaEntrada } from './dos-mundos';

function salario60(sd: number, sm = 278.8) {
  return Array.from({ length: 60 }, (_, i) => ({ mes: i + 1, salario_diario: sd, salario_minimo: sm }));
}
function fila(p: {
  seg: string; nac: string; sd: number; sem: number; ultima: string; empleado?: boolean; conserva?: boolean;
  limite?: string | null; finCons?: string | null; hist?: Array<Record<string, unknown>>; um?: string;
}): FilaEntrada {
  return {
    persona_id: `sint-${p.seg}`, segmento: p.seg, grupo: 'x', sexo: 'H', edad: null, ultima_modalidad: p.um ?? 'obligatorio',
    semilla: {
      meta: { version_semilla: '2.2', ley: 'Ley73' },
      perfil: {
        ley: 'Ley73', sexo: 'H', fecha_nacimiento: p.nac, status_empleo: p.empleado ? 'empleado' : 'desempleado',
        salario_diario_registrado: p.sd, salario_promedio_250: p.sd, ratio_historico_salario_uma: p.sd / 117.31,
        semanas: { cotizadas: p.sem, descontadas: 0, recuperadas: 0, netas: p.sem },
        fechas: { primera_cotizacion: '1988-01-01', ultima_cotizacion_valida: p.ultima, ultima_cotizacion_mod40: null,
          limite_inscripcion_mod40: p.limite ?? null, fin_conservacion_derechos: p.finCons ?? null },
        conserva_derechos: p.conserva ?? true, aplica_mod40: true, gap_meses: 0,
      },
      saldos: { rcv97: 200000, sar92: 20000, infonavit: 80000, ahorro_voluntario: 0, credito_infonavit_vigente: false },
      salario_60m: salario60(p.sd),
      historial: p.hist ?? [{ empleador: 'PATRON', registro_patronal: 'X0000000000', fecha_inicio: '2010-01-01', fecha_fin: p.empleado ? null : p.ultima, salario_base: p.sd }],
    },
  };
}

const casos: Record<string, FilaEntrada> = {
  D_60_desempleado: fila({ seg: 'D', nac: '1966-03-10', sd: 300, sem: 1200, ultima: '2025-02-28', limite: '2030-02-27', finCons: '2032-01-01' }),
  E_55_desempleado: fila({ seg: 'E', nac: '1971-05-20', sd: 450, sem: 1050, ultima: '2025-08-31', limite: '2030-08-30', finCons: '2031-06-01' }),
  B_60_ex_mod40: fila({ seg: 'B', nac: '1966-07-01', sd: 2600, sem: 1500, ultima: '2026-03-31', um: 'mod40', limite: '2027-03-31', finCons: '2033-01-01',
    hist: [{ empleador: 'CONTINUACION VOLUNTARIA EN EL REGIMEN OBLIGATORIO', registro_patronal: 'A409999940', fecha_inicio: '2023-01-01', fecha_fin: '2026-03-31', salario_base: 2600 }] }),
  H_57_empleado: fila({ seg: 'H', nac: '1969-04-15', sd: 450, sem: 1200, ultima: '2026-10-20', empleado: true }),
  F_61_sin_derechos: fila({ seg: 'F', nac: '1965-02-01', sd: 400, sem: 550, ultima: '2014-06-30', conserva: false, limite: '2019-06-30', finCons: '2017-01-01' }),
};

describe('dos mundos (sintéticos)', () => {
  for (const [k, f] of Object.entries(casos)) {
    it(k, () => {
      const t = Date.now();
      const r = evaluarDosMundos(f);
      const ms = Date.now() - t;
      const d0 = r.detalle!.edades[0];
      // eslint-disable-next-line no-console
      console.log(k, `${ms}ms`, JSON.stringify({
        edad: r.edad_retiro_min, permitida: r.mod40_permitida, tope40: r.sbc_tope_mod40,
        viejo: [r.viejo_pension, r.viejo_costo_imss, r.viejo_costo_total], nuevo: [r.nuevo_mejor_camino, r.nuevo_pension, r.nuevo_costo], base: r.base_pension,
        resumen: r.detalle!.resumen, prop: r.detalle!.propuestas, avisos: r.detalle!.avisos.filter((a) => a.startsWith("propuestas")),
      }));
      expect(r.error).toBe(null);
      expect(r.base_pension).not.toBe(null);
    });
  }

  it('derechos perdidos: sin Mod 40 en el mundo nuevo', () => {
    const r = evaluarDosMundos(casos.F_61_sin_derechos);
    expect(r.mod40_permitida).toBe(false);
    expect(r.detalle!.edades[0].nuevo.mod40).toBe(null);
  });
});

describe('lote (fetch simulado)', () => {
  it('pagina, evalúa y guarda en bloques sin red', async () => {
    const { vi } = await import('vitest');
    const guardadas: unknown[] = [];
    let paginas = 0;
    vi.stubEnv('SUPABASE_URL', 'https://ejemplo.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'x');
    vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      const ok = (j: unknown) => ({ ok: true, status: 200, json: async () => j, text: async () => '' });
      if (url.endsWith('/impacto_mod40_entradas')) return ok(paginas++ === 0 ? Object.values(casos) : []);
      if (url.endsWith('/impacto_mod40_guardar')) { guardadas.push(...body.p_filas); return ok(body.p_filas.length); }
      return { ok: false, status: 404, json: async () => null, text: async () => 'no' };
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await import('../impacto-mod40-batch');
    await new Promise((r) => setTimeout(r, 500));
    log.mockRestore();
    expect(guardadas.length).toBe(Object.keys(casos).length);
    expect((guardadas[0] as { motor_version: string }).motor_version).toMatch(/^2026\./);
    vi.unstubAllGlobals();
  });
});
