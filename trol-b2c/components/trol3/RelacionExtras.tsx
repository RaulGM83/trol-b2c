'use client';
// 210 · Lo que faltaba en Relación (claude/95): el carril con sus gestos, los datos clave
// (CURP, NSS, fecha del IMSS con "Actualizar", registro), quién lo trajo, la sesión que se
// programó por fuera y las oportunidades que el asesor identifica a mano.
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CarrilAcciones, type FilaCarril, type Miembro } from '@/components/trol3/CarrilAcciones';
import { etiqueta } from '@/components/trol3/CarrilFila';
import { abrirOportunidad, actualizarSisec, buscarPersonasRapido, cancelarCita, fijarOrigen, registrarSesion, type OrigenPersona, type OrigenTipo } from '@/app/trabajo/actions';

const dark = 'rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50';
const line = 'rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-50';
const input = 'w-full rounded-lg border border-line px-2 py-1.5 text-xs';
const H = ({ children }: { children: React.ReactNode }) => <div className="text-[11px] font-bold uppercase tracking-wide text-muted">{children}</div>;

const fmtDia = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtDiaHora = (iso?: string | null) => iso ? new Date(iso).toLocaleString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const diasDesde = (iso?: string | null) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null;

type R = { ok: boolean; error?: string; texto?: string };

/** CURP / NSS con botón de copiar. */
export function Copiable({ label, valor, mono = true }: { label: string; valor: string | null; mono?: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[11px] text-muted">{label}</span>
      {valor ? (
        <>
          <span className={mono ? 'font-mono text-xs font-semibold' : 'text-xs font-semibold'}>{valor}</span>
          <button type="button" title="Copiar" onClick={() => { navigator.clipboard?.writeText(valor).then(() => { setOk(true); setTimeout(() => setOk(false), 1200); }); }} className="rounded border border-line px-1 text-[10px] text-muted hover:text-ink">{ok ? '✓' : 'copiar'}</button>
        </>
      ) : <span className="text-xs text-amber-700">falta</span>}
    </span>
  );
}

