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
export const ENGINE_VERSION = '2026.08.24.2';
