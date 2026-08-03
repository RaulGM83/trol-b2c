// ============================================================================
// Lógica de diagnóstico B2C — consume el motor compartido @trol/pension-core.
// Espeja la lógica de la calculadora del portal (calculadora-client.tsx):
//   · "pensión hoy"      = retiro a la edad mínima, SIN estrategia (pct=0).
//   · "mejor jugada"     = la estrategia estrella del perfil.
//       - Ley 73 con Mod 40 → computeProyectoMod40 (pensión con/sin proyecto +
//         financiamiento real: crédito DXN + retroactivo → EFECTIVO NETO que
//         pone el cliente, no el bruto a pagar al IMSS).
//       - Ley 73 sin Mod 40 → recuperar semanas + cotizar al tope.
//       - Ley 97            → seguir aportando / PPR.
// Una sola fuente del cálculo: aquí NO se reimplementa nada, se orquesta.
// ============================================================================

import { computeLey73 } from '@trol/pension-core';
import { computeLey97 } from '@trol/pension-core';
import { computeTransicion } from '@trol/pension-core';
import { computeProyectoMod40 } from '@trol/pension-core';
import { parseSemillaV2, type SemillaV2 } from '@trol/pension-core/semilla';
import { UMA } from '@trol/pension-core/tablas';
import type {
  EntradaCalculo,
  EstatusPension,
  Palancas,
  RazonNegativa73,
  RazonNegativa97,
  SalidaNegativa97,
} from '@trol/pension-core/types';

export interface MejorJugada {
  titulo: string;
  /** Pensión base (mismo horizonte que la jugada). */
  de: number | null;
  /** Pensión con la jugada. */
  a: number | null;
  deltaMensual: number | null;
  /** Cuántas veces sube la pensión (×N). */
  multiplicador: number | null;
  /** Costo bruto del proyecto (a pagar al IMSS + despacho), si aplica. */
  costoProyecto: number | null;
  /** Efectivo NETO que pone el cliente tras crédito + retroactivo (negativo = de su bolsa). */
  efectivoCliente: number | null;
  /** true = el proyecto se cubre solo (saldos + crédito); false = pone dinero. */
  seAutofinancia: boolean;
  nota: string;
}

export interface DiagnosticoVM {
  nombre: string;
  ley: 'Ley73' | 'Ley97';
  edadActual: number;
  semanas: number;
  conservaDerechos: boolean;
  pensionHoy: number | null;
  escenarioMaximo: { monto: number | null; edad: number };
  mejorJugada: MejorJugada | null;
  /**
   * Estatus del escenario BASE ("tu pensión hoy"), vocabulario compartido
   * `escenario_base_status`. Cuando no es 'viable' el front NO debe pintar
   * campo de monto: la negativa es un resultado, no un dato que falte.
   */
  status: EstatusPension;
  /** Ley 97: razón y salida (Art. 154). */
  razon97: RazonNegativa97 | null;
  salida: SalidaNegativa97 | null;
  /** Ley 73: razón (semanas y/o conservación de derechos, Art. 150/151). */
  razon73: RazonNegativa73 | null;
  /** Ley 73: monto si el único obstáculo es la conservación y la reactiva. */
  pensionSiReactiva: number | null;
  /**
   * Régimen bajo el que se pensionaría. Un transición que perdió conservación
   * cae a 'Ley97' si alcanza el umbral de semanas de su año de retiro.
   */
  regimenEfectivo: 'Ley73' | 'Ley97' | 'ninguno';
  /** Ley 97: true si el escenario máximo SÍ alcanza (palanca: seguir cotizando). */
  reversibleCotizando: boolean;
}

const UMA_2026 = UMA[2026];
const SALARIO_25_UMA = 25 * UMA_2026; // 2933.75 — tope de cotización Mod 40
const EDAD_PROYECTO = 65; // horizonte estándar de la jugada (cesantía→vejez)

const money = (n: number) => '$' + Math.round(n).toLocaleString('es-MX');

