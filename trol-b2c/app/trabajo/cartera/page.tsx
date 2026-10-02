import Link from 'next/link';
import { requireMiembro, t3, fmtNum, type Any } from '@/lib/trol3/server';
import { CarteraTabs, type Carril } from '@/components/trol3/CarteraTabs';
import { CarrilFila, type FilaCompleta } from '@/components/trol3/CarrilFila';
import { TibiosLista } from '@/components/trol3/TibiosLista';
import type { Miembro } from '@/components/trol3/CarrilAcciones';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mi cartera · Trol equipo' };

// 187 · Mi cartera por carriles (claude/84). Favoritos los cuidas tú; Calientes es a quién estar
// atento hoy (tope de 25 toques esperando reacción; los que reaccionan no cuentan); Tibios es de
// dónde se llena, con el reto del día; Fríos descansan con motivo y vuelven por detonador.
// Las reglas viven en la base (carril_de, mi_*); esta página sólo pinta y ofrece los gestos.
const CARRILES: Carril[] = ['favoritos', 'calientes', 'tibios', 'frios'];

export default async function Cartera({ searchParams }: { searchParams: { tab?: string; vista?: string; alcance?: string; tema?: string; q?: string } }) {
  const m = await requireMiembro();
  const tab: Carril = CARRILES.includes(searchParams.tab as Carril) ? (searchParams.tab as Carril) : 'calientes';
  const vista = searchParams.vista === 'equipo' ? 'equipo' : 'mios';
  const equipo = vista === 'equipo';
  const alcance: 'mios' | 'pozo' = searchParams.alcance === 'pozo' ? 'pozo' : 'mios';
  const esAdmin = (m.roles ?? []).some((r) => r === 'admin' || r === 'coach');
  const db = t3();
  // 210 · Buscar sin salir de la cartera: cada resultado trae su carril y sus gestos (claude/95).
  const q = (searchParams.q ?? '').trim();
  const busqueda = q.length >= 2 ? await db.rpc('buscar_cartera', { p_q: q, p_limit: 20 }) : null;
  const encontrados: FilaCompleta[] = (busqueda?.data ?? []) as FilaCompleta[];

  const [{ data, error }, { data: misTareas }, { data: miembrosRaw }] = await Promise.all([
    tab === 'calientes' ? db.rpc('mi_calientes', { p_vista: vista })
      : tab === 'tibios' ? db.rpc('mi_tibios', { p_alcance: alcance, p_oportunidad: searchParams.tema ?? null, p_limit: 20 })
      : tab === 'favoritos' ? db.rpc('mi_favoritos', { p_vista: vista })
      : db.rpc('mi_frios', { p_vista: vista }),
    db.from('v_tareas').select('id,vencida').eq('estado', 'pendiente').eq('responsable_id', m.id).limit(200),
    db.from('miembros').select('id,nombre').eq('activo', true).order('nombre'),
  ]);
  const nPend = (misTareas ?? []).length; const nVenc = ((misTareas ?? []) as Any[]).filter((t) => t.vencida).length;
  const miembros = (miembrosRaw ?? []) as Miembro[];
  const d = (data ?? {}) as Any;
  const nombre = (m.nombre ?? '').split(' ')[0];
  const href = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    Object.entries({ tab, vista: equipo ? 'equipo' : undefined, alcance: alcance === 'pozo' ? 'pozo' : undefined, tema: searchParams.tema, q: q || undefined, ...patch }).forEach(([k, v]) => { if (v) sp.set(k, v); });
    return `/trabajo/cartera?${sp.toString()}`;
  };
  const query = `${equipo ? '&vista=equipo' : ''}`;
  const comunes = { esAdmin, miembros, equipo };

  // Conteo de la pestaña activa, para la etiqueta
  const conteo: Partial<Record<Carril, string>> = {};
  if (tab === 'calientes') conteo.calientes = `${d.reaccionaron ?? 0} + ${d.tocados ?? 0}/${d.tope ?? 25}`;
  if (tab === 'tibios') conteo.tibios = d.reto?.meta ? `reto ${d.reto.llevas ?? 0}/${d.reto.meta}` : String(fmtNum(d.total ?? 0));
  if (tab === 'favoritos') conteo.favoritos = String((d.en_proceso?.length ?? 0) + (d.favoritos?.length ?? 0));
  if (tab === 'frios') conteo.frios = String(d.filas?.length ?? 0);

  const sub = tab === 'calientes' ? `A quién estar atent${nombre.endsWith('a') ? 'a' : 'o'} hoy. Los que reaccionan no cuentan en el tope; los tocados que no reaccionen bajan solos esta noche a Fríos.`
    : tab === 'tibios' ? 'De aquí llenas Calientes con el reto que te pongas. Se trabaja por tema; los que nadie ha tocado van primero.'
    : tab === 'favoritos' ? 'Los que cuidas por la razón que sea, más los trámites en proceso (entran solos). No cuentan en el tope.'
    : 'Descansan con motivo. Vuelven solos a Tibios cuando toca el siguiente toque, cumplen 60 o 65, o se les cierra una ventana; a Calientes si escriben.';

  const lista = (filas: FilaCompleta[], vacio: string, atenuar?: (f: FilaCompleta) => boolean, conCarril = false) => (
    filas.length ? <ul className="mt-2">{filas.map((f) => <CarrilFila key={f.persona_id} f={f} libres={d.libres ?? 99} {...comunes} atenuada={atenuar?.(f)} conCarril={conCarril} />)}</ul> : <p className="py-4 text-sm text-muted">{vacio}</p>
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{equipo ? 'La cartera del equipo' : `Hola${nombre ? `, ${nombre}` : ''}`}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">{sub}</p>
        </div>
        <div className="flex gap-1.5 text-xs">
          <Link href={href({ vista: undefined })} className={!equipo ? 'rounded-lg bg-ink px-3 py-1.5 font-bold text-white' : 'rounded-lg border border-line bg-white px-3 py-1.5 font-bold'}>Míos</Link>
          <Link href={href({ vista: 'equipo' })} className={equipo ? 'rounded-lg bg-ink px-3 py-1.5 font-bold text-white' : 'rounded-lg border border-line bg-white px-3 py-1.5 font-bold'}>Todo el equipo</Link>
        </div>
      </div>
      <CarteraTabs activa={tab} pendientes={nPend} vencidas={nVenc} conteos={conteo} query={query} />
      {error ? <p className="text-sm text-red-600">No se pudo cargar: {error.message}</p> : null}
      <form method="get" action="/trabajo/cartera" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="tab" value={tab} />
        {equipo ? <input type="hidden" name="vista" value="equipo" /> : null}
        <input name="q" defaultValue={q} placeholder="Buscar en la cartera: nombre, teléfono o CURP" className="min-w-[280px] flex-1 rounded-xl border border-line bg-white px-3 py-2 text-sm" />
        <button type="submit" className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white">Buscar</button>
        {q ? <Link href={href({ q: undefined })} className="text-xs underline">limpiar</Link> : null}
      </form>
      {q ? (
        <div className="rounded-2xl border-2 border-ink bg-white px-5 pb-2 pt-5">
          <div className="flex items-baseline justify-between"><h2 className="text-sm font-bold">Resultados para “{q}” <span className="font-normal text-muted">· {encontrados.length}</span></h2><span className="text-xs text-muted">cada uno con su carril</span></div>
          {busqueda?.error ? <p className="text-sm text-red-600">No se pudo buscar: {busqueda.error.message}</p> : lista(encontrados, 'Nadie coincide. Prueba con el teléfono o la CURP.', undefined, true)}
        </div>
      ) : null}

      {tab === 'calientes' ? (() => {
        const filas: FilaCompleta[] = d.filas ?? [];
        const react = filas.filter((f) => ['reacciono', 'llego_hoy', 'cita'].includes(f.origen));
        const tocados = filas.filter((f) => f.origen === 'tocado');
        const deFav = filas.filter((f) => ['tramite', 'favorito', 'asignado'].includes(f.origen));
        const pct = Math.min(100, Math.round(((d.tocados ?? 0) / (d.tope ?? 25)) * 100));
        return (
          <>
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-cream px-4 py-3 text-sm">
              <span className="font-mono font-bold">Tocados hoy {d.tocados ?? 0} de {d.tope ?? 25}</span>
              <div className="h-2 min-w-[160px] flex-1 overflow-hidden rounded-full bg-white"><div className="h-full bg-red-500" style={{ width: `${pct}%` }} /></div>
              <span className="font-mono font-bold text-green-800">{d.reaccionaron ?? 0} reaccionaron</span>
              <span className="w-full text-xs text-muted">{(d.libres ?? 0) > 0 ? <>Te caben <b>{d.libres}</b> toques más hoy. </> : <span className="font-semibold text-red-700">Tope del día alcanzado. </span>}Favoritos y trámites no cuentan.</span>
            </div>
            <div className="rounded-2xl border border-line bg-white px-5 pb-2 pt-5">
              <div className="flex items-baseline justify-between"><h2 className="text-sm font-bold">Reaccionaron · te toca a ti <span className="font-normal text-muted">· {react.length}</span></h2><span className="text-xs text-muted">lo más reciente primero</span></div>
              {lista(react, 'Nadie ha reaccionado en los últimos 7 días. Toca a alguien de Tibios.')}
            </div>
            <div className="rounded-2xl border border-line bg-white px-5 pb-2 pt-5">
              <div className="flex items-baseline justify-between"><h2 className="text-sm font-bold">Tocados hoy · esperando reacción <span className="font-normal text-muted">· {tocados.length}</span></h2><span className="text-xs text-muted">cuentan en el {d.tope ?? 25} · esta noche → Fríos “no contestó”</span></div>
              {lista(tocados, 'Hoy no has tocado a nadie todavía.')}
            </div>
            {deFav.length ? (
              <div className="rounded-2xl border border-line bg-white px-5 pb-2 pt-5">
                <div className="flex items-baseline justify-between"><h2 className="text-sm font-bold">De Favoritos, hoy <span className="font-normal text-muted">· {deFav.length}</span></h2><span className="text-xs text-muted">llegó su fecha, el trámite pide algo, o te lo mandaron</span></div>
                {lista(deFav, '')}
              </div>
            ) : null}
          </>
        );
      })() : null}

      {tab === 'tibios' ? (
        <div className="rounded-2xl border border-line bg-white px-5 pb-2 pt-5">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Link href={href({ alcance: undefined, tema: undefined })} className={alcance === 'mios' ? 'rounded-lg bg-ink px-3 py-1.5 font-bold text-white' : 'rounded-lg border border-line bg-white px-3 py-1.5 font-bold'}>Mis tibios</Link>
            <Link href={href({ alcance: 'pozo', tema: undefined })} className={alcance === 'pozo' ? 'rounded-lg bg-ink px-3 py-1.5 font-bold text-white' : 'rounded-lg border border-line bg-white px-3 py-1.5 font-bold'}>Sin dueño</Link>
            <span className="ml-2 text-muted">{alcance === 'pozo' ? 'Nadie los lleva: a quien toques te lo quedas.' : 'Asignados a ti, sin conversación viva ni avance.'} · {fmtNum(d.total ?? 0)} en total</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {((d.grupos ?? []) as Any[]).map((g) => (
              <Link key={g.nombre} href={href({ tema: g.nombre })} className={g.nombre === d.grupo ? 'rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-white' : 'rounded-full border border-line bg-white px-3 py-1 text-[11px] font-semibold'}>{g.nombre} · {fmtNum(Number(g.n))}</Link>
            ))}
            {(d.grupos ?? []).length > 1 ? <Link href={href({ tema: 'todas' })} className={!d.grupo ? 'rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-white' : 'rounded-full border border-line bg-white px-3 py-1 text-[11px] font-semibold text-muted'}>Todas</Link> : null}
          </div>
          <div className="mt-3">
            <TibiosLista filas={(d.filas ?? []) as FilaCompleta[]} reto={{ meta: d.reto?.meta ?? null, llevas: d.reto?.llevas ?? 0 }} tope={d.tope ?? 25} tocados={d.tocados ?? 0} libres={d.libres ?? 0} alcance={alcance} {...comunes} />
          </div>
        </div>
      ) : null}

      {tab === 'favoritos' ? (
        <>
          <div className="rounded-2xl border border-line bg-white px-5 pb-2 pt-5">
            <div className="flex items-baseline justify-between"><h2 className="text-sm font-bold">En proceso <span className="font-normal text-muted">· {(d.en_proceso ?? []).length} · entran solos</span></h2>{equipo ? <span className="text-xs text-muted">los que no tienen dueño se pueden asignar</span> : null}</div>
            {lista(d.en_proceso ?? [], 'No llevas ningún trámite en proceso.')}
          </div>
          <div className="rounded-2xl border border-line bg-white px-5 pb-2 pt-5">
            <div className="flex items-baseline justify-between"><h2 className="text-sm font-bold">Favoritos <span className="font-normal text-muted">· {(d.favoritos ?? []).length}</span></h2><span className="text-xs text-muted">con fecha, ese día vuelven a Calientes</span></div>
            {lista(d.favoritos ?? [], 'Marca como favorito a quien quieras cuidar aunque no esté caliente: desde Calientes o desde su expediente.')}
          </div>
        </>
      ) : null}

      {tab === 'frios' ? (
        <>
          {((d.detonadores ?? []) as Any[]).length ? (
            <div className="rounded-2xl border border-line bg-white px-5 pb-4 pt-5">
              <h2 className="text-sm font-bold">Detonadores de hoy <span className="font-normal text-muted">· vale la pena despertarlos</span></h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {((d.detonadores ?? []) as Any[]).map((x) => <li key={x.codigo} className="rounded-xl bg-cream px-3 py-2 text-sm"><b className="font-mono">{x.n}</b> · {x.nombre}</li>)}
              </ul>
              <p className="mt-2 text-xs text-muted">Salen marcados abajo; despiértalos uno por uno cuando te quepan.</p>
            </div>
          ) : null}
          <div className="rounded-2xl border border-line bg-white px-5 pb-2 pt-5">
            <div className="flex items-baseline justify-between"><h2 className="text-sm font-bold">Enfriados <span className="font-normal text-muted">· {(d.filas ?? []).length}</span></h2><span className="text-xs text-muted">los tocados hace más tiempo primero</span></div>
            {(() => {
              const det = new Set<string>(((d.detonadores ?? []) as Any[]).flatMap((x) => (x.personas ?? []) as string[]));
              return lista(d.filas ?? [], 'Nadie en Fríos. Los tocados que no reaccionen llegan aquí solos por la noche.', (f) => !det.has(f.persona_id) && det.size > 0);
            })()}
          </div>
        </>
      ) : null}
    </section>
  );
}
