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

/**
 * Un periodo de la historia laboral, como viene del SISEC.
 *
 * Los nombres son los que trae el dato (`empleador`, `fecha_inicio`…), no unos
 * bonitos: mapearlos a mano fue exactamente el error que dejó esta sección
 * inservible — dieciséis renglones de nulls y el modelo diciendo, con razón,
 * que no tenía el detalle de patrones.
 */
export type Periodo = {
  empleador?: string | null;
  registro_patronal?: string | null;
  entidad_federativa?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  salario_base?: number | string | null;
  // Tolerancia a otras fuentes: si algún día llega con otros nombres, se lee
  // igual en vez de salir en blanco sin avisar.
  patron?: string | null;
  desde?: string | null;
  hasta?: string | null;
};

const MAX_PERIODOS = 40;

const mes = (d: string | null | undefined) =>
  d && /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : null;

/** Meses enteros entre dos fechas ISO. Null si falta alguna. */
function mesesEntre(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b || !/^\d{4}-\d{2}-\d{2}/.test(a) || !/^\d{4}-\d{2}-\d{2}/.test(b)) return null;
  const d1 = new Date(a + 'T00:00:00');
  const d2 = new Date(b + 'T00:00:00');
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return null;
  return Math.round((d2.getTime() - d1.getTime()) / 86_400_000 / 30.44);
}

/**
 * La historia laboral leída, no sólo listada.
 *
 * El prompt le pide al redactor una LECTURA —huecos, continuidad, salario—, y
 * un modelo restando fechas a ojo se equivoca. Los huecos y los totales se
 * calculan aquí; allá sólo se narran.
 */
export function resumenHistorial(historial: Periodo[]) {
  const norm = (historial ?? []).map((h) => ({
    empleador: h.empleador ?? h.patron ?? null,
    registro_patronal: h.registro_patronal ?? null,
    entidad: h.entidad_federativa ?? null,
    desde: h.fecha_inicio ?? h.desde ?? null,
    hasta: h.fecha_fin ?? h.hasta ?? null,
    salario_base: h.salario_base == null ? null : Number(h.salario_base),
  }));

  // Sin nada legible se dice así, en vez de entregar una lista de nulls que
  // invita al modelo a rellenarla.
  const conAlgo = norm.filter((p) => p.empleador || p.desde);
  if (conAlgo.length === 0) {
    return {
      sin_detalle: true,
      nota: 'No tenemos el desglose de patrones y periodos de este cliente. No lo describas: di que hace falta pedir la constancia de semanas al IMSS.',
      periodos: [] as unknown[],
    };
  }

  // Del más viejo al más nuevo para poder medir los huecos entre uno y otro.
  const asc = [...conAlgo].sort((a, b) => (a.desde ?? '').localeCompare(b.desde ?? ''));

  const huecos: { desde: string; hasta: string; meses: number }[] = [];
  for (let i = 1; i < asc.length; i++) {
    const finAnterior = asc[i - 1].hasta;
    const inicio = asc[i].desde;
    const m = mesesEntre(finAnterior, inicio);
    // Un mes de brinco es cambio de trabajo, no un hueco que valga contar.
    if (m != null && m >= 2 && finAnterior && inicio) {
      huecos.push({ desde: finAnterior, hasta: inicio, meses: m });
    }
  }

  const vigente = asc.find((p) => !p.hasta) ?? null;
  const salarios = asc.map((p) => p.salario_base).filter((n): n is number => typeof n === 'number' && n > 0);
  const patrones = new Set(asc.map((p) => p.empleador).filter(Boolean));

  // El más reciente primero: es como se lee y como se narra.
  const desc = [...asc].reverse();
  const listados = desc.slice(0, MAX_PERIODOS);

  return {
    sin_detalle: false,
    periodos_totales: asc.length,
    patrones_distintos: patrones.size,
    primera_alta: asc[0]?.desde ?? null,
    ultima_baja: vigente ? null : (desc[0]?.hasta ?? null),
    sigue_cotizando_con: vigente?.empleador ?? null,
    // Los huecos son la mitad de la lectura: explican semanas que faltan.
    // El contador y la lista usan EL MISMO umbral: decir "3 huecos" y no
    // enseñar ninguno es pedirle al modelo que se los invente.
    huecos_mayores_a_un_mes: huecos.length,
    meses_sin_cotizar_entre_empleos: huecos.reduce((s, h) => s + h.meses, 0),
    hueco_mas_largo_meses: huecos.length ? Math.max(...huecos.map((h) => h.meses)) : 0,
    huecos: huecos.slice(-12).reverse(),
    huecos_no_listados: Math.max(0, huecos.length - 12),
    salario_base_mayor: salarios.length ? Math.max(...salarios) : null,
    salario_base_ultimo: desc[0]?.salario_base ?? null,
    truncado: asc.length > MAX_PERIODOS
      ? `Se listan los ${MAX_PERIODOS} más recientes de ${asc.length}. No digas que trabajó en ${MAX_PERIODOS} lugares.`
      : null,
    periodos: listados.map((p) => ({
      empleador: p.empleador,
      entidad: p.entidad,
      desde: mes(p.desde),
      hasta: p.hasta ? mes(p.hasta) : 'vigente',
      meses: mesesEntre(p.desde, p.hasta ?? new Date().toISOString().slice(0, 10)),
      salario_base_diario: p.salario_base,
    })),
  };
}

