'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { waLink } from '@/lib/whatsapp';
import { mensajeError } from '@/lib/trol3/errores';
import { miSubirDocumento } from '@/app/mi/actions';

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
        {tieneSemilla && beneficios.includes('calculadora') && <Link href="/mi?tab=calculadora" className={btn}>Abrir mi calculadora</Link>}
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


/* ---------- Identidad: confirmar o corregir la CURP ---------- */

/** Lo que devuelve `mi_identidad()` (migración 074). */
export type Identidad = {
  curp: string | null;
  estatus: string;
  mensaje: string | null;
  editable: boolean;
  puede_confirmar: boolean;
  ultimo_intento: { estado?: string | null; proveedor?: string | null; fecha?: string | null } | null;
};

const CURP_RE = /^[A-Z]{4}\d{6}[A-Z]{6}[A-Z0-9]\d$/;

/** Estatus en los que hay algo que hacer o que explicar. Con el resto no molestamos al cliente. */
export const IDENTIDAD_VISIBLE = ['por_confirmar', 'confirmada_con_problema'];

/**
 * Las dos salidas del callejón de la 068: o la CURP trae un dedazo (se corrige y
 * la base relanza IMSS y CDA sola por `tg_curp_consultas`), o viene bien en el
 * documento y entonces el problema está en cómo quedó registrada la cuenta.
 */
export function CurpAcciones({ identidad, compacto = false }: { identidad: Identidad; compacto?: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [val, setVal] = useState('');
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cls = compacto ? 'rounded-lg bg-ink px-3 py-1 text-xs font-bold text-white disabled:opacity-50' : btnDark;
  const clsAlt = compacto ? 'rounded-lg border border-line bg-white px-3 py-1 text-xs font-bold disabled:opacity-50' : btn;

  const corregir = () => start(async () => {
    setErr(null); setOk(null);
    const nueva = val.trim().toUpperCase();
    if (!CURP_RE.test(nueva)) { setErr('Revisa la CURP: son 18 caracteres, tal como vienen en tu documento.'); return; }
    if (nueva === (identidad.curp ?? '').toUpperCase()) { setErr('Esa es la CURP que ya tenemos. Si así viene en tu documento, usa el otro botón.'); return; }
    const { error } = await supabase.schema('trol3').rpc('declarar_mio', { p_campo: 'curp', p_valor: nueva });
    if (error) { setErr(mensajeError(error)); return; }
    // `declarar` NO lanza error cuando la CURP ya es de otro expediente: emite el evento
    // `curp_duplicada`, deja la anterior y devuelve normal. La única forma de saberlo desde
    // aquí es releer la identidad y ver si de verdad se guardó.
    const { data } = await supabase.schema('trol3').rpc('mi_identidad');
    const guardada = ((data as Identidad | null)?.curp ?? '').toUpperCase();
    if (guardada && guardada !== nueva) { setErr(mensajeError({ message: 'curp_duplicada' })); return; }
    setOk('Listo, la corregimos. Ya estamos volviendo a buscar tu información oficial; te avisamos en cuanto llegue.');
    setAbierto(false); setVal(''); router.refresh();
  });

  const confirmar = () => start(async () => {
    setErr(null); setOk(null);
    const { data, error } = await supabase.schema('trol3').rpc('confirmar_curp');
    if (error) { setErr(mensajeError(error)); return; }
    const r = data as { ok?: boolean; motivo?: string } | null;
    if (!r?.ok) { setErr(r?.motivo === 'nada_que_confirmar' ? 'Tu identidad ya no necesita confirmarse; recarga la página para ver cómo quedó.' : 'No se pudo confirmar.'); return; }
    setOk('Gracias. Con eso sabemos que hay que revisar cómo quedó registrada tu cuenta; tu experto lo toma desde aquí.');
    router.refresh();
  });

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-2">
        {identidad.editable && (
          <button disabled={pending} className={abierto ? clsAlt : cls} onClick={() => { setAbierto(!abierto); setErr(null); setOk(null); }}>
            {abierto ? 'Cancelar' : 'Corregir'}
          </button>
        )}
        {identidad.puede_confirmar && (
          <button disabled={pending} className={identidad.editable ? clsAlt : cls} onClick={confirmar}>Así viene en mi documento</button>
        )}
      </div>

      {abierto && identidad.editable && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={val}
            onChange={(e) => setVal(e.target.value.toUpperCase())}
            maxLength={18}
            placeholder="CURP corregida (18 caracteres)"
            className="w-60 rounded-lg border border-line px-2 py-1.5 font-mono text-sm uppercase"
          />
          <button disabled={pending || val.length !== 18} className={cls} onClick={corregir}>{pending ? 'Guardando…' : 'Guardar'}</button>
        </div>
      )}

      {!identidad.editable && identidad.curp && (
        <div className="mt-2 text-xs text-muted">
          Tu CURP ya trajo información oficial, así que desde aquí ya no se puede cambiar. Si viene mal, tu experto la corrige contigo.
          <div className="mt-2"><HablarBoton texto="Pedirle a mi experto que la revise" mensaje={`Hola, mi CURP (${identidad.curp}) necesita corregirse pero ya no puedo cambiarla desde mi expediente. Vengo de app.trol.mx.`} compacto={compacto} /></div>
        </div>
      )}

      {ok && <p className="mt-2 text-xs text-green-700">{ok}</p>}
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  );
}

