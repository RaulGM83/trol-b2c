'use client';
// 179 · La pantalla del pasillo: pensada para el teléfono, letras grandes, un botón.
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { altaEnEvento, qrCuentaEvento, pedirConsulta } from '@/app/trabajo/actions';

export type Registrado = {
  persona_id: string; nombre: string | null; apellidos: string | null; curp: string | null; telefono: string | null; creado_en: string;
  consulta: { estado: string; proveedor: string | null; error: string | null; creada_en: string; completada_en: string | null } | null;
  ley: string | null; semanas: number | null; pension_base: number | null; parada: number | null; escribio: boolean;
};

const CURP_RE = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/;
const mxn = (n: unknown) => (n == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(n)));
const campo = 'mt-1 block w-full rounded-xl border border-line bg-white px-4 py-3 text-lg';

function EstadoConsulta({ c }: { c: Registrado['consulta'] }) {
  if (!c) return <span className="rounded-full bg-cream px-2.5 py-0.5 text-xs font-semibold">Sin CURP: falta pedir su información</span>;
  const min = Math.round((Date.now() - new Date(c.creada_en).getTime()) / 60000);
  if (c.estado === 'completada') return <span className="rounded-full bg-lime px-2.5 py-0.5 text-xs font-bold text-ink">Información lista</span>;
  if (c.estado === 'sin_resultado') return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">El IMSS no la devolvió: pedir en vivo</span>;
  if (c.estado === 'error') return <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-900">Error: {c.error ?? 'sin detalle'}</span>;
  return <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">Buscando en el IMSS · {min} min{min > 5 ? ' · suele tardar 3, a veces 13' : ''}</span>;
}

