// ============================================================================
// Estimación direccional SIN semilla (Plan Maestro §16, estado "sin-CURP").
// El usuario captura datos a mano y el MISMO motor @trol/pension-core calcula
// una pensión aproximada mientras llega su historial real del IMSS.
// Aproximaciones explícitas (salario constante, SM actual, sin saldos AFORE);
// el cálculo oficial usará el SISEC real.
// ============================================================================

import { computeLey73, computeLey97 } from '@trol/pension-core';
import { UMA, SALARIO_MINIMO } from '@trol/pension-core/tablas';
import type { EntradaCalculo, Palancas } from '@trol/pension-core/types';

export interface InputManual {
  anioNacimiento: number;
  anioPrimeraCotizacion: number;
  anioUltimaCotizacion: number;
  semanas: number;
  salarioMensual: number;
  sigueCotizando: boolean;
  /** Ley 97: saldos del estado de cuenta (opcionales; sin ellos no se estima). */
  saldoAfore?: number;
  saldoInfonavit?: number;
  /** Ley 97: incluir Infonavit en la pensión (default: no). */
  incluirInfonavit?: boolean;
}

export interface ConservacionVM {
  /** Sigue cotizando o aún dentro del periodo de conservación (Art. 150). */
  vigente: boolean;
  /** Año aproximado hasta el que conserva derechos (null si sigue cotizando). */
  finAnio: number | null;
  /** Semanas que debe re-cotizar para reactivar si los perdió (Art. 151). */
  semanasParaReactivar: number;
  titulo: string;
  detalle: string;
}

export interface EstimacionVM {
  ley: 'Ley73' | 'Ley97';
  computable: boolean; // Ley 97 no es estimable sin saldo AFORE
  edadActual: number;
  escenarios: { edad: number; pension: number | null }[];
  /** Semanas mínimas requeridas (500 Ley 73). */
  semanasMinimas: number;
  cumpleSemanas: boolean;
  conservacion: ConservacionVM;
  nota: string;
}

/**
 * Conservación de derechos (Art. 150 LSS): al causar baja, conserva los
 * derechos por 1/4 del tiempo cubierto por sus cotizaciones. Para reactivarlos
 * (Art. 151) según el tiempo transcurrido desde la baja.
 */
function calcularConservacion(inp: InputManual, anioHoy: number): ConservacionVM {
  if (inp.sigueCotizando) {
    return {
      vigente: true,
      finAnio: null,
      semanasParaReactivar: 0,
      titulo: 'Conservas tus derechos',
      detalle: 'Mientras sigas cotizando, tus semanas y derechos están vigentes.',
    };
  }
  const aniosConservacion = inp.semanas / 4 / 52; // 1/4 del tiempo cotizado
  const finAnio = Math.round(inp.anioUltimaCotizacion + aniosConservacion);
  const gap = anioHoy - inp.anioUltimaCotizacion;
  const vigente = anioHoy <= finAnio;

  if (vigente) {
    return {
      vigente: true,
      finAnio,
      semanasParaReactivar: 0,
      titulo: 'Conservas tus derechos',
      detalle: `Por tus ${inp.semanas.toLocaleString('es-MX')} semanas, los conservas aproximadamente hasta ${finAnio}. Si dejas pasar más tiempo, podrías perderlos.`,
    };
  }
  // Perdidos: reactivación según el tiempo desde la baja (Art. 151).
  const semanasParaReactivar = gap > 6 ? 52 : 26;
  return {
    vigente: false,
    finAnio,
    semanasParaReactivar,
    titulo: 'Tus derechos están suspendidos',
    detalle: `Tus semanas no se pierden, pero para usarlas necesitas reactivarlas cotizando ${semanasParaReactivar} semanas más (aprox. ${Math.round(semanasParaReactivar / 4)} meses). Te ayudamos con eso.`,
  };
}

const UMA_2026 = UMA[2026];
const TOPE_DIARIO = 25 * UMA_2026; // 25 UMA
const HOY = new Date(Date.UTC(2026, 5, 15));

