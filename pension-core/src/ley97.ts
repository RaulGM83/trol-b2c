// ============================================================================
// Motor Ley 97 — port fiel de la hoja "Calculadora 97" del Excel CALCULADORA.
// Proyección mensual de saldo AFORE (cuotas + rendimiento 3% real) y pensión
// por renta vitalicia (URV) contra la PMG. Celdas citadas en comentarios.
// ============================================================================

import {
  CESANTIA97_ANIOS,
  CESANTIA97_PCT,
  PMG97_ANIO_REFERENCIA,
  PMG97_GRUPOS,
  PMG97_SEMANAS_MINIMAS,
  UMA,
  URV,
} from './tablas';
import type {
  EntradaCalculo,
  CapaFuente,
  DestinoInfonavit,
  EstatusPension97,
  FuentePension,
  RazonNegativa97,
  ResultadoLey97,
  SalidaNegativa97,
} from './types';
import {
  addDias,
  addMeses,
  DIAS_ANIO,
  DIAS_ANIO_RETIRO,
  DIAS_MES_PENSION,
  diasDelMes,
  diasEntre,
  lookupAprox,
  parseISO,
  porAnio,
} from './util';

const RENDIMIENTO_REAL = 1.03; // AFORE/Siefore: rendimiento real anual de la proyección
// Subcuenta de vivienda: 0% REAL hacia adelante (regla de negocio, Raúl 5-sep-2026).
// El Infonavit ajusta el saldo en línea con la inflación (~4% nominal), así que en
// pesos de hoy no gana nada. Antes se proyectaba al mismo 3% real que la AFORE, lo
// que inflaba el saldo de vivienda y con él la pensión Ley 97 y el bloque IV de la
// asesoría Infonavit.
const RENDIMIENTO_REAL_INFONAVIT = 1.0;
// Vehículos fuera de la AFORE, con rendimiento real propio (regla de negocio,
// Raúl 5-sep-2026). Fijos a propósito: un solo criterio para toda la empresa.
const RENDIMIENTO_REAL_CORPORATIVO = 1.02; // plan de retiro de la empresa
const RENDIMIENTO_REAL_OTROS = 1.01; // PPR de aseguradora, fondos, cajas de ahorro
const MAX_MESES = 716; // filas 5:721
/**
 * Castigo actuarial al convertir saldo → renta vitalicia del IMSS.
 *
 * Sale del Excel validado y representa, a grandes rasgos, lo que se reserva
 * para el seguro de sobrevivencia. Lo paga todo lo que compra la renta del
 * IMSS: el RCV siempre, y la subcuenta de vivienda cuando se queda para la
 * pensión. Rescatada ya no lo paga, porque deja de comprar esa renta — y ésa
 * es una de las tres cosas que hacen valer el rescate, junto con el 3% real y
 * quedar por encima de la mínima garantizada.
 *
 * El ahorro voluntario y los planes privados nunca lo pagan.
 *
 * PENDIENTE (Raúl, 6-sep-2026): 0.81 es un promedio. El factor real depende de
 * si la persona tiene dependientes económicos y de su edad al pensionarse.
 * Modelarlo bien va junto con los beneficios fiscales del ahorro voluntario.
 */
const FACTOR_RETIRO = 0.81;
const CESANTIA_ANIO_TOPE = 2030;

function grupoPMG(ratio: number): number {
  return ratio < 2 ? 1 : ratio < 3 ? 2 : ratio < 4 ? 3 : ratio < 5 ? 4 : 5; // K8
}

function grupoCesantia(ratio: number): number {
  // K18 (sin el +1 del índice de fila de Excel): grupo 1..7
  return ratio < 1.5 ? 1 : ratio < 2 ? 2 : ratio < 2.5 ? 3 : ratio < 3 ? 4 : ratio < 3.5 ? 5 : ratio < 4 ? 6 : 7;
}

function cesantiaPct(grupo: number, anio: number): number {
  const a = Math.min(anio, CESANTIA_ANIO_TOPE);
  // HLOOKUP TRUE sobre años
  let idx = 0;
  CESANTIA97_ANIOS.forEach((y, i) => {
    if (y <= a) idx = i;
  });
  return CESANTIA97_PCT[grupo - 1][idx];
}

