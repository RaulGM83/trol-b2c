// 276 · Carga lo necesario para la cotización inicial Infonavit de una persona (expediente y PNG).
import { parseSemillaV2 } from '@trol/pension-core/semilla';
import { t3, type Any } from '@/lib/trol3/server';
import { titularDesdeExpediente, extrasInfonavit } from './prefill';
import { armarCotizacionInicial, textoWhatsApp, SALDO_MIN_COTIZACION, type CotizacionInicial } from './cotizacion-inicial';
import type { Proyecto, SupuestosGlobales } from '@/components/trol3/AsesoriaInfonavit';

export type CargaCotizacion =
  | { ok: true; cot: CotizacionInicial; nombre: string; primerNombre: string | null; texto: string }
  | { ok: false; motivo: string };

/** 297 · Fecha de nacimiento codificada en la CURP (YYMMDD en 5-10; siglo por la posición 17). Null si no es válida. */
export function fechaNacimientoDeCurp(curp: string | null | undefined): string | null {
  const c = (curp ?? '').trim().toUpperCase();
  if (!/^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/.test(c)) return null;
  const siglo = /\d/.test(c.charAt(16)) ? 1900 : 2000;
  const y = siglo + Number(c.slice(4, 6)), m = Number(c.slice(6, 8)), d = Number(c.slice(8, 10));
  const f = new Date(Date.UTC(y, m - 1, d));
  if (f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d || f.getTime() > Date.now()) return null;
  return f.toISOString().slice(0, 10);
}

/** 297b · Año de nacimiento codificado en el NSS (dígitos 5-6), como 1-jul de ese año (±6 meses). Validado
 *  contra la CURP en 10,631 personas: 94% exacto, 98% a ±1 año. Sólo respaldo cuando no hay CURP válida. */
export function fechaNacimientoDeNss(nss: string | null | undefined): string | null {
  const n = (nss ?? '').replace(/\D/g, '');
  if (!/^\d{11}$/.test(n)) return null;
  const yy = Number(n.slice(4, 6));
  const corte = (new Date().getFullYear() - 15) % 100; // nadie cotiza antes de los ~15 años
  return `${yy > corte ? 1900 + yy : 2000 + yy}-07-01`;
}

