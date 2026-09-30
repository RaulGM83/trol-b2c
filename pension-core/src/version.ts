// ============================================================================
// Versión del motor de cálculo.
//
// Se estampa en cada snapshot de escenario autorizado (`trol3.escenarios.inputs
// .motor_version`) para poder responder después una sola pregunta: ¿estos
// números los produjo el motor de hoy o uno viejo? Sin esto, un snapshot que ya
// no cuadra con un recálculo es indistinguible de un bug.
//
// **Súbela cuando cambien los NÚMEROS**: fórmulas, tablas (UMA, INPC, cuantías,
// URV, salario mínimo), reglas de negocio o el corte del retroactivo. NO hace
// falta subirla por comentarios, tipos, refactors ni copy de avisos.
//
// Formato: fecha del cambio + contador dentro del día, ordenable como string.
// ============================================================================

// 2026.08.24.2 — líneas de captura día a día: el retro se calcula con
// `lineasCapturaMod40` (prorrateo diario de los extremos, ancla en la fecha de
// TRÁMITE y serie INPC de `trol3.inpc_mensual`). Mueve el pago al IMSS y todo
// lo que cuelga de él. Ver `claude/21-lineas-captura-dia-a-dia-spec.md`.
// 2026.08.24.3 — se restaura el tope de 60 meses (art. 219) sobre el costo:
// `mesesMax` con default 60, conservando los meses MÁS RECIENTES. Sólo mueve
// números en tramos de más de 5 años. Decisión de Raúl.
// 2026.09.02.1 — la fecha de trámite y la edad dejan de ser variables
// independientes en el proyecto Mod 40: el trámite ES el retiro, con piso en el
// día que el cliente cumple 60. Las semanas y los meses que suben la pensión se
// derivan de los días que la línea de captura cobra (antes se medían hasta la
// fecha de retiro y el hueco sumaba gratis), y el promedio de 250 semanas se
// topa a 57 meses. Baja la pensión de todo el que no tenga 60 cumplidos y sube
// el costo de esos casos.
// 2026.09.02.2 — se unifica el motor: `trol-b2c/lib/imss` deja de existir y
// pension-core absorbe lo que solo vivía en el fork (`ajusteSemanas`,
// `overrides.disponibleAfore`, `retroactivoAlPensionarse` y los ROUND quitados
// de F10/F12/L12). Mueve los saldos y los valores totales del proyecto Mod 40
// para quien llamaba a pension-core; la app ya calculaba así.
// 2026.09.02.3 — `computeLey73` gana `fechaTramite`: el arranque del plan (la
// inscripción a Mod 40/10) se separa de `hoy`. La línea de captura cubre de la
// baja a esa fecha y la cotización futura corre de ahí al retiro, así que el
// hueco entre hoy y la inscripción ya no puede contarse dos veces. Omitirla
// deja el cálculo idéntico: los goldens no se movieron.
// 2026.09.06.1 — cuatro días de cambios que SÍ mueven números y que se
// quedaron sin subir la versión (se corrige aquí, al empezar a usar los
// snapshots de escenario en serio):
//   · Infonavit 0% real hacia adelante (antes 1% de premio).
//   · Cinco fuentes de ahorro con su propia tasa: AFORE 3%, plan corporativo
//     2%, otros planes 1%, vivienda 0%.
//   · El castigo del seguro de sobrevivencia (0.81) aplica SÓLO al RCV; antes
//     castigaba también a la subcuenta de vivienda.
//   · Rescate Infonavit: la vivienda puede salir de la cuenta individual al 3%
//     real, sin castigo y por encima de la mínima, con su costo cuando el saldo
//     de hoy no llega al piso sin costo.
//   · Mod 40 sin baja: el proyecto asume que deja de cotizar hoy.
// Un snapshot anterior a esta versión NO es comparable con uno de hoy.
// 2026.09.27.1 — saldo AFORE calibrado con 24 saldos reales (claude/89):
// contrafactual v1.9 y motor n8n v5.6 a la vez. Comisión sobre flujo antes de
// 2008, tope de Cesantía y Vejez 1997-2006, cuota social nueva desde 2023,
// retiros por desempleo cada 5 años dentro del hueco y residuo repartido,
// eventos del mismo día bien ordenados, tramos planos deflactados cuando el
// SISEC no trae modificaciones, SIN castigo plano de 10% y fugas 0.95 sobre
// RCV-97. Mueve los saldos RCV/SAR y todo lo de Ley 97 que cuelga de ellos.
// 2026.09.30.1 — regla de la fecha del derecho (espejo del motor n8n v5.7,
// claude/90): quien ya no cotiza y ya ganó su derecho (60 años, >500 semanas,
// conservación vigente) cobra el monto calculado a D —edad a D con la regla del
// .5, mínima garantizada del año de D— actualizado con los incrementos de
// febrero; el retroactivo suma cada mensualidad con el incremento de su mes.
// Sube la pensión "hoy" de los pensionables con derecho viejo (Sergio Durán
// 30,200 → 39,500; Beatriz Serrano 69,400 → 88,300) y la base "sin proyecto"
// del Mod 40 cuando D ya pasó. `reglaDerecho: false` reproduce el Excel.
// 2026.09.30.2 — mínima garantizada Ley 73 igual a la del motor n8n: 2025 =
// 9,412.98 (confirmada con la nómina IMSS de César, claude/90) y 2026 = 10,635
// (antes 9,415.69 y 10,600 del Excel). Decisión de Raul, 30-sep.
// 2026.09.30.3 — la regla del derecho se generaliza a todo 0 % de cotización:
// con Mod 40 retro (D = fecha de trámite), empleado que deja de cotizar (D = la
// baja) y derecho futuro (D = los 60). Esperar para pensionarse ya no sube el
// factor de edad; el retroactivo dice además cuántas mensualidades se pierden
// más allá de 12. Caso: Fernando Beltrán (BEMF660421), Raul 30-sep.
export const ENGINE_VERSION = '2026.09.30.3';

// ============================================================================
// Identidad de la implementación que produjo un snapshot.
//
// Hasta el 2-sep-2026 esto vivía en `trol-b2c/lib/imss/version.ts` porque había
// DOS implementaciones —pension-core y su fork— y el snapshot tenía que decir
// cuál corrió. Ya no: hay una sola. `MOTOR_ID` se queda porque los snapshots
// viejos traen 'trol-b2c/lib/imss' y hay que poder distinguirlos.
// ============================================================================

/** Implementación concreta que corrió. */
export const MOTOR_ID = 'pension-core';

/** Lo que se estampa en `trol3.escenarios.inputs.motor_version`. */
export const MOTOR_VERSION = `${MOTOR_ID}@${ENGINE_VERSION}`;