export function computeLey97(entrada: EntradaCalculo): ResultadoLey97 {
  const { perfil, saldos, palancas } = entrada;
  const hoy = entrada.hoy ?? new Date();
  const anioHoy = hoy.getUTCFullYear();

  const fnac = parseISO(perfil.fecha_nacimiento);
  const edadActual = diasEntre(fnac, hoy) / DIAS_ANIO; // D12
  const edadRetiro = Math.max(palancas.edadRetiro, Math.max(60, edadActual)); // C26
  const fechaRetiro = addDias(hoy, (edadRetiro - edadActual) * DIAS_ANIO_RETIRO - 1); // D27
  const pct = palancas.pctTiempoCotizando; // C29
  const salario = palancas.salarioMod40; // C31

  const sem = perfil.semanas;
  // K28: semanas para cálculo (+ descontadas si las recupera)
  const semanasCalculo =
    sem.cotizadas - sem.descontadas + sem.recuperadas +
    (palancas.recuperarSemanasDescontadas ? sem.descontadas - sem.recuperadas : 0);

  const mesesPasados = (sem.cotizadas * 7) / DIAS_MES_PENSION; // K3
  const mesesFuturos = (diasEntre(hoy, fechaRetiro) * pct) / DIAS_MES_PENSION; // K4
  const ratioPasado = perfil.ratio_historico_salario_uma; // K5
  const ratioFuturo = salario / porAnio(UMA, anioHoy - 1); // K6 (UMA del año previo, AI6)
  const ratioPonderado =
    (mesesPasados * ratioPasado + mesesFuturos * ratioFuturo) / (mesesPasados + mesesFuturos); // K7

  // ---- PMG (K8..K16) ----
  const grupo = grupoPMG(ratioPonderado);
  const [, pmgBase, extraAnio, extraSem] = PMG97_GRUPOS[grupo - 1]; // K9/K15/K13
  const semanasRetiro = ((semanasCalculo * 7) / DIAS_MES_PENSION + mesesFuturos) * (DIAS_MES_PENSION / 7); // K10
  const semanasMinimasPMG = porAnio(PMG97_SEMANAS_MINIMAS, fechaRetiro.getUTCFullYear()); // K11
  const bloquesExtra = Math.min(10, (semanasRetiro - semanasMinimasPMG) / 25); // K12
  const aniosExtra = Math.min(5, edadRetiro - 60); // K14
  const pmg =
    ((pmgBase + bloquesExtra * extraSem + aniosExtra * extraAnio) /
      porAnio(UMA, PMG97_ANIO_REFERENCIA)) *
    porAnio(UMA, anioHoy); // K16

  // ---- URV ----
  const fila = lookupAprox(edadRetiro, URV as Array<[number, number, number]>);
  const urv = perfil.sexo === 'H' ? fila[1] : fila[2]; // K17

  // ---- Proyección mensual de aportaciones (N..AC) ----
  const gCes = grupoCesantia(ratioFuturo); // K18 - 1
  const umaCuotaSocial = porAnio(UMA, anioHoy) * 4; // W: tope de cuota social
  const av = palancas.ahorroVoluntarioMensual; // C52
  const avCorp = palancas.planCorporativoMensual ?? 0;
  const avOtros = palancas.otrosPlanesMensual ?? 0;
  let aportacionesFV = 0; // SUM(Y)
  let infonavitFV = 0; // SUM(AA)
  // Las mismas aportaciones patronales, capitalizadas al 3%: es lo que valen
  // si el cliente las va rescatando conforme caen en vez de dejarlas al 0%.
  // Son más de la mitad del saldo de vivienda proyectado en un cliente que
  // sigue cotizando, así que no es un detalle.
  let infonavitRescatadoFV = 0;
  let ahorroVoluntarioFV = 0; // SUM(AC)
  let corporativoFV = 0;
  let otrosFV = 0;
  const meses: Date[] = [];
  for (let i = 1; i <= MAX_MESES; i++) {
    const n = addMeses(hoy, i);
    if (diasEntre(n, fechaRetiro) <= 0) break;
    meses.push(n);
  }
  // El countdown P del Excel deja en 0 el último mes de la serie (IFERROR del encadenado).
  const mesesActivos = meses.slice(0, Math.max(meses.length - 1, 0));
  mesesActivos.forEach((n) => {
    const dias = diasDelMes(n);
    const rMensual = salario * dias; // R
    const aporte =
      rMensual * 0.02 * pct + // S: retiro 2%
      (cesantiaPct(gCes, n.getUTCFullYear()) / 100) * rMensual * pct + // T: cesantía patrón
      rMensual * 0.01125 * pct + // U: cesantía empleado
      rMensual * 0.00225 * pct + // V: cesantía gobierno
      (salario < umaCuotaSocial ? 7 * dias : 0) * pct; // W: cuota social
    const aniosAlRetiro = diasEntre(n, fechaRetiro) / DIAS_ANIO;
    const fv = Math.pow(RENDIMIENTO_REAL, aniosAlRetiro);
    const fvInf = Math.pow(RENDIMIENTO_REAL_INFONAVIT, aniosAlRetiro);
    aportacionesFV += aporte * fv; // Y
    infonavitFV += rMensual * 0.05 * pct * fvInf; // Z→AA (0% real)
    infonavitRescatadoFV += rMensual * 0.05 * pct * fv; // el mismo flujo, al 3%
    ahorroVoluntarioFV += av * fv; // AB→AC
    corporativoFV += avCorp * Math.pow(RENDIMIENTO_REAL_CORPORATIVO, aniosAlRetiro);
    otrosFV += avOtros * Math.pow(RENDIMIENTO_REAL_OTROS, aniosAlRetiro);
  });

  // ---- Saldos proyectados (K19..K21 + fuentes fuera de la AFORE) ----
  // Cada fuente se capitaliza a SU tasa real: AFORE 3%, corporativo 2%, otros
  // 1%, vivienda 0% — salvo que se rescate, y entonces también 3%. `incluir` y
  // el destino de la vivienda son decisiones de la corrida y no se guardan.
  const inc = palancas.incluir ?? {};
  const anios = diasEntre(hoy, fechaRetiro) / DIAS_ANIO;
  const fvHoy = Math.pow(RENDIMIENTO_REAL, anios);
  const fvHoyInf = Math.pow(RENDIMIENTO_REAL_INFONAVIT, anios);
  const rcvBase = palancas.overrides?.rcv97 ?? saldos.rcv97; // K25
  const infBase = palancas.overrides?.infonavit ?? saldos.infonavit; // K26
  const avBase = palancas.overrides?.ahorroVoluntario ?? saldos.ahorro_voluntario; // K27
  const corpBase = palancas.overrides?.planCorporativo ?? 0;
  const otrosBase = palancas.overrides?.otrosPlanes ?? 0;

  const saldoAfore = (rcvBase * fvHoy + aportacionesFV) * ((inc.afore ?? true) ? 1 : 0); // K19

  // Los tres destinos de la subcuenta de vivienda. La casa manda sobre todo:
  // si el saldo está comprometido con un crédito no hay nada que rescatar.
  const usaCredito = palancas.usaCreditoInfonavit || saldos.credito_infonavit_vigente; // C45
  const destinoInfonavit: DestinoInfonavit = usaCredito
    ? 'vivienda'
    : palancas.rescatarInfonavit
      ? 'rescate'
      : 'pension';
  const rescataInfonavit = destinoInfonavit === 'rescate';
  const saldoInfonavit =
    destinoInfonavit === 'vivienda'
      ? 0
      : rescataInfonavit
        ? infBase * fvHoy + infonavitRescatadoFV // fuera de la cuenta individual, al 3%
        : infBase * fvHoyInf + infonavitFV; // K20 (0% real)
  const saldoAV =
    (avBase * fvHoy + ahorroVoluntarioFV) * ((inc.ahorroVoluntario ?? true) ? 1 : 0); // K21
  const saldoCorporativo =
    (corpBase * Math.pow(RENDIMIENTO_REAL_CORPORATIVO, anios) + corporativoFV) *
    ((inc.planCorporativo ?? true) ? 1 : 0);
  const saldoOtrosPlanes =
    (otrosBase * Math.pow(RENDIMIENTO_REAL_OTROS, anios) + otrosFV) *
    ((inc.otrosPlanes ?? true) ? 1 : 0);

  // ---- Pensiones (K22..K24) ----
  // Cada saldo se convierte a renta con la misma URV. Paga el castigo del
  // seguro de sobrevivencia lo que compra la renta del IMSS: el RCV siempre y
  // la vivienda mientras se quede para la pensión.
  const aRenta = (saldo: number) => saldo / urv / 12;
  const negativa = !(semanasRetiro > semanasMinimasPMG);

  const rentaRCV = aRenta(saldoAfore * FACTOR_RETIRO);
  const rentaInfonavit = aRenta(
    rescataInfonavit ? saldoInfonavit : saldoInfonavit * FACTOR_RETIRO,
  );
  // Lo que la cuenta individual da por sí sola, antes del piso. La vivienda
  // rescatada ya no está aquí: se fue arriba del piso.
  const rentaCuentaIndividual = rentaRCV + (rescataInfonavit ? 0 : rentaInfonavit);
  // El gobierno completa hasta la mínima garantizada. Con el piso puesto, cada
  // peso de vivienda le quita un peso al complemento: la pensión no se mueve.
  const complementoPmg = negativa ? 0 : Math.max(0, pmg - rentaCuentaIndividual);
  const enPmg = complementoPmg > 0;

  const pensionAfore = negativa ? null : Math.max(rentaRCV, pmg); // K22
  const pensionAforeInfonavit = negativa ? null : rentaCuentaIndividual + complementoPmg; // K23
  const rentaEncima =
    (rescataInfonavit ? rentaInfonavit : 0) +
    aRenta(saldoAV) +
    aRenta(saldoCorporativo) +
    aRenta(saldoOtrosPlanes);
  const pensionTotal = negativa ? null : pensionAforeInfonavit! + rentaEncima; // K24

  const fuentes: FuentePension[] = negativa
    ? []
    : [
        {
          id: 'rcv' as const,
          capa: 'cuenta_individual' as const,
          saldoAlRetiro: saldoAfore,
          pensionMensual: rentaRCV,
          absorbidaPorPmg: false,
          incluida: (palancas.incluir?.afore ?? true),
        },
        {
          id: 'infonavit' as const,
          capa: (rescataInfonavit ? 'encima' : 'cuenta_individual') as CapaFuente,
          saldoAlRetiro: saldoInfonavit,
          pensionMensual: rentaInfonavit,
          // Rescatada nunca la absorbe el piso: para eso se rescata.
          absorbidaPorPmg: !rescataInfonavit && enPmg && rentaInfonavit > 0,
          incluida: !usaCredito,
        },
        {
          id: 'complemento_pmg' as const,
          capa: 'cuenta_individual' as const,
          saldoAlRetiro: null,
          pensionMensual: complementoPmg,
          absorbidaPorPmg: false,
          incluida: true,
        },
        {
          id: 'ahorro_voluntario' as const,
          capa: 'encima' as const,
          saldoAlRetiro: saldoAV,
          pensionMensual: aRenta(saldoAV),
          absorbidaPorPmg: false,
          incluida: (palancas.incluir?.ahorroVoluntario ?? true),
        },
        {
          id: 'plan_corporativo' as const,
          capa: 'encima' as const,
          saldoAlRetiro: saldoCorporativo,
          pensionMensual: aRenta(saldoCorporativo),
          absorbidaPorPmg: false,
          incluida: (palancas.incluir?.planCorporativo ?? true),
        },
        {
          id: 'otros_planes' as const,
          capa: 'encima' as const,
          saldoAlRetiro: saldoOtrosPlanes,
          pensionMensual: aRenta(saldoOtrosPlanes),
          absorbidaPorPmg: false,
          incluida: (palancas.incluir?.otrosPlanes ?? true),
        },
      ];

  // La negativa es un RESULTADO, no un dato faltante: se acompaña de su razón
  // (semanas que tiene vs. las que exige su año de retiro) y de su salida
  // (Art. 154 LSS: retiro en una sola exhibición + devolución de vivienda).
  const status: EstatusPension97 = negativa ? 'negativa' : 'viable';
  // Las faltantes se derivan de las semanas YA REDONDEADAS que se muestran, no
  // del float: semanasRetiro pasa por meses y regresa (×7/30.4 ×30.4/7), y el
  // residuo hacía que "862 de 1,000" reportara 139 faltantes en vez de 138.
  const semanasAlRetiro = Math.round(semanasRetiro);
  const semanasFaltantes = Math.max(0, semanasMinimasPMG - semanasAlRetiro);
  const razon: RazonNegativa97 | null = negativa
    ? {
        anioRetiro: fechaRetiro.getUTCFullYear(),
        semanasActuales: Math.round(semanasCalculo),
        semanasAlRetiro,
        semanasRequeridas: semanasMinimasPMG,
        semanasFaltantes,
      }
    : null;
  const salida: SalidaNegativa97 | null = negativa
    ? {
        retiroUnaExhibicion: saldoAfore,
        devolucionVivienda: saldoInfonavit, // ya viene en 0 si hay crédito vigente
        ahorroVoluntario: saldoAV,
        planCorporativo: saldoCorporativo,
        otrosPlanes: saldoOtrosPlanes,
        total: saldoAfore + saldoInfonavit + saldoAV + saldoCorporativo + saldoOtrosPlanes,
        semanasFaltantes,
      }
    : null;

  return {
    ley: 'Ley97',
    pensionAfore,
    pensionAforeInfonavit,
    pensionTotal,
    status,
    negativa,
    razon,
    salida,
    detalle: {
      edadActual,
      fechaRetiro,
      semanasRetiro,
      semanasMinimasPMG,
      saldoAforeProyectado: saldoAfore,
      saldoInfonavitProyectado: saldoInfonavit,
      saldoAhorroVoluntario: saldoAV,
      saldoPlanCorporativo: saldoCorporativo,
      saldoOtrosPlanes: saldoOtrosPlanes,
      urv,
      pmg,
      aportacionesFuturas: aportacionesFV,
      destinoInfonavit,
      enPmg,
      complementoPmg,
    },
    fuentes,
  };
}

