// 293 · Inventario Infonavit para el aliado (claude/116): los inmuebles disponibles con su ficha
// técnica y para qué rango de saldo los sugiere el mismo motor que arma la cotización de cada
// cliente. Nada personal aquí: es catálogo comercial. Los números finos (crédito, pago, lo que
// recibe) salen de la precalificación de cada persona, no de esta página.
//
// Cómo se calcula el rango: se corre `rankearInmuebles` (el motor de la cotización inicial) para un
// titular tipo —42 años, Ley 97, sigue cotizando 5 años, vende a 60 meses— con tres salarios y una
// malla de saldos; el inmueble queda "sugerido" desde el saldo donde sale viable y con ventaja
// positiva. Sólo el mínimo: nada de crédito / pago / lo que recibe de ejemplo (Raúl, 3-nov: varían
// mucho con el plazo y el objetivo; eso lo da la cotización de cada cliente). Tampoco costo del
// aliado, comisiones ni notas internas.
import { requireAliado, t3admin } from '@/lib/trol3/server';
import { rankearInmuebles, FACTORES_DEFAULT } from '@/lib/infonavit/sugerencia';
import { supuestosMotor } from '@/lib/infonavit/cotizacion-inicial';
import type { Proyecto, SupuestosGlobales } from '@/components/trol3/AsesoriaInfonavit';
import type { TitularInfonavit } from '@trol/pension-core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inventario Infonavit · Aliados Trol' };

const SALDOS = [150000, 250000, 400000, 600000, 800000, 1000000, 1300000, 1600000, 2000000, 2500000];
/** Tres salarios de referencia: la retención (≤ 30 % del salario) es lo que más abre o cierra opciones. */
const SALARIOS = [20000, 30000, 45000];
const SALARIO_REF = 30000;
const SEGMENTOS: { clave: string; nombre: string; desde: number; hasta: number | null }[] = [
  { clave: 'bajo', nombre: 'Saldo de $150,000 a $800,000', desde: 150000, hasta: 800000 },
  { clave: 'alto', nombre: 'Saldo de $800,000 en adelante', desde: 800000, hasta: null },
];
const TITULAR_TIPO = { edad: 42, meses: 60, horizonte: 60 };

const mxn0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const money = (n: number | null | undefined) => (n == null ? '—' : mxn0.format(n));
const miles = (n: number) => '$' + (Math.round(n / 1000) * 1000).toLocaleString('es-MX');

interface Rango {
  /** Saldo mínimo con el que sale viable, por salario de referencia (null = no sale ni con $2.5M). */
  minimo: Record<number, number | null>;
}

function rangosPorInmueble(proyectos: Proyecto[], sup: SupuestosGlobales): Map<string, Rango> {
  const supM = supuestosMotor(sup);
  const creditoMin = Number(sup.credito_minimo ?? 100000);
  const reglas = {
    ...(sup.apalancamiento_max != null ? { apalancamiento_max: Number(sup.apalancamiento_max) } : {}),
    ...(sup.empate_min != null ? { empate_min: Number(sup.empate_min) } : {}),
    ...(sup.empate_pct != null ? { empate_pct: Number(sup.empate_pct) } : {}),
  };
  const out = new Map<string, Rango>();
  for (const p of proyectos) out.set(p.id, { minimo: Object.fromEntries(SALARIOS.map((x) => [x, null])) });

  for (const salario of SALARIOS) {
    for (const s of SALDOS) {
      const titular: TitularInfonavit = {
        regimen: 97, edad: TITULAR_TIPO.edad, salario_imss: salario, ssv: s,
        meses_cotizando: TITULAR_TIPO.meses, ingreso_real: salario, deducciones_usadas: 0, conserva_valor: 1,
      };
      let filas: ReturnType<typeof rankearInmuebles>['filas'] = [];
      try {
        filas = rankearInmuebles({
          proyectos, cliente: { titulares: [titular] }, supuestos: supM,
          palancas: { plusvalia: 0.06, alterno: sup.alterno, pct_deuda: 0, tasa_deuda: 0.2, corte_anios: Math.max(5, TITULAR_TIPO.horizonte / 12 + 3) },
          factores: FACTORES_DEFAULT(salario), creditoMin, horizonteElegido: TITULAR_TIPO.horizonte, horizonteFallback: null, reglas,
        }).filas;
      } catch { filas = []; }
      for (const f of filas) {
        if (f.horizonte !== TITULAR_TIPO.horizonte) continue;
        const ok = f.viable && !f.para_saldos_mayores && f.ventaja > 0 && !(f.meses_cotizando > 0 && f.pct_salario > 0.30);
        if (!ok) continue;
        const r = out.get(f.id);
        if (!r) continue;
        if (r.minimo[salario] == null) r.minimo[salario] = s;
      }
    }
  }
  return out;
}

/** Recámaras y tipo a partir del nombre comercial (no hay columna propia). */
const tipoCorto = (p: Proyecto) => (p.nombre_comercial ?? '').trim() || p.desarrollo;

