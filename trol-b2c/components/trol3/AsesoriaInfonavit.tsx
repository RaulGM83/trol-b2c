'use client';
// Pestaña de asesoría Infonavit: convertir el saldo de la Subcuenta de Vivienda en una
// inversión inmobiliaria antes del retiro, en vez de dejarlo al ~4% anual en Infonavit.
//
// Es la hoja `Asesoria` del Excel v4_2 hecha pantalla: selección de inmueble, palancas,
// la operación con sus señales, de dónde sale la ventaja (bloques I–IV), el valor de la
// liquidez, el veredicto, la sensibilidad y el PnL interno del aliado.
//
// Las señales NUNCA bloquean: son material de conversación, no un semáforo.
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { calcularAsesoriaInfonavit, sobreprecioMinimo } from '@trol/pension-core';
import { buscarCotitular, cargarCotitular, guardarAsesoriaInfonavit, archivarAsesoria, declararAsesor } from '@/app/trabajo/actions';
import { ETIQUETA_FALTANTE, type FaltanteInfonavit, DIAS_MES } from '@/lib/infonavit/prefill';
import type {
  ClienteInfonavit, InmuebleInfonavit, PalancasInfonavit, ResultadoInfonavit,
  SupuestosInfonavit, TitularInfonavit,
} from '@trol/pension-core';

export interface Proyecto {
  id: string; clave: number | null; desarrollo: string; zona: string | null; m2: number | null;
  avaluo: number; escrituracion: number; costo_aliado: number | null; renta: number;
  pct_excedente_constructora?: number | null;
  renta_estimada: boolean; plusvalia: number; plusvalia_validada: boolean;
  notariales_credito: number; notariales_adicionales: number; comision_desarrollador: number;
  aliado_cubre_notariales: boolean; disponible: boolean; notas: string | null;
}

export interface SupuestosGlobales {
  r_ssv: number; inflacion: number; aport_patronal: number; mantenimiento: number;
  gestion: number; aplica_gestion: boolean; comision_venta: number; alterno: number;
  base_plusvalia: string; uma_mensual: number; monto_max_credito: number;
  horizontes: number[]; meses_cotizando_default: number; saldo_min_asesoria: number;
  credito_minimo: number;
}

const mxn0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const money = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? '—' : mxn0.format(n));
const pct = (n: number | null | undefined, d = 1) => (n == null || !Number.isFinite(n) ? '—' : `${(n * 100).toFixed(d)}%`);

const card = 'rounded-2xl border border-line bg-white p-5';
const h2 = 'text-xs font-bold uppercase tracking-wide text-muted';
const inp = 'w-full rounded-lg border border-line px-2 py-1 text-sm';
const btn = 'rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-cream disabled:opacity-50';

/** Las notas de lectura del Excel: lo que el asesor necesita para defender el número. */
function Nota({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 rounded-lg bg-cream px-3 py-2 text-[11px] leading-relaxed text-muted">{children}</p>;
}

function Campo({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-muted">{label}</span>
      {children}
      {sub ? <span className="mt-0.5 block text-[10px] leading-tight text-muted">{sub}</span> : null}
    </label>
  );
}

function Num({ value, onChange, step = 1, sufijo }: { value: number; onChange: (n: number) => void; step?: number; sufijo?: string }) {
  return (
    <div className="flex items-center gap-1">
      <input type="number" step={step} value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))} className={inp} />
      {sufijo ? <span className="text-[11px] text-muted">{sufijo}</span> : null}
    </div>
  );
}

function Fila({ label, vals, fmt = money, negativo, indent, fuerte }: {
  label: string; vals: (number | null)[]; fmt?: (n: number | null | undefined) => string;
  negativo?: boolean; indent?: boolean; fuerte?: boolean;
}) {
  return (
    <tr className={fuerte ? 'font-bold' : ''}>
      <td className={`py-1 pr-3 ${indent ? 'pl-4 text-muted' : ''}`}>{label}</td>
      {vals.map((v, i) => (
        <td key={i} className={`py-1 text-right tabular-nums ${negativo && v != null && v < 0 ? 'text-red-700' : ''}`}>{fmt(v)}</td>
      ))}
    </tr>
  );
}

const ETIQUETA_SENAL: Record<string, string> = {
  credito_excede_monto_maximo: 'El crédito rebasa el monto máximo que autoriza Infonavit',
  retencion_arriba_30pct: 'La retención pasa del 30% del salario: Infonavit rara vez la autoriza',
};
function textoSenal(s: string): string {
  if (ETIQUETA_SENAL[s]) return ETIQUETA_SENAL[s];
  const [k, v] = s.split(':');
  const n = Number(v);
  if (k === 'desembolso_mensual') return `El cliente desembolsa ${money(n)} al mes (la renta no cubre la retención)`;
  if (k === 'notariales_cliente') return `${money(n)} de notariales adicionales que paga de contado al inicio`;
  if (k === 'edad_al_termino') return `Termina de pagar a los ${v} años — informativo, no bloquea`;
  return s;
}

export interface AsesoriaGuardada {
  id: string; created_at: string; mejor_horizonte: number | null; ventaja_corte: number | null;
  credito: number | null; desarrollo: string | null; miembro: string | null;
  cotitular_nombre: string | null; es_cotitular: boolean; nota: string | null;
  nombre: string | null; horizonte: number | null; efectivo: number | null;
}

type Origen = { salario: string; ssv: string; meses_cotizando: string; conserva_valor: string; ingreso_real: string };
type CotitularCliente = { personaId: string; nombre: string; origen: Origen; saldoCapa: string | null; creditoVigente: boolean | null };
type ModoCotitular = 'no' | 'cliente' | 'manual';
type Hallazgo = { id: string; nombre: string | null; apellidos: string | null; curp: string | null; edad: number | null; ley: string | null };
type R = { ok: boolean; error?: string; personas?: Hallazgo[]; id?: string } & Partial<CotitularCliente> & { titular?: TitularInfonavit };