/** Tarjeta de identidad en “Hoy”: sale sola cuando el IMSS no reconoció la CURP. */
export function IdentidadCard({ identidad }: { identidad: Identidad }) {
  const problema = identidad.estatus === 'confirmada_con_problema';
  return (
    <section className={`rounded-2xl border-2 bg-white p-5 ${problema ? 'border-amber-300' : 'border-red-200'}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted">Tu identidad</div>
      <h2 className="mt-1 text-lg font-extrabold">
        {problema ? 'Tu CURP es correcta, pero el IMSS no la reconoce' : 'Confirma que tu CURP está bien escrita'}
      </h2>
      <p className="mt-1 text-sm text-muted">
        {identidad.mensaje ?? 'El IMSS no encontró a nadie con esa CURP. Casi siempre es un carácter mal capturado; corregirlo no cuesta nada y volvemos a buscar de inmediato.'}
      </p>
      {identidad.curp && (
        <div className="mt-3 rounded-xl bg-cream p-3">
          <div className="text-[11px] text-muted">La CURP que tenemos</div>
          <div className="font-mono text-base font-bold tracking-wide">{identidad.curp}</div>
        </div>
      )}
      <div className="mt-3">
        {problema
          ? <HablarBoton texto="Hablar con mi experto" mensaje={`Hola, confirmé que mi CURP (${identidad.curp ?? ''}) está bien y aun así el IMSS no la reconoce. Quiero que lo revisemos. Vengo de app.trol.mx.`} oscuro />
          : <CurpAcciones identidad={identidad} />}
      </div>
    </section>
  );
}

/* ---------- CTA por misión ---------- */
export function MisionCta({ mision, campos, identidad = null, compacto = false }: { mision: { codigo: string; cta?: string | null; estado: string; titulo?: string; detalle?: string; clabe?: string | null }; campos: { campo: string; nombre: string; tipo: string; grupo: string; opciones?: string[] | null }[]; identidad?: Identidad | null; compacto?: boolean }) {
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
  // La misión `curp_confirmar` (075) trae la CURP en su payload, pero quién puede
  // corregirla y quién sólo confirmarla lo dice `mi_identidad()`: sin ella no
  // inventamos permisos, mandamos al experto.
  if (cta === 'curp_confirmar') {
    if (!identidad) return <HablarBoton texto="Revisar mi CURP con mi experto" mensaje="Hola, el IMSS no reconoce mi CURP y quiero revisarla. Vengo de mi expediente en app.trol.mx." compacto={compacto} oscuro />;
    return <CurpAcciones identidad={identidad} compacto={compacto} />;
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
  if (cta === 'issste') {
    // Sí → la consulta al ISSSTE (Nubarium) se dispara sola desde la base; No → la misión queda cerrada.
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={pending} className={cls} onClick={() => start(async () => {
          const { error } = await supabase.schema('trol3').rpc('declarar_mio', { p_campo: 'cotiza_issste', p_valor: true });
          setMsg(error ? error.message : 'Gracias: ya estamos consultando tu historial del ISSSTE (+10 pts).'); router.refresh();
        })}>Sí, trabajé en gobierno</button>
        <button disabled={pending} className={clsAlt} onClick={() => start(async () => {
          const { error } = await supabase.schema('trol3').rpc('declarar_mio', { p_campo: 'cotiza_issste', p_valor: false });
          setMsg(error ? error.message : 'Listo, lo anotamos (+10 pts).'); router.refresh();
        })}>No</button>
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
        <Link href="/comparativo" className={clsAlt}>Comparar con mi historia real</Link>
        <Link href="/comparador" className={clsAlt}>Ver todas las AFOREs</Link>
        {msg && <span className="text-xs text-green-700">{msg}</span>}
      </div>
    );
  }
  if (cta === 'agendar') {
    return <HablarBoton texto="Programar sesión por WhatsApp" mensaje="Hola, quiero programar una sesión con mi experto de Trol para entender mi situación de pensión. ¿Cuándo pueden contactarme? Vengo de mi expediente en app.trol.mx." compacto={compacto} oscuro />;
  }
  if (cta === 'infonavit') {
    if (compacto) return <Link href="/mi?tab=expediente" className={cls}>Contestar</Link>;
    return <InfonavitCta />;
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

/** Subir un documento a la bóveda del cliente (+50 pts). Constancia de semanas → recalcula el expediente. */
export function SubirDoc({ tipo, formatos = ['pdf'], parseable = false, compacto = false, tieneCurp = true }: { tipo: string; formatos?: string[]; parseable?: boolean; compacto?: boolean; tieneCurp?: boolean }) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [curp, setCurp] = useState('');
  const [pedirCurp, setPedirCurp] = useState(!tieneCurp && tipo === 'constancia_semanas');
  const [pending, start] = useTransition();
  const accept = formatos.map((f) => (f === 'jpg' ? '.jpg,.jpeg' : `.${f}`)).join(',');
  return (
    <span className={`inline-flex flex-col items-end gap-1 ${compacto ? '' : 'text-xs'}`}>
      <label className="cursor-pointer rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-bold hover:bg-cream">
        {archivo ? archivo.name.slice(0, 22) : 'Elegir archivo'}
        <input type="file" accept={accept} className="hidden" onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setMsg(null); }} />
      </label>
      {archivo && pedirCurp && (
        <input value={curp} onChange={(e) => setCurp(e.target.value.toUpperCase())} maxLength={18} placeholder="Tu CURP (18 caracteres)" className="w-[220px] rounded-lg border border-line px-2 py-1.5 font-mono text-xs uppercase" />
      )}
      {archivo && (
        <button disabled={pending || (pedirCurp && curp.length > 0 && curp.length < 18)} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" onClick={() => start(async () => {
          const fd = new FormData(); fd.set('tipo', tipo); fd.set('archivo', archivo); if (curp) fd.set('curp', curp);
          const r = (await miSubirDocumento(fd)) as { ok: boolean; error?: string; procesando?: boolean; aviso?: string; falta_curp?: boolean };
          setMsg(r.ok ? (r.aviso ?? (r.procesando ? '¡Listo! +50 pts. Estamos leyendo tu constancia; en unos minutos se actualiza tu expediente.' : '¡Guardado! +50 pts.')) : r.error ?? 'No se pudo subir.');
          if (r.ok && r.falta_curp) setPedirCurp(true);
          if (r.ok && !r.falta_curp) { setArchivo(null); router.refresh(); }
        })}>{pending ? 'Subiendo…' : parseable ? 'Subir y actualizar mi expediente' : 'Subir (+50 pts)'}</button>
      )}
      {msg && <span className="max-w-[220px] text-right text-[11px] text-green-700">{msg}</span>}
    </span>
  );
}

/**
 * El saldo de Infonavit lo tiene la persona en su cuenta; nosotros sólo lo estimamos.
 * Este formulario se puede volver a usar aunque ya haya contestado antes: el saldo vence
 * a los 180 días y el número real manda sobre nuestro estimado.
 */
export function InfonavitCta() {
  const supabase = createClient();
  const router = useRouter();
  const [saldo, setSaldo] = useState('');
  const [credito, setCredito] = useState<'' | 'si' | 'no'>('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const guardar = () => start(async () => {
    setErr(null);
    const n = Number(saldo.replace(/[^0-9.]/g, ''));
    if (saldo && (!Number.isFinite(n) || n < 0)) return setErr('Escribe el saldo en pesos, sin letras.');
    if (!saldo && !credito) return setErr('Contesta al menos una de las dos.');
    if (saldo) {
      const { error } = await supabase.schema('trol3').rpc('declarar_mio', { p_campo: 'saldo_infonavit', p_valor: n });
      if (error) return setErr(error.message);
    }
    if (credito) {
      const { error } = await supabase.schema('trol3').rpc('declarar_mio', { p_campo: 'credito_infonavit_vigente', p_valor: credito === 'si' });
      if (error) return setErr(error.message);
    }
    setMsg('¡Gracias! Con tu saldo real las cuentas te van a salir bien (+10 pts).');
    setSaldo(''); router.refresh();
  });

  return (
    <div className="w-full">
      <p className="mb-2 text-xs text-muted">Entra a <b>mi cuenta Infonavit</b> y busca tu saldo de la subcuenta de vivienda. Si no lo tienes a la mano, contesta lo que sí sepas.</p>
      <div className="flex flex-wrap items-center gap-2">
        <input value={saldo} onChange={(e) => setSaldo(e.target.value)} inputMode="decimal" placeholder="Saldo de mi subcuenta de vivienda" className="w-60 rounded-lg border border-line px-2 py-1.5 text-sm" />
        <select value={credito} onChange={(e) => setCredito(e.target.value as '' | 'si' | 'no')} className="rounded-lg border border-line px-2 py-1.5 text-sm">
          <option value="">¿Ya usaste tu crédito?</option>
          <option value="no">Todavía no</option>
          <option value="si">Sí, ya lo usé</option>
        </select>
        <button disabled={pending} className={btnDark} onClick={guardar}>Guardar</button>
      </div>
      {msg && <p className="mt-1 text-xs text-green-700">{msg}</p>}
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}
