// 276 · Carga lo necesario para la cotización inicial Infonavit de una persona (expediente y PNG).
import { parseSemillaV2 } from '@trol/pension-core/semilla';
import { t3, type Any } from '@/lib/trol3/server';
import { titularDesdeExpediente, extrasInfonavit } from './prefill';
import { armarCotizacionInicial, textoWhatsApp, SALDO_MIN_COTIZACION, type CotizacionInicial } from './cotizacion-inicial';
import type { Proyecto, SupuestosGlobales } from '@/components/trol3/AsesoriaInfonavit';

export type CargaCotizacion =
  | { ok: true; cot: CotizacionInicial; nombre: string; primerNombre: string | null; texto: string }
  | { ok: false; motivo: string };

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
  const base = titularDesdeExpediente({
    semilla: parseSemillaV2(map.get('semilla')?.valor),
    ley: e.ley ?? null,
    fechaNacimiento: e.fecha_nacimiento ?? null,
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
  });
  if (Number(e.saldo_infonavit ?? 0) < SALDO_MIN_COTIZACION) return { ok: false, motivo: `Saldo menor a $${SALDO_MIN_COTIZACION.toLocaleString('es-MX')}` };
  if (!cot) {
    const tope = base.titular.credito_max;
    return { ok: false, motivo: tope
      ? `Solo con cotitular: con los $${Math.round(tope).toLocaleString('es-MX')} que le presta Infonavit ningún inmueble del catálogo le alcanza solo. Suma a otra persona que cotice (pareja, hijo o hija) para juntar créditos y saldos.`
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
