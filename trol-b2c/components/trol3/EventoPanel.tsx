'use client';
// 191 · Panel del evento (claude/88): la meta arriba, el embudo en medio, y abajo cada
// registrado con "qué le toca" y el botón que lo resuelve. Pensado para los 24 días alrededor
// del Foro: quien lo abra ve de un vistazo dónde se atora la gente y a quién llamar.
import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { accionEvento, type AccionEvento } from '@/app/trabajo/actions';

export type FilaEvento = {
  id: string; nombre: string | null; apellidos: string | null; curp: string | null; telefono: string | null; created_at: string;
  via: 'web' | 'chat' | 'pasillo'; experto: string | null; app_visto_en: string | null; escribio: boolean; intentos: number;
  consulta: { id: string; tipo: string; estado: string; proveedor: string | null; error: string | null; creada_en: string; completada_en: string | null } | null;
  tiene_historial: boolean; tiene_constancia: boolean; ley: string | null; semanas: number | null; pension_base: number | null;
  base_listos: number; cita: { inicio: string; estado: string } | null; pagado: number;
  seguimiento: { que: string; en: string; quien: string | null } | null;
};
export type PanelEvento = {
  resumen: {
    clics: number; registrados: number; registrados_previos: number; registrados_evento: number; via: { web: number; chat: number; pasillo: number };
    sin_curp: number; con_historial: number; buscando: number; atoradas: number; entraron: number; base_completa: number;
    con_sesion: number; sesion_hecha: number; pagaron: number; ingresos: number;
    meta: { registrados_previos?: number; registrados_evento?: number; ingresos?: number; fecha?: string };
  };
  filas: FilaEvento[];
};

const mxn = (n: unknown) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(n ?? 0));
const fecha = (s: string) => new Date(s).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const min = (s: string) => Math.round((Date.now() - new Date(s).getTime()) / 60000);
const VIA: Record<string, string> = { web: 'Web', chat: 'Chat', pasillo: 'Pasillo' };
const ACCION_TXT: Record<string, string> = { reintentar_jordan: 'reintento Jordan', reintentar_belvo: 'reintento Belvo', ventanilla: 'ventanilla', pedir_constancia: 'se pidió constancia', llamado: 'llamada, contestó', sin_respuesta: 'llamada sin respuesta' };

type Situacion = { clave: string; texto: string; tono: 'ok' | 'aviso' | 'alerta' | 'neutro' };
function situacion(f: FilaEvento): Situacion {
  const c = f.consulta;
  const enCurso = c && !['completada', 'sin_resultado', 'error', 'cancelada'].includes(c.estado);
  if (f.pagado > 0) return { clave: 'pagaron', texto: `Cliente · pagó ${mxn(f.pagado)}`, tono: 'ok' };
  if (f.cita && new Date(f.cita.inicio) < new Date()) return { clave: 'sesion_hecha', texto: `Sesión hecha el ${fecha(f.cita.inicio)} · cerrar`, tono: 'aviso' };
  if (f.cita) return { clave: 'con_sesion', texto: `Sesión el ${fecha(f.cita.inicio)}`, tono: 'ok' };
  if (!f.curp) return { clave: 'sin_curp', texto: 'Falta su CURP: sin ella no hay historial', tono: 'alerta' };
  if (!f.tiene_historial && !f.tiene_constancia) {
    if (enCurso) return { clave: 'buscando', texto: `Buscando en el IMSS (${c!.proveedor ?? '—'}) · ${min(c!.creada_en)} min${c!.tipo === 'imss_ventanilla' ? ' · ventanilla' : ''}`, tono: 'aviso' };
    if (c) return { clave: 'atoradas', texto: `Historial atorado tras ${f.intentos} intento${f.intentos === 1 ? '' : 's'} (${c.proveedor ?? '—'}: ${c.estado})`, tono: 'alerta' };
    return { clave: 'atoradas', texto: 'Con CURP pero sin consulta: pídela', tono: 'alerta' };
  }
  if (!f.app_visto_en) return { clave: 'no_entro', texto: 'Su cuenta está lista y no ha entrado: recordarle', tono: 'aviso' };
  if (f.base_listos < 5) return { clave: 'base', texto: `Entró · le faltan preguntas (${f.base_listos}/5) · agendar`, tono: 'neutro' };
  return { clave: 'agendar', texto: 'Listo para su sesión: agendar', tono: 'aviso' };
}
const TONO: Record<Situacion['tono'], string> = { ok: 'bg-lime text-ink', aviso: 'bg-amber-100 text-amber-900', alerta: 'bg-red-100 text-red-900', neutro: 'bg-cream text-ink' };