/**
 * Ley 97: qué proporción del saldo de la Subcuenta de Vivienda CONSERVA VALOR al pensionarse.
 *
 * El saldo se suma al AFORE y se convierte en pensión. Si la persona queda en Pensión Mínima
 * Garantizada, el sistema consume ese saldo pagando la pensión que de todos modos recibiría:
 * ahí el saldo no agrega nada y conviene rescatarlo antes (bloque IV de la asesoría Infonavit).
 *
 * 1 = lo conserva completo (está por encima de la PMG) · 0 = se consume entero.
 * Valores intermedios: sólo una parte del saldo la levanta por encima de la PMG.
 */
export function conservaValorSSV(r: ResultadoLey97): number {
  const { urv, saldoInfonavitProyectado: inf, saldoAforeProyectado: afore, pmg } = r.detalle;
  if (inf <= 0 || urv <= 0) return 1;
  // Aquí la vivienda SÍ está comprando la renta del IMSS —es justo el caso que
  // se está evaluando— así que paga el castigo como el RCV. Si se rescata deja
  // de pagarlo, pero entonces no hay nada que preguntarle a esta función.
  const bruto = (inf / urv) * FACTOR_RETIRO / 12; // lo que aportaría si no hubiera piso
  if (bruto <= 0) return 1;
  const sinInf = Math.max((afore / urv) * FACTOR_RETIRO / 12, pmg);
  const conInf = Math.max(((afore + inf) / urv) * FACTOR_RETIRO / 12, pmg);
  return Math.min(1, Math.max(0, (conInf - sinInf) / bruto));
}
