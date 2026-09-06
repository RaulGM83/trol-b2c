// ============================================================================
// Los hechos del diagnóstico.
//
// Esta es la capa que NO se edita. Sale del expediente y de los escenarios que
// el asesor cerró, y es lo único que el redactor ve: si un número está mal, se
// corrige el dato —o se cierra otro escenario— pero no el documento.
//
// Cada cifra viaja con su capa (oficial · declarado · estimado). El reporte de
// una clienta real le atribuyó $1,486,491 de Infonavit cuando su expediente
// tenía $193,374 validado; marcar la procedencia es lo que hace visible ese
// tipo de discrepancia antes de imprimirla.
// ============================================================================

export type Capa = 'oficial' | 'declarado' | 'estimado' | 'desconocido';

/** Un número con su procedencia. `null` es "no lo sabemos", que no es cero. */
export type Dato = { valor: number | string | boolean | null; capa: Capa };

const dato = (valor: Dato['valor'], capa: Capa = 'oficial'): Dato => ({ valor, capa });

/** La capa de trol3 traducida a la que se le enseña al cliente. */
export function capaDe(capaTrol3: string | null | undefined): Capa {
  switch (capaTrol3) {
    case 'validado':
      return 'oficial';
    case 'declarado':
      return 'declarado';
    case 'calculado':
      return 'estimado';
    default:
      return 'desconocido';
  }
}

export type EscenarioCerrado = {
  id: string;
  tipo: string;
  creado_en: string;
  resumen: Record<string, unknown> | null;
  inputs: Record<string, unknown> | null;
  resultado: Record<string, unknown> | null;
};

/** Un renglón de `v_mejor_dato`: el mejor valor de un campo, con su capa. */
export type MejorDato = { campo: string; valor: unknown; capa?: string | null };

export type HechosDiagnostico = ReturnType<typeof construirHechos>;

/**
 * Arma los hechos que ve el redactor.
 *
 * Se le pasa el renglón del expediente tal como lo devuelve `v_expediente`, la
 * historia laboral y los escenarios cerrados. No recalcula nada: los números
 * del escenario mandan, porque son los que el asesor le enseñó al cliente.
 */
export function construirHechos({
  expediente,
  datos = [],
  historial,
  escenarios,
  issste,
}: {
  expediente: Record<string, any>;
  /** `v_mejor_dato` de esta persona. Varios campos que el documento cita viven
   *  SÓLO aquí y no en `v_expediente` — la última cotización, el salario
   *  promedio de 250 semanas, las semanas descontadas. Leerlos del expediente
   *  los mandaba al documento como null. */
  datos?: MejorDato[];
  historial: Array<{ desde?: string | null; hasta?: string | null; patron?: string | null }>;
  escenarios: EscenarioCerrado[];
  issste?: Record<string, any> | null;
}) {
  const e = expediente;
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

  const porCampo = new Map(datos.map((d) => [d.campo, d]));
  /** Un campo del expediente con la capa que trae, no una capa inventada. */
  const d = (campo: string): Dato => {
    const r = porCampo.get(campo);
    return { valor: (r?.valor as Dato['valor']) ?? null, capa: capaDe(r?.capa) };
  };
  const dNum = (campo: string): Dato => {
    const r = d(campo);
    return { valor: num(r.valor), capa: r.capa };
  };

  return {
    generado_en: new Date().toISOString(),

    cliente: {
      nombre: [e.nombre, e.apellidos].filter(Boolean).join(' ') || null,
      curp: e.curp ?? null,
      edad: num(e.edad),
      ley: e.ley ?? null,
      status_empleo: e.status_empleo ?? null,
    },

    // De dónde salió cada cosa. Va explícito para que el redactor pueda
    // matizar ("según tu último reporte oficial", "según lo que nos comentaste")
    // en vez de afirmar todo con la misma seguridad.
    procedencia: {
      imss_sisec: e.ley_en ?? null,
      saldo_infonavit: capaDe(e.saldo_infonavit_capa),
      nota:
        'oficial = viene del IMSS o del ISSSTE; declarado = lo dijo el cliente; estimado = lo calculamos nosotros.',
    },

    imss: {
      semanas_cotizadas: dato(num(e.semanas)),
      semanas_descontadas: dNum('semanas_descontadas'),
      semanas_recuperadas: dNum('semanas_recuperadas'),
      primera_cotizacion: d('primera_cotizacion'),
      ultima_cotizacion: d('ultima_cotizacion'),
      ultima_modalidad: d('ultima_modalidad'),
      meses_sin_cotizar: dNum('gap_meses'),
      salario_diario: dNum('salario_diario'),
      salario_promedio_250: dNum('salario_promedio_250'),
      conserva_derechos: dato(e.conserva_derechos ?? null),
      fin_conservacion: dato(e.fin_conservacion ?? null),
      pension_base: dato(num(e.pension_base), 'estimado'),
      mod40_aplica: dato(e.mod40_retro_aplica ?? null),
      // La ventana del art. 220 la corrige trol3 en el dato; `v_expediente`
      // todavía trae la del 219. Una sola verdad, y es la del dato.
      limite_mod40: d('limite_inscripcion_mod40').valor
        ? d('limite_inscripcion_mod40')
        : dato(e.limite_mod40 ?? null),
      pension_mod40_retro: dato(num(e.pension_mod40_retro), 'estimado'),
    },

    saldos: {
      afore: d('afore_actual'),
      afore_rcv97: dato(num(e.saldo_rcv97), 'oficial'),
      sar92: dNum('saldo_sar92'),
      infonavit: dato(num(e.saldo_infonavit), capaDe(e.saldo_infonavit_capa)),
      credito_infonavit_vigente: dato(e.credito_infonavit ?? null),
      ahorro_voluntario: dNum('ahorro_voluntario'),
      plan_corporativo: dNum('plan_corporativo'),
      otros_planes: dNum('otros_planes'),
    },

    issste: issste ?? null,

    historia_laboral: historial.slice(0, 30).map((h) => ({
      desde: h.desde ?? null,
      hasta: h.hasta ?? null,
      patron: h.patron ?? null,
    })),

    // Lo que el asesor CERRÓ con el cliente. Es la diferencia entre este
    // documento y el que se generaba solo desde la semilla.
    escenarios: escenarios.map((s) => ({
      id: s.id,
      calculadora: s.tipo.replace('calc_', ''),
      cerrado_en: s.creado_en,
      resumen: s.resumen ?? {},
      // Del resultado sólo lo que el redactor necesita para narrar; el bloque
      // completo se queda guardado en el escenario, no en el prompt.
      pension_total: num((s.resultado as any)?.pensionTotal),
      pension_cuenta_individual: num((s.resultado as any)?.pensionAforeInfonavit),
      en_pmg: (s.resultado as any)?.detalle?.enPmg ?? null,
      pmg: num((s.resultado as any)?.detalle?.pmg),
      destino_infonavit: (s.resultado as any)?.detalle?.destinoInfonavit ?? null,
      costo_rescate: num((s.resultado as any)?.detalle?.costoRescate),
      fuentes: ((s.resultado as any)?.fuentes ?? []).map((f: any) => ({
        fuente: f.id,
        capa: f.capa,
        saldo_al_retiro: f.saldoAlRetiro,
        aporta_al_mes: f.pensionMensual,
        absorbida_por_pmg: f.absorbidaPorPmg,
        incluida: f.incluida,
      })),
    })),
  };
}
