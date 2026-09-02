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
export const ENGINE_VERSION = '2026.09.02.1';
