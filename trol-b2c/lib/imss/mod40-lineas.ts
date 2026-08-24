// ============================================================================
// Líneas de captura Mod 40 — RE-EXPORT, no un fork.
//
// El resto de `lib/imss` es un fork de pension-core que divergió a propósito en
// reglas de negocio (redondeos, disponible AFORE, ajuste de semanas). Esta
// pieza NO: es aritmética del IMSS validada contra líneas reales y tiene que
// ser bit a bit la misma en los dos lados, o la Mesa y la calculadora del
// portal cobrarían distinto por lo mismo. Vive sólo en pension-core.
// ============================================================================

export * from '@trol/pension-core/mod40-lineas';
