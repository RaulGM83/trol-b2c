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

export const ENGINE_VERSION = '2026.08.24.1';
