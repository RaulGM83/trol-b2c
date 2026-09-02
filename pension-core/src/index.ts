// ============================================================================
// @trol/pension-core — el ÚNICO motor de cálculo.
//
// Del 15-ago al 2-sep-2026 existió un fork en `trol-b2c/lib/imss/`. Divergió en
// las dos direcciones y la app terminó importando los dos a la vez: `/mi` y
// `/calculadora` usaban este paquete (con la conservación de derechos del art.
// 150/151 y el modelado de la negativa), mientras `/trabajo` y la Mesa Viraal
// usaban el fork (con `ajusteSemanas`, "disponible AFORE" y los ROUND quitados,
// pero SIN la conservación). Para la misma persona podían dar respuestas
// distintas, y de hecho lo hacían.
//
// El fork ya no existe. Si mañana hace falta una regla que solo aplique a una
// superficie, va como PARÁMETRO de entrada, no como copia del archivo.
// ============================================================================

export { ENGINE_VERSION, MOTOR_ID, MOTOR_VERSION } from './version';
export * from './types';
export * from './tablas';
export { computeLey73 } from './ley73';
export { computeLey97, conservaValorSSV } from './ley97';
export { computeTransicion } from './transicion';
export type { ResultadoTransicion } from './transicion';
export { computeProyectoMod40 } from './mod40-proyecto';
export {
  lineasCapturaMod40,
  mesesDelTramo,
  CUOTA_MOD40_POR_ANIO,
  TASA_RECARGOS_MENSUAL,
  MESES_MAX_ART219,
} from './mod40-lineas';
export type { EntradaLineasCaptura, LineasCapturaMod40, MesLineaCaptura } from './mod40-lineas';
export {
  INPC_MENSUAL,
  INPC_INDICES,
  INPC_PRIMER_MES_PROYECTADO,
  INPC_TASA_PROYECCION_MENSUAL,
  INPC_SEMILLA,
  claveINPC,
  inpcDe,
  serieINPCDesdeFilas,
  recortarSerieINPC,
} from './inpc';
export type { SerieINPC, PuntoINPC, LecturaINPC } from './inpc';
export type { EntradaProyecto } from './mod40-proyecto';
export { ventanaMod40, modalidadDeRegistro } from './mod40-ventana';
export type {
  VentanaMod40,
  OpcionesVentanaMod40,
  RegistroHistorialMod40,
  ModalidadUltimaCotizacion,
  PlazoVentanaMod40,
  EstadoVentanaMod40,
} from './mod40-ventana';
export * from './contrafactual';
export * from './tablas-contrafactual';
export { getHistoriaLaboral } from './historia-laboral';
export type { EmpleoHistorial } from './historia-laboral';
export * from './eventos-laborales';
export { calcular as calcularAsesoriaInfonavit, tasaInfonavit, sobreprecioMinimo, SUPUESTOS_DEFAULT as SUPUESTOS_INFONAVIT_DEFAULT, PALANCAS_DEFAULT as PALANCAS_INFONAVIT_DEFAULT, TASAS_INFONAVIT } from './infonavit-asesoria';
export type { TitularInfonavit, ClienteInfonavit, InmuebleInfonavit, SupuestosInfonavit, PalancasInfonavit, OperacionInfonavit, FilaHorizonte, ResultadoInfonavit } from './infonavit-asesoria';