// ── Carril ─────────────────────────────────────────────────────────────────
export function CarrilCard({ fila, takoUrl, esAdmin, miembros }: { fila: FilaCarril; takoUrl: string | null; esAdmin: boolean; miembros: Miembro[] }) {
  const [texto, pill] = etiqueta(fila, miembros);
  const NOMBRE: Record<string, string> = { favoritos: 'Favorito', calientes: 'Caliente', tibios: 'Tibio', frios: 'Frío', descartado: 'Descartado' };
  const sesion = fila.carril === 'favoritos' && fila.origen === 'sesion';
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <H>En mi cartera</H>
        <Link href={`/trabajo/cartera?tab=${fila.carril === 'descartado' ? 'frios' : fila.carril}`} className="text-[11px] underline">ver carril</Link>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${pill}`}>{NOMBRE[fila.carril] ?? fila.carril}</span>
        <span className="text-sm">{sesion ? `Sesión el ${fmtDiaHora(fila.cita_proxima)}` : texto}</span>
      </div>
      {fila.marca?.nota ? <p className="mt-1 text-xs text-muted">“{fila.marca.nota}”</p> : null}
      <div className="mt-3">
        <CarrilAcciones fila={fila} takoUrl={takoUrl} esAdmin={esAdmin} miembros={miembros} />
      </div>
    </section>
  );
}

// ── Datos clave ────────────────────────────────────────────────────────────
export function DatosClaveCard({ personaId, curp, nss, fechaSisec, registradoEn, costoConsulta, origen, aliados, miembros, personaNombre }: {
  personaId: string; curp: string | null; nss: string | null; fechaSisec: string | null; registradoEn: string | null; costoConsulta: number | null;
  origen: OrigenPersona | null; aliados: { id: string; nombre: string }[]; miembros: Miembro[]; personaNombre: string;
}) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dias = diasDesde(fechaSisec);
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <H>Datos clave</H>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1"><Copiable label="CURP" valor={curp} /><Copiable label="NSS" valor={nss} /></div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span>Información del IMSS: <b>{fechaSisec ? fmtDia(fechaSisec) : 'sin consulta'}</b>{dias != null ? <span className={dias > 90 ? 'ml-1 text-xs font-semibold text-amber-700' : 'ml-1 text-xs text-muted'}>({dias} días)</span> : null}</span>
        {!confirmar ? <button type="button" className={line} onClick={() => { setConfirmar(true); setMsg(null); }}>Actualizar</button> : (
          <span className="flex flex-wrap items-center gap-2 rounded-lg bg-cream px-2 py-1 text-xs">
            Pide una consulta real{costoConsulta != null ? ` (~$${costoConsulta} MXN)` : ''}. ¿Seguro?
            <button type="button" disabled={pending} className={dark} onClick={() => start(async () => {
              const r = await actualizarSisec(personaId) as R & { resultado?: { ok?: boolean; motivo?: string; proveedor?: string; estado?: string; error?: string } };
              const res = r.resultado;
              setMsg(!r.ok ? r.error ?? 'No se pudo.' : !res?.ok ? `No enviada: ${res?.motivo === 'consulta_en_curso' ? 'ya hay una consulta en curso' : res?.motivo ?? 'sin motivo'}` : `Pedida a ${res.proveedor ?? 'proveedor'}${res.estado ? ` · ${res.estado}` : ''}${res.error ? ` · ${res.error}` : ''}. Llega en unos minutos.`);
              setConfirmar(false); router.refresh();
            })}>{pending ? 'Pidiendo…' : 'Sí, actualizar'}</button>
            <button type="button" className={line} onClick={() => setConfirmar(false)}>No</button>
          </span>
        )}
      </div>
      {msg ? <p className="mt-1 text-xs text-muted">{msg}</p> : null}
      <p className="mt-3 text-sm">Registrado el <b>{fmtDia(registradoEn)}</b></p>
      <OrigenLinea personaId={personaId} origen={origen} aliados={aliados} miembros={miembros} personaNombre={personaNombre} />
    </section>
  );
}

// ── Quién lo trajo ─────────────────────────────────────────────────────────
const CANALES: [string, string][] = [['organico', 'Orgánico'], ['meta', 'Meta (anuncio)'], ['linkedin', 'LinkedIn'], ['evento', 'Evento'], ['referido_vip', 'Referido VIP'], ['web', 'Web'], ['otro', 'Otro']];

export function describirOrigen(o: OrigenPersona | null): string {
  if (!o) return 'No sabemos cómo llegó.';
  if (o.tipo === 'cliente') return `Lo refirió ${o.nombre ?? 'otro cliente'}`;
  if (o.tipo === 'aliado') return `Lo trajo el aliado ${o.nombre ?? ''}${o.referido_estado === 'por_revisar' ? ' (atribución por revisar)' : o.referido_estado === 'rechazado' ? ' (no atribuido)' : ''}`;
  if (o.tipo === 'equipo') return `Lo trajo ${o.nombre ?? 'alguien del equipo'}`;
  if (o.canal) return `Llegó por ${CANALES.find(([k]) => k === o.canal)?.[1] ?? o.canal}${o.campania ? ` · ${o.campania}` : ''}${o.codigo ? ` · código ${o.codigo}` : ''}`;
  return 'No sabemos cómo llegó.';
}

/** Un selector de referidor que sirve igual en el alta y en Relación. */
export function OrigenPicker({ value, onChange, aliados, miembros, excluir }: {
  value: { tipo: OrigenTipo; ref: string; canal: string; texto: string; refNombre?: string };
  onChange: (v: { tipo: OrigenTipo; ref: string; canal: string; texto: string; refNombre?: string }) => void;
  aliados: { id: string; nombre: string }[]; miembros: Miembro[]; excluir?: string;
}) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ id: string; nombre: string }[]>([]);
  const [buscando, start] = useTransition();
  const set = (patch: Partial<typeof value>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap gap-1">
        {([['cliente', 'Un cliente'], ['aliado', 'Un aliado'], ['equipo', 'Alguien del equipo'], ['otro', 'Otro medio']] as [OrigenTipo, string][]).map(([k, l]) => (
          <button key={k} type="button" onClick={() => set({ tipo: k, ref: '', refNombre: undefined })} className={value.tipo === k ? 'rounded-full bg-ink px-2.5 py-1 font-bold text-white' : 'rounded-full border border-line bg-white px-2.5 py-1 font-semibold'}>{l}</button>
        ))}
      </div>
      {value.tipo === 'cliente' ? (
        value.ref ? <p>Refirió: <b>{value.refNombre}</b> <button type="button" className="underline" onClick={() => set({ ref: '', refNombre: undefined })}>cambiar</button></p> : (
          <div>
            <input value={q} onChange={(e) => { const v = e.target.value; setQ(v); if (v.trim().length >= 3) start(async () => { const r = await buscarPersonasRapido(v.trim()) as R & { personas?: { id: string; nombre: string }[] }; setRes((r.personas ?? []).filter((p) => p.id !== excluir)); }); else setRes([]); }} placeholder="Nombre, teléfono o CURP del que lo refirió" className={input} />
            {buscando ? <p className="text-muted">Buscando…</p> : null}
            {res.length ? <ul className="mt-1 max-h-40 overflow-auto rounded-lg border border-line">{res.map((p) => <li key={p.id}><button type="button" className="w-full px-2 py-1 text-left hover:bg-cream" onClick={() => { set({ ref: p.id, refNombre: p.nombre }); setRes([]); setQ(''); }}>{p.nombre}</button></li>)}</ul> : null}
          </div>
        )
      ) : null}
      {value.tipo === 'aliado' ? (
        <select value={value.ref} onChange={(e) => set({ ref: e.target.value })} className={input}><option value="">Elige al aliado…</option>{aliados.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select>
      ) : null}
      {value.tipo === 'equipo' ? (
        <select value={value.ref} onChange={(e) => set({ ref: e.target.value })} className={input}><option value="">Yo</option>{miembros.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
      ) : null}
      {value.tipo === 'otro' ? (
        <select value={value.canal} onChange={(e) => set({ canal: e.target.value })} className={input}>{CANALES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      ) : null}
      <input value={value.texto} onChange={(e) => set({ texto: e.target.value })} placeholder={value.tipo === 'otro' ? 'Campaña, evento o detalle (opcional)' : 'Detalle (opcional)'} className={input} />
    </div>
  );
}

function OrigenLinea({ personaId, origen, aliados, miembros, personaNombre }: { personaId: string; origen: OrigenPersona | null; aliados: { id: string; nombre: string }[]; miembros: Miembro[]; personaNombre: string }) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [v, setV] = useState<{ tipo: OrigenTipo; ref: string; canal: string; texto: string; refNombre?: string }>({ tipo: origen?.tipo ?? 'otro', ref: '', canal: origen?.canal ?? 'organico', texto: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const o = origen;
  const refAliado = o?.tipo === 'aliado' && o.ref ? `/trabajo/aliados/referidores` : null;
  return (
    <div className="mt-1 text-sm">
      <span>{o?.tipo === 'cliente' && o.ref ? <>Lo refirió <Link href={`/trabajo/p/${o.ref}`} className="font-semibold underline">{o.nombre}</Link></> : refAliado ? <>Lo trajo el aliado <Link href={refAliado} className="font-semibold underline">{o!.nombre}</Link>{o!.referido_estado === 'por_revisar' ? <span className="ml-1 text-xs text-amber-700">(atribución por revisar)</span> : null}</> : describirOrigen(o)}</span>
      {' '}<button type="button" className="text-xs underline" onClick={() => { setEditando((x) => !x); setMsg(null); }}>{editando ? 'cancelar' : o?.tipo ? 'corregir' : 'anotar'}</button>
      {editando ? (
        <div className="mt-2 rounded-xl bg-cream p-3">
          <OrigenPicker value={v} onChange={setV} aliados={aliados} miembros={miembros} excluir={personaId} />
          <button type="button" disabled={pending || ((v.tipo === 'cliente' || v.tipo === 'aliado') && !v.ref)} className={`${dark} mt-2`} onClick={() => start(async () => {
            const r = await fijarOrigen(personaId, v.tipo, v.ref || null, v.canal, v.texto) as R;
            setMsg(r.ok ? null : r.error ?? 'No se pudo.'); if (r.ok) { setEditando(false); router.refresh(); }
          })}>{pending ? 'Guardando…' : `Guardar cómo llegó ${personaNombre}`}</button>
          {msg ? <p className="mt-1 text-xs text-red-600">{msg}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

// ── Sesión programada por fuera ────────────────────────────────────────────
export type CitaMini = { id: string; inicio: string; estado: string; origen: string; notas: string | null; miembro_id: string | null; fuente: string | null };

export function SesionCard({ personaId, citas, miembros, yo, agendarSlot }: { personaId: string; citas: CitaMini[]; miembros: Miembro[]; yo: string; agendarSlot?: React.ReactNode }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [dt, setDt] = useState('');
  const [quien, setQuien] = useState(yo);
  const [notas, setNotas] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const futuras = citas.filter((c) => c.estado === 'programada' && new Date(c.inicio).getTime() > Date.now() - 2 * 3600000).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const nombre = (id: string | null) => miembros.find((x) => x.id === id)?.nombre?.split(' ')[0] ?? '—';
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center justify-between gap-2"><H>Sesión</H>{agendarSlot}</div>
      {futuras.length ? (
        <ul className="mt-2 space-y-1 text-sm">
          {futuras.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2">
              <b>{fmtDiaHora(c.inicio)}</b><span className="text-xs text-muted">con {nombre(c.miembro_id)}{c.fuente === 'gcal' ? ' · calendario' : c.origen === 'cliente' ? ' · la agendó él' : ''}{c.notas ? ` · ${c.notas}` : ''}</span>
              <button type="button" disabled={pending} className="text-[11px] text-muted underline" onClick={() => { if (!confirm('¿Cancelar esta sesión?')) return; start(async () => { const r = await cancelarCita(c.id, personaId) as R; setMsg(r.ok ? null : r.error ?? 'No se pudo.'); router.refresh(); }); }}>cancelar</button>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-sm text-muted">Sin sesión programada.</p>}
      <button type="button" className={`${line} mt-3`} onClick={() => setAbierto((x) => !x)}>{abierto ? 'Cerrar' : 'Registrar sesión programada por fuera'}</button>
      {abierto ? (
        <div className="mt-2 space-y-2 rounded-xl bg-cream p-3 text-xs">
          <p className="text-muted">Para cuando se acordó por teléfono o WhatsApp sin pasar por el calendario. Queda en Favoritos y dos días antes pasa a Calientes.</p>
          <input type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} className={input} />
          <select value={quien} onChange={(e) => setQuien(e.target.value)} className={input}>{miembros.map((x) => <option key={x.id} value={x.id}>{x.id === yo ? `${x.nombre} (yo)` : x.nombre}</option>)}</select>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Nota (opcional)" className={input} />
          <button type="button" disabled={pending || !dt} className={dark} onClick={() => start(async () => {
            const r = await registrarSesion(personaId, new Date(dt).toISOString(), quien, notas) as R;
            setMsg(r.ok ? null : r.error ?? 'No se pudo.'); if (r.ok) { setAbierto(false); setDt(''); setNotas(''); router.refresh(); }
          })}>{pending ? 'Guardando…' : 'Registrar'}</button>
        </div>
      ) : null}
      {msg ? <p className="mt-1 text-xs text-red-600">{msg}</p> : null}
    </section>
  );
}

// ── Oportunidad a mano ─────────────────────────────────────────────────────
export function AgregarOportunidad({ personaId, catalogo, abiertas }: { personaId: string; catalogo: { codigo: string; nombre: string; nombre_cliente?: string | null }[]; abiertas: string[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [nota, setNota] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pending, start] = useTransition();
  const opciones = catalogo.filter((c) => !abiertas.includes(c.codigo));
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center justify-between gap-2"><H>Oportunidad que viste tú</H><button type="button" className={line} onClick={() => setAbierto((x) => !x)}>{abierto ? 'Cerrar' : '+ Agregar'}</button></div>
      {abierto ? (
        <div className="mt-2 space-y-2 text-xs">
          <p className="text-muted">Para lo que el motor no detectó solo. Nace <b>detectada</b> y el motor no la cierra. Crédito a pensionados cierra las demás que estén abiertas.</p>
          <select value={codigo} onChange={(e) => setCodigo(e.target.value)} className={input}><option value="">Elige la oportunidad…</option>{opciones.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}</select>
          <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Por qué la ves (queda en la historia)" className={input} />
          <button type="button" disabled={pending || !codigo} className={dark} onClick={() => start(async () => {
            const r = await abrirOportunidad(personaId, codigo, nota) as R;
            setMsg({ ok: r.ok, texto: r.ok ? r.texto ?? 'Abierta.' : r.error ?? 'No se pudo.' }); if (r.ok) { setCodigo(''); setNota(''); setAbierto(false); router.refresh(); }
          })}>{pending ? 'Abriendo…' : 'Abrir oportunidad'}</button>
        </div>
      ) : <p className="mt-1 text-xs text-muted">{abiertas.length ? `${abiertas.length} abiertas.` : 'Ninguna abierta.'} Si ves una que el motor no sacó, agrégala aquí.</p>}
      {msg ? <p className={`mt-1 text-xs ${msg.ok ? 'text-muted' : 'text-red-600'}`}>{msg.texto}</p> : null}
    </section>
  );
}
