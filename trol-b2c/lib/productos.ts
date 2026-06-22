// ============================================================================
// Catálogo de productos propios B2C (Plan Maestro §6) — precios en MXN.
// Refleja `products` de Supabase: code, precio_mxn, etapa de progreso.
// Economía de puntos: ancla 1 punto = 1 peso de valor de desbloqueo.
// ============================================================================

export interface Producto {
  code: string;
  nombre: string;
  precioMXN: number;
  etapa: number; // etapa del modelo de progreso del cliente
  descripcion: string;
  entrega: string;
}

export const PRODUCTOS: Record<string, Producto> = {
  CALCULADORA_ADDON: {
    code: 'CALCULADORA_ADDON',
    nombre: 'Calculadora pro',
    precioMXN: 100,
    etapa: 4,
    descripcion:
      'Mueve las palancas (edad, semanas, Modalidad 40, UMAs) y ve tu pensión exacta en cada escenario. Incluye actualizar tu información con el IMSS si tiene más de un mes.',
    entrega: 'Acceso inmediato; si tus datos tienen más de un mes, los actualizamos al momento.',
  },
  DIAGNOSTICO_AVANZADO: {
    code: 'DIAGNOSTICO_AVANZADO',
    nombre: 'Diagnóstico avanzado',
    precioMXN: 500,
    etapa: 5,
    descripcion: 'Tu plan pensional completo: estrategia, costos, gestorías, Infonavit y ahorro, explicado paso a paso.',
    entrega: 'Documento personalizado en minutos.',
  },
  DIAGNOSTICO_AVANZADO_SESION: {
    code: 'DIAGNOSTICO_AVANZADO_SESION',
    nombre: 'Diagnóstico avanzado + sesión',
    precioMXN: 800,
    etapa: 5,
    descripcion: 'El diagnóstico avanzado más una videollamada 1:1 con un asesor para resolver tu caso.',
    entrega: 'Documento + sesión agendada.',
  },
};

export function getProducto(code: string | undefined): Producto {
  return (code && PRODUCTOS[code]) || PRODUCTOS.CALCULADORA_ADDON;
}

/** Cashback del 10% del valor al contratar (desde el primer producto). No aplica si se desbloqueó con puntos. */
export function cashbackPuntos(precioMXN: number): number {
  return Math.round(precioMXN * 0.1);
}