export function EventoAlta({ codigo, etiqueta, eventos, registrados, qrChat, waUrl }: { codigo: string; etiqueta: string; eventos: { codigo: string; etiqueta: string | null }[]; registrados: Registrado[]; qrChat: string; waUrl: string }) {
  const router = useRouter();
  const [nombre, setNombre] = useState(''); const [tel, setTel] = useState(''); const [curp, setCurp] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [acepta, setAcepta] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null); // persona con su QR de cuenta abierto
  const [qrCuenta, setQrCuenta] = useState<Record<string, { svg: string; url: string }>>({});
  const [verChat, setVerChat] = useState(false);
  const [pending, start] = useTransition();
  const tel10 = tel.replace(/\D/g, '').slice(-10); const curpOk = !curp || CURP_RE.test(curp.toUpperCase().trim());
  const listo = nombre.trim().length >= 2 && tel10.length === 10 && curpOk && acepta;

  // Mientras haya consultas en curso, la lista se refresca sola cada 15 s.
  const enCurso = registrados.some((r) => r.consulta && !['completada', 'sin_resultado', 'error', 'cancelada'].includes(r.consulta.estado));
  useEffect(() => { if (!enCurso) return; const t = setInterval(() => router.refresh(), 15000); return () => clearInterval(t); }, [enCurso, router]);

  const registrar = () => start(async () => {
    setMsg(null);
    const r = (await altaEnEvento(codigo, tel10, nombre.trim(), curp.toUpperCase().trim() || null, acepta)) as { ok: boolean; error?: string; persona_id?: string; ya_existia?: boolean; motivo?: string };
    if (!r.ok) { setMsg(r.error ?? 'No se pudo registrar.'); return; }
    setNombre(''); setTel(''); setCurp(''); setAcepta(false);
    setMsg(r.motivo === 'curp_de_otra_persona' ? 'Esa CURP ya estaba registrada con otro teléfono: abrimos su cuenta existente.' : r.ya_existia ? 'Ya estaba registrado: se abre su cuenta.' : 'Registrado. Ya estamos buscando su información en el IMSS.');
    if (r.persona_id) abrirQr(r.persona_id);
    router.refresh();
  });
  const abrirQr = (pid: string) => { setAbierto(pid); setVerChat(false); if (!qrCuenta[pid]) start(async () => { const r = (await qrCuentaEvento(pid)) as { ok: boolean; svg?: string; url?: string; error?: string }; if (r.ok && r.svg && r.url) setQrCuenta((x) => ({ ...x, [pid]: { svg: r.svg as string, url: r.url as string } })); else setMsg(r.error ?? 'No se pudo generar su acceso.'); }); };
  const pedirEnVivo = (pid: string) => start(async () => { const r = await pedirConsulta(pid, 'imss_historial', false, `evento ${codigo}: en vivo`, true, 'jordan'); setMsg(r.ok ? 'Pedida en vivo (Jordan).' : (r as { error?: string }).error ?? 'No se pudo.'); router.refresh(); });

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div><h1 className="text-2xl font-extrabold">{etiqueta}</h1><p className="text-xs text-muted">Registra, enseña su cuenta y sigue platicando: la información del IMSS llega sola.</p></div>
        {eventos.length > 1 ? <select value={codigo} onChange={(e) => router.push(`/trabajo/evento?c=${e.target.value}`)} className="rounded-lg border border-line bg-white px-2 py-1 text-xs">{eventos.map((e) => <option key={e.codigo} value={e.codigo}>{e.etiqueta ?? e.codigo}</option>)}</select> : null}
      </div>

      <section className="rounded-2xl border border-line bg-white p-5">
        <label className="block text-sm font-bold">Nombre<input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" placeholder="Como se presentó" className={campo} /></label>
        <label className="mt-3 block text-sm font-bold">WhatsApp<input value={tel} onChange={(e) => setTel(e.target.value)} inputMode="tel" autoComplete="off" placeholder="10 dígitos" className={campo} />{tel && tel10.length !== 10 ? <span className="text-xs text-red-600">Faltan dígitos.</span> : null}</label>
        <label className="mt-3 block text-sm font-bold">CURP <span className="font-normal text-muted">· con ella buscamos su información en el IMSS</span><input value={curp} onChange={(e) => setCurp(e.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="18 caracteres (opcional)" className={`${campo} font-mono uppercase`} />{!curpOk ? <span className="text-xs text-red-600">No parece una CURP.</span> : null}</label>
        <label className="mt-4 flex items-start gap-3 rounded-xl border border-line bg-cream/60 p-3 text-sm">
          <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-lime" />
          <span><b>Se lo leí y aceptó:</b> los Términos y Condiciones y el Aviso de Privacidad de El Trol Financiero (<a href="https://trol.mx/privacidad" target="_blank" rel="noreferrer" className="underline">trol.mx/privacidad</a>), y autoriza consultar su historial del IMSS para su diagnóstico.</span>
        </label>
        <button type="button" disabled={pending || !listo} onClick={registrar} className="mt-4 w-full rounded-xl bg-ink py-3.5 text-base font-bold text-white disabled:opacity-40">{pending ? 'Registrando…' : 'Registrar y buscar su información'}</button>
        <p className="mt-2 text-[11px] text-muted">Queda como tu cliente, atribuido a {codigo}, con el diagnóstico avanzado de cortesía.</p>
        {msg ? <p className="mt-2 text-sm">{msg}</p> : null}
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <button type="button" onClick={() => { setVerChat(!verChat); setAbierto(null); }} className="flex w-full items-center justify-between text-left"><span className="text-sm font-bold">QR al chat con Lukas <span className="font-normal text-muted">· para quien prefiera hacerlo solo</span></span><span className="text-xs text-muted">{verChat ? 'Ocultar' : 'Mostrar'}</span></button>
        {verChat ? <div className="mt-3 flex flex-col items-center"><div className="w-64 max-w-full" dangerouslySetInnerHTML={{ __html: qrChat }} /><p className="mt-2 text-center text-xs text-muted">Abre WhatsApp con el mensaje listo; con mandarlo, Lukas lo atiende y queda atribuido a {codigo}.<br /><a href={waUrl} className="underline" target="_blank" rel="noreferrer">app.trol.mx/i/{codigo}</a></p></div> : null}
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="text-sm font-bold">Registrados <span className="font-normal text-muted">· {registrados.length}</span></h2>
        {!registrados.length ? <p className="mt-2 text-sm text-muted">Todavía nadie.</p> : null}
        <ul className="mt-2 divide-y divide-line">
          {registrados.map((r) => {
            const q = qrCuenta[r.persona_id]; const ab = abierto === r.persona_id;
            return (
              <li key={r.persona_id} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-bold">{[r.nombre, r.apellidos].filter(Boolean).join(' ') || '(sin nombre)'} <span className="text-xs font-normal text-muted">{new Date(r.creado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span></div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5"><EstadoConsulta c={r.consulta} />{r.escribio ? <span className="rounded-full bg-cream px-2 py-0.5 text-[11px] font-semibold">Ya escribió</span> : null}</div>
                    {r.consulta?.estado === 'completada' ? <div className="mt-1 text-sm">{[r.ley === 'Ley73' ? 'Ley 73' : r.ley === 'Ley97' ? 'Ley 97' : null, r.semanas ? `${Math.round(Number(r.semanas)).toLocaleString('es-MX')} semanas` : null, r.pension_base ? `hoy le tocaría ${mxn(r.pension_base)}` : null].filter(Boolean).join(' · ')}</div> : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => (ab ? setAbierto(null) : abrirQr(r.persona_id))} className={ab ? 'rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white' : 'rounded-lg bg-lime px-3 py-2 text-xs font-bold text-ink'}>{ab ? 'Cerrar' : 'Su cuenta'}</button>
                    {r.consulta?.estado === 'sin_resultado' || r.consulta?.estado === 'error' ? <button type="button" disabled={pending} onClick={() => pedirEnVivo(r.persona_id)} className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-bold">Pedir en vivo</button> : null}
                    <Link href={`/trabajo/p/${r.persona_id}`} className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-bold">Expediente</Link>
                  </div>
                </div>
                {ab ? (
                  <div className="mt-3 rounded-2xl bg-cream p-4">
                    {q ? (
                      <div className="flex flex-col items-center">
                        <div className="w-60 max-w-full rounded-xl bg-white p-2" dangerouslySetInnerHTML={{ __html: q.svg }} />
                        <p className="mt-2 text-center text-sm font-semibold">Escanea y entras a tu cuenta Trol.</p>
                        <p className="text-center text-[11px] text-muted">Acceso directo, sin contraseña. Vale 7 días.</p>
                        <div className="mt-2 flex gap-2"><a href={q.url} target="_blank" rel="noreferrer" className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-bold">Abrir aquí</a><button type="button" onClick={() => navigator.clipboard?.writeText(q.url)} className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-bold">Copiar link</button></div>
                      </div>
                    ) : <p className="text-center text-sm text-muted">Generando su acceso…</p>}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
