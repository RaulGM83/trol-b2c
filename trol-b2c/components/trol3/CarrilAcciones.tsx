'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { activarCliente, registrarContacto, tomarCabecera, carrilMarcar, carrilDespertar, asignarCabecera, noAplicaOportunidad } from '@/app/trabajo/actions';

const dark = 'rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50';
const line = 'rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-50';
const quiet = 'rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink disabled:opacity-50';
const adm = 'rounded-lg border border-dashed border-sky-700 bg-white px-3 py-1.5 text-xs font-semibold text-sky-800 disabled:opacity-50';

export type Miembro = { id: string; nombre: string | null };
export type FilaCarril = {
  persona_id: string; nombre?: string | null; chat_abierto: boolean; telefono: string | null; no_contactar: boolean; cabecera_id: string | null;
  oportunidad: string | null; oportunidad_id: string | null; oportunidad_estado?: string | null;
  carril: 'favoritos' | 'calientes' | 'tibios' | 'frios' | 'descartado'; origen: string;
  marca?: { id: string; marca: string; motivo?: string | null; nota?: string | null; hasta?: string | null; toques?: number; por_miembro_id?: string | null; en?: string | null } | null;
  ultimo_gesto?: string | null; ultimo_toque?: string | null; toques_30d?: number; vuelve_el?: string | null; en_proceso?: boolean; pide_equipo?: boolean;
  potencial?: { oportunidad_id?: string; nombre?: string; potencial?: number; valor?: number; urgencia_fecha?: string | null; factor?: number } | null;
  toque?: { n: number; tipo?: 'plantilla' | 'lukas' | 'llamada' } | null; tramo?: number;
};

export const MOTIVOS_FRIO: [string, string][] = [
  ['no_le_interesa_ahora', 'No le interesa ahora'], ['sin_dinero', 'Sin dinero'], ['lo_va_a_pensar', 'Lo va a pensar'],
  ['no_contesto', 'No contestó'], ['ya_lo_resolvio', 'Ya lo resolvió'], ['otro', 'Otro'],
];
const MOTIVOS_DESCARTE: [string, string][] = [['no_contactar', 'Pidió que no le escribamos'], ['numero_equivocado', 'Número equivocado'], ['fallecio', 'Falleció'], ['otro', 'Otro']];
const MOTIVOS_NO_APLICA: [string, string][] = [['ya_lo_hizo', 'Ya lo hizo por su cuenta'], ['no_cumple_requisitos', 'No cumple requisitos'], ['datos_imss_equivocados', 'Datos del IMSS equivocados'], ['no_le_conviene', 'No le conviene'], ['otro', 'Otro']];
const FECHAS_FAVORITO: [string, string][] = [['', 'Sin fecha'], ['14', 'En 2 semanas'], ['30', 'En 1 mes'], ['90', 'En 3 meses'], ['fecha', 'Fecha…']];

type Hoja = 'enfriar' | 'descartar' | 'noaplica' | 'favorito' | 'asignar' | 'despertar_para' | null;
const isoEn = (dias: number) => { const d = new Date(); d.setDate(d.getDate() + dias); return d.toISOString().slice(0, 10); };

/**
 * 187 · Los gestos del asesor sobre un renglón, por carril (claude/84). Cada botón registra algo
 * que antes no se registraba: Contestó alimenta el pulso; Enfriar/Favorito/Descartar liberan el
 * tope con motivo; No aplica cierra sólo esa oportunidad; Asignar/Despertar para son de admin.
 */
