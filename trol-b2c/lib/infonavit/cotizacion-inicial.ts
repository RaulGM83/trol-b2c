// 276 · Cotización inicial Infonavit (Raúl, 29-oct-2026): dos plazos (18 y 60 meses) listos para
// que el asesor los comparta por WhatsApp sin abrir la calculadora.
//
// Reglas:
//  · Sólo con saldo validado (Precalix/broker) y cotizando. Un titular, sin cotitular, con el
//    sobreprecio mínimo que pida cada inmueble y los supuestos globales.
//  · Fuera siempre: retención > 30% del salario. Saldo mínimo $100,000.
//  · SIN tope de "veces su saldo" (Raúl, 29-oct): hay situaciones muy variadas. Con saldo chico puede
//    ser estrategia si cotiza alto y lo sostiene varios años: las aportaciones abonan, deduce intereses
//    y el crédito trae seguro de vida; además puede unir su crédito con el de otra persona.
//  · 18 meses: el que le pide MENOS dinero al mes (pago − renta neta); empate → mayor ventaja.
//  · 60 meses: si hay OTRO inmueble viable, el de mayor potencial total (ventaja al corte) y que no sea
//    variante del mismo (misma ficha), para que se vean alternativas distintas (ej. Zumpango corto, Playa del
//    Carmen largo). Si no hay otro con ventaja positiva, el mismo inmueble a 60 meses.
//  · Se calcula al pintar (sigue al inventario y a los supuestos); al compartir se guarda la foto.
import { rankearInmuebles, FACTORES_DEFAULT, type FilaSugerencia } from './sugerencia';
import type { SupuestosInfonavit, TitularInfonavit } from '@trol/pension-core';
import type { Proyecto, SupuestosGlobales } from '@/components/trol3/AsesoriaInfonavit';

export const PLAZO_CORTO = 18;
export const PLAZO_LARGO = 60;
export const SALDO_MIN_COTIZACION = 100000;

export interface OpcionCotizacion {
  plazo: number;
  proyecto_id: string; desarrollo: string; zona: string | null; ficha_url: string | null;
  credito: number; pago: number; renta_neta: number;
  /** Lo que sale de su bolsa al mes: pago − renta neta (0 = la renta lo cubre). */
  pone_al_mes: number;
  recibe_al_vender: number;
  ventaja: number;
  criterio: 'menor_pago' | 'mayor_potencial' | 'mismo_inmueble';
}

export interface CotizacionInicial {
  saldo: number;
  credito_max: number | null;
  fecha_saldo: string | null;
  opciones: OpcionCotizacion[];
}

export function supuestosMotor(s: SupuestosGlobales): Partial<SupuestosInfonavit> {
  return {
    r_ssv: s.r_ssv, inflacion: s.inflacion, aport_patronal: s.aport_patronal,
    mantenimiento: s.mantenimiento, gestion: s.gestion, aplica_gestion: s.aplica_gestion,
    comision_venta: s.comision_venta, uma_mensual: s.uma_mensual,
    monto_max_credito: s.monto_max_credito, horizontes: s.horizontes,
    credito_minimo: Number(s.credito_minimo ?? 100000),
    base_plusvalia: s.base_plusvalia === 'avaluo' ? 'avaluo' : 'escrituracion',
  };
}

function opcion(f: FilaSugerencia, plazo: number, criterio: OpcionCotizacion['criterio']): OpcionCotizacion {
  return {
    plazo, proyecto_id: f.id, desarrollo: f.desarrollo, zona: f.zona, ficha_url: f.ficha_url,
    credito: f.credito, pago: f.pmt, renta_neta: f.renta_neta,
    pone_al_mes: Math.max(0, f.pmt - f.renta_neta),
    recibe_al_vender: f.recibe_dia, ventaja: f.ventaja, criterio,
  };
}

