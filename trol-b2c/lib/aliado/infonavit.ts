// 282 · Brokers Infonavit (claude/114): catálogo compartido entre la acción y la pantalla.
/** Documentos que el broker puede subir por su cliente (proceso Laureles, etapa Documentos). */
export const DOCS_INFONAVIT: { tipo: string; nombre: string; nota?: string }[] = [
  { tipo: 'identificacion', nombre: 'INE (ambos lados)' },
  { tipo: 'curp_doc', nombre: 'CURP' },
  { tipo: 'acta_nacimiento', nombre: 'Acta de nacimiento' },
  { tipo: 'acta_matrimonio', nombre: 'Acta de matrimonio', nota: 'si es casado(a)' },
  { tipo: 'constancia_fiscal', nombre: 'Constancia de situación fiscal' },
  { tipo: 'comprobante_domicilio', nombre: 'Comprobante de domicilio', nota: 'no mayor a 3 meses' },
  { tipo: 'recibo_nomina', nombre: 'Recibo de nómina' },
];


/** Las etapas que ve el broker, en orden (oportunidades.etapa_infonavit). */
export const ETAPAS_INFONAVIT: { clave: string; nombre: string }[] = [
  { clave: 'precalificado', nombre: 'Precalificado' },
  { clave: 'documentos', nombre: 'Documentos' },
  { clave: 'formatos', nombre: 'Formatos firmados' },
  { clave: 'en_infonavit', nombre: 'En Infonavit' },
  { clave: 'aviso_retencion', nombre: 'Aviso de retención' },
  { clave: 'escrituras', nombre: 'Escrituras' },
  { clave: 'entregado', nombre: 'Entregado' },
];
