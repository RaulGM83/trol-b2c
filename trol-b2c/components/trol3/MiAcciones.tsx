'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { waLink } from '@/lib/whatsapp';

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
        <HablarBoton texto="Hablar con mi experto por WhatsApp" mensaje="Hola, soy cliente de Trol y quiero hablar con mi experto sobre mi pensión. Vengo de mi expediente en app.trol.mx." oscuro />
        <button disabled={pending} className={btn} onClick={() => start(async () => {
          const { data, error } = await supabase.schema('trol3').rpc('pedir_consulta_mia', { p_tipo: 'imss_historial' });
          const r = data as { ok?: boolean; motivo?: string } | null;
          setMsg(error ? error.message : r?.ok ? 'Pedimos tu información oficial al IMSS. Te avisamos cuando llegue.' : r?.motivo === 'validado_vigente' ? 'Tu información oficial ya está actualizada.' : 'Ya hay una consulta en curso.');
          router.refresh();
        })}>Actualizar mi información del IMSS</button>
        {tieneSemilla && beneficios.includes('calculadora') && <Link href="/calculadora" className={btn}>Abrir mi calculadora</Link>}
        <Link href="/mi?tab=asesorias" className={btn}>Ver asesorías y precios</Link>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs text-muted">{proxima ? `Tu próxima sesión: ${new Date(proxima.inicio).toLocaleString('es-MX')}` : 'Programa una sesión con tu experto:'}</span>
        {!proxima && <HablarBoton texto="Programar sesión" mensaje="Hola, quiero programar una sesión con mi experto de Trol para revisar mi pensión. ¿Cuándo pueden contactarme? Vengo de mi expediente en app.trol.mx." compacto />}
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
export function MisionCta({ mision, campos, compacto = false }: { mision: { codigo: string; cta?: string | null; estado: string; titulo?: string; detalle?: string; clabe?: string | null }; campos: { campo: string; nombre: string; tipo: string; grupo: string; opciones?: string[] | null }[]; compacto?: boolean }) {
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
    return <HablarBoton texto="Programar sesión por WhatsApp" mensaje="Hola, quiero programar una sesión con mi experto de Trol para entender mi situación de pensión. ¿Cuándo pueden contactarme? Vengo de mi expediente en app.trol.mx." compacto={compacto} oscuro />;
  }
  if (cta === 'infonavit') {
    if (compacto) return <Link href="/mi?tab=expediente" className={cls}>Contestar</Link>;
    return <CompletarDatos campos={campos.filter((c) => ['credito_infonavit_vigente', 'saldo_infonavit'].includes(c.campo))} />;
  }
  if (cta === 'ahorrar') {
    const m = mision as { detalle?: string; clabe?: string | null };
    return (
      <div className="w-full text-xs">
        {m.clabe ? <div className="rounded-lg bg-cream p-2 font-mono text-sm">CLABE: {m.clabe}</div> : <p className="text-muted">Tu experto te comparte la CLABE y los pasos por WhatsApp.</p>}
        <div className="mt-2 flex flex-wrap gap-2"><HablarBoton texto="Quiero ahorrar" mensaje="Hola, quiero empezar a ahorrar para mi retiro con Millas para el Retiro. ¿Me comparten la CLABE y los pasos? Vengo de mi expediente en app.trol.mx." compacto={compacto} oscuro /></div>
      </div>
    );
  }
  if (cta === 'referir') return <Link href="/referidos" className={cls}>Invitar</Link>;
  return <HablarBoton texto="Hablar con mi experto" mensaje={`Hola, quiero hablar con mi experto de Trol sobre: ${(mision as { titulo?: string }).titulo ?? 'mi pensión'}. Vengo de mi expediente en app.trol.mx.`} compacto={compacto} oscuro />;
}

