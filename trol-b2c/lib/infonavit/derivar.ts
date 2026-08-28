// Deriva de una asesoría guardada todo lo que la narrativa y el detalle necesitan.
// Vive aparte de infonavit-pdf.tsx a propósito: la ruta del PNG (next/og) lo importa,
// y no debe arrastrar @react-pdf/renderer (500 en producción si lo hace).
import { calcularAsesoriaInfonavit } from '@trol/pension-core';
import type { Any } from '@/lib/trol3/server';

/** Todo lo que la narrativa y el detalle necesitan, derivado una sola vez. */
export function derivar(a: Any) {
  let r = (a.resultado ?? {}) as Any;
  const ent = (a.entrada ?? {}) as Any;
  const pal = ent.palancas ?? {};
  const sup = ent.supuestos ?? {};
  const inm = ent.inmueble ?? {};
  const h = Number(a.horizonte ?? r.veredicto?.mejor_horizonte);
  const aniosVenta = h / 12;
  // El corte de medición default es venta + 3 años, con piso de 5 años (max). Una asesoría
  // guardada con otro corte (p. ej. las previas al 28-ago, con 10) se re-deriva con el motor
  // sobre su entrada congelada, para que el documento mida "el después" en el plazo correcto.
  const corteObjetivo = Math.max(5, aniosVenta + 3);
  let corte = Number(pal.corte_anios ?? 10);
  if (Math.abs(corte - corteObjetivo) > 1e-9 && (ent.titulares ?? []).length && ent.inmueble) {
    try {
      r = calcularAsesoriaInfonavit({ titulares: ent.titulares }, ent.inmueble, sup, { ...pal, corte_anios: corteObjetivo }) as Any;
      corte = corteObjetivo;
    } catch { /* si el motor no puede (datos viejos), se queda lo guardado */ }
  }
  const op = r.operacion ?? {};
  const tabla: Any[] = r.tabla ?? [];
  const fila = tabla.find((f) => Number(f.horizonte) === h) ?? tabla[tabla.length - 1];
  const det = fila?.bloques?.detalle ?? {};
  const hoy = a.created_at ? new Date(a.created_at) : new Date();
  return {
    r, ent, op, pal, sup, inm, tabla, h, fila, det, hoy,
    ssvTotal: Number(op.saldo_apl ?? 0) + Number(op.remanente ?? 0),
    efectivo: Number(fila?.efectivo ?? 0),
    flujo: Number(op.flujo_mensual ?? 0),
    credito: Number(op.credito ?? 0),
    isrAnual: aniosVenta > 0 ? Number(det.isr_devuelto ?? 0) / aniosVenta : 0,
    aportaciones: Number(fila?.aportaciones_aplicadas ?? 0),
    rescate: Number(fila?.bloques?.IV_rescate ?? 0) > 0,
    notCliente: Number(op.not_cliente ?? 0),
    sobreprecio: Number(op.sobreprecio ?? 0),
    corte,
    aniosDespues: Math.max(corte - aniosVenta, 0),
    ventajaCorte: Number(fila?.ventaja_corte ?? 0),
    ventajaVenta: Number(fila?.ventaja_venta ?? 0),
    rentaNeta: Number(op.renta_neta ?? 0),
    rentaBruta: Number(inm.renta ?? 0),
    mantGestion: Math.max(Number(inm.renta ?? 0) - Number(op.renta_neta ?? 0), 0),
    pmt: Number(op.pmt ?? 0),
    desarrollo: ent.proyecto?.desarrollo ?? '',
    zona: ent.proyecto?.zona ?? '',
    rentaEstimada: Boolean(ent.proyecto?.renta_estimada),
    conyugal: ((ent.titulares ?? []) as Any[]).filter((t) => Number(t?.salario_imss ?? 0) > 0).length > 1,
    mejorH: Number(a.horizonte ?? r.veredicto?.mejor_horizonte),
  };
}
