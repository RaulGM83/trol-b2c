// Prefill de la Mesa Viraal a partir de la semilla del cliente (B2B y B2C).
// Regla de negocio (Raúl, 17-ago-2026): el proyecto se autoriza "a día de hoy"
// (Mod40 retroactiva hoy), con la opción de recuperar las semanas descontadas
// por retiros por desempleo. Nombre, CURP, edad, semanas y salario acompañan al caso.
//
// 24-ago-2026: la fecha de trámite dejó de ser "hoy" a fuerza. El asesor la
// elige y todo se recalcula a esa fecha; la fecha elegida se congela en los
// `inputs` de la autorización.
import type { SerieINPC } from '@trol/pension-core/inpc';
import type { RegistroHistorialMod40 } from '@trol/pension-core/mod40-ventana';
import type { Palancas } from '@trol/pension-core/types';
import type { SemillaV2 } from '@trol/pension-core/semilla';
import { construirSnapshot, type SnapshotEscenario, type VentanaSnapshot } from '@/lib/viraal/snapshot';

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
  /**
   * Snapshot de ESTA variante. Es la misma corrida del motor que produjo el
   * prefill de arriba: al autorizar viaja tal cual a `trol3.escenarios`, sin
   * recalcular. Si se recalculara, el PDF y la fila podrían no coincidir.
   */
  snapshot: SnapshotEscenario;
}

export interface MesaViraalData {
  cliente: ClienteViraal;
  /** Fecha de inicio de trámite con la que se calcularon las variantes (ISO). */
  fechaTramite: string;
  /** Ventana de reingreso a esa fecha. null si no se pudo calcular el proyecto. */
  ventana: VentanaSnapshot | null;
  /** Avisos del motor: ventana, conservación, edad, retro parcial. */
  avisos: string[];
  /** Sin recuperar semanas descontadas. */
  sin: VarianteViraal | null;
  /** Recuperando semanas descontadas (null si no hay recuperables). */
  con: VarianteViraal | null;
}

export interface OpcionesMesaViraal {
  /** Historial laboral, para clasificar la última baja (art. 219 / 220 LSS). */
  historial?: RegistroHistorialMod40[] | null;
  /** `limite_inscripcion_mod40` del expediente: mejor dato que el cálculo local. */
  limiteInscripcionMod40?: string | null;
  /**
   * Serie INPC viva (`trol3.inpc_mensual`), que el servidor baja y pasa hasta
   * aquí. Sin ella el motor usa el fallback embebido, que puede ir un mes atrás
   * del INEGI: la línea saldría parecida, pero no sería la del día.
   */
  serieINPC?: SerieINPC;
}

const SALARIO_25_UMA = 2933.75; // tope Mod40
// El motor ya no lee `edadRetiro` en el proyecto Mod 40: la edad la deriva de la
// fecha de trámite (que es la de la pensión, con piso a los 60). La palanca se
// queda por compatibilidad de tipo y no mueve nada.
const EDAD_PROYECTO_HOY = 0;

/** Fecha (UTC) → 'YYYY-MM-DD', el formato que come un <input type="date">. */
export function isoFecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' → Date en UTC. Devuelve null si no es una fecha válida. */
export function parseFechaTramite(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

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

/**
 * El día en que cumple 60: el trámite no puede ser antes, porque este trámite
 * ES el de la pensión. Espejo de lo que hace `computeProyectoMod40`; aquí sirve
 * para que la mesa muestre la fecha con la que de verdad corrió el motor.
 */
export function fechaMinimaTramite(fechaNac: string | null | undefined): Date | null {
  if (!fechaNac) return null;
  const d = new Date(`${fechaNac.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear() + 60, d.getUTCMonth(), d.getUTCDate()));
}

function edadDe(fechaNac: string | null | undefined, en: Date): number | null {
  if (!fechaNac) return null;
  const d = new Date(fechaNac);
  if (Number.isNaN(d.getTime())) return null;
  let e = en.getUTCFullYear() - d.getUTCFullYear();
  const m = en.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && en.getUTCDate() < d.getUTCDate())) e--;
  return e;
}

/**
 * Calcula las dos variantes (sin/con recuperación de semanas) del proyecto Mod40
 * retroactivo a `fechaTramite` y arma el prefill de la mesa: línea IMSS, gestorías,
 * pensión y saldos.
 * `saldosLiquidos` (AFORE disponible + Infonavit) puede venir corregido por el asesor.
 */
export function mesaViraalDesdeSemilla(
  semilla: SemillaV2,
  saldosLiquidos: number | null,
  fechaTramite = new Date(),
  opts: OpcionesMesaViraal = {},
): MesaViraalData {
  const { perfil } = semilla;
  const recuperables = Math.max(0, perfil.semanas.descontadas - perfil.semanas.recuperadas);
  // Se recorre igual que en el motor, para que la edad y la fecha que ve el
  // asesor sean las del cálculo y no las que pidió.
  const minima = fechaMinimaTramite(perfil.fecha_nacimiento);
  const fecha = minima && fechaTramite < minima ? minima : fechaTramite;
  const cliente: ClienteViraal = {
    nombre: perfil.nombre,
    curp: perfil.curp,
    nss: perfil.nss,
    edad: edadDe(perfil.fecha_nacimiento, fecha),
    semanas_cotizadas: perfil.semanas.cotizadas,
    semanas_descontadas: perfil.semanas.descontadas,
    semanas_recuperadas: perfil.semanas.recuperadas,
    semanas_recuperables: recuperables,
    salario_diario: perfil.salario_diario_registrado,
    meses_retro: null,
    ley: perfil.ley,
    aplica_mod40: !!perfil.aplica_mod40,
  };
  let ventana: VentanaSnapshot | null = null;
  let avisos: string[] = [];
  const variante = (recuperar: boolean): VarianteViraal | null => {
    try {
      // Una sola corrida del motor por variante: de aquí salen el prefill que ve
      // el asesor Y el snapshot que se guarda al autorizar.
      const snapshot = construirSnapshot({
        semilla,
        historial: opts.historial ?? null,
        fechaTramite: fecha,
        limiteInscripcionMod40: opts.limiteInscripcionMod40 ?? null,
        serieINPC: opts.serieINPC,
        palancas: palancas({ recuperarSemanasDescontadas: recuperar }),
      });
      if (!snapshot) return null;
      const r = snapshot.resultado;
      if (cliente.meses_retro == null) cliente.meses_retro = r.pagoImss.meses;
      // Ventana y avisos no dependen de la variante: los toma la primera que corre.
      if (!ventana) {
        ventana = snapshot.ventana;
        avisos = snapshot.avisos;
      }
      const semanasRetiro = perfil.semanas.cotizadas - perfil.semanas.descontadas + perfil.semanas.recuperadas + (recuperar ? recuperables : 0);
      return {
        prefill: {
          imss: Math.round(r.pagoImss.total),
          gest: Math.round(r.costos.gestorias),
          pension: Math.round(r.conProyecto.pensionMensual),
          saldos: saldosLiquidos != null ? Math.round(saldosLiquidos) : Math.round(r.efectivo.saldosDisponibles),
        },
        pension: Math.round(r.conProyecto.pensionMensual),
        semanas_retiro: semanasRetiro,
        snapshot,
      };
    } catch {
      return null;
    }
  };
  const sin = perfil.ley === 'Ley73' ? variante(false) : null;
  const con = perfil.ley === 'Ley73' && recuperables > 0 ? variante(true) : null;
  return { cliente, fechaTramite: isoFecha(fecha), ventana, avisos, sin, con };
}