export default async function InventarioAliado() {
  const a = await requireAliado();
  const admin = t3admin();
  const [{ data: proys }, { data: sup }] = await Promise.all([
    admin.from('proyectos_inmobiliarios').select('*').eq('disponible', true).order('escrituracion'),
    admin.from('infonavit_supuestos').select('*').eq('id', 'default').maybeSingle(),
  ]);
  const proyectos = ((proys ?? []) as Proyecto[]).filter((p) => p.ficha_url);
  const rangos = sup ? rangosPorInmueble(proyectos, sup as SupuestosGlobales) : new Map<string, Rango>();
  // Segmento por el saldo mínimo al salario de referencia ($30,000): hasta $800,000 o arriba.
  const enSegmento = (p: Proyecto, seg: (typeof SEGMENTOS)[number]) => {
    const m = rangos.get(p.id)?.minimo[SALARIO_REF];
    if (m == null) return false;
    return seg.hasta == null ? m > SEGMENTOS[0].hasta! : m <= seg.hasta;
  };
  const sinRango = proyectos.filter((p) => !SEGMENTOS.some((s) => enSegmento(p, s)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold">Inventario Infonavit</h1>
          <p className="text-xs text-muted">
            Los inmuebles que hoy ofrecemos, con su ficha técnica y para qué saldo de vivienda los sugerimos. Aplica a quien cotiza hoy, tiene menos de 62 años y no tiene crédito Infonavit vigente.
          </p>
        </div>
        <a href="/aliado" className="text-xs underline text-muted">← volver a tus clientes</a>
      </div>

      <div className="rounded-2xl border border-line bg-cream/60 p-4 text-xs text-muted">
        <b className="text-ink">Cómo leer el rango.</b> Cada inmueble dice con qué <b className="text-ink">saldo de vivienda mínimo</b> sale viable y conviene, calculado con el mismo motor que arma la cotización de cada cliente, para una persona tipo ({TITULAR_TIPO.edad} años, sigue cotizando {TITULAR_TIPO.meses / 12} años, vende a {TITULAR_TIPO.horizonte} meses). Lo que más abre o cierra opciones es el <b className="text-ink">salario</b> (Infonavit retiene hasta el 30 %), por eso el mínimo se da para tres salarios. <b className="text-ink">La precalificación de tu cliente manda</b>: lo que Infonavit le presta puede acotar. Ganas <b className="text-ink">{money(Number(a.comision_infonavit ?? 25000))}</b> por inmueble (IVA incluido) al firmar escrituras, sin importar el saldo.
      </div>

      {SEGMENTOS.map((seg) => {
        const lista = proyectos.filter((p) => enSegmento(p, seg));
        return (
          <section key={seg.clave} className="rounded-2xl border border-line bg-white p-5">
            <h2 className="text-sm font-bold">{seg.nombre}</h2>
            <p className="mb-3 text-xs text-muted">{seg.clave === 'bajo' ? 'Casas en desarrollo con renta estable: la conversación es patrimonio sin poner enganche.' : 'Inmuebles con más potencial de plusvalía y renta: la conversación es inversión.'}</p>
            {lista.length === 0 ? <p className="text-xs text-muted">Por ahora no hay inmuebles sugeridos para este rango.</p> : (
              <div className="grid gap-3 sm:grid-cols-2">
                {lista.map((p) => <Tarjeta key={p.id} p={p} r={rangos.get(p.id) ?? null} />)}
              </div>
            )}
          </section>
        );
      })}

      {sinRango.length ? (
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="text-sm font-bold">Sólo con cotitular, salario alto o efectivo</h2>
          <p className="mb-3 text-xs text-muted">Con salario de {money(SALARIO_REF)} no le alcanza a una persona sola; sí puede con salario mayor, sumando a otra persona que cotice (pareja, hijo o hija) o poniendo una parte en efectivo.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {sinRango.map((p) => <Tarjeta key={p.id} p={p} r={rangos.get(p.id) ?? null} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Tarjeta({ p, r }: { p: Proyecto; r: Rango | null }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-bold">{tipoCorto(p)}</div>
          {p.ubicacion_comercial ? <div className="text-xs text-muted">{p.ubicacion_comercial}</div> : p.zona ? <div className="text-xs text-muted">{p.zona}</div> : null}
        </div>
        {r?.minimo[SALARIO_REF] != null ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">Saldo desde {miles(r.minimo[SALARIO_REF]!)}</span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">{Object.values(r?.minimo ?? {}).some((v) => v != null) ? 'Con salario alto' : 'Con cotitular'}</span>
        )}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div><div className="text-[10px] uppercase tracking-wide text-muted">Precio (escrituración)</div><div className="font-semibold">{money(Number(p.escrituracion))}</div></div>
        <div><div className="text-[10px] uppercase tracking-wide text-muted">Tamaño</div><div className="font-semibold">{p.m2 ? `${Number(p.m2).toLocaleString('es-MX')} m²` : '—'}</div></div>
        <div><div className="text-[10px] uppercase tracking-wide text-muted">Renta{p.renta_estimada ? ' est.' : ''}</div><div className="font-semibold">{money(Number(p.renta))}/mes</div></div>
      </div>
      {r ? (
        <div className="mt-2 text-[11px] text-muted">
          <span className="font-semibold text-ink">Saldo mínimo según salario: </span>
          {SALARIOS.map((x, i) => <span key={x}>{i ? ' · ' : ''}{money(x)} → {r.minimo[x] != null ? miles(r.minimo[x]!) : 'no alcanza'}</span>)}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {p.ficha_url ? <a href={p.ficha_url} target="_blank" rel="noreferrer" className="rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-cream">Ficha técnica (PDF)</a> : null}
      </div>
    </div>
  );
}
