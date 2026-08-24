export { ENGINE_VERSION } from './version';
export * from './types';
export * from './tablas';
export { computeLey73 } from './ley73';
export { computeLey97, conservaValorSSV } from './ley97';
export { computeTransicion } from './transicion';
export type { ResultadoTransicion } from './transicion';
export { computeProyectoMod40 } from './mod40-proyecto';
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