export async function cargarCotizacionInicial(personaId: string, opts: { db?: Any; voz?: 'trol' | 'aliado' } = {}): Promise<CargaCotizacion> {
  // 281 · Los brokers la piden con la llave de servicio, sólo después de verificar que la persona es suya.
  const db = opts.db ?? t3();
  const [{ data: e }, { data: datos }, { data: sup }, { data: proys }, { data: rel }] = await Promise.all([
    db.from('v_expediente').select('*').eq('persona_id', personaId).maybeSingle(),
    db.from('v_mejor_dato').select('*').eq('persona_id', personaId),
    db.from('infonavit_supuestos').select('*').eq('id', 'default').maybeSingle(),
    db.from('proyectos_inmobiliarios').select('*').eq('disponible', true).order('clave'),
    db.from('datos').select('valor,obtenido_en').eq('persona_id', personaId).eq('campo', 'relacion_laboral_vigente')
      .eq('capa', 'validado').order('obtenido_en', { ascending: false }).limit(1),
  ]);
  if (!e) return { ok: false, motivo: 'Sin expediente' };
  if (e.saldo_infonavit_capa !== 'validado') return { ok: false, motivo: 'Falta la precalificación Infonavit (saldo validado)' };
  if (e.credito_infonavit === true) return { ok: false, motivo: 'Tiene crédito Infonavit vigente' };
  const relacion = ((rel ?? []) as Any[])[0]?.valor;
  const cotiza = relacion === true || (relacion !== false && e.status_empleo === 'empleado');
  if (!cotiza) return { ok: false, motivo: 'Infonavit no lo reporta con relación laboral vigente' };
  if (!sup) return { ok: false, motivo: 'Faltan los supuestos globales de Infonavit' };

  const map = new Map(((datos ?? []) as Any[]).map((d) => [d.campo, d]));
  const num = (c: string) => (map.get(c)?.valor == null ? null : Number(map.get(c)?.valor));
  // 297 · Preliminar sin historial del IMSS (Raúl, 4-nov): el salario ya sale del pago de la precalificación
  // (pago ÷ 30%; contra el SBC del IMSS da mediana 1.01 y 3 de 4 dentro de ±15%), el monto es el de Infonavit
  // y la edad sale de la CURP. Lo único que no sabemos es la ley: se asume 97 (sólo cambia qué pasa con el
  // saldo que no se use, y en la cotización inicial conserva_valor ya es 1). Al llegar Jordan se recalcula sola.
  const semilla = parseSemillaV2(map.get('semilla')?.valor);
  let fnac: string | null = e.fecha_nacimiento ?? fechaNacimientoDeCurp(e.curp);
  let edadPorNss = false;
  if (!fnac) {
    // 297b · CURP ausente o mal escrita: el año sale del NSS (Precalix sí entró con él).
    const { data: per } = await db.from('personas').select('nss').eq('id', personaId).maybeSingle();
    fnac = fechaNacimientoDeNss((per as Any)?.nss);
    edadPorNss = !!fnac;
  }
  const sinHistorial = !semilla && !e.ley;
  const base = titularDesdeExpediente({
    semilla,
    ley: e.ley ?? (sinHistorial ? 'Ley97' : null),
    fechaNacimiento: fnac,
    statusEmpleo: 'empleado',
    salarioDiario: num('salario_diario'),
    saldoInfonavit: e.saldo_infonavit == null ? null : Number(e.saldo_infonavit),
    saldoEsReportado: true,
    creditoVigente: false,
    mesesCotizandoDefault: Number((sup as Any).meses_cotizando_default ?? 60),
    ingresoRealMensual: num('ingreso_mensual'),
    deduccionesUsadas: num('deducciones_personales_anuales'),
    ...extrasInfonavit(map, e.curp),
  });
  // Ley 97 sin semilla no tiene conserva_valor proyectado: se toma 1 (la cotización es inicial).
  const bloquea = base.faltantes.filter((f) => f !== 'conserva_valor');
  if (bloquea.length) return { ok: false, motivo: `Faltan datos para calcular: ${bloquea.join(', ')}` };

  const cot = armarCotizacionInicial({
    titular: base.titular,
    proyectos: (proys ?? []) as Proyecto[],
    supuestos: sup as SupuestosGlobales,
    creditoMax: num('infonavit_monto_credito'),
    fechaSaldo: (map.get('saldo_infonavit')?.obtenido_en as string | undefined) ?? null,
    preliminar: sinHistorial || edadPorNss,
    edadPorNss,
  });
  if (Number(e.saldo_infonavit ?? 0) < SALDO_MIN_COTIZACION) return { ok: false, motivo: `Saldo menor a $${SALDO_MIN_COTIZACION.toLocaleString('es-MX')}` };
  if (!cot) {
    const tope = base.titular.credito_max;
    // 290b: lo mínimo que tendría que poner en efectivo (hasta $100,000), como alternativa al cotitular.
    const { data: op } = await db.from('oportunidades').select('efectivo_minimo').eq('persona_id', personaId).eq('codigo', 'compra_inmueble').maybeSingle();
    const ef = Number((op as Any)?.efectivo_minimo ?? 0);
    return { ok: false, motivo: tope
      ? `Solo con cotitular: con los $${Math.round(tope).toLocaleString('es-MX')} que le presta Infonavit ningún inmueble del catálogo le alcanza solo. Suma a otra persona que cotice (pareja, hijo o hija) para juntar créditos y saldos.${ef > 0 ? ` Alternativa: poner $${ef.toLocaleString('es-MX')} en efectivo.` : ''}`
      : 'Ningún inmueble del catálogo le queda (crédito mínimo o retención arriba del 30% de su salario)' };
  }
  const primerNombre = (e.nombre as string | null)?.trim().split(/\s+/)[0] ?? null;
  const pn = primerNombre ? primerNombre.charAt(0).toUpperCase() + primerNombre.slice(1).toLowerCase() : null;
  return {
    ok: true, cot,
    nombre: [e.nombre, e.apellidos].filter(Boolean).join(' ') || '(sin nombre)',
    primerNombre: pn,
    texto: textoWhatsApp(cot, pn, opts.voz ?? 'trol'),
  };
}
