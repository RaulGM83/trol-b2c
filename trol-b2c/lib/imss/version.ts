// ============================================================================
// Identidad del motor que produjo un snapshot.
//
// ⚠ Lo importante de este archivo: `trol-b2c/lib/imss/` es un FORK de
// `pension-core/src/`. Han divergido en las dos direcciones — pension-core va
// adelante en el `status`/`razon` de Ley 73; esta copia va adelante en
// `ajusteSemanas`, `disponibleAfore` y el redondeo de saldos. Los proyectos
// Mod 40 de la app (Mesa Viraal y pestaña Calculadoras) los calcula ESTA copia,
// no pension-core.
//
// Por eso el snapshot guarda dos cosas y no una: la versión (única, importada
// de pension-core, que es la fuente de verdad del número de versión) y CUÁL de
// las dos implementaciones corrió. Guardar solo la versión sería mentir sobre
// qué código produjo los montos.
// ============================================================================

import { ENGINE_VERSION } from '@trol/pension-core';

export { ENGINE_VERSION };

/** Implementación concreta que corrió. Ver el comentario de arriba. */
export const MOTOR_ID = 'trol-b2c/lib/imss';

/** Lo que se estampa en `trol3.escenarios.inputs.motor_version`. */
export const MOTOR_VERSION = `${MOTOR_ID}@${ENGINE_VERSION}`;