/**
 * Un plan de vivienda tal como lo necesita el documento (119).
 *
 * La lista es BLANCA a propósito, no un recorte de lo que sobraba: el resultado
 * de la asesoría trae `sobreprecio` y el proyecto trae `costo_aliado` y
 * `comision_desarrollador`. Volcar el bloque completo al prompt termina con el
 * margen impreso en el documento del cliente. Lo que no está aquí, no viaja.
 */
export type AsesoriaVivienda = {
  id: string;
  desarrollo?: string | null;
  zona?: string | null;
  m2?: number | null;
  avaluo?: number | string | null;
  horizonte?: number | null;
  credito?: number | string | null;
  pmt?: number | string | null;
  efectivo?: number | string | null;
  ventaja_corte?: number | string | null;
  renta_estimada?: number | string | null;
  cotitular_nombre?: string | null;
  lectura_salida?: string | null;
};

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
  vivienda,
}: {
  expediente: Record<string, any>;
  /** `v_mejor_dato` de esta persona. Varios campos que el documento cita viven
   *  SÓLO aquí y no en `v_expediente` — la última cotización, el salario
   *  promedio de 250 semanas, las semanas descontadas. Leerlos del expediente
   *  los mandaba al documento como null. */
  datos?: MejorDato[];
  historial: Periodo[];
  escenarios: EscenarioCerrado[];
  issste?: Record<string, any> | null;
  /** Los planes de vivienda que el asesor eligió incluir. Ya en lista blanca. */
  vivienda?: AsesoriaVivienda[] | null;
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

    // El plan de vivienda, cuando el asesor eligió incluirlo (119).
    //
    // Comprar la casa NO compite con la pensión: es el primer tiempo de la
    // misma estrategia. Al corte sale el efectivo, y ese efectivo es el que
    // puede irse al ahorro que sí levanta la pensión. Por eso los plazos del
    // plan no tienen que cuadrar con la edad de retiro del escenario — son dos
    // tramos, no dos versiones de lo mismo, y el redactor tiene que contarlo
    // encadenado y no como dos oportunidades sueltas.
    plan_vivienda: (vivienda ?? []).length
      ? {
          nota: 'Primer tiempo de la estrategia: se compra el inmueble usando la subcuenta de vivienda, y al corte el efectivo que sale puede pasar al ahorro que levanta la pensión. Narra SÓLO el plazo presentado; no sugieras otro.',
          planes: (vivienda ?? []).map((v) => ({
            desarrollo: v.desarrollo ?? null,
            zona: v.zona ?? null,
            m2: num(v.m2),
            avaluo: num(v.avaluo),
            plazo_meses: num(v.horizonte),
            credito: num(v.credito),
            pago_mensual: num(v.pmt),
            efectivo_al_corte: num(v.efectivo),
            ventaja_contra_no_hacerlo: num(v.ventaja_corte),
            renta_estimada_mensual: num(v.renta_estimada),
            cotitular: v.cotitular_nombre ?? null,
            lectura: v.lectura_salida ?? null,
          })),
        }
      : null,

    historia_laboral: resumenHistorial(historial),

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