export function armarCotizacionInicial(a: {
  titular: TitularInfonavit;
  proyectos: Proyecto[];
  supuestos: SupuestosGlobales;
  creditoMax?: number | null;
  fechaSaldo?: string | null;
}): CotizacionInicial | null {
  const sup = supuestosMotor(a.supuestos);
  const creditoMin = Number(a.supuestos.credito_minimo ?? 100000);
  const reglas = {
    ...(a.supuestos.apalancamiento_max != null ? { apalancamiento_max: Number(a.supuestos.apalancamiento_max) } : {}),
    ...(a.supuestos.empate_min != null ? { empate_min: Number(a.supuestos.empate_min) } : {}),
    ...(a.supuestos.empate_pct != null ? { empate_pct: Number(a.supuestos.empate_pct) } : {}),
  };
  const factores = FACTORES_DEFAULT(a.titular.ingreso_real || a.titular.salario_imss || 0);
  const disponibles = a.proyectos.filter((p) => p.disponible);
  if (!disponibles.length || !(a.titular.ssv >= SALDO_MIN_COTIZACION)) return null;

  const corrida = (h: number): FilaSugerencia[] => {
    try {
      const s = rankearInmuebles({
        proyectos: disponibles, cliente: { titulares: [a.titular] }, supuestos: sup,
        palancas: { plusvalia: 0.06, alterno: a.supuestos.alterno, pct_deuda: 0, tasa_deuda: 0.2, corte_anios: Math.max(5, h / 12 + 3) },
        factores, creditoMin, horizonteElegido: h, horizonteFallback: null, reglas,
      });
      return s.filas.filter((f) => f.horizonte === h && !(f.meses_cotizando > 0 && f.pct_salario > 0.30));
    } catch { return []; }
  };

  const pone = (f: FilaSugerencia) => Math.max(0, f.pmt - f.renta_neta);
  const corto = corrida(PLAZO_CORTO).sort((x, y) => (pone(x) - pone(y)) || (y.ventaja - x.ventaja))[0];
  const filasLargo = corrida(PLAZO_LARGO);
  const opciones: OpcionCotizacion[] = [];
  if (corto) opciones.push(opcion(corto, PLAZO_CORTO, 'menor_pago'));
  // Alternativa de verdad: otro inmueble que no sea variante del mismo (Laureles PA/PB comparten ficha).
  const mismoProducto = (f: FilaSugerencia) => !!corto && (f.id === corto.id || (!!f.ficha_url && f.ficha_url === corto.ficha_url));
  const otro = filasLargo.filter((f) => !mismoProducto(f) && f.ventaja > 0).sort((x, y) => y.ventaja - x.ventaja)[0];
  if (otro) opciones.push(opcion(otro, PLAZO_LARGO, 'mayor_potencial'));
  else {
    const mismo = corto ? filasLargo.find((f) => f.id === corto.id) : [...filasLargo].sort((x, y) => y.ventaja - x.ventaja)[0];
    if (mismo) opciones.push(opcion(mismo, PLAZO_LARGO, corto ? 'mismo_inmueble' : 'mayor_potencial'));
  }
  if (!opciones.length) return null;
  return { saldo: a.titular.ssv, credito_max: a.creditoMax ?? null, fecha_saldo: a.fechaSaldo ?? null, opciones };
}

const miles = (n: number) => '$' + (Math.round(Math.abs(n) / 1000) * 1000).toLocaleString('es-MX');
const cientos = (n: number) => '$' + (Math.round(Math.abs(n) / 100) * 100).toLocaleString('es-MX');

/** El mensaje para copiar (texto aprobado por Raúl, 29-oct). Montos redondeados. */
export function textoWhatsApp(c: CotizacionInicial, primerNombre: string | null): string {
  const lineas: string[] = [];
  lineas.push(`Hola${primerNombre ? ' ' + primerNombre : ''}, ya tenemos tu precalificación de Infonavit: tu saldo de vivienda es de ${miles(c.saldo)}${c.credito_max ? ` y tu crédito llega a ${miles(c.credito_max)}` : ''}.`);
  lineas.push('');
  lineas.push(c.opciones.length > 1 ? 'Te comparto dos opciones para usarlo con un inmueble que se renta:' : 'Te comparto una opción para usarlo con un inmueble que se renta:');
  for (const o of c.opciones) {
    const lugar = `${o.desarrollo}${o.zona ? ` (${o.zona})` : ''}`;
    const pone = o.pone_al_mes > 0 ? `pones ${cientos(o.pone_al_mes)} al mes` : 'la renta cubre el pago';
    lineas.push(`• *Si vendes en ${o.plazo} meses* — ${lugar}: ${pone} y al vender recibes ${miles(o.recibe_al_vender)}.${o.ficha_url ? `\n  Ficha: ${o.ficha_url}` : ''}`);
  }
  lineas.push('');
  lineas.push('Funciona mejor si lo mantienes varios años: mientras cotizas tus aportaciones abonan al crédito, deduces intereses y el crédito trae seguro de vida. También puedes unir tu crédito con el de otra persona.');
  lineas.push('');
  lineas.push('Son cifras iniciales con supuestos de renta y plusvalía; las afinamos juntos. ¿Te late una llamada de 20 min esta semana?');
  return lineas.join('\n');
}
