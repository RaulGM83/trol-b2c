// AFOREs vigentes en México (CONSAR, 2026). Fuente única para encuesta y comparador.
export const AFORES = [
  'Azteca',
  'Banorte',
  'Citibanamex',
  'Coppel',
  'Inbursa',
  'Invercap',
  'PensionISSSTE',
  'Principal',
  'Profuturo',
  'SURA',
] as const;

export type Afore = (typeof AFORES)[number];

export const PUNTOS_ENCUESTA = 50;

// Estados de México (para confirmar residencia / logística de gestoría).
export const ESTADOS_MX = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas', 'Chihuahua',
  'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México', 'Guanajuato',
  'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit', 'Nuevo León', 'Oaxaca',
  'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí', 'Sinaloa', 'Sonora', 'Tabasco',
  'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
] as const;

// Catálogos de prospección (value/label).
export const HORIZONTE_RETIRO = [
  { v: 'ya', l: 'Ya quiero / ya puedo' },
  { v: '1-2', l: 'En 1–2 años' },
  { v: '3-5', l: 'En 3–5 años' },
  { v: '5+', l: 'En más de 5 años' },
  { v: 'no_se', l: 'No estoy seguro' },
] as const;

export const SITUACION_LABORAL = [
  { v: 'empleado', l: 'Empleado formal (cotizo)' },
  { v: 'independiente', l: 'Independiente / negocio propio' },
  { v: 'desempleado', l: 'Sin empleo formal ahora' },
  { v: 'jubilado', l: 'Ya jubilado / pensionado' },
] as const;

export const AHORRO_MENSUAL = [
  { v: '0', l: 'Nada por ahora' },
  { v: '<500', l: 'Menos de $500' },
  { v: '500-1500', l: '$500 – $1,500' },
  { v: '1500-3000', l: '$1,500 – $3,000' },
  { v: '3000+', l: 'Más de $3,000' },
] as const;

export const CONTACTO_CANAL = [
  { v: 'whatsapp', l: 'WhatsApp' },
  { v: 'llamada', l: 'Llamada' },
] as const;

export const CONTACTO_HORARIO = [
  { v: 'manana', l: 'Mañana' },
  { v: 'tarde', l: 'Tarde' },
  { v: 'noche', l: 'Noche' },
] as const;

// ============================================================================
// IRN (Indicador de Rendimiento Neto) por SIEFORE Generacional — métrica oficial
// de CONSAR para comparar rendimientos. Cifras de referencia (corte reciente);
// el dato exacto cambia cada mes — confirmar/actualizar desde consar.gob.mx.
// El IRN varía por tu año de nacimiento, por eso se muestra por generación.
// ============================================================================
export type GeneracionKey = '90-94' | '85-89' | '80-84' | '75-79' | '70-74';

export const MEJORES_POR_GENERACION: Record<GeneracionKey, { rango: string; top: { afore: string; irn: number }[] }> = {
  '90-94': { rango: 'nacidos en 1990 o después', top: [{ afore: 'Profuturo', irn: 8.06 }, { afore: 'SURA', irn: 7.6 }, { afore: 'Inbursa', irn: 7.28 }] },
  '85-89': { rango: 'nacidos entre 1985 y 1989', top: [{ afore: 'Profuturo', irn: 8.0 }, { afore: 'SURA', irn: 7.55 }, { afore: 'Inbursa', irn: 7.22 }] },
  '80-84': { rango: 'nacidos entre 1980 y 1984', top: [{ afore: 'Profuturo', irn: 7.85 }, { afore: 'SURA', irn: 7.43 }, { afore: 'Citibanamex', irn: 7.15 }] },
  '75-79': { rango: 'nacidos entre 1975 y 1979', top: [{ afore: 'Profuturo', irn: 7.55 }, { afore: 'SURA', irn: 7.18 }, { afore: 'Citibanamex', irn: 6.85 }] },
  '70-74': { rango: 'nacidos antes de 1975', top: [{ afore: 'Profuturo', irn: 7.22 }, { afore: 'SURA', irn: 6.91 }, { afore: 'Citibanamex', irn: 6.27 }] },
};

export function generacionPorAnio(anio: number): GeneracionKey {
  if (anio >= 1990) return '90-94';
  if (anio >= 1985) return '85-89';
  if (anio >= 1980) return '80-84';
  if (anio >= 1975) return '75-79';
  return '70-74';
}
