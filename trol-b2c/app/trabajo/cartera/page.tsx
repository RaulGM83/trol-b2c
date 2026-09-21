import Link from 'next/link';
import { requireMiembro, t3, fmtNum, type Any } from '@/lib/trol3/server';
import { CarteraAcciones, type FilaCartera } from '@/components/trol3/CarteraAcciones';
import { PorActivarLista } from '@/components/trol3/PorActivarLista';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mi cartera · Trol equipo' };

// 164 · Mi cartera: a quién le hablo hoy. Las bandejas son las de /mi vistas desde el otro
// lado ("me toca a mí" / "le toca al cliente") y la parada es la MISMA que ve el cliente.
const TAKO_LINE = 'm2MS9fYJb1EhjJQykLUz';
const takoUrl = (tel?: string | null) => (tel ? `https://portal.takohub.com/trol-financiero/pas/chats?line=${TAKO_LINE}&number=521${String(tel).replace(/\D/g, '').slice(-10)}` : null);
const PARADAS = ['Información', 'Diagnóstico', 'Plan', 'Trámite', 'Pensión'];
const MOTIVO: Record<string, [string, string]> = {
  escribio: ['Escribió', 'bg-red-100 text-red-900'],
  cita: ['Cita', 'bg-lime text-ink'],
  tramite: ['Trámite: nos toca', 'bg-amber-100 text-amber-900'],
  contactar: ['Buscarle hoy', 'bg-amber-100 text-amber-900'],
  propuesta: ['Propuesta sin respuesta', 'bg-amber-100 text-amber-900'],
  abrio_cuenta: ['Abrió su cuenta', 'bg-cream text-ink'],
};

function hace(iso?: string | null): string {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 0) { const h = Math.round(-min / 60); return h < 24 ? `en ${Math.max(1, h)} h` : `en ${Math.round(h / 24)} d`; }
  if (min < 60) return `hace ${Math.max(1, min)} min`;
  if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} d`;
}

function RutaMini({ parada }: { parada: number | null }) {
  const cur = Math.min(Math.max(parada ?? 1, 1), 5) - 1;
  return (
    <div>
      <div className="flex items-center">
        {PARADAS.map((_, i) => (
          <span key={i} className="flex items-center">
            <span className={i < cur ? 'h-2.5 w-2.5 rounded-full bg-ink' : i === cur ? 'h-2.5 w-2.5 rounded-full border-2 border-ink bg-lime' : 'h-2.5 w-2.5 rounded-full border-2 border-line bg-white'} />
            {i < 4 ? <span className={i < cur ? 'h-0.5 w-2.5 bg-ink' : 'h-0.5 w-2.5 bg-line'} /> : null}
          </span>
        ))}
      </div>
      <div className="mt-1 text-[11px] text-muted">{PARADAS[cur]}</div>
    </div>
  );
}

function Fila({ f }: { f: Any }) {
  const mot = MOTIVO[f.motivo as string];
  const uc = f.ultimo_contacto as Any | null;
  const quien = uc ? (uc.actor === 'cliente' ? 'él/ella' : uc.actor === 'bot' ? 'Lukas' : 'nosotros') : null;
  return (
    <li className="grid grid-cols-1 items-center gap-3 border-t border-line py-3 md:grid-cols-[170px_200px_96px_minmax(0,1fr)_auto]">
      <div>
        {mot ? <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${mot[1]}`}>{mot[0]}{f.fecha ? ` · ${hace(f.fecha)}` : ''}</span>
          : <span className="inline-block rounded-full bg-cream px-2.5 py-0.5 text-[11px] font-semibold">{uc ? `Último contacto ${hace(uc.fecha)}` : 'Sin contacto'}</span>}
      </div>
      <div>
        <Link href={`/trabajo/p/${f.persona_id}`} className="text-sm font-bold hover:underline">{f.nombre ?? '(sin nombre)'}</Link>
        <div className="text-xs text-muted">{[f.edad ? `${f.edad} años` : null, f.ley === 'Ley73' ? 'Ley 73' : f.ley === 'Ley97' ? 'Ley 97' : null, f.semanas ? `${fmtNum(Number(f.semanas))} sem.` : null].filter(Boolean).join(' · ') || 'sin información oficial'}</div>
      </div>
      <RutaMini parada={f.parada ?? null} />
      <div className="text-[13px] leading-snug">
        {f.detalle ?? (f.toca === 'cliente' ? `Le toca: ${f.sigue ?? '—'}` : f.sigue ?? '—')}
        {f.oportunidad && !(f.detalle ?? '').includes(f.oportunidad) ? <span className="text-muted"> · {f.oportunidad}</span> : null}
        <div className="text-xs text-muted">
          {uc ? `Último contacto: ${quien}, ${uc.canal === 'wa' || uc.canal === 'bot' ? 'WhatsApp' : uc.canal} · ${hace(uc.fecha)}` : 'Sin contacto humano todavía'}
          {' · '}<span className={f.chat_abierto ? 'font-semibold text-green-700' : ''}>{f.chat_abierto ? 'chat abierto' : 'chat cerrado'}</span>
          {f.no_contactar ? <span className="font-semibold text-red-600"> · NO CONTACTAR</span> : null}
        </div>
      </div>
      <CarteraAcciones fila={f as FilaCartera} takoUrl={takoUrl(f.telefono)} />
    </li>
  );
}

