/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Parser defensivo de la semilla calculo_pensional v2 (jsonb de Supabase).
// Devuelve null si la semilla no existe o es v1 (sin secciones ricas).
// `any` es deliberado: el jsonb llega sin tipar y aquí es donde se valida.
// ============================================================================

import type { Ley, PerfilSemilla, SaldosSemilla, SalarioMes, Sexo } from './types';

export interface SemillaV2 {
  meta: { curp: string; ley: Ley; version_semilla: string; generado_en?: string };
  perfil: PerfilSemilla;
  saldos: SaldosSemilla;
  salario_60m: SalarioMes[];
  escenarios?: {
    estrategicos?: Array<Record<string, unknown>>;
    seleccionados?: Array<Record<string, unknown>>;
    mod40_retro_hoy?: Record<string, unknown>;
    mod40_retro_futuro?: Record<string, unknown>;
  };
  proyeccion_ley73?: Array<Record<string, unknown>>;
  proyeccion_ley97?: Array<Record<string, unknown>>;
}

function num(v: unknown, def = 0): number {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : def;
}

export function parseSemillaV2(raw: unknown): SemillaV2 | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, any>;
  const version = String(s.meta?.version_semilla ?? '');
  if (!s.perfil || !s.saldos || !Array.isArray(s.salario_60m)) return null;
  if (!version.startsWith('2')) return null;

  const p = s.perfil;
  const perfil: PerfilSemilla = {
    nombre: p.nombre ?? '',
    curp: p.curp ?? s.meta?.curp ?? '',
    nss: String(p.nss ?? ''),
    sexo: (p.sexo === 'M' ? 'M' : 'H') as Sexo,
    fecha_nacimiento: p.fecha_nacimiento,
    ley: (p.ley === 'Ley97' ? 'Ley97' : 'Ley73') as Ley,
    status_empleo: p.status_empleo === 'empleado' ? 'empleado' : 'desempleado',
    salario_diario_registrado: num(p.salario_diario_registrado),
    salario_promedio_250: num(p.salario_promedio_250),
    ratio_historico_salario_uma: num(p.ratio_historico_salario_uma),
    semanas: {
      cotizadas: num(p.semanas?.cotizadas),
      descontadas: num(p.semanas?.descontadas),
      recuperadas: num(p.semanas?.recuperadas),
      netas: num(p.semanas?.netas),
    },
    fechas: {
      primera_cotizacion: p.fechas?.primera_cotizacion ?? null,
      ultima_cotizacion_valida: p.fechas?.ultima_cotizacion_valida,
      ultima_cotizacion_mod40: p.fechas?.ultima_cotizacion_mod40 ?? null,
      limite_inscripcion_mod40: p.fechas?.limite_inscripcion_mod40 ?? null,
      fin_conservacion_derechos: p.fechas?.fin_conservacion_derechos ?? null,
    },
    conserva_derechos: !!p.conserva_derechos,
    aplica_mod40: !!p.aplica_mod40,
    gap_meses: num(p.gap_meses),
  };
  if (!perfil.fecha_nacimiento || !perfil.fechas.ultima_cotizacion_valida) return null;

  const sa = s.saldos;
  const saldos: SaldosSemilla = {
    rcv97: num(sa.rcv97),
    sar92: num(sa.sar92),
    infonavit: num(sa.infonavit),
    ahorro_voluntario: num(sa.ahorro_voluntario),
    credito_infonavit_vigente: !!sa.credito_infonavit_vigente,
  };

  const salario_60m: SalarioMes[] = (s.salario_60m as any[]).map((m, i) => ({
    mes: num(m.mes, i + 1),
    salario_diario: num(m.salario_diario),
    salario_minimo: num(m.salario_minimo),
  }));
  if (salario_60m.length === 0) return null;

  return {
    meta: { curp: perfil.curp, ley: perfil.ley, version_semilla: version, generado_en: s.meta?.generado_en },
    perfil,
    saldos,
    salario_60m,
    escenarios: s.escenarios,
    proyeccion_ley73: s.proyeccion_ley73,
    proyeccion_ley97: s.proyeccion_ley97,
  };
}
