'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const card = 'mt-5 rounded-2xl border border-line bg-white p-5';
const btnDark = 'rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50';
const btn = 'rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-bold disabled:opacity-50';

export function MiAcciones({ tieneSemilla, cabecera, citas, beneficios = [] }: { tieneSemilla: boolean; cabecera: string | null; citas: { inicio: string; estado: string }[]; beneficios?: string[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [dt, setDt] = useState('');
  const [pending, start] = useTransition();
  const proxima = citas.find((c) => c.estado === 'programada' && new Date(c.inicio) > new Date());
  return (
    <section className={card}>
      <h2 className="text-sm font-bold">Tu experto</h2>
      <p className="mt-1 text-xs text-muted">{cabecera ? `Tu experto asignado es ${cabecera}.` : 'Todavía no tienes asesor asignado; el primer experto que te atienda quedará asignado a tu caso.'}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button disabled={pending} className={btnDark} onClick={() => start(async () => {
          const { error } = await supabase.schema('trol3').rpc('pedir_humano', { p_motivo: 'Solicitud desde mi expediente' });
          setMsg(error ? error.message : 'Listo, un asesor te contacta por WhatsApp.');
        })}>Quiero hablar con un asesor</button>
        <button disabled={pending} className={btn} onClick={() => start(async () => {
          const { data, error } = await supabase.schema('trol3').rpc('pedir_consulta_mia', { p_tipo: 'imss_historial' });
          const r = data as { ok?: boolean; motivo?: string } | null;
          setMsg(error ? error.message : r?.ok ? 'Pedimos tu información oficial al IMSS. Te avisamos cuando llegue.' : r?.motivo === 'validado_vigente' ? 'Tu información oficial ya está actualizada.' : 'Ya hay una consulta en curso.');
          router.refresh();
        })}>Actualizar mi información del IMSS</button>
        {tieneSemilla && beneficios.includes('calculadora') && <Link href="/calculadora" className={btn}>Probar escenarios (calculadora)</Link>}
        <Link href="/mi?tab=asesorias" className={btn}>Ver asesorías y precios</Link>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs text-muted">{proxima ? `Tu próxima cita: ${new Date(proxima.inicio).toLocaleString('es-MX')}` : 'Agenda una llamada:'}</span>
        {!proxima && <>
          <input type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} className="rounded-lg border border-line px-2 py-1.5 text-xs" />
          <button disabled={pending || !dt} className={btn} onClick={() => start(async () => {
            const { error } = await supabase.schema('trol3').rpc('agendar_mio', { p_inicio: new Date(dt).toISOString(), p_notas: 'Agendada desde mi expediente' });
            setMsg(error ? error.message : 'Cita agendada. Te confirmamos por WhatsApp.');
            router.refresh();
          })}>Agendar</button>
        </>}
      </div>
      {msg && <p className="mt-2 text-xs text-green-700">{msg}</p>}
    </section>
  );
}

const PLACEHOLDER: Record<string, string> = { dolor_principal: '¿Qué es lo que más te preocupa de tu pensión?', expectativa: '¿Qué te gustaría lograr?', empleo_actual: 'Empresa o actividad' };

export function CompletarDatos({ campos }: { campos: { campo: string; nombre: string; tipo: string; grupo: string; opciones?: string[] | null }[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [verTodos, setVerTodos] = useState(false);
  const lista = verTodos ? campos : campos.slice(0, 6);
  if (!campos.length) return <p className="text-sm text-muted">¡Tu expediente está completo con lo que puedes declarar!</p>;
  const parse = (c: { tipo: string }, v: string): unknown => c.tipo === 'number' ? Number(v.replace(/[^0-9.\-]/g, '')) : c.tipo === 'bool' ? v === 'si' : v;
  return (
    <div className="space-y-2">
      {lista.map((c) => (
        <div key={c.campo} className="flex flex-wrap items-center gap-2 text-sm">
          <label className="w-full sm:w-56 text-xs text-muted">{c.nombre}</label>
          {c.tipo === 'bool' ? (
            <select value={vals[c.campo] ?? ''} onChange={(e) => setVals({ ...vals, [c.campo]: e.target.value })} className="flex-1 rounded-lg border border-line px-2 py-1.5"><option value="">—</option><option value="si">Sí</option><option value="no">No</option></select>
          ) : c.opciones?.length ? (
            <select value={vals[c.campo] ?? ''} onChange={(e) => setVals({ ...vals, [c.campo]: e.target.value })} className="flex-1 rounded-lg border border-line px-2 py-1.5"><option value="">—</option>{c.opciones.map((o) => <option key={o} value={o}>{o}</option>)}</select>
          ) : (
            <input type={c.tipo === 'number' ? 'number' : c.tipo === 'date' ? 'date' : 'text'} value={vals[c.campo] ?? ''} onChange={(e) => setVals({ ...vals, [c.campo]: e.target.value })} placeholder={PLACEHOLDER[c.campo] ?? ''} className="flex-1 rounded-lg border border-line px-2 py-1.5" />
          )}
        </div>
      ))}
      {campos.length > 6 && <button className="text-xs underline" onClick={() => setVerTodos(!verTodos)}>{verTodos ? 'Ver menos' : `Ver ${campos.length - 6} más`}</button>}
      <div>
        <button disabled={pending} className={btnDark} onClick={() => start(async () => {
          let n = 0; let err: string | null = null;
          for (const c of campos) {
            const v = vals[c.campo];
            if (v == null || v === '') continue;
            const { error } = await supabase.schema('trol3').rpc('declarar_mio', { p_campo: c.campo, p_valor: parse(c, v) });
            if (error) err = error.message.includes('dato_validado') ? 'Ya tenemos ese dato oficial; usa la calculadora para probar escenarios.' : error.message; else n++;
          }
          setMsg(err ?? `Guardado (${n}).`);
          setVals({});
          router.refresh();
        })}>Guardar</button>
        {msg && <span className="ml-3 text-xs text-muted">{msg}</span>}
      </div>
    </div>
  );
}


/* ---------- CTA por misión ---------- */
export function MisionCta({ mision, campos, compacto = false }: { mision: { codigo: string; cta?: string | null; estado: string }; campos: { campo: string; nombre: string; tipo: string; grupo: string; opciones?: string[] | null }[]; compacto?: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cls = compacto ? 'rounded-lg bg-ink px-3 py-1 text-xs font-bold text-white disabled:opacity-50' : btnDark;
  const clsAlt = compacto ? 'rounded-lg border border-line bg-white px-3 py-1 text-xs font-bold' : btn;
  const cta = mision.cta;
  if (!cta) return null;
  if (cta === 'curp') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input value={val} onChange={(e) => setVal(e.target.value.toUpperCase())} maxLength={18} placeholder="Tu CURP (18 caracteres)" className="w-56 rounded-lg border border-line px-2 py-1.5 font-mono text-sm uppercase" />
        <button disabled={pending || val.length !== 18} className={cls} onClick={() => start(async () => {
          const { error } = await supabase.schema('trol3').rpc('declarar_mio', { p_campo: 'curp', p_valor: val });
          if (error) return setMsg(error.message);
          await supabase.schema('trol3').rpc('pedir_consulta_mia', { p_tipo: 'imss_historial' });
          setMsg('¡Gracias! Ya buscamos tu información oficial (+20 pts).'); router.refresh();
        })}>Enviar</button>
        {msg && <span className="text-xs text-green-700">{msg}</span>}
      </div>
    );
  }
  if (cta === 'consulta_imss') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={pending} className={cls} onClick={() => start(async () => {
          const { data, error } = await supabase.schema('trol3').rpc('pedir_consulta_mia', { p_tipo: 'imss_historial' });
          const r = data as { ok?: boolean; motivo?: string } | null;
          setMsg(error ? error.message : r?.ok ? 'Listo, la pedimos. Te avisamos cuando llegue.' : r?.motivo === 'validado_vigente' ? 'Tu información ya está al día.' : 'Ya está en proceso.'); router.refresh();
        })}>Buscar mi información</button>
        {msg && <span className="text-xs text-green-700">{msg}</span>}
      </div>
    );
  }
  if (cta === 'completar') {
    if (compacto) return <Link href="/mi?tab=expediente" className={cls}>Completar</Link>;
    return <CompletarDatos campos={campos.slice(0, 4)} />;
  }
  if (cta === 'afore') {
    const opts = campos.find((c) => c.campo === 'afore_actual')?.opciones ?? ['Azteca','Banorte','Citibanamex','Coppel','Inbursa','Invercap','PensionISSSTE','Principal','Profuturo','SURA'];
    return (
      <div className="flex flex-wrap items-center gap-2">
        <select value={val} onChange={(e) => setVal(e.target.value)} className="rounded-lg border border-line px-2 py-1.5 text-sm"><option value="">¿Cuál es tu AFORE?</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}<option value="__nose">No sé</option></select>
        {val && val !== '__nose' && <button disabled={pending} className={cls} onClick={() => start(async () => {
          const { error } = await supabase.schema('trol3').rpc('declarar_mio', { p_campo: 'afore_actual', p_valor: val });
          setMsg(error ? error.message : 'Guardado (+5 pts). Evalúala en la encuesta y gana 50 más.'); router.refresh();
        })}>Guardar</button>}
        {val === '__nose' && <span className="text-xs text-muted">Sin problema: la buscamos por ti al consultar la CONSAR.</span>}
        <Link href="/encuesta" className={clsAlt}>Evaluar mi AFORE (+50)</Link>
        {msg && <span className="text-xs text-green-700">{msg}</span>}
      </div>
    );
  }
  if (cta === 'agendar') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {!open && <button className={cls} onClick={() => setOpen(true)}>Agendar llamada</button>}
        {open && <>
          <input type="datetime-local" value={val} onChange={(e) => setVal(e.target.value)} className="rounded-lg border border-line px-2 py-1.5 text-xs" />
          <button disabled={pending || !val} className={cls} onClick={() => start(async () => {
            const { error } = await supabase.schema('trol3').rpc('agendar_mio', { p_inicio: new Date(val).toISOString(), p_notas: 'Agendada desde misiones' });
            setMsg(error ? error.message : 'Cita agendada. Te confirmamos por WhatsApp.'); router.refresh();
          })}>Confirmar</button>
        </>}
        <HablarBoton texto="Mejor escríbanme" compacto={compacto} />
        {msg && <span className="text-xs text-green-700">{msg}</span>}
      </div>
    );
  }
  if (cta === 'referir') return <Link href="/referidos" className={cls}>Invitar</Link>;
  return <HablarBoton texto="Hablar con mi experto" compacto={compacto} />;
}