export default async function Cartera({ searchParams }: { searchParams: { vista?: string; grupo?: string } }) {
  const m = await requireMiembro();
  const vista = searchParams.vista === 'equipo' ? 'equipo' : 'mios';
  const db = t3();
  const [{ data: cartera, error }, { data: activar, error: errAct }] = await Promise.all([
    db.rpc('mi_cartera', { p_vista: vista }),
    db.rpc('cartera_por_activar', { p_nombre: searchParams.grupo ?? null, p_limit: 20 }),
  ]);
  const c = (cartera ?? {}) as Any;
  const meToca: Any[] = c.me_toca ?? [];
  const leToca: Any[] = c.le_toca ?? [];
  const pa = (activar ?? {}) as Any;
  const grupos: Any[] = pa.grupos ?? [];
  const nombre = (m.nombre ?? '').split(' ')[0];
  const href = (patch: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    Object.entries({ vista: vista === 'equipo' ? 'equipo' : undefined, grupo: searchParams.grupo, ...patch }).forEach(([k, v]) => { if (v) sp.set(k, v); });
    const q = sp.toString();
    return q ? `/trabajo/cartera?${q}` : '/trabajo/cartera';
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">{vista === 'equipo' ? 'La cartera del equipo' : `Hola${nombre ? `, ${nombre}` : ''}`}</h1>
          <p className="mt-1 text-sm text-muted">
            {meToca.length === 0 ? 'Hoy no hay nadie esperando algo de tu lado.' : meToca.length === 1 ? 'Hoy te toca 1 cliente.' : `Hoy te tocan ${meToca.length} clientes.`}
            {leToca.length ? ` Otros ${leToca.length} están esperando algo de su lado.` : ''}
          </p>
        </div>
        <div className="flex gap-1.5 text-xs">
          <Link href={href({ vista: undefined })} className={vista === 'mios' ? 'rounded-lg bg-ink px-3 py-1.5 font-bold text-white' : 'rounded-lg border border-line bg-white px-3 py-1.5 font-bold'}>Míos</Link>
          <Link href={href({ vista: 'equipo' })} className={vista === 'equipo' ? 'rounded-lg bg-ink px-3 py-1.5 font-bold text-white' : 'rounded-lg border border-line bg-white px-3 py-1.5 font-bold'}>Todo el equipo</Link>
        </div>
      </div>
      {error ? <p className="text-sm text-red-600">No se pudo cargar la cartera: {error.message}</p> : null}

      <div className="rounded-2xl border border-line bg-white px-5 pb-2 pt-5">
        <div className="flex items-baseline justify-between"><h2 className="text-sm font-bold">Me toca a mí <span className="font-normal text-muted">· {meToca.length}</span></h2><span className="text-xs text-muted">Primero lo que más se enfría</span></div>
        {meToca.length ? <ul className="mt-2">{meToca.map((f) => <Fila key={f.persona_id} f={f} />)}</ul> : <p className="py-4 text-sm text-muted">Nada pendiente de tu lado. Buen momento para activar a alguien de abajo.</p>}
      </div>

      <div className="rounded-2xl border border-line bg-white px-5 pb-2 pt-5">
        <h2 className="text-sm font-bold">Le toca al cliente <span className="font-normal text-muted">· {leToca.length}</span></h2>
        {leToca.length ? <ul className="mt-2">{leToca.map((f) => <Fila key={f.persona_id} f={f} />)}</ul> : <p className="py-4 text-sm text-muted">Nadie está esperando algo de su lado.</p>}
      </div>

      <div className="rounded-2xl border border-line bg-white px-5 pb-2 pt-5">
        <h2 className="text-sm font-bold">Por activar <span className="font-normal text-muted">· sin experto, con algo encontrado</span></h2>
        <p className="mt-1 text-xs text-muted">Ya tienen su información y nadie se las ha explicado. Elige un grupo: salen los 20 más calientes (los que escribieron hace poco y los que tienen fecha límite van primero). Actívalos de uno en uno o en lote; a quien actives se vuelve tuyo. Una plantilla por persona al día.</p>
        {errAct ? <p className="mt-2 text-sm text-red-600">{errAct.message}</p> : null}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {grupos.map((g) => (
            <Link key={g.nombre} href={href({ grupo: g.nombre })} className={g.nombre === pa.grupo ? 'rounded-full bg-ink px-3 py-1 text-[11px] font-semibold text-white' : 'rounded-full border border-line bg-white px-3 py-1 text-[11px] font-semibold'}>{g.nombre} · {fmtNum(Number(g.n))}</Link>
          ))}
        </div>
        <PorActivarLista filas={(pa.filas ?? []) as never} />
      </div>
    </section>
  );
}
