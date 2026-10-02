'use client';
import Link from 'next/link';
import { CarrilAcciones, type FilaCarril, type Miembro, MOTIVOS_FRIO } from '@/components/trol3/CarrilAcciones';

const TAKO_LINE = 'm2MS9fYJb1EhjJQykLUz';
export const takoUrl = (tel?: string | null) => (tel ? `https://portal.takohub.com/trol-financiero/pas/chats?line=${TAKO_LINE}&number=521${String(tel).replace(/\D/g, '').slice(-10)}` : null);
const PARADAS = ['Información', 'Diagnóstico', 'Plan', 'Trámite', 'Pensión'];
const fmt = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('es-MX').format(Number(n)));
const fmtMXN = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(n)));
const dia = (iso?: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '');

export function hace(iso?: string | null): string {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 0) { const h = Math.round(-min / 60); return h < 24 ? `en ${Math.max(1, h)} h` : `en ${Math.round(h / 24)} d`; }
  if (min < 60) return `hace ${Math.max(1, min)} min`;
  if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} d`;
}

const PILL: Record<string, string> = { calientes: 'bg-red-100 text-red-900', tibios: 'bg-amber-100 text-amber-900', favoritos: 'bg-sky-100 text-sky-900', frios: 'bg-slate-100 text-slate-700', proceso: 'bg-violet-100 text-violet-900' };

/** La etiqueta del renglón: por qué está en este carril, dicho en una frase corta. */
export function etiqueta(f: FilaCarril, miembros: Miembro[] = []): [string, string] {
  const por = miembros.find((m) => m.id === f.marca?.por_miembro_id)?.nombre?.split(' ')[0];
  const motivo = MOTIVOS_FRIO.find(([k]) => k === f.marca?.motivo)?.[1] ?? f.marca?.motivo ?? '';
  switch (f.carril) {
    case 'calientes':
      if (f.origen === 'reacciono') return [`Reaccionó ${hace(f.ultimo_gesto)}`, PILL.calientes];
      if (f.origen === 'llego_hoy') return ['Llegó hoy', PILL.calientes];
      if (f.origen === 'cita') return ['Cita', PILL.calientes];
      if (f.origen === 'tramite') return ['Trámite: nos toca', PILL.proceso];
      if (f.origen === 'asignado') return [`Te lo mandó ${por ?? 'admin'}`, PILL.favoritos];
      if (f.origen === 'favorito') return ['Favorito: hoy', PILL.favoritos];
      return [`Tocado hoy ${hace(f.ultimo_toque)}`.trim(), PILL.calientes];
    case 'tibios':
      if (f.origen === 'despertado') return [`Te lo mandó ${por ?? 'admin'}`, PILL.favoritos];
      if (f.origen === 'cadencia') return [`Toque ${f.toque?.n ?? ''}/4`, PILL.tibios];
      if (f.origen === 'pozo') return ['Sin dueño', PILL.frios];
      return [f.ultimo_toque ? `Último toque ${hace(f.ultimo_toque)}` : 'Nunca tocado', PILL.tibios];
    case 'favoritos':
      if (f.en_proceso) return [f.pide_equipo ? 'En proceso · nos toca' : 'En proceso', PILL.proceso];
      if (f.origen === 'sesion') return [f.cita_proxima ? `Sesión el ${dia(f.cita_proxima)}` : 'Sesión programada', PILL.favoritos];
      return [f.marca?.hasta ? `Hasta el ${dia(f.marca.hasta)}` : 'Sin fecha', PILL.favoritos];
    case 'frios':
      return [`${motivo || (f.origen === 'sin_telefono' ? 'Sin teléfono' : f.origen === 'sin_potencial' ? 'Sin oportunidad' : f.origen)}${f.marca?.en ? ` · ${dia(f.marca.en)}` : ''}`, PILL.frios];
    default:
      return ['Descartado', PILL.frios];
  }
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

export type FilaCompleta = FilaCarril & {
  edad?: number | null; ley?: string | null; semanas?: number | null; parada?: number | null; sigue?: string | null; toca?: string | null; sub?: string | null;
  ultimo_contacto?: { fecha: string; canal?: string; actor?: string; texto?: string } | null; cita?: string | null;
};

/**
 * 187 · Un renglón de Mi cartera, igual en las cuatro pestañas: etiqueta del carril · cliente ·
 * mini-ruta de paradas · qué sigue y último contacto · acciones. Lo que cambia por carril lo
 * decide CarrilAcciones; aquí sólo se pinta.
 */
export function CarrilFila({ f, libres, alcance, esAdmin, miembros, equipo, izquierda, atenuada, conCarril }: {
  f: FilaCompleta; libres?: number; alcance?: 'mios' | 'pozo'; esAdmin?: boolean; miembros?: Miembro[]; equipo?: boolean; izquierda?: React.ReactNode; atenuada?: boolean;
  /** 210 · en una búsqueda la fila dice en qué carril está. */
  conCarril?: boolean;
}) {
  const [txt, cls] = etiqueta(f, miembros);
  const uc = f.ultimo_contacto;
  const quien = uc ? (uc.actor === 'cliente' ? 'él/ella' : uc.actor === 'bot' ? 'Lukas' : 'nosotros') : null;
  const pot = f.potencial;
  const urg = pot?.urgencia_fecha && (pot.factor ?? 1) > 1 ? `ventana ${dia(pot.urgencia_fecha)}` : null;
  const dueno = equipo && f.cabecera_id ? miembros?.find((m) => m.id === f.cabecera_id)?.nombre?.split(' ')[0] : null;
  return (
    <li className={`grid grid-cols-1 items-center gap-3 border-t border-line py-3 ${izquierda ? 'md:grid-cols-[24px_170px_200px_96px_minmax(0,1fr)_auto]' : 'md:grid-cols-[170px_200px_96px_minmax(0,1fr)_auto]'} ${atenuada ? 'opacity-70' : ''}`}>
      {izquierda}
      <div className="flex flex-wrap gap-1">
        {conCarril ? <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${PILL[f.carril] ?? PILL.frios}`}>{({ favoritos: 'Favorito', calientes: 'Caliente', tibios: 'Tibio', frios: 'Frío', descartado: 'Descartado' } as Record<string, string>)[f.carril] ?? f.carril}</span> : null}
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>{txt}</span>
        {f.carril === 'tibios' && f.toque?.n ? <span className="inline-block rounded-md border border-line bg-white px-1.5 py-0.5 text-[10px] font-semibold text-muted">toque {f.toque.n}/4{f.toque.tipo ? ` · ${f.toque.tipo === 'lukas' ? (f.chat_abierto ? 'Lukas' : 'llamada') : f.toque.tipo}` : ''}</span> : null}
        {f.carril === 'frios' && f.vuelve_el ? <span className="inline-block rounded-md border border-line bg-white px-1.5 py-0.5 text-[10px] font-semibold text-muted">vuelve el {dia(f.vuelve_el)}</span> : null}
        {f.carril === 'frios' && f.marca?.motivo === 'no_contesto' && (f.marca?.toques ?? 0) >= 4 ? <span className="inline-block rounded-md border border-line bg-white px-1.5 py-0.5 text-[10px] font-semibold text-muted">4 toques sin respuesta</span> : null}
      </div>
      <div>
        <Link href={`/trabajo/p/${f.persona_id}`} className="text-sm font-bold hover:underline">{f.nombre ?? '(sin nombre)'}</Link>
        <div className="text-xs text-muted">{[f.edad ? `${f.edad} años` : null, f.ley === 'Ley73' ? 'Ley 73' : f.ley === 'Ley97' ? 'Ley 97' : null, f.semanas ? `${fmt(Number(f.semanas))} sem.` : null, dueno].filter(Boolean).join(' · ') || 'sin información oficial'}</div>
      </div>
      <RutaMini parada={f.parada ?? null} />
      <div className="text-[13px] leading-snug">
        {f.carril === 'tibios' || f.carril === 'frios'
          ? <>{pot?.nombre ?? f.oportunidad ?? '—'}{pot?.potencial ? <span className="text-muted"> · potencial {fmtMXN(pot.potencial)}</span> : null}{urg ? <span className="font-semibold text-amber-700"> · {urg}</span> : null}</>
          : <>{f.toca === 'cliente' ? `Le toca: ${f.sigue ?? '—'}` : f.sigue ?? '—'}{f.oportunidad ? <span className="text-muted"> · {f.oportunidad}</span> : null}</>}
        {f.marca?.nota ? <div className="text-xs italic text-muted">“{f.marca.nota}”</div> : null}
        <div className="text-xs text-muted">
          {uc ? `Último contacto: ${quien}, ${uc.canal === 'wa' || uc.canal === 'bot' ? 'WhatsApp' : uc.canal} · ${hace(uc.fecha)}` : 'Sin contacto humano todavía'}
          {' · '}<span className={f.chat_abierto ? 'font-semibold text-green-700' : ''}>{f.chat_abierto ? 'chat abierto' : 'chat cerrado'}</span>
          {f.base_listos != null && f.base_listos < 5 ? <>{' · '}<span title="Las cinco preguntas del paso 0 (AFORE, saldo, Infonavit, expectativa, otros ahorros)">base {f.base_listos}/5</span></> : null}
          {f.no_contactar ? <span className="font-semibold text-red-600"> · NO CONTACTAR</span> : null}
        </div>
      </div>
      <CarrilAcciones fila={f} takoUrl={takoUrl(f.telefono)} libres={libres} alcance={alcance} esAdmin={esAdmin} miembros={miembros} equipo={equipo} />
    </li>
  );
}