export function AsesoriaInfonavit({ personaId, cliente, base, origen, saldo, proyectos, supuestos, historial, faltantes, desdeSemilla }: {
  personaId: string;
  /** Lo que hay que capturar antes de poder calcular. Vacío = listo. */
  faltantes: FaltanteInfonavit[];
  desdeSemilla: boolean;
  cliente: { nombre: string; ley: string; edad: number | null; cotiza: boolean; creditoVigente: boolean | null };
  base: TitularInfonavit;
  origen: Origen;
  saldo: { capa: string | null; estimado: number | null; vigente: boolean | null };
  proyectos: Proyecto[];
  supuestos: SupuestosGlobales;
  historial: AsesoriaGuardada[];
}) {
  const creditoMin = Number(supuestos.credito_minimo ?? 50000);
  const enCatalogo = proyectos.filter((p) => p.disponible);
  // Default: el inmueble que le genera el crédito más chico por encima del mínimo.
  // Crédito con sobreprecio 0 = escrituración + notariales del crédito − saldo; si no
  // llega al mínimo, el sobreprecio requerido lo deja exactamente en el mínimo.
  const [proyectoId, setProyectoId] = useState(() => {
    const ssv0 = base.ssv || 0;
    const porCredito = enCatalogo
      .filter((p) => sobreprecioMinimo(p, ssv0, creditoMin).viable)
      .map((p) => ({ id: p.id, credito: Math.max(p.escrituracion + p.notariales_credito - ssv0, creditoMin) }))
      .sort((a, b) => a.credito - b.credito);
    return porCredito[0]?.id ?? enCatalogo[0]?.id ?? '';
  });
  const [t1, setT1] = useState<TitularInfonavit>(base);
  const [modoCotitular, setModoCotitular] = useState<ModoCotitular>('no');
  const [q, setQ] = useState('');
  const [hallazgos, setHallazgos] = useState<Hallazgo[]>([]);
  const [cotitular, setCotitular] = useState<CotitularCliente | null>(null);
  const [buscando, buscar] = useTransition();
  const [guardando, guardar] = useTransition();
  const [nota, setNota] = useState('');
  // null = seguir la recomendación del motor. En cuanto el asesor elige, manda su elección:
  // el óptimo no siempre es lo que el cliente quiere, y el plazo se conversa.
  const [horizonteElegido, setHorizonteElegido] = useState<number | null>(null);
  const [nombre, setNombre] = useState('');
  const [nombreTocado, setNombreTocado] = useState(false);
  const [archivando, archivar] = useTransition();
  const [msgGuardar, setMsgGuardar] = useState<string | null>(null);
  const conCotitular = modoCotitular !== 'no';
  const [t2, setT2] = useState<TitularInfonavit>({
    regimen: 73, edad: 0, salario_imss: 0, ssv: 0,
    meses_cotizando: supuestos.meses_cotizando_default, ingreso_real: 0, deducciones_usadas: 0, conserva_valor: 1,
  });
  const [pal, setPal] = useState<PalancasInfonavit>({
    plusvalia: (enCatalogo.find((p) => p.id === proyectoId) ?? enCatalogo[0])?.plusvalia ?? 0.06,
    alterno: supuestos.alterno,
    pct_deuda: 0.2, tasa_deuda: 0.2, corte_anios: 5,
  });
  // false = el corte sigue el default venta + 3 años con piso de 5; el asesor puede fijarlo.
  const [corteTocado, setCorteTocado] = useState(false);
  const [verInterno, setVerInterno] = useState(false);
  // Escriturar por arriba del precio de venta, topado al avalúo. El diferencial se
  // le entrega al cliente en efectivo a la firma.
  const [sobreprecio, setSobreprecio] = useState(0);
  // Faltantes que el asesor resuelve aquí mismo, sin salir de la pestaña.
  const [sbcNuevo, setSbcNuevo] = useState('');
  const [pmgDecidida, setPmgDecidida] = useState(false);
  const [msgFalta, setMsgFalta] = useState<string | null>(null);
  const [resolviendo, resolver] = useTransition();
  const pendientes = faltantes.filter((f) => !(f === 'conserva_valor' && pmgDecidida));
  const [aliadoVende, setAliadoVende] = useState(true);
  const [aliadoRenta, setAliadoRenta] = useState(true);

  const setP = <K extends keyof PalancasInfonavit>(k: K, v: PalancasInfonavit[K]) => setPal((o) => ({ ...o, [k]: v }));
  const set1 = <K extends keyof TitularInfonavit>(k: K, v: TitularInfonavit[K]) => setT1((o) => ({ ...o, [k]: v }));
  const set2 = <K extends keyof TitularInfonavit>(k: K, v: TitularInfonavit[K]) => setT2((o) => ({ ...o, [k]: v }));

  const supMotor: Partial<SupuestosInfonavit> = useMemo(() => ({
    r_ssv: supuestos.r_ssv, inflacion: supuestos.inflacion, aport_patronal: supuestos.aport_patronal,
    mantenimiento: supuestos.mantenimiento, gestion: supuestos.gestion, aplica_gestion: supuestos.aplica_gestion,
    comision_venta: supuestos.comision_venta, uma_mensual: supuestos.uma_mensual,
    monto_max_credito: supuestos.monto_max_credito, horizontes: supuestos.horizontes,
    credito_minimo: Number(supuestos.credito_minimo ?? 50000),
    base_plusvalia: supuestos.base_plusvalia === 'avaluo' ? 'avaluo' : 'escrituracion',
  }), [supuestos]);

  const clienteMotor: ClienteInfonavit = { titulares: conCotitular ? [t1, t2] : [t1] };

  // No se puede comprar con la pura subcuenta: Infonavit siempre presta algo. Si ni
  // escriturando al avalúo queda el crédito mínimo, ese inmueble no le sirve a esta
  // persona y no se ofrece.
  const ssvTotal = clienteMotor.titulares.reduce((acc, x) => acc + (x.ssv || 0), 0);
  const disponibles = enCatalogo.filter((p) => sobreprecioMinimo(p, ssvTotal, creditoMin).viable);
  const proyecto = disponibles.find((p) => p.id === proyectoId) ?? disponibles[0] ?? null;
  // Cuánto hay que escriturar por arriba para que la operación exista.
  const minimo = proyecto ? sobreprecioMinimo(proyecto, ssvTotal, creditoMin) : null;
  const faltaSobreprecio = Boolean(minimo && sobreprecio < minimo.requerido);

  const inmueble: InmuebleInfonavit | null = proyecto && {
    avaluo: proyecto.avaluo, escrituracion: proyecto.escrituracion, costo_aliado: proyecto.costo_aliado ?? proyecto.escrituracion,
    renta: proyecto.renta, plusvalia: proyecto.plusvalia, notariales_credito: proyecto.notariales_credito,
    notariales_adicionales: proyecto.notariales_adicionales, comision_desarrollador: proyecto.comision_desarrollador,
    aliado_cubre_notariales: proyecto.aliado_cubre_notariales,
    sobreprecio,
  };

  // Horizonte de medición default: venta + 3 años, con piso de 5. La venta de referencia
  // sale de una corrida con corte fijo de 5 para que la recomendación no se retroalimente.
  const corteEfectivo = useMemo(() => {
    if (corteTocado) return pal.corte_anios;
    let venta = horizonteElegido;
    if (venta == null && inmueble) {
      try { venta = calcularAsesoriaInfonavit(clienteMotor, inmueble, supMotor, { ...pal, corte_anios: 5 }).veredicto.mejor_horizonte; }
      catch { venta = null; }
    }
    return venta == null ? 5 : Math.max(5, venta / 12 + 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corteTocado, horizonteElegido, proyectoId, t1, t2, conCotitular, pal, supMotor, sobreprecio]);
  const palEff: PalancasInfonavit = { ...pal, corte_anios: corteEfectivo };

  const { r, error } = useMemo(() => {
    if (!inmueble) return { r: null, error: null as string | null };
    try { return { r: calcularAsesoriaInfonavit(clienteMotor, inmueble, supMotor, palEff), error: null }; }
    catch (e) { return { r: null as ResultadoInfonavit | null, error: e instanceof Error ? e.message : 'Error de cálculo' }; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId, t1, t2, conCotitular, pal, corteEfectivo, supMotor, sobreprecio]);

  // Sensibilidad: la plusvalía es el supuesto que más mueve la conclusión y casi nunca
  // tiene respaldo de mercado. Ver la ventaja a varias plusvalías evita venderla como certeza.
  const sensibilidad = useMemo(() => {
    if (!inmueble) return null;
    const gs = [0, 0.02, 0.04, 0.06, 0.08, 0.10];
    return gs.map((g) => {
      try {
        const rr = calcularAsesoriaInfonavit(clienteMotor, inmueble, supMotor, { ...palEff, plusvalia: g });
        return { g, filas: rr.tabla.map((f) => ({ h: f.horizonte, ventaja: f.ventaja_corte, efectivo: f.efectivo })) };
      } catch { return { g, filas: [] }; }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proyectoId, t1, t2, conCotitular, pal, corteEfectivo, supMotor, sobreprecio]);

  if (!disponibles.length) {
    return (
      <section className={card}>
        <p className="text-sm">
          {enCatalogo.length === 0
            ? <>No hay inmuebles disponibles en el catálogo. Cárgalos en <b>Inmuebles</b> antes de armar una asesoría.</>
            : <>Con un saldo de <b>{money(ssvTotal)}</b> ninguno de los inmuebles del catálogo deja el crédito mínimo de {money(creditoMin)}, ni escriturando al avalúo. <b>No se puede comprar sólo con la subcuenta</b>: hace falta un inmueble más caro.</>}
        </p>
      </section>
    );
  }

  const hs = r?.tabla.map((f) => f.horizonte) ?? supuestos.horizontes;
  const sugerida = r ? r.tabla.find((f) => f.horizonte === r.veredicto.mejor_horizonte) ?? null : null;
  const elegida = r ? r.tabla.find((f) => f.horizonte === (horizonteElegido ?? r.veredicto.mejor_horizonte)) ?? sugerida : null;
  const horizonte = elegida?.horizonte ?? r?.veredicto.mejor_horizonte ?? null;
  const sigueSugerencia = horizonte === r?.veredicto.mejor_horizonte;
  // Default del nombre: a quien, donde y a cuanto tiempo. Con eso el historial se lee solo.
  const nombreSugerido = [
    cotitular ? `${cliente.nombre} y ${cotitular.nombre}` : cliente.nombre,
    proyecto?.desarrollo,
    horizonte ? `${horizonte} meses` : null,
  ].filter(Boolean).join(' · ');
  const saldoSinConfirmar = saldo.capa === 'calculado' || saldo.vigente === false;

  // PnL interno del aliado (hoja `Interno`). Nunca se comparte con el cliente.
  // Reglas 29-ago-2026: la comisión del desarrollador se paga sobre el COSTO ALIADO (no sobre
  // la escrituración), y del excedente sobre el costo interno la constructora puede retener
  // un porcentaje por inmueble (Laureles: 25%).
  const pnl = (() => {
    if (!r || !proyecto || !elegida) return null;
    const costoAliado = proyecto.costo_aliado ?? proyecto.escrituracion;
    const excedente = proyecto.escrituracion - costoAliado;
    const aConstructora = excedente * (proyecto.pct_excedente_constructora ?? 0);
    const margen = excedente - aConstructora;
    const comisionDesarrollador = costoAliado * proyecto.comision_desarrollador;
    const notarialesRegalados = proyecto.aliado_cubre_notariales ? proyecto.notariales_adicionales : 0;
    const inicio = margen + comisionDesarrollador - notarialesRegalados;
    const gestion = aliadoRenta ? proyecto.renta * supuestos.gestion * elegida.horizonte : 0;
    const reventa = aliadoVende ? -elegida.bloques.detalle.comision_venta : 0;
    return { excedente, aConstructora, margen, comisionDesarrollador, notarialesRegalados, inicio, gestion, reventa,
      total: inicio + gestion + reventa, sobreEscrituracion: (inicio + gestion + reventa) / proyecto.escrituracion };
  })();

  return (
    <div className="space-y-4">
      {/* ---------------- Cabecera ---------------- */}
      <section className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-extrabold">Asesoría Infonavit · {cliente.nombre}</h1>
            <p className="text-xs text-muted">
              {cliente.ley} · {cliente.edad ? `${cliente.edad} años` : 'edad desconocida'} ·{' '}
              {cliente.cotiza ? 'cotizando' : 'sin cotizar'} · saldo de vivienda {money(t1.ssv)}
              {cliente.creditoVigente ? ' · con crédito Infonavit vigente' : ''}
            </p>
          </div>
        </div>
        {saldoSinConfirmar && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            El saldo de {money(t1.ssv)} es <b>nuestro estimado</b>, no un dato de su cuenta. Sirve para ver si vale
            la pena la conversación; para <b>formalizar la propuesta</b> hay que pedirle el saldo real de mi cuenta Infonavit.
          </p>
        )}
        {cliente.creditoVigente && (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Aparece con un <b>crédito Infonavit vigente</b>: confirma que su subcuenta esté libre antes de avanzar.
          </p>
        )}
      </section>

      {pendientes.length > 0 ? (
        <section className={card}>
          <h2 className={h2}>Faltan datos para armar el escenario</h2>
          <p className="mt-1 text-xs text-muted">
            Este expediente no tiene consulta del IMSS, pero sí lo suficiente para el proyecto Infonavit.
            Captura lo que falta y la pestaña calcula igual.
          </p>
          <ul className="mt-3 space-y-3">
            {pendientes.map((f) => (
              <li key={f} className="rounded-xl border border-line p-3">
                <div className="text-sm font-semibold">{ETIQUETA_FALTANTE[f].titulo}</div>
                <p className="mt-0.5 text-[11px] text-muted">{ETIQUETA_FALTANTE[f].por_que}</p>

                {f === 'salario_diario' && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input value={sbcNuevo} onChange={(ev) => setSbcNuevo(ev.target.value)} inputMode="decimal"
                      placeholder="Salario diario ante el IMSS" className="w-56 rounded-lg border border-line px-2 py-1 text-sm" />
                    {Number(sbcNuevo) > 0 && (
                      <span className="text-xs text-muted">= {money(Number(sbcNuevo) * DIAS_MES)} al mes</span>
                    )}
                    <button disabled={resolviendo || !(Number(sbcNuevo) > 0)} className="rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      onClick={() => resolver(async () => {
                        const res = (await declararAsesor(personaId, 'salario_diario', Number(sbcNuevo), 'declarado')) as R;
                        setMsgFalta(res.ok ? null : res.error ?? 'error');
                      })}>Guardar en el expediente</button>
                  </div>
                )}

                {f === 'ley' && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(['Ley73', 'Ley97'] as const).map((l) => (
                      <button key={l} disabled={resolviendo} className={btn}
                        onClick={() => resolver(async () => {
                          const res = (await declararAsesor(personaId, 'ley', l, 'declarado')) as R;
                          setMsgFalta(res.ok ? null : res.error ?? 'error');
                        })}>{l === 'Ley73' ? 'Ley 73' : 'Ley 97'}</button>
                    ))}
                  </div>
                )}

                {f === 'fecha_nacimiento' && (
                  <p className="mt-2 text-xs text-muted">
                    Captúrala en <span className="font-semibold">Información</span>; desde ahí se guarda con su procedencia.
                  </p>
                )}

                {f === 'conserva_valor' && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button disabled={resolviendo} className={btn}
                      onClick={() => { set1('conserva_valor', 1); setPmgDecidida(true); }}>
                      Sí, la supera: conserva todo su saldo
                    </button>
                    <button disabled={resolviendo} className={btn}
                      onClick={() => { set1('conserva_valor', 0); setPmgDecidida(true); }}>
                      No, quedaría en PMG: el saldo se consumiría
                    </button>
                    <button disabled={resolviendo} className={btn}
                      onClick={() => { set1('conserva_valor', 0.5); setPmgDecidida(true); }}>
                      A caballo: ajusto el % a mano
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          {msgFalta && <p className="mt-2 text-xs text-red-600">{msgFalta}</p>}
        </section>
      ) : (
      <>
      {/* ---------------- Selección y palancas ---------------- */}
      <section className={card}>
        <h2 className={h2}>Selección y palancas</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Campo label="Inmueble" sub={proyecto?.zona ?? undefined}>
            <select value={proyectoId} onChange={(e) => { setProyectoId(e.target.value); setSobreprecio(0); const p = disponibles.find((x) => x.id === e.target.value); if (p) setP('plusvalia', p.plusvalia); }} className={inp}>
              {disponibles.map((p) => <option key={p.id} value={p.id}>{p.desarrollo}</option>)}
            </select>
          </Campo>
          <Campo label="Plusvalía anual del escenario" sub={proyecto && !proyecto.plusvalia_validada ? 'Sin respaldo de mercado: preséntalo como supuesto' : undefined}>
            <Num value={pal.plusvalia} step={0.005} onChange={(v) => setP('plusvalia', v)} sufijo={pct(pal.plusvalia)} />
          </Campo>
          <Campo label="Rendimiento alterno del cliente" sub="Su mejor uso realista del dinero: ésa es la vara honesta, no el 4% de Infonavit">
            <Num value={pal.alterno} step={0.005} onChange={(v) => setP('alterno', v)} sufijo={pct(pal.alterno)} />
          </Campo>
          <Campo label="% del efectivo que va a bajar deuda">
            <Num value={pal.pct_deuda} step={0.05} onChange={(v) => setP('pct_deuda', v)} sufijo={pct(pal.pct_deuda, 0)} />
          </Campo>
          <Campo label="Tasa promedio de esas deudas">
            <Num value={pal.tasa_deuda} step={0.01} onChange={(v) => setP('tasa_deuda', v)} sufijo={pct(pal.tasa_deuda, 0)} />
          </Campo>
          <Campo label="Horizonte de medición (años)">
            <Num value={corteEfectivo} onChange={(v) => { setCorteTocado(true); setP('corte_anios', v); }} sufijo="años" />
          </Campo>
        </div>
        {r && (
          <div className="mt-3 border-t border-line pt-3">
            <span className="text-[11px] font-semibold text-muted">Plazo de venta que vas a presentar</span>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
              {r.tabla.map((f) => {
                const activo = f.horizonte === horizonte;
                const esSugerido = f.horizonte === r.veredicto.mejor_horizonte;
                return (
                  <button key={f.horizonte} onClick={() => { setHorizonteElegido(f.horizonte); setNombreTocado(false); }}
                    className={`rounded-lg px-2.5 py-1 font-semibold ${activo ? 'bg-ink text-white' : 'border border-line bg-white hover:bg-cream'}`}>
                    {f.horizonte} meses{esSugerido ? <span className={activo ? ' text-lime' : ' text-muted'}> · sugerido</span> : null}
                  </button>
                );
              })}
              {!sigueSugerencia && (
                <button className="text-[11px] underline text-muted" onClick={() => { setHorizonteElegido(null); setNombreTocado(false); }}>volver al sugerido</button>
              )}
            </div>
            <p className="mt-1 text-[10px] text-muted">
              Manda en la propuesta, en el escenario resumido y en el PnL interno. El sugerido es el de mayor
              ventaja al corte; si el cliente tiene una fecha en mente, ésa pesa más.
            </p>
          </div>
        )}
        {proyecto && (
          <p className="mt-3 text-[11px] text-muted">
            Avalúo {money(proyecto.avaluo)} · escrituración {money(proyecto.escrituracion)} · renta {money(proyecto.renta)}
            {proyecto.renta_estimada ? <span className="text-amber-700"> (estimada, no observada)</span> : ' (observada en la zona)'} ·
            notariales del crédito {money(proyecto.notariales_credito)} · adicionales {money(proyecto.notariales_adicionales)}{' '}
            {proyecto.aliado_cubre_notariales ? '(los cubre el aliado)' : <span className="text-amber-700">(los paga el cliente de contado)</span>}
            {proyecto.notas ? <> · {proyecto.notas}</> : null}
          </p>
        )}
        {proyecto && proyecto.avaluo > proyecto.escrituracion && (
          <div className="mt-3 rounded-xl border border-line bg-cream/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-muted">
                Escriturar por arriba del precio de venta · tope {money(proyecto.avaluo - proyecto.escrituracion)} (el avalúo)
              </span>
              <span className="text-xs">
                Se le entregan <b>{money(sobreprecio)}</b> en efectivo a la firma
              </span>
            </div>
            <input type="range" min={0} max={proyecto.avaluo - proyecto.escrituracion} step={5000}
              value={sobreprecio} onChange={(ev) => setSobreprecio(Number(ev.target.value))}
              className="mt-2 w-full" />
            <p className="mt-1 text-[11px] text-muted">
              Entra más saldo de vivienda a la operación en vez de quedarse al {pct(supuestos.r_ssv, 0)} en Infonavit.
              Sube lo que se escritura y por tanto el crédito, la retención y los intereses;{' '}
              <b>no sube lo que el inmueble vale</b>: la plusvalía sigue corriendo sobre {money(proyecto.escrituracion)}.
            </p>
          </div>
        )}
        <Nota>
          El apalancamiento no es lineal: la plusvalía corre sobre el <b>100% del inmueble</b> todo el tiempo, mientras
          los intereses corren sólo sobre la deuda viva, que baja cada mes. Regla rápida: conviene más crédito cuando la
          plusvalía supera la tasa Infonavit neta del escudo fiscal (con 10.45% y marginal de 34%, ~6.9%).
        </Nota>
      </section>

      {/* ---------------- Datos del titular ---------------- */}
      <section className={card}>
        <h2 className={h2}>Datos del titular</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Campo label="Edad" sub="Define el plazo: MIN(30, 70 − edad)"><Num value={t1.edad} step={0.1} onChange={(v) => set1('edad', v)} /></Campo>
          <Campo label="Salario mensual IMSS" sub={origen.salario}><Num value={t1.salario_imss} step={100} onChange={(v) => set1('salario_imss', v)} /></Campo>
          <Campo label="Saldo de vivienda" sub={origen.ssv}><Num value={t1.ssv} step={1000} onChange={(v) => set1('ssv', v)} /></Campo>
          <Campo label="Meses que seguirá cotizando" sub={origen.meses_cotizando}><Num value={t1.meses_cotizando} onChange={(v) => set1('meses_cotizando', v)} /></Campo>
          <Campo label="Ingreso real mensual" sub={origen.ingreso_real}><Num value={t1.ingreso_real} step={1000} onChange={(v) => set1('ingreso_real', v)} /></Campo>
          <Campo label="Otras deducciones personales (anuales)" sub="Compiten por el mismo tope del 151-IV y bajan la devolución de ISR">
            <Num value={t1.deducciones_usadas} step={1000} onChange={(v) => set1('deducciones_usadas', v)} />
          </Campo>
          {t1.regimen === 97 && (
            <Campo label="% del saldo que conserva valor (Ley 97)" sub={origen.conserva_valor}>
              <Num value={t1.conserva_valor} step={0.05} onChange={(v) => set1('conserva_valor', v)} sufijo={pct(t1.conserva_valor, 0)} />
            </Campo>
          )}
        </div>
        <div className="mt-4 border-t border-line pt-3">
          <span className="text-[11px] font-semibold text-muted">Crédito conyugal · Infonavit suma el monto máximo de cada titular</span>
          <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
            {([['no', 'Sin cotitular'], ['cliente', 'Buscar entre clientes de Trol'], ['manual', 'Capturar a mano']] as [ModoCotitular, string][]).map(([k, l]) => (
              <button key={k} onClick={() => { setModoCotitular(k); if (k !== 'cliente') setCotitular(null); }}
                className={`rounded-lg px-2.5 py-1 font-semibold ${modoCotitular === k ? 'bg-ink text-white' : 'border border-line bg-white hover:bg-cream'}`}>{l}</button>
            ))}
          </div>
          {modoCotitular === 'cliente' && (
            <div className="mt-3">
              {cotitular ? (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-cream px-3 py-2 text-xs">
                  <b>{cotitular.nombre}</b>
                  <span className="text-muted">
                    saldo {cotitular.saldoCapa === 'declarado' || cotitular.saldoCapa === 'validado' ? 'reportado' : 'estimado'}
                    {cotitular.creditoVigente ? ' · con crédito vigente' : ''}
                  </span>
                  <button className="ml-auto rounded-lg border border-line bg-white px-2 py-0.5 font-semibold" onClick={() => { setCotitular(null); setHallazgos([]); }}>Quitar</button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <input value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Nombre o CURP del cónyuge" className="w-64 rounded-lg border border-line px-2 py-1 text-sm" />
                    <button disabled={buscando} className="rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                      onClick={() => buscar(async () => { const r = (await buscarCotitular(q)) as R; setHallazgos(r.ok ? (r.personas ?? []) : []); })}>Buscar</button>
                  </div>
                  {hallazgos.length > 0 && (
                    <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
                      {hallazgos.filter((h) => h.id !== personaId).map((h) => (
                        <li key={h.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                          <span>{[h.nombre, h.apellidos].filter(Boolean).join(' ')} <span className="text-muted">{h.curp ?? 'sin CURP'} · {h.edad ?? '—'} años · {h.ley ?? '—'}</span></span>
                          <button className="rounded-lg border border-line px-2 py-0.5 font-semibold hover:bg-cream" onClick={() => buscar(async () => {
                            const r = (await cargarCotitular(h.id)) as R;
                            if (!r.ok) return setMsgGuardar(r.error ?? 'error');
                            setCotitular({ personaId: h.id, nombre: r.nombre as string, origen: r.origen as Origen, saldoCapa: r.saldoCapa ?? null, creditoVigente: r.creditoVigente ?? null });
                            if (r.titular) setT2(r.titular);
                            setMsgGuardar(null);
                          })}>Usar</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        {conCotitular && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Campo label="Régimen del cotitular">
              <select value={t2.regimen} onChange={(e) => set2('regimen', Number(e.target.value))} className={inp}>
                <option value={73}>Ley 73</option><option value={97}>Ley 97</option>
              </select>
            </Campo>
            <Campo label="Edad" sub="En conyugal el plazo lo manda el de MAYOR edad"><Num value={t2.edad} step={0.1} onChange={(v) => set2('edad', v)} /></Campo>
            <Campo label="Salario mensual IMSS"><Num value={t2.salario_imss} step={100} onChange={(v) => set2('salario_imss', v)} /></Campo>
            <Campo label="Saldo de vivienda"><Num value={t2.ssv} step={1000} onChange={(v) => set2('ssv', v)} /></Campo>
            <Campo label="Meses que seguirá cotizando"><Num value={t2.meses_cotizando} onChange={(v) => set2('meses_cotizando', v)} /></Campo>
            <Campo label="Ingreso real mensual"><Num value={t2.ingreso_real} step={1000} onChange={(v) => set2('ingreso_real', v)} /></Campo>
            {t2.regimen === 97 && (
              <Campo label="% que conserva valor (Ley 97)"><Num value={t2.conserva_valor} step={0.05} onChange={(v) => set2('conserva_valor', v)} sufijo={pct(t2.conserva_valor, 0)} /></Campo>
            )}
          </div>
        )}
      </section>

      {faltaSobreprecio && minimo && (
        <section className="rounded-2xl border-2 border-amber-300 bg-amber-50/50 p-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-amber-800">No se puede comprar sólo con la subcuenta</h2>
          <p className="mt-2 text-sm">
            Su saldo de <b>{money(ssvTotal)}</b> alcanza para el inmueble completo, así que no quedaría crédito
            Infonavit y la operación no existe. Para que haya al menos {money(creditoMin)} de crédito hay que
            escriturar en <b>{money(minimo.escrituraMinima)}</b>: {money(minimo.requerido)} por arriba del precio de
            venta, que se le entregan en efectivo el día de la firma.
          </p>
          <button className="mt-3 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white"
            onClick={() => setSobreprecio(minimo.requerido)}>
            Escriturar en {money(minimo.escrituraMinima)}
          </button>
        </section>
      )}

      {error && (
        <section className={card}>
          <p className="text-sm text-red-700"><b>El cálculo no cuadra:</b> {error}</p>
          <p className="mt-1 text-xs text-muted">La verificación interna del motor debe dar cero siempre. Revisa los datos capturados; si persiste, es un error de cableado y hay que reportarlo.</p>
        </section>
      )}

      {!faltaSobreprecio && r && (
        <>
          {/* ---------------- La operación ---------------- */}
          <section className={card}>
            <h2 className={h2}>La operación</h2>
            <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Kpi label="Crédito Infonavit" v={money(r.operacion.credito)} sub={`de ${money(r.cliente_derivado.monto_max)} máximo`} />
              <Kpi label="Retención mensual" v={money(r.operacion.pmt)} sub={`${pct(r.operacion.pct_salario)} del salario`} />
              <Kpi label="Flujo mensual" v={money(r.operacion.flujo_mensual)} sub={r.operacion.flujo_mensual < 0 ? 'lo pone el cliente' : 'le sobra'} alerta={r.operacion.flujo_mensual < 0} />
              <Kpi label="Tasa y plazo" v={pct(r.cliente_derivado.tasa, 2)} sub={`${r.cliente_derivado.plazo.toFixed(1)} años`} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Mini label="Saldo aplicado" v={money(r.operacion.saldo_apl)} />
              <Mini label="Remanente en Infonavit" v={money(r.operacion.remanente)} />
              <Mini label="Renta neta" v={money(r.operacion.renta_neta)} />
              <Mini label="Se liquida el crédito" v={r.mes_liquida_credito ? `mes ${r.mes_liquida_credito}` : `> ${supuestos.horizontes[supuestos.horizontes.length - 1]} meses`} />
              {r.operacion.sobreprecio > 0 && <Mini label="Efectivo a la firma" v={money(r.operacion.sobreprecio)} />}
              {r.operacion.sobreprecio > 0 && <Mini label="Escriturado" v={money(r.operacion.esc)} />}
            </div>
            {r.senales.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {r.senales.map((s) => (
                  <li key={s} className="rounded-lg bg-cream px-2.5 py-1 text-[11px]">{textoSenal(s)}</li>
                ))}
              </ul>
            )}
            <Nota>
              El capital que la retención amortiza <b>no es un costo</b>: regresa peso por peso en el cheque de venta.
              La renta cuenta íntegra como ingreso y el único costo real del crédito son los intereses netos. Quién pone
              el efectivo cada mes es <b>liquidez, no valor</b>: eso lo responden las señales de arriba.
            </Nota>
          </section>

          {/* ---------------- Bloques I–IV ---------------- */}
          <section className={card}>
            <h2 className={h2}>De dónde sale la ventaja {horizonte ? <span className="normal-case text-muted">· plazo elegido: {horizonte} meses</span> : null}</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-[11px] uppercase text-muted">
                    <th className="py-1 text-left">Horizonte de venta (meses)</th>
                    {hs.map((h) => <th key={h} className="py-1 text-right">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <Fila fuerte label="I. Lo que produce el inmueble completo" vals={r.tabla.map((f) => f.bloques.I_inmueble)} negativo />
                  <Fila indent label="plusvalía sobre el 100% de la base" vals={r.tabla.map((f) => f.bloques.detalle.plusvalia_100)} />
                  <Fila indent label="descuento de compra" vals={r.tabla.map((f) => f.bloques.detalle.descuento)} />
                  <Fila indent label="renta neta acumulada" vals={r.tabla.map((f) => f.bloques.detalle.renta_acum)} />
                  <Fila indent label="comisión de venta" vals={r.tabla.map((f) => f.bloques.detalle.comision_venta)} negativo />
                  <Fila indent label="notariales del crédito (financiados)" vals={r.tabla.map((f) => f.bloques.detalle.notariales_credito)} negativo />
                  <Fila indent label="notariales a cargo del cliente" vals={r.tabla.map((f) => f.bloques.detalle.notariales_cliente)} negativo />
                  <Fila fuerte label="II. Costo neto de financiamiento" vals={r.tabla.map((f) => f.bloques.II_financiamiento)} negativo />
                  <Fila indent label="intereses sobre la deuda viva" vals={r.tabla.map((f) => f.bloques.detalle.intereses)} negativo />
                  <Fila indent label="devolución de ISR por intereses reales" vals={r.tabla.map((f) => f.bloques.detalle.isr_devuelto)} />
                  <Fila fuerte label="III. Lo que ese dinero ganaba en Infonavit" vals={r.tabla.map((f) => f.bloques.III_oportunidad)} negativo />
                  <Fila indent label="rendimiento del saldo aplicado" vals={r.tabla.map((f) => f.bloques.detalle.oportunidad_saldo)} negativo />
                  <Fila indent label="aportaciones netas" vals={r.tabla.map((f) => f.bloques.detalle.aportaciones_netas)} negativo />
                  <Fila fuerte label="IV. Saldo rescatado (Ley 97 bajo PMG)" vals={r.tabla.map((f) => f.bloques.IV_rescate)} />
                  {r.operacion.sobreprecio > 0 && (
                    <Fila fuerte label="V. Efectivo de la firma, a su rendimiento alterno" vals={r.tabla.map((f) => f.bloques.V_efectivo_firma)} />
                  )}
                  <tr className="border-t border-line"><td className="py-2 pr-3 font-bold">Ventaja del esquema a la venta</td>
                    {r.tabla.map((f) => <td key={f.horizonte} className={`py-2 text-right font-bold tabular-nums ${f.ventaja_venta < 0 ? 'text-red-700' : 'text-green-700'}`}>{money(f.ventaja_venta)}</td>)}
                  </tr>
                  <Fila label="Plusvalía de equilibrio (deja la ventaja en cero)" vals={r.tabla.map((f) => f.plusvalia_equilibrio)} fmt={(n) => pct(n, 2)} />
                  <Fila label="Rendimiento de conservar 12 meses más" vals={r.tabla.map((f) => f.rendimiento_conservar_12m)} fmt={(n) => pct(n, 1)} />
                </tbody>
              </table>
            </div>
            <Nota>
              Las aportaciones patronales <b>suman</b>: prepagan el crédito y evitan intereses a la tasa del cliente.
              Sólo se les resta el rendimiento SSV que dejan de devengar; como la tasa del crédito supera a la de la
              subcuenta, su efecto neto es positivo. El bloque IV es el caso en que, de no usarse, el sistema consumiría
              el saldo pagando la pensión que el cliente recibiría de todos modos (Ley 97 bajo PMG).
            </Nota>
          </section>

          {/* ---------------- Liquidez ---------------- */}
          <section className={card}>
            <h2 className={h2}>El valor de convertirlo en efectivo</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-line text-[11px] uppercase text-muted">
                    <th className="py-1 text-left">Horizonte de venta (meses)</th>
                    {hs.map((h) => <th key={h} className="py-1 text-right">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <Fila label="Recibe el día de la venta" vals={r.tabla.map((f) => f.recibe_dia)} fuerte />
                  <Fila indent label="venta estimada, neta de comisión" vals={r.tabla.map((f) => f.venta_estimada - f.comision_venta_total)} />
                  <Fila indent label="menos saldo del crédito ese día" vals={r.tabla.map((f) => -f.saldo_credito)} />
                  <Fila label="Neto de todo el periodo (día + rentas + ISR)" vals={r.tabla.map((f) => f.efectivo)} />
                  <Fila indent label="a bajar deuda" vals={r.tabla.map((f) => Math.max(0, f.efectivo) * pal.pct_deuda)} />
                  <Fila indent label="al rendimiento alterno" vals={r.tabla.map((f) => Math.max(0, f.efectivo) * (1 - pal.pct_deuda))} />
                  <Fila label="Valor adicional de la liquidez" vals={r.tabla.map((f) => f.valor_liquidez)} />
                  <tr className="border-t border-line">
                    <td className="py-2 pr-3 font-bold">Ventaja total al corte de {corteEfectivo} años</td>
                    {r.tabla.map((f) => <td key={f.horizonte} className={`py-2 text-right font-bold tabular-nums ${f.ventaja_corte < 0 ? 'text-red-700' : 'text-green-700'}`}>{money(f.ventaja_corte)}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted">
              Si nunca hace nada, su saldo y aportaciones en Infonavit valdrían <b>{money(r.contrafactual_corte)}</b> al
              corte de {corteEfectivo} años. Tasa de reinversión combinada: <b>{pct(r.tasa_combinada, 1)}</b>.
            </p>
            <Nota>
              <b>"Recibe el día de la venta"</b> es el número que ven los documentos del cliente: venta menos comisión y
              saldo del crédito, sin rentas ni ISR (esos ya se recibieron en el camino y se mencionan aparte). El
              <b> neto del periodo</b> los incluye y es la base de la reinversión y las comparaciones.
              Bajar deuda es un rendimiento <b>garantizado</b> a la tasa de esa deuda: cuando esa tasa supera al alterno,
              cada peso a deuda vale más que invertido. El supuesto es que la deuda seguiría viva todo el corte; si el
              cliente la pagaría pronto de todos modos, el beneficio real es menor. La venta se modela libre de ISR por
              la exención de casa habitación (LISR 93-XIX): déjalo como supuesto documentado y que lo confirme su contador.
            </Nota>
          </section>

          {/* ---------------- Veredicto ---------------- */}
          <section className="rounded-2xl border border-line bg-ink p-5 text-white">
            <h2 className="text-xs font-bold uppercase tracking-wide text-white/60">Veredicto con las palancas actuales</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <div><div className="text-[11px] text-white/60">Mejor horizonte</div><div className="text-2xl font-extrabold text-lime">{r.veredicto.mejor_horizonte} meses</div></div>
              <div><div className="text-[11px] text-white/60">Plusvalía de equilibrio</div><div className="text-2xl font-extrabold">{pct(r.veredicto.plusvalia_equilibrio, 2)}</div></div>
              <div><div className="text-[11px] text-white/60">Fuente que más aporta</div><div className="text-2xl font-extrabold capitalize">{r.veredicto.fuente_dominante}</div></div>
            </div>
            <p className="mt-3 text-sm text-white/80">
              {r.veredicto.lectura_salida}. Ventaja total al corte con el plazo que vas a presentar
              ({horizonte} meses): <b className="text-lime">{money(elegida?.ventaja_corte)}</b> contra no hacer nada.
              {!sigueSugerencia && sugerida ? <span className="text-white/50"> Con los {sugerida.horizonte} meses que sugiere el motor serían {money(sugerida.ventaja_corte)}.</span> : null}
            </p>
            <p className="mt-2 text-[11px] text-white/50">
              El veredicto responde a las palancas actuales: es el punto de partida de la conversación, no la sustituye.
              Marca los supuestos como supuestos y presenta el contrafactual honesto.
            </p>
          </section>

          {/* ---------------- Sensibilidad ---------------- */}
          {sensibilidad && (
            <section className={card}>
              <h2 className={h2}>Sensibilidad: ventaja al corte según la plusvalía</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-[11px] uppercase text-muted">
                      <th className="py-1 text-left">Plusvalía anual</th>
                      {hs.map((h) => <th key={h} className="py-1 text-right">{h} meses</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {sensibilidad.map((s) => (
                      <tr key={s.g} className={Math.abs(s.g - pal.plusvalia) < 1e-9 ? 'bg-cream font-semibold' : ''}>
                        <td className="py-1 pr-3">{pct(s.g, 0)}</td>
                        {s.filas.map((f) => (
                          <td key={f.h} className={`py-1 text-right tabular-nums ${f.ventaja < 0 ? 'text-red-700' : 'text-green-700'}`}>{money(f.ventaja)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Nota>
                Si la ventaja sólo aparece con plusvalías altas, la tesis <b>depende de un supuesto sin respaldo</b>.
                Enséñale la fila donde deja de convenir: esa conversación construye confianza y evita una venta que se
                cae después.
              </Nota>
            </section>
          )}

          {/* ---------------- Interno ---------------- */}
          {pnl && (
            <section className="rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/40 p-5">
              <button onClick={() => setVerInterno(!verInterno)} className="flex w-full items-center justify-between text-left">
                <span className="text-xs font-bold uppercase tracking-wide text-amber-800">Vista interna · PnL del aliado — no compartir con el cliente</span>
                <span className="text-xs text-amber-800">{verInterno ? 'Ocultar' : 'Ver'}</span>
              </button>
              {verInterno && (
                <div className="mt-3 text-sm">
                  <div className="mb-3 flex flex-wrap gap-4 text-xs">
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={aliadoVende} onChange={(e) => setAliadoVende(e.target.checked)} /> El aliado gestiona la venta</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={aliadoRenta} onChange={(e) => setAliadoRenta(e.target.checked)} /> El aliado gestiona la renta</label>
                    <span className="text-muted">Horizonte: {horizonte} meses</span>
                  </div>
                  <table className="w-full">
                    <tbody>
                      <tr className="border-b border-amber-200"><td colSpan={2} className="pt-2 text-[11px] font-bold uppercase text-amber-800">Al inicio · seguro, con liquidez al firmar</td></tr>
                      <Fila indent label="Excedente sobre el costo interno" vals={[pnl.excedente]} />
                      {pnl.aConstructora > 0 ? <Fila indent label={`Parte de la constructora (${pct(proyecto?.pct_excedente_constructora ?? 0, 0)} del excedente)`} vals={[-pnl.aConstructora]} negativo /> : null}
                      <Fila indent label="Margen para Trol" vals={[pnl.margen]} />
                      <Fila indent label="Comisión del desarrollador (sobre costo aliado)" vals={[pnl.comisionDesarrollador]} />
                      <Fila indent label="Notariales que el aliado regala al cliente" vals={[-pnl.notarialesRegalados]} negativo />
                      <Fila fuerte label="Total al inicio" vals={[pnl.inicio]} />
                      <tr className="border-b border-amber-200"><td colSpan={2} className="pt-3 text-[11px] font-bold uppercase text-amber-800">Durante y al final · no garantizado</td></tr>
                      <Fila indent label="Gestión de rentas en el horizonte" vals={[pnl.gestion]} />
                      <Fila indent label="Comisión de reventa" vals={[pnl.reventa]} />
                      <Fila fuerte label="Total potencial del horizonte" vals={[pnl.total]} />
                      <Fila label="Margen sobre el valor de escrituración" vals={[pnl.sobreEscrituracion]} fmt={(n) => pct(n, 1)} />
                    </tbody>
                  </table>
                  <p className="mt-2 text-[11px] text-amber-800">
                    Dos comisiones distintas: la del desarrollador entra al firmar; la de reventa la paga el cliente al
                    vender y sólo es ingreso si el aliado gestiona esa venta. <b>Durante</b> y <b>al final</b> no dan
                    liquidez al inicio ni están garantizados: no financiar la operación contra ellos.
                  </p>
                </div>
              )}
            </section>
          )}
        </>
      )}

      </>
      )}

      {/* ---------------- Guardar e historial ---------------- */}
      <section className={card}>
        <h2 className={h2}>Guardar la asesoría</h2>
        <p className="mt-1 text-xs text-muted">
          Se congelan el inmueble y los supuestos de este momento: el catálogo cambia y una propuesta
          entregada tiene que poder reproducirse tal como se presentó. La oportunidad pasa a
          <b> presentada</b> y queda la nota en la bitácora.
          {cotitular ? <> El escenario aparecerá también en el expediente de <b>{cotitular.nombre}</b>; el valor se cuenta sólo aquí para no duplicar el embudo.</> : null}
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <input value={nombreTocado ? nombre : nombreSugerido} onChange={(ev) => { setNombre(ev.target.value); setNombreTocado(true); }}
            placeholder="Nombre del escenario" className="rounded-lg border border-line px-2 py-1 text-sm" />
          <input value={nota} onChange={(ev) => setNota(ev.target.value)} placeholder="Nota de la sesión (opcional)" className="rounded-lg border border-line px-2 py-1 text-sm" />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button disabled={!r || guardando} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            onClick={() => guardar(async () => {
              if (!r || !proyecto || !inmueble || !horizonte) return;
              const res = (await guardarAsesoriaInfonavit({
                personaId,
                entrada: { titulares: clienteMotor.titulares, inmueble, supuestos: supMotor, palancas: palEff, saldo_sin_confirmar: saldoSinConfirmar, proyecto: { id: proyecto.id, desarrollo: proyecto.desarrollo, zona: proyecto.zona, renta_estimada: proyecto.renta_estimada, plusvalia_validada: proyecto.plusvalia_validada } },
                resultado: r,
                proyectoId: proyecto.id,
                cotitularPersonaId: cotitular?.personaId ?? null,
                cotitularDatos: modoCotitular === 'manual' ? t2 : null,
                nota: nota || null,
                nombre: (nombreTocado ? nombre : nombreSugerido) || null,
                horizonte,
              })) as R;
              setMsgGuardar(res.ok ? 'Guardada.' : res.error ?? 'error');
            })}>Guardar asesoría</button>
          {msgGuardar && <span className="text-xs text-muted">{msgGuardar}</span>}
        </div>

        {historial.length > 0 && (
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {historial.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                <span>
                  <b>{a.nombre ?? a.desarrollo ?? 'Escenario'}</b>
                  <span className="text-muted">
                    {' · '}{new Date(a.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                    {a.horizonte ? ` · ${a.horizonte} meses` : ''}
                    {a.efectivo != null ? ` · neto ${money(Number(a.efectivo))}` : ''}
                    {a.ventaja_corte != null ? ` · ventaja ${money(Number(a.ventaja_corte))}` : ''}
                    {a.miembro ? ` · ${a.miembro}` : ''}
                    {a.nota ? ` · ${a.nota}` : ''}
                  </span>
                  {a.es_cotitular ? <span className="ml-1 rounded bg-cream px-1.5 py-0.5">como cotitular</span> : null}
                  {a.cotitular_nombre ? <span className="ml-1 text-muted">con {a.cotitular_nombre}</span> : null}
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <Link href={`/trabajo/infonavit/resumen/${a.id}`} target="_blank" className="rounded-lg border border-line px-2 py-0.5 font-semibold hover:bg-cream">Resumen WhatsApp</Link>
                  <Link href={`/trabajo/infonavit/pdf/${a.id}`} target="_blank" className="rounded-lg border border-line px-2 py-0.5 font-semibold hover:bg-cream">Resumen PDF</Link>
                  <Link href={`/trabajo/infonavit/pdf/${a.id}?doc=extendido`} target="_blank" className="rounded-lg border border-line px-2 py-0.5 font-semibold hover:bg-cream">Extendido PDF</Link>
                  <button disabled={archivando} className="rounded-lg border border-line px-2 py-0.5 text-muted hover:bg-cream disabled:opacity-50"
                    onClick={() => archivar(async () => { await archivarAsesoria(a.id, personaId, true); })}>Archivar</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, v, sub, alerta }: { label: string; v: string; sub?: string; alerta?: boolean }) {
  return <div><div className="text-[11px] uppercase tracking-wide text-muted">{label}</div><div className={`text-xl font-extrabold ${alerta ? 'text-amber-700' : ''}`}>{v}</div>{sub ? <div className="text-[11px] text-muted">{sub}</div> : null}</div>;
}
function Mini({ label, v }: { label: string; v: string }) {
  return <div><div className="text-[11px] text-muted">{label}</div><div className="font-semibold">{v}</div></div>;
}