export function estimarDireccional(inp: InputManual): EstimacionVM {
  const ley = inp.anioPrimeraCotizacion < 1997 ? 'Ley73' : 'Ley97';
  const edadActual = 2026 - inp.anioNacimiento;
  const salarioDiario = Math.min(inp.salarioMensual / 30.4, TOPE_DIARIO);
  const sm = SALARIO_MINIMO[2026];
  const conservacion = calcularConservacion(inp, 2026);
  const semanasMinimas = 500; // Ley 73

  const perfil = {
    nombre: '',
    curp: '',
    nss: '',
    sexo: 'H' as const, // no afecta el cálculo Ley 73; Ley 97 usa URV por sexo (aprox H)
    fecha_nacimiento: `${inp.anioNacimiento}-06-15`,
    ley,
    status_empleo: inp.sigueCotizando ? ('empleado' as const) : ('desempleado' as const),
    salario_diario_registrado: salarioDiario,
    salario_promedio_250: salarioDiario,
    ratio_historico_salario_uma: salarioDiario / UMA[2025],
    semanas: { cotizadas: inp.semanas, descontadas: 0, recuperadas: 0, netas: inp.semanas },
    fechas: {
      primera_cotizacion: `${inp.anioPrimeraCotizacion}-01-01`,
      ultima_cotizacion_valida: inp.sigueCotizando ? '2026-06-15' : `${inp.anioUltimaCotizacion}-06-15`,
      ultima_cotizacion_mod40: null,
      limite_inscripcion_mod40: null,
      fin_conservacion_derechos: null,
    },
    conserva_derechos: conservacion.vigente,
    aplica_mod40: false,
    gap_meses: 0,
  };
  const saldos = {
    rcv97: Math.max(0, inp.saldoAfore ?? 0),
    sar92: 0,
    infonavit: Math.max(0, inp.saldoInfonavit ?? 0),
    ahorro_voluntario: 0,
    credito_infonavit_vigente: false,
  };
  const salario_60m = Array.from({ length: 60 }, (_, i) => ({
    mes: i + 1,
    salario_diario: salarioDiario,
    salario_minimo: sm,
  }));

  const palancas = (edadRetiro: number): Palancas => ({
    edadRetiro,
    pctTiempoCotizando: inp.sigueCotizando ? 1 : 0,
    salarioMod40: salarioDiario,
    recuperarSemanasDescontadas: false,
    recuperarSemanasMod40Retro: false,
    salarioCotizacionRetro: 'MAXIMO',
    usaCreditoInfonavit: false,
    ahorroVoluntarioMensual: 0,
  });

  // ---- Ley 97: estima con el saldo AFORE (e Infonavit opcional) ----
  if (ley === 'Ley97') {
    if (!inp.saldoAfore || inp.saldoAfore <= 0) {
      return {
        ley,
        computable: false,
        edadActual,
        escenarios: [],
        semanasMinimas,
        cumpleSemanas: inp.semanas >= semanasMinimas,
        conservacion,
        nota: 'Eres Ley 97: tu pensión depende del saldo de tu AFORE. Escribe tu saldo de AFORE (y de Infonavit si quieres incluirlo) para ver una estimación.',
      };
    }
    const edades97 = [60, 61, 62, 63, 64, 65].filter((e) => e >= Math.min(60, Math.floor(edadActual)));
    const escenarios97 = edades97.map((edad) => {
      const r = computeLey97({ perfil, saldos, salario_60m, palancas: palancas(edad), hoy: HOY } as EntradaCalculo);
      const pension = inp.incluirInfonavit ? r.pensionAforeInfonavit : r.pensionAfore;
      return { edad, pension };
    });
    return {
      ley,
      computable: true,
      edadActual,
      escenarios: escenarios97,
      semanasMinimas,
      cumpleSemanas: inp.semanas >= semanasMinimas,
      conservacion,
      nota: 'Estimación con tu saldo de AFORE. El cálculo oficial usará tu historial real del IMSS (saldo, aportaciones y semanas exactas).',
    };
  }

  const edades = [60, 61, 62, 63, 64, 65].filter((e) => e >= Math.min(60, Math.floor(edadActual)));
  const escenarios = edades.map((edad) => {
    const r = computeLey73({ perfil, saldos, salario_60m, palancas: palancas(edad), hoy: HOY } as EntradaCalculo);
    return { edad, pension: r.pensionMensual };
  });

  return {
    ley: 'Ley73',
    computable: true,
    edadActual,
    escenarios,
    semanasMinimas,
    cumpleSemanas: inp.semanas >= semanasMinimas,
    conservacion,
    nota: 'Estimación direccional con los datos que capturaste. El cálculo oficial usará tu historial real del IMSS (semanas y salarios exactos).',
  };
}