const FILTROS: [string, string][] = [['todos', 'Todos'], ['atoradas', 'Historial atorado'], ['buscando', 'Buscando'], ['sin_curp', 'Sin CURP'], ['no_entro', 'No han entrado'], ['base', 'Faltan preguntas'], ['agendar', 'Por agendar'], ['con_sesion', 'Con sesión'], ['sesion_hecha', 'Sesión hecha'], ['pagaron', 'Pagaron']];

function Meta({ titulo, valor, meta, dinero }: { titulo: string; valor: number; meta?: number; dinero?: boolean }) {
  const pct = meta ? Math.min(100, Math.round((valor / meta) * 100)) : null;
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="text-xs text-muted">{titulo}</div>
      <div className="mt-1 text-2xl font-extrabold">{dinero ? mxn(valor) : valor}{meta ? <span className="text-sm font-semibold text-muted"> / {dinero ? mxn(meta) : meta}</span> : null}</div>
      {pct != null ? <div className="mt-2 h-2 overflow-hidden rounded-full bg-cream"><div className="h-full rounded-full bg-lime" style={{ width: `${pct}%` }} /></div> : null}
    </div>
  );
}

export function EventoPanel({ codigo, etiqueta, panel, filtroInicial }: { codigo: string; etiqueta: string; panel: PanelEvento; filtroInicial: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [filtro, setFiltro] = useState(filtroInicial);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<Record<string, string>>({});
  const r = panel.resumen; const meta = r.meta ?? {};
  const filas = useMemo(() => panel.filas.map((f) => ({ f, s: situacion(f) })), [panel.filas]);
  const conteo = useMemo(() => filas.reduce<Record<string, number>>((a, x) => { a[x.s.clave] = (a[x.s.clave] ?? 0) + 1; return a; }, {}), [filas]);
  const visibles = filas.filter((x) => (filtro === 'todos' || x.s.clave === filtro) && (!q || `${x.f.nombre ?? ''} ${x.f.apellidos ?? ''} ${x.f.telefono ?? ''} ${x.f.curp ?? ''}`.toLowerCase().includes(q.toLowerCase())));

  const buscando = filas.some((x) => x.s.clave === 'buscando');
  useEffect(() => { if (!buscando) return; const t = setInterval(() => router.refresh(), 30000); return () => clearInterval(t); }, [buscando, router]);

  const hacer = (pid: string, accion: AccionEvento) => start(async () => {
    const res = (await accionEvento(pid, codigo, accion)) as { ok: boolean; texto?: string; error?: string };
    setMsg((m) => ({ ...m, [pid]: res.ok ? (res.texto ?? 'Listo.') : (res.error ?? 'No se pudo.') }));
    router.refresh();
  });

  const embudo: [string, number][] = [
    ['Abrieron el link', r.clics], ['Se registraron', r.registrados], ['Con historial', r.con_historial], ['Entraron a su cuenta', r.entraron],
    ['Base 5/5', r.base_completa], ['Con sesión', r.con_sesion], ['Sesión hecha', r.sesion_hecha], ['Pagaron', r.pagaron],
  ];

  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-extrabold">{etiqueta}</h1><p className="text-xs text-muted">Código {codigo}{meta.fecha ? ` · evento el ${new Date(meta.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long' })}` : ''} · {r.via.web} por web · {r.via.chat} por chat · {r.via.pasillo} en pasillo</p></div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Meta titulo="Registrados antes del evento" valor={r.registrados_previos} meta={meta.registrados_previos} />
        <Meta titulo="Registrados el día del evento" valor={r.registrados_evento} meta={meta.registrados_evento} />
        <Meta titulo="Ingresos del código" valor={r.ingresos} meta={meta.ingresos} dinero />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-white p-4">
        <ol className="flex min-w-max items-end gap-1">
          {embudo.map(([t, n], i) => {
            const base = embudo[1][1] || 1; const pct = i === 0 ? 100 : Math.round((n / base) * 100);
            return (
              <li key={t} className="flex w-28 flex-col items-center text-center">
                <div className="text-lg font-extrabold">{n}</div>
                <div className="h-16 w-full px-2"><div className="mx-auto w-full rounded-t-md bg-lime" style={{ height: `${Math.max(4, Math.min(100, pct))}%`, marginTop: `${100 - Math.max(4, Math.min(100, pct))}%` }} /></div>
                <div className="mt-1 text-[11px] leading-tight text-muted">{t}</div>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-[11px] text-muted">Atoradas ahora: <b>{r.atoradas}</b> · buscando: <b>{r.buscando}</b> · sin CURP: <b>{r.sin_curp}</b>. La barra es contra los registrados.</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {FILTROS.map(([k, t]) => {
          const n = k === 'todos' ? filas.length : (conteo[k] ?? 0);
          return <button key={k} type="button" onClick={() => setFiltro(k)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filtro === k ? 'bg-ink text-white' : n ? 'border border-line bg-white' : 'border border-line bg-white text-muted/60'}`}>{t} · {n}</button>;
        })}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre, teléfono, CURP" className="ml-auto w-56 rounded-lg border border-line bg-white px-2.5 py-1 text-xs" />
      </div>

      <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
        {!visibles.length ? <li className="p-4 text-sm text-muted">Nadie en este filtro.</li> : null}
        {visibles.map(({ f, s }) => {
          const atorada = s.clave === 'atoradas'; const puedeConsulta = !!f.curp && !f.tiene_historial && !f.tiene_constancia && s.clave !== 'buscando';
          return (
            <li key={f.id} className="p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link href={`/trabajo/p/${f.id}`} className="text-base font-bold hover:underline">{[f.nombre, f.apellidos].filter(Boolean).join(' ') || '(sin nombre)'}</Link>
                    <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-semibold">{VIA[f.via]}</span>
                    <span className="text-xs text-muted">{fecha(f.created_at)}</span>
                    {f.experto ? <span className="text-xs text-muted">· {f.experto.split(' ')[0]}</span> : null}
                    {f.escribio ? <span className="rounded-full bg-cream px-2 py-0.5 text-[11px]">escribió</span> : null}
                  </div>
                  <div className="mt-1.5"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${TONO[s.tono]}`}>{s.texto}</span></div>
                  {f.tiene_historial || f.tiene_constancia ? <div className="mt-1 text-sm">{[f.ley === 'Ley73' ? 'Ley 73' : f.ley === 'Ley97' ? 'Ley 97' : null, f.semanas ? `${Math.round(Number(f.semanas)).toLocaleString('es-MX')} semanas` : null, f.pension_base ? `hoy le tocaría ${mxn(f.pension_base)}` : null, `base ${f.base_listos}/5`].filter(Boolean).join(' · ')}</div> : null}
                  {atorada && f.consulta?.error ? <div className="mt-1 text-xs text-red-700">{f.consulta.error}</div> : null}
                  {f.seguimiento ? <div className="mt-1 text-[11px] text-muted">Último: {ACCION_TXT[f.seguimiento.que] ?? f.seguimiento.que} · {fecha(f.seguimiento.en)}{f.seguimiento.quien ? ` · ${f.seguimiento.quien.split(' ')[0]}` : ''}</div> : null}
                  {msg[f.id] ? <div className="mt-1 text-xs font-semibold">{msg[f.id]}</div> : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {puedeConsulta ? <>
                    <button type="button" disabled={pending} onClick={() => hacer(f.id, 'reintentar_jordan')} className="rounded-lg bg-ink px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50">Reintentar Jordan</button>
                    <button type="button" disabled={pending} onClick={() => hacer(f.id, 'reintentar_belvo')} className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold disabled:opacity-50">Belvo</button>
                    <button type="button" disabled={pending} onClick={() => hacer(f.id, 'ventanilla')} className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold disabled:opacity-50" title="Jordan en ventanilla · exige NSS · ~30 min hábiles">Ventanilla</button>
                    <button type="button" disabled={pending} onClick={() => hacer(f.id, 'pedir_constancia')} className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold disabled:opacity-50" title="Le pide su Reporte de Semanas por WhatsApp">Pedir constancia</button>
                  </> : null}
                  <button type="button" disabled={pending} onClick={() => hacer(f.id, 'llamado')} className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold disabled:opacity-50">Llamé · contestó</button>
                  <button type="button" disabled={pending} onClick={() => hacer(f.id, 'sin_respuesta')} className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold text-muted disabled:opacity-50">Sin respuesta</button>
                  {f.telefono ? <a href={`https://wa.me/${f.telefono.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold">WhatsApp</a> : null}
                  <Link href={`/trabajo/p/${f.id}`} className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-bold">Expediente</Link>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
