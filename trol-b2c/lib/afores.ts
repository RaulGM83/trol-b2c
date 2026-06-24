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
// SIEFOREs Básicas Generacionales de CONSAR (las que usa la tabla afore_irn).
export type GeneracionKey =
  | 'SB Inicial' | 'SB 95-99' | 'SB 90-94' | 'SB 85-89' | 'SB 80-84'
  | 'SB 75-79' | 'SB 70-74' | 'SB 65-69' | 'SB 60-64' | 'SB de Pensiones';

export function generacionPorAnio(anio: number): GeneracionKey {
  if (anio >= 2000) return 'SB Inicial';
  if (anio >= 1995) return 'SB 95-99';
  if (anio >= 1990) return 'SB 90-94';
  if (anio >= 1985) return 'SB 85-89';
  if (anio >= 1980) return 'SB 80-84';
  if (anio >= 1975) return 'SB 75-79';
  if (anio >= 1970) return 'SB 70-74';
  if (anio >= 1965) return 'SB 65-69';
  if (anio >= 1960) return 'SB 60-64';
  return 'SB de Pensiones';
}

export function rangoGeneracion(g: GeneracionKey): string {
  if (g === 'SB Inicial') return 'nacidos en 2000 o después';
  if (g === 'SB de Pensiones') return 'nacidos antes de 1960 / próximos a pensionarse';
  const m = g.match(/(\d{2})-(\d{2})/);
  if (m) return `nacidos entre 19${m[1]} y 19${m[2]}`;
  return g;
}