/** Registra el handoff y abre WhatsApp con el mensaje listo: la conversación la inicia el cliente. */
export function HablarBoton({ texto = 'Hablar con mi experto', mensaje, compacto = false, oscuro = false }: { texto?: string; mensaje?: string; compacto?: boolean; oscuro?: boolean }) {
  const supabase = createClient();
  const [pending, start] = useTransition();
  const cls = oscuro ? (compacto ? 'rounded-lg bg-ink px-3 py-1 text-xs font-bold text-white disabled:opacity-50' : btnDark) : (compacto ? 'rounded-lg border border-line bg-white px-3 py-1 text-xs font-bold disabled:opacity-50' : btn);
  const texto_wa = mensaje ?? `Hola, soy cliente de Trol y quiero hablar con mi experto: ${texto}. Vengo de mi expediente en app.trol.mx.`;
  return (
    <button disabled={pending} className={cls} onClick={() => start(async () => {
      const url = waLink(texto_wa);
      const w = window.open(url, '_blank');
      try { await supabase.schema('trol3').rpc('pedir_humano', { p_motivo: texto }); } catch {}
      if (!w) window.location.href = url;
    })}>{texto}</button>
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
        setMsg(error ? error.message : r?.ok ? '¡Listo! Ya está habilitado.' : r?.motivo ?? 'No se pudo'); if (r?.ok) { setTimeout(() => window.location.reload(), 600); } else router.refresh();
      })}>{alcanza ? `Usar ${precio} puntos` : `${precio} pts (tienes ${saldo})`}</button>
      {msg && <span className="text-xs text-green-700">{msg}</span>}
    </span>
  );
}

export function AhorrarPuntos({ saldo }: { saldo: number }) {
  const supabase = createClient();
  const router = useRouter();
  const [pts, setPts] = useState(String(Math.max(100, Math.floor(saldo / 10) * 10)));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = Number(pts) || 0;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <input type="number" step={10} min={100} value={pts} onChange={(e) => setPts(e.target.value)} className="w-28 rounded-lg border border-line px-2 py-1.5" />
      <span className="text-xs text-muted">= {new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n / 10)}</span>
      <button disabled={pending || n < 100 || n > saldo || n % 10 !== 0} className={btnDark} onClick={() => start(async () => {
        const { data, error } = await supabase.schema('trol3').rpc('solicitar_ahorro_puntos', { p_puntos: n });
        const r = data as { ok?: boolean; motivo?: string; pesos?: number } | null;
        setMsg(error ? error.message : r?.ok ? `Listo: enviaremos ${r.pesos} MXN a tu ahorro.` : r?.motivo ?? 'No se pudo'); router.refresh();
      })}>Enviar a mi ahorro</button>
      {msg && <span className="text-xs text-green-700">{msg}</span>}
    </div>
  );
}

export function SolicitarDoc({ tipo, precio }: { tipo: string; precio: number | null }) {
  const supabase = createClient();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button disabled={pending || !!msg} className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-50" onClick={() => start(async () => {
        const { error } = await supabase.schema('trol3').rpc('mi_solicitar_documento', { p_tipo: tipo });
        setMsg(error ? error.message : 'Solicitado. Te avisamos cuando esté.'); router.refresh();
      })}>{precio ? `Solicitar · ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(precio)}` : 'Solicitar (gratis)'}</button>
      {msg && <span className="text-[11px] text-green-700">{msg}</span>}
    </span>
  );
}

export function DesbloquearDoc({ tipo, precio, maxPct, saldo }: { tipo: string; precio: number | null; maxPct: number; saldo: number }) {
  const p = precio ?? 0;
  const conPuntos = Math.min(saldo, Math.floor((p * maxPct) / 100));
  return (
    <span className="inline-flex flex-col items-end gap-1 text-[11px] text-muted">
      <HablarBoton texto={`Desbloquear · ${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(p)}`} mensaje={`Hola, quiero desbloquear mi documento "${tipo}" (${p} MXN${conPuntos ? `, usando ${conPuntos} puntos` : ''}). ¿Me pasan los datos de pago? Vengo de mi expediente en app.trol.mx.`} compacto oscuro />
      {conPuntos > 0 ? <span>hasta {conPuntos} pts ({maxPct}%)</span> : null}
    </span>
  );
}
