// Prefill de la Mesa Viraal a partir de la semilla del cliente (B2B y B2C).
// Regla de negocio (Raúl, 17-ago-2026): el proyecto se autoriza SIEMPRE "a día de
// hoy" (Mod40 retroactiva hoy), con la opción de recuperar las semanas descontadas
// por retiros por desempleo. Nombre, CURP, edad, semanas y salario acompañan al caso.
import { computeProyectoMod40 } from '@/lib/imss/mod40-proyecto';
import type { Palancas } from '@/lib/imss/types';
import type { SemillaV2 } from '@/lib/imss/semilla';

export type PrefillViraal = Record<string, number | null>;

export interface ClienteViraal {
  nombre: string;
  curp: string;
  nss: string;
  edad: number | null;
  semanas_cotizadas: number;
  semanas_descontadas: number;
  semanas_recuperadas: number;
  semanas_recuperables: number;
  salario_diario: number;
  meses_retro: number | null;
  ley: string;
  aplica_mod40: boolean;
}

export interface VarianteViraal {
  prefill: PrefillViraal;
  pension: number | null;
  semanas_retiro: number | null;
}

export interface MesaViraalData {
  cliente: ClienteViraal;
  /** Sin recuperar semanas descontadas. */
  sin: VarianteViraal | null;
  /** Recuperando semanas descontadas (null si no hay recuperables). */
  con: VarianteViraal | null;
}

const SALARIO_25_UMA = 2933.75; // tope Mod40
// "A día de hoy": el motor toma edadProyecto = max(edadRetiro, 60, edadActual); con 0 el retiro es hoy
// (o a los 60 si aún no los cumple) y el retroactivo cubre desde la última cotización hasta hoy.
const EDAD_PROYECTO_HOY = 0;

function palancas(over: Partial<Palancas> = {}): Palancas {
  return {
    edadRetiro: EDAD_PROYECTO_HOY,
    pctTiempoCotizando: 0,
    salarioMod40: SALARIO_25_UMA,
    recuperarSemanasDescontadas: false,
    recuperarSemanasMod40Retro: false,
    salarioCotizacionRetro: 'MAXIMO',
    usaCreditoInfonavit: false,
    ahorroVoluntarioMensual: 0,
    ...over,
  };
}

function edadDe(fechaNac: string | null | undefined, hoy: Date): number | null {
  if (!fechaNac) return null;
  const d = new Date(fechaNac);
  if (Number.isNaN(d.getTime())) return null;
  let e = hoy.getUTCFullYear() - d.getUTCFullYear();
  const m = hoy.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && hoy.getUTCDate() < d.getUTCDate())) e--;
  return e;
}

/**
 * Calcula las dos variantes (sin/con recuperación de semanas) del proyecto Mod40
 * retroactivo HOY y arma el prefill de la mesa: línea IMSS, gestorías, pensión y saldos.
 * `saldosLiquidos` (AFORE disponible + Infonavit) puede venir corregido por el asesor.
 */
export function mesaViraalDesdeSemilla(semilla: SemillaV2, saldosLiquidos: number | null, hoy = new Date()): MesaViraalData {
  const { perfil, saldos, salario_60m } = semilla;
  const recuperables = Math.max(0, perfil.semanas.descontadas - perfil.semanas.recuperadas);
  const cliente: ClienteViraal = {
    nombre: perfil.nombre,
    curp: perfil.curp,
    nss: perfil.nss,
    edad: edadDe(perfil.fecha_nacimiento, hoy),
    semanas_cotizadas: perfil.semanas.cotizadas,
    semanas_descontadas: perfil.semanas.descontadas,
    semanas_recuperadas: perfil.semanas.recuperadas,
    semanas_recuperables: recuperables,
    salario_diario: perfil.salario_diario_registrado,
    meses_retro: null,
    ley: perfil.ley,
    aplica_mod40: !!perfil.aplica_mod40,
  };
  const variante = (recuperar: boolean): VarianteViraal | null => {
    try {
      const proy = computeProyectoMod40({ perfil, saldos, salario_60m, hoy, palancas: palancas({ recuperarSemanasDescontadas: recuperar }) });
      if (!proy) return null;
      if (cliente.meses_retro == null) cliente.meses_retro = proy.pagoImss.meses;
      const semanasRetiro = perfil.semanas.cotizadas - perfil.semanas.descontadas + perfil.semanas.recuperadas + (recuperar ? recuperables : 0);
      return {
        prefill: {
          imss: Math.round(proy.pagoImss.total),
          gest: Math.round(proy.costos.gestorias),
          pension: Math.round(proy.conProyecto.pensionMensual),
          saldos: saldosLiquidos != null ? Math.round(saldosLiquidos) : Math.round(proy.efectivo.saldosDisponibles),
        },
        pension: Math.round(proy.conProyecto.pensionMensual),
        semanas_retiro: semanasRetiro,
      };
    } catch {
      return null;
    }
  };
  const sin = perfil.ley === 'Ley73' ? variante(false) : null;
  const con = perfil.ley === 'Ley73' && recuperables > 0 ? variante(true) : null;
  return { cliente, sin, con };
}
