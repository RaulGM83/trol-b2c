// ============================================================================
// Catálogo de productos propios B2C (Plan Maestro §6) — precios en MXN.
// Refleja `products` de Supabase: code, precio_mxn, etapa de progreso.
// Economía de puntos: ancla 1 punto = 1 peso de valor de desbloqueo.
// ============================================================================

export type TipoProducto = 'herramienta' | 'asesoria';

export interface Producto {
  code: string;
  nombre: string;
  precioMXN: number;
  etapa: number; // etapa del modelo de progreso del cliente
  tipo: TipoProducto;
  incluyeSesion?: boolean; // asesoría con videollamada 1:1
  descripcion: string;
  entrega: string;
}

export const PRODUCTOS: Record<string, Producto> = {
  ASESORIA_BASICA: {
    code: 'ASESORIA_BASICA',
    nombre: 'Asesoría básica',
    precioMXN: 0,
    etapa: 3,
    tipo: 'asesoria',
    descripcion:
      'Platica tu caso con un experto en pensiones por WhatsApp: qué significa tu diagnóstico y cuál es tu mejor siguiente paso. Sin costo.',
    entrega: 'Por WhatsApp, en horario hábil. Sin costo y sin compromiso.',
  },
  CALCULADORA_ADDON: {
    code: 'CALCULADORA_ADDON',
    nombre: 'Calculadora pro',
    precioMXN: 100,
    etapa: 4,
    tipo: 'herramienta',
    descripcion:
      'Mueve las palancas (edad, semanas, Modalidad 40, UMAs) y ve tu pensión exacta en cada escenario. Incluye actualizar tu información con el IMSS si tiene más de un mes.',
    entrega: 'Acceso inmediato; si tus datos tienen más de un mes, los actualizamos al momento.',
  },
  DIAGNOSTICO_AVANZADO: {
    code: 'DIAGNOSTICO_AVANZADO',
    nombre: 'Diagnóstico avanzado',
    precioMXN: 500,
    etapa: 5,
    tipo: 'asesoria',
    descripcion: 'Tu plan pensional completo: estrategia, costos, gestorías, Infonavit y ahorro, explicado paso a paso.',
    entrega: 'Documento personalizado en 2 días hábiles.',
  },
  DIAGNOSTICO_AVANZADO_SESION: {
    code: 'DIAGNOSTICO_AVANZADO_SESION',
    nombre: 'Diagnóstico avanzado + sesión',
    precioMXN: 800,
    etapa: 5,
    tipo: 'asesoria',
    incluyeSesion: true,
    descripcion: 'El diagnóstico avanzado más una videollamada 1:1 con un experto en pensiones para resolver tu caso.',
    entrega: 'Documento en 2 días hábiles + sesión agendada.',
  },
};

/** Productos de asesoría, en orden de oferta (escalera: gratis → $500 → $800). */
export const ASESORIAS: Producto[] = [
  PRODUCTOS.ASESORIA_BASICA,
  PRODUCTOS.DIAGNOSTICO_AVANZADO,
  PRODUCTOS.DIAGNOSTICO_AVANZADO_SESION,
];

export function getProducto(code: string | undefined): Producto {
  return (code && PRODUCTOS[code]) || PRODUCTOS.CALCULADORA_ADDON;
}

/** Cashback del 10% del valor al contratar (desde el primer producto). No aplica si se desbloqueó con puntos. */
export function cashbackPuntos(precioMXN: number): number {
  return Math.round(precioMXN * 0.1);
}

// ============================================================================
// Pago mixto (puntos + efectivo). Restricciones de Mercado Pago:
// - SPEI: monto mínimo $100 MXN → si el resto es menor, solo tarjeta.
// - Tarjeta: mínimo práctico ~$5 MXN → los puntos se capean para dejar resto >= $5.
// ============================================================================
export const SPEI_MINIMO_MXN = 100;
export const TARJETA_MINIMO_MXN = 5;

/** Puntos aplicables a un pago mixto y resto en efectivo resultante. */
export function calcularMixto(precioMXN: number, saldoPuntos: number): { puntos: number; resto: number; speiDisponible: boolean } {
  const puntos = Math.max(0, Math.min(saldoPuntos, precioMXN - TARJETA_MINIMO_MXN));
  const resto = precioMXN - puntos;
  return { puntos, resto, speiDisponible: resto >= SPEI_MINIMO_MXN };
}