function palancas(over: Partial<Palancas> = {}): Palancas {
  return {
    edadRetiro: 60,
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

function semanasRecuperables(perfil: SemillaV2['perfil']): number {
  return Math.max(0, perfil.semanas.descontadas - perfil.semanas.recuperadas);
}

export function buildDiagnostico(seed: unknown, hoy = new Date()): DiagnosticoVM {
  const semilla = parseSemillaV2(seed);
  if (!semilla) throw new Error('Semilla calculo_pensional v2 inválida o ausente');
  const { perfil, saldos, salario_60m } = semilla;
  const base = (p: Palancas): EntradaCalculo => ({ perfil, saldos, salario_60m, palancas: p, hoy });

  if (perfil.ley === 'Ley73') {
    // Pensión "hoy": retiro a la edad mínima, sin estrategia. Se resuelve por
    // transición: si perdió la conservación de derechos, la Ley 73 no está
    // disponible y la ruta que le queda es la Ley 97 con su saldo AFORE.
    const tHoy = computeTransicion(base(palancas({ edadRetiro: 60 })));
    const rHoy = tHoy.ley73;
    const edadActual = Math.floor(rHoy.detalle.edadActual);
    const pierdeConservacion = !!rHoy.razon?.pierdeConservacion;

    let mejorJugada: MejorJugada;
    let escenarioMaximoMonto: number | null;

    const proy = perfil.aplica_mod40 && !pierdeConservacion
      ? computeProyectoMod40(base(palancas({ edadRetiro: EDAD_PROYECTO, recuperarSemanasDescontadas: true })))
      : null;

    if (proy) {
      // Modalidad 40: marco realista con financiamiento.
      const seAutofinancia = proy.efectivo.resultado >= 0;
      escenarioMaximoMonto = proy.conProyecto.pensionMensual;
      mejorJugada = {
        titulo: 'Modalidad 40',
        de: proy.sinProyecto.pensionMensual,
        a: proy.conProyecto.pensionMensual,
        deltaMensual: Math.round(proy.conProyecto.pensionMensual - proy.sinProyecto.pensionMensual),
        multiplicador: proy.multiplicadorPension || null,
        costoProyecto: Math.round(proy.totalAPagar),
        efectivoCliente: Math.round(proy.efectivo.resultado),
        seAutofinancia,
        nota: seAutofinancia
          ? `El proyecto se financia solo: tus saldos y el crédito lo cubren (te quedan ~${money(Math.abs(proy.efectivo.resultado))} a favor). El nivel de cotización (UMAs) lo ajustas en la calculadora.`
          : `Tras crédito y retroactivo, pondrías ~${money(Math.abs(proy.efectivo.resultado))} de tu bolsa. Puedes bajar el costo cotizando a menos UMAs en la calculadora.`,
      };
    } else {
      // Sin Mod 40: recuperar semanas + cotizar al tope hasta 65. Cotizar
      // también REACTIVA los derechos perdidos (Art. 151), así que este mismo
      // escenario es la palanca para quien los perdió.
      const rMax = computeLey73(
        base(palancas({ edadRetiro: EDAD_PROYECTO, pctTiempoCotizando: 1, recuperarSemanasDescontadas: true })),
      );
      const recuperables = semanasRecuperables(perfil);
      escenarioMaximoMonto = rMax.pensionMensual;
      mejorJugada = {
        titulo: pierdeConservacion
          ? 'Reactivar tus derechos cotizando'
          : recuperables > 0
            ? 'Recuperar semanas y cotizar'
            : 'Seguir cotizando al tope',
        de: rHoy.pensionMensual,
        a: rMax.pensionMensual,
        deltaMensual:
          rHoy.pensionMensual != null && rMax.pensionMensual != null
            ? Math.round(rMax.pensionMensual - rHoy.pensionMensual)
            : null,
        multiplicador:
          rHoy.pensionMensual ? (rMax.pensionMensual ?? 0) / rHoy.pensionMensual : null,
        costoProyecto: Math.round(rMax.costoTotal),
        efectivoCliente: null,
        seAutofinancia: false,
        nota: pierdeConservacion
          ? `Volviendo a cotizar ${rHoy.razon!.semanasParaReactivar} semanas recuperas tus derechos de Ley 73, y si sigues hasta los ${EDAD_PROYECTO} cotizas al tope.`
          : recuperables > 0
            ? `Recuperas ${recuperables} semanas descontadas y cotizas hasta los ${EDAD_PROYECTO}.`
            : `Cotizas al tope (25 UMA) hasta los ${EDAD_PROYECTO}.`,
      };
    }

    return {
      nombre: perfil.nombre,
      ley: 'Ley73',
      edadActual,
      semanas: perfil.semanas.netas,
      conservaDerechos: perfil.conserva_derechos,
      // Si cayó a Ley 97 por perder conservación, el monto "hoy" es el de esa
      // ruta, no el de una Ley 73 que no está disponible.
      pensionHoy: tHoy.pensionMensual,
      escenarioMaximo: { monto: escenarioMaximoMonto, edad: EDAD_PROYECTO },
      mejorJugada,
      status: tHoy.status,
      razon97: tHoy.ley97Alterna?.razon ?? null,
      salida: tHoy.ley97Alterna?.salida ?? null,
      razon73: rHoy.razon,
      pensionSiReactiva: rHoy.pensionSiReactiva,
      regimenEfectivo: tHoy.regimenEfectivo,
      reversibleCotizando: escenarioMaximoMonto != null,
    };
  }

  // ---- Ley 97 ----
  const rHoy = computeLey97(base(palancas({ edadRetiro: 60 })));
  const rMax = computeLey97(
    base(palancas({ edadRetiro: EDAD_PROYECTO, pctTiempoCotizando: 1 })),
  );
  const edadActual = Math.floor(rHoy.detalle.edadActual);
  const de = rHoy.pensionAfore;
  const a = rMax.pensionAfore;

  // Con negativa en el escenario base, la jugada NO es "aporta más a tu AFORE":
  // más saldo no compra semanas. La palanca es seguir cotizando (Modalidad
  // 10/40) hasta alcanzar las que exige su año de retiro.
  const negativaHoy = rHoy.status === 'negativa';
  const reversibleCotizando = rMax.status === 'viable';
  const faltan = rHoy.razon?.semanasFaltantes ?? 0;

  const jugadaNegativa: MejorJugada = {
    titulo: reversibleCotizando
      ? 'Completar tus semanas (Modalidad 10 o 40)'
      : 'Revisar tu caso con un asesor',
    de,
    a,
    deltaMensual: null,
    multiplicador: null,
    costoProyecto: null,
    efectivoCliente: null,
    seAutofinancia: false,
    nota: reversibleCotizando
      ? `Hoy te faltan ${faltan.toLocaleString('es-MX')} semanas y el IMSS te negaría la pensión. Si sigues cotizando hasta los ${EDAD_PROYECTO} las completas y sí te pensionas: ahí es donde cambia tu caso.`
      : `Te faltan ${faltan.toLocaleString('es-MX')} semanas y, cotizando hasta los ${EDAD_PROYECTO}, todavía no alcanzarías el mínimo. Vale la pena revisar tu caso: puede haber semanas no reconocidas o periodos que sí cuentan.`,
  };

  return {
    nombre: perfil.nombre,
    ley: 'Ley97',
    edadActual,
    semanas: perfil.semanas.netas,
    conservaDerechos: perfil.conserva_derechos,
    pensionHoy: de,
    escenarioMaximo: { monto: a, edad: EDAD_PROYECTO },
    status: rHoy.status,
    razon97: rHoy.razon,
    salida: rHoy.salida,
    razon73: null,
    pensionSiReactiva: null,
    regimenEfectivo: rHoy.status === 'viable' ? 'Ley97' : 'ninguno',
    reversibleCotizando,
    mejorJugada: negativaHoy
      ? jugadaNegativa
      : {
          titulo: 'Seguir aportando (AFORE / PPR)',
          de,
          a,
          deltaMensual: de != null && a != null ? Math.round(a - de) : null,
          multiplicador: de ? (a ?? 0) / de : null,
          costoProyecto: null,
          efectivoCliente: null,
          seAutofinancia: false,
          nota: 'Asegúrate de estar en una de las mejores AFOREs y complementa tu pensión con ahorro (PPR).',
        },
  };
}

export type { SemillaV2 };