export function HablarBoton({ texto = 'Hablar con mi experto', compacto = false }: { texto?: string; compacto?: boolean }) {
  const supabase = createClient();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <button disabled={pending || !!msg} className={compacto ? 'rounded-lg border border-line bg-white px-3 py-1 text-xs font-bold disabled:opacity-50' : btn} onClick={() => start(async () => {
        const { error } = await supabase.schema('trol3').rpc('pedir_humano', { p_motivo: texto });
        setMsg(error ? error.message : 'Listo, te contactamos por WhatsApp.');
      })}>{texto}</button>
      {msg && <span className="text-xs text-green-700">{msg}</span>}
    </span>
  );
}

export function CanjearBoton({ producto, precio, saldo }: { producto: string; precio: number; saldo: number }) {
  const supabase = createClient();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const alcanza = saldo >= precio;
  return (
    <span className="inline-flex items-center gap-2">
      <button disabled={pending || !alcanza} title={alcanza ? '' : `Te faltan ${precio - saldo} puntos`} className="rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-bold disabled:opacity-50" onClick={() => start(async () => {
        const { data, error } = await supabase.schema('trol3').rpc('canjear_puntos', { p_producto: producto });
        const r = data as { ok?: boolean; motivo?: string } | null;
        setMsg(error ? error.message : r?.ok ? '¡Listo! Ya está habilitado.' : r?.motivo ?? 'No se pudo'); router.refresh();
      })}>{alcanza ? `Usar ${precio} puntos` : `${precio} pts (tienes ${saldo})`}</button>
      {msg && <span className="text-xs text-green-700">{msg}</span>}
    </span>
  );
}