export function CarrilAcciones({ fila, takoUrl, libres = 99, alcance = 'mios', esAdmin = false, miembros = [], equipo = false }: {
  fila: FilaCarril; takoUrl: string | null; libres?: number; alcance?: 'mios' | 'pozo'; esAdmin?: boolean; miembros?: Miembro[]; equipo?: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [hoja, setHoja] = useState<Hoja>(null);
  const [pick, setPick] = useState<string>('');
  const [nota, setNota] = useState('');
  const [fecha, setFecha] = useState('');
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; texto?: string }>, exito: string) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? { ok: true, texto: r.texto ?? exito } : { ok: false, texto: r.error ?? 'No se pudo.' });
    if (r.ok) { setHoja(null); setPick(''); setNota(''); router.refresh(); }
  });
  const abrir = (h: Hoja) => { setHoja(hoja === h ? null : h); setPick(''); setNota(''); setFecha(''); setMsg(null); };

  const opAbierta = !!fila.oportunidad_id && !fila.no_contactar && ['detectada', 'presentada', 'interesada', undefined, null].includes(fila.oportunidad_estado as never);
  const lleno = libres <= 0;
  const pozo = alcance === 'pozo';
  const tel = fila.telefono ? `tel:+52${String(fila.telefono).replace(/\D/g, '').slice(-10)}` : null;

  // ── Tocar (Tibios): la acción concreta del toque que corresponde
  const avisar = (etiqueta: string) => (
    <button disabled={pending || lleno || !opAbierta} title={lleno ? 'Tope del día: espera a que alguien reaccione o a mañana' : undefined} className={dark}
      onClick={() => {
        const aviso = fila.chat_abierto ? `Le llegará dentro de su chat: “Encontramos algo en tu caso: ${fila.oportunidad}”.` : `Su chat está cerrado: saldrá la plantilla de “${fila.oportunidad}”. Sólo se puede una al día.`;
        if (!window.confirm(`${aviso}${pozo ? '\nQueda como tuyo.' : ''}\n\n¿La mandamos? Pasa a Calientes por hoy.`)) return;
        run(() => activarCliente(fila.oportunidad_id as string, fila.persona_id), 'Enviado. Pasa a Calientes por hoy.');
      }}>{pozo ? `Tomar y ${etiqueta.toLowerCase()}` : etiqueta}</button>
  );
  const contacto = (resultado: 'contesto' | 'no_contesto' | 'atendido_chat', texto: string) => async () => {
    if (pozo) { const r = await tomarCabecera(fila.persona_id) as { ok: boolean; error?: string }; if (!r.ok) return r; }
    return registrarContacto(fila.persona_id, resultado) as Promise<{ ok: boolean; error?: string; texto?: string }>;
  };
  const llamadas = (primaria = false) => (
    <>
      {tel ? <a href={tel} className={primaria ? dark : line}>{pozo ? 'Tomar y llamar' : 'Llamar'}</a> : null}
      <button disabled={pending} className={line} onClick={() => run(contacto('contesto', ''), 'Anotado: contestó. Sigue en Calientes 7 días.')}>Contestó</button>
      <button disabled={pending || (lleno && fila.carril !== 'calientes')} className={line} onClick={() => run(contacto('no_contesto', ''), 'Anotado: no contestó. Si no reacciona, esta noche baja a Fríos.')}>No contestó</button>
    </>
  );
  const tocar = () => {
    const tipo = fila.toque?.tipo ?? 'plantilla';
    if (tipo === 'plantilla' || (tipo === 'lukas' && fila.chat_abierto)) return avisar(fila.chat_abierto ? 'Avisarle por Lukas' : 'Mandar plantilla');
    return llamadas(true);
  };

  // ── Botones por carril
  let principales: React.ReactNode = null;
  let secundarios: React.ReactNode = null;
  const chat = takoUrl ? <a href={takoUrl} target="_blank" rel="noreferrer" className={dark}>Abrir chat</a> : null;
  const enfriar = <button disabled={pending} className={quiet} onClick={() => abrir('enfriar')}>Enfriar</button>;
  const favorito = <button disabled={pending} className={quiet} onClick={() => abrir('favorito')}>Favorito</button>;
  const noAplica = fila.oportunidad_id ? <button disabled={pending} className={quiet} onClick={() => abrir('noaplica')}>No aplica…</button> : null;
  const descartar = <button disabled={pending} className={quiet} onClick={() => abrir('descartar')}>Descartar</button>;
  const asignar = esAdmin && equipo ? <button disabled={pending} className={adm} onClick={() => abrir('asignar')}>Asignar a…</button> : null;
  const despertarPara = esAdmin && equipo ? <button disabled={pending} className={adm} onClick={() => abrir('despertar_para')}>Despertar para…</button> : null;

  if (fila.carril === 'calientes') {
    if (fila.origen === 'reacciono' || fila.origen === 'llego_hoy') principales = <>{chat}<button disabled={pending} className={line} onClick={() => run(() => registrarContacto(fila.persona_id, 'atendido_chat'), 'Anotado: atendido.')}>Ya lo atendí</button></>;
    else if (fila.origen === 'cita') principales = <Link href={`/trabajo/p/${fila.persona_id}?tab=asesoria`} className={dark}>Preparar asesoría</Link>;
    else if (fila.origen === 'tramite' || fila.origen === 'asignado') principales = <><Link href={`/trabajo/p/${fila.persona_id}?tab=oportunidades`} className={dark}>Ver trámite</Link><button disabled={pending} className={line} onClick={() => run(() => registrarContacto(fila.persona_id, 'contesto'), 'Anotado: contestó.')}>Contestó</button></>;
    else if (fila.origen === 'tocado') principales = <>{fila.chat_abierto ? chat : null}<button disabled={pending} className={line} onClick={() => run(() => registrarContacto(fila.persona_id, 'contesto'), 'Anotado: contestó. Ya no cuenta en el tope.')}>Contestó</button></>;
    else principales = llamadas(true);
    secundarios = <>{enfriar}{favorito}{noAplica}{asignar}</>;
  } else if (fila.carril === 'tibios') {
    principales = tocar();
    secundarios = <>{noAplica}{!pozo ? enfriar : null}{asignar}{despertarPara}</>;
  } else if (fila.carril === 'favoritos') {
    if (fila.en_proceso) principales = <><Link href={`/trabajo/p/${fila.persona_id}?tab=oportunidades`} className={dark}>Ver trámite</Link>{fila.chat_abierto && takoUrl ? <a href={takoUrl} target="_blank" rel="noreferrer" className={line}>Abrir chat</a> : null}</>;
    else principales = <button disabled={pending} className={line} onClick={() => run(() => carrilMarcar(fila.persona_id, 'favorito', null, fila.marca?.nota ?? null, isoEn(0)), 'En Calientes hoy (no cuenta en el tope).')}>Traer a Calientes hoy</button>;
    secundarios = <>{!fila.en_proceso ? enfriar : null}{fila.cabecera_id ? null : asignar}{fila.cabecera_id ? asignar : null}{fila.en_proceso && esAdmin && equipo ? despertarPara : null}</>;
  } else if (fila.carril === 'frios') {
    principales = <button disabled={pending} className={line} onClick={() => run(() => carrilDespertar(fila.persona_id), 'Despierta: vuelve a Tibios por su potencial.')}>Despertar</button>;
    secundarios = <>{descartar}{noAplica}{asignar}{despertarPara}</>;
  }

  // ── Hojas (motivo / fecha / asesor)
  const opciones = hoja === 'enfriar' ? MOTIVOS_FRIO : hoja === 'descartar' ? MOTIVOS_DESCARTE : hoja === 'noaplica' ? MOTIVOS_NO_APLICA : hoja === 'favorito' ? FECHAS_FAVORITO
    : (hoja === 'asignar' || hoja === 'despertar_para') ? miembros.map((m) => [m.id, m.nombre?.split(' ')[0] ?? m.id] as [string, string]) : [];
  const titulo = { enfriar: '¿Por qué lo enfrías? El motivo decide cuándo vuelve.', descartar: 'Descartar: no regresa por detonador, sólo si escribe.', noaplica: `Esta oportunidad no aplica porque… (cierra sólo “${fila.oportunidad ?? ''}”)`, favorito: 'Favorito: no cuenta en el tope. Con fecha, ese día vuelve a Calientes.', asignar: 'Asignar a…', despertar_para: 'Despertar para… (hasta arriba de sus Tibios, con tu nota)' }[hoja ?? 'enfriar'];
  const listo = hoja === 'favorito' ? (pick !== 'fecha' || !!fecha) : !!pick;
  const guardar = () => {
    if (hoja === 'enfriar') run(() => carrilMarcar(fila.persona_id, 'frio', pick, nota), 'A Fríos. Libera un lugar.');
    if (hoja === 'descartar') run(() => carrilMarcar(fila.persona_id, 'descartado', pick, nota), 'Descartado.');
    if (hoja === 'noaplica') run(() => noAplicaOportunidad(fila.oportunidad_id as string, fila.persona_id, pick, nota), 'Oportunidad cerrada.');
    if (hoja === 'favorito') run(() => carrilMarcar(fila.persona_id, 'favorito', null, nota, pick === 'fecha' ? fecha : pick ? isoEn(Number(pick)) : null), 'Favorito.');
    if (hoja === 'asignar') run(() => asignarCabecera([fila.persona_id], pick), 'Asignado.');
    if (hoja === 'despertar_para') {
      const directo = fila.en_proceso && window.confirm('Es un trámite en proceso. ¿Directo a sus Calientes de hoy? (Cancelar = hasta arriba de sus Tibios)');
      run(() => carrilDespertar(fila.persona_id, pick, nota, !!directo), directo ? 'En sus Calientes de hoy.' : 'Hasta arriba de sus Tibios.');
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">{principales}{secundarios}</div>
      {hoja ? (
        <div className="mt-1 w-full max-w-md rounded-xl bg-cream p-3 text-left">
          <div className="text-xs font-bold">{titulo}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {opciones.map(([v, l]) => <button key={v || 'sin'} type="button" className={pick === v ? 'rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-white' : 'rounded-full border border-line bg-white px-2.5 py-1 text-[11px] font-semibold'} onClick={() => setPick(v)}>{l}</button>)}
            {hoja === 'favorito' && pick === 'fecha' ? <input type="date" aria-label="Fecha" className="rounded-lg border border-line bg-white px-2 py-1 text-xs" value={fecha} min={isoEn(1)} onChange={(e) => setFecha(e.target.value)} /> : null}
          </div>
          {hoja !== 'asignar' ? <input aria-label="Nota" className="mt-2 w-full rounded-lg border border-line bg-white px-2 py-1 text-xs" placeholder={hoja === 'despertar_para' ? 'Nota para el asesor (opcional)' : 'Nota (opcional)'} value={nota} onChange={(e) => setNota(e.target.value)} /> : null}
          <div className="mt-2 flex justify-end gap-1.5">
            <button type="button" className={quiet} onClick={() => setHoja(null)}>Cancelar</button>
            <button type="button" disabled={pending || !listo} className={dark} onClick={guardar}>Guardar</button>
          </div>
        </div>
      ) : null}
      {msg ? <span className={msg.ok ? 'text-[11px] text-green-700' : 'max-w-[280px] text-right text-[11px] text-red-600'}>{msg.texto}</span> : null}
    </div>
  );
}
