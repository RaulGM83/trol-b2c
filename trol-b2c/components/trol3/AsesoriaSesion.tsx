'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { abrirAsesoria, marcarAsesoria } from '@/app/trabajo/actions';
import { PASOS, caminos, guion, mxn, tramos, type VistaAsesoria } from '@/lib/trol3/asesoria';

const dark = 'rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white disabled:opacity-50';
const line = 'rounded-lg border border-line bg-white px-3 py-2 text-xs font-bold disabled:opacity-50';
const fechaLarga = (iso?: string | null) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : null);

/**
 * 168 · La asesoría como sesión de cinco pasos. Navegación libre: la barra marca por dónde se
 * pasó, no obliga a nada. Lo que el asesor ve aquí trae guion, valores internos y notas;
 * "Presentar" abre la versión limpia para compartir pantalla.
 */
export function AsesoriaSesion({ personaId, vista, hrefTab }: { personaId: string; vista: VistaAsesoria; hrefTab: Record<string, string> }) {
  const router = useRouter();
  const ses = vista.sesion && vista.sesion.estado === 'abierta' ? vista.sesion : null;
  const [paso, setPaso] = useState<number>(ses?.paso ?? 1);
  const [nota, setNota] = useState<string>(ses?.notas?.[String(ses?.paso ?? 1)] ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!ses) {
    const previa = vista.sesion;
    return (
      <section className="rounded-2xl border border-line bg-white p-6">
        <h2 className="text-lg font-extrabold">Asesoría</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">Cinco pasos: su situación, lo que encontramos, escenarios, nuestra recomendación y acuerdos. Puedes saltar entre ellos; queda registro de la sesión y, al final, su diagnóstico armado.</p>
        {previa ? <p className="mt-2 text-xs text-muted">Última asesoría cerrada el {fechaLarga(previa.cerrada_en) ?? '—'}.</p> : null}
        <button disabled={pending} className={`${dark} mt-4`} onClick={() => start(async () => { const r = await abrirAsesoria(personaId); if (!r.ok) setMsg((r as { error?: string }).error ?? 'No se pudo abrir.'); else router.refresh(); })}>{previa ? 'Empezar una asesoría nueva' : 'Empezar asesoría'}</button>
        {msg ? <p className="mt-2 text-xs text-red-600">{msg}</p> : null}
      </section>
    );
  }

  const ir = (n: number) => { setPaso(n); setNota(ses.notas?.[String(n)] ?? ''); start(async () => { await marcarAsesoria(ses.id, personaId, { paso: n }); router.refresh(); }); };
  const guardarNota = () => { if ((ses.notas?.[String(paso)] ?? '') === nota) return; start(async () => { const r = await marcarAsesoria(ses.id, personaId, { paso, nota }); setMsg(r.ok ? 'Nota guardada.' : (r as { error?: string }).error ?? 'No se guardó.'); }); };
  const vistos = new Set(ses.pasos_vistos ?? []);
  const c = vista.cliente; const num = vista.numeros;
  const brecha = num.pension_base && num.pension_maxima ? Number(num.pension_maxima) - Number(num.pension_base) : null;
  const ts = tramos(vista.historial);
  const cams = caminos(vista);

  return (
    <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav className="space-y-1">
        {PASOS.map((p) => (
          <button key={p.n} type="button" onClick={() => ir(p.n)} className={p.n === paso ? 'flex w-full items-center gap-2.5 rounded-xl bg-white p-2.5 text-left shadow-sm ring-1 ring-line' : 'flex w-full items-center gap-2.5 rounded-xl p-2.5 text-left hover:bg-white'}>
            <span className={p.n === paso ? 'h-6 w-6 shrink-0 rounded-full border-[3px] border-ink bg-lime' : vistos.has(p.n) ? 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white' : 'h-6 w-6 shrink-0 rounded-full border-2 border-line bg-white'}>{p.n !== paso && vistos.has(p.n) ? '✓' : ''}</span>
            <span><span className="block text-[10px] text-muted">Paso {p.n}</span><span className={p.n === paso ? 'block text-sm font-bold' : 'block text-sm'}>{p.titulo}</span></span>
          </button>
        ))}
        <label className="mt-3 flex items-start gap-2 rounded-xl border border-dashed border-line p-2.5 text-xs">
          <input type="checkbox" className="mt-0.5" checked={ses.mostrar_costos} onChange={(e) => start(async () => { await marcarAsesoria(ses.id, personaId, { mostrarCostos: e.target.checked }); router.refresh(); })} />
          <span><b>Mostrar costos al presentar.</b> Apagado, el cliente compara pensiones; lo que cuesta sale hasta la recomendación.</span>
        </label>
      </nav>

      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-xl font-extrabold">{paso} · {PASOS[paso - 1].titulo}</h2><p className="text-xs text-muted">Asesoría iniciada el {fechaLarga(ses.iniciada_en)}</p></div>
          <a href={`/presentar/${personaId}?paso=${paso}`} target="_blank" rel="noreferrer" className="rounded-lg bg-lime px-3 py-2 text-xs font-bold text-ink">Presentar al cliente ↗</a>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wide text-amber-800">Guion</div>
          <p className="mt-1 text-sm leading-relaxed">{guion(paso, vista)}</p>
        </div>

        {paso === 1 && (
          <>
            <section className="rounded-2xl bg-ink p-5 text-white">
              <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
                <div><div className="text-[11px] uppercase tracking-wide text-white/60">Hoy le tocaría</div><div className="text-3xl font-extrabold">{mxn(num.pension_base)}</div></div>
                <div><div className="text-[11px] uppercase tracking-wide text-lime">Podría lograr</div><div className="text-3xl font-extrabold text-lime">{mxn(num.pension_maxima)}</div></div>
                {brecha && brecha > 0 ? <div className="pb-1 text-sm text-white/80">Brecha: <b className="text-lime">{mxn(brecha)}</b> al mes</div> : null}
              </div>
              <div className="mt-3 text-xs text-white/60">{[c.ley === 'Ley73' ? 'Ley 73' : c.ley === 'Ley97' ? 'Ley 97' : null, c.semanas ? `${Math.round(Number(c.semanas)).toLocaleString('es-MX')} semanas ${c.semanas_capa === 'validado' ? 'oficiales' : 'declaradas'}` : null, c.edad ? `${c.edad} años` : null, c.status_empleo ? `cotiza: ${c.status_empleo}` : null, c.datos_al ? `datos del IMSS al ${fechaLarga(c.datos_al)}` : null].filter(Boolean).join(' · ')}</div>
            </section>
            <section className="rounded-2xl border border-line bg-white p-5">
              <h3 className="text-sm font-bold">Lo que le preocupa</h3>
              <p className="mt-1 text-sm">{c.dolor_principal ? `“${c.dolor_principal}”` : <span className="text-muted">No lo ha dicho. Pregúntaselo y anótalo abajo.</span>}</p>
              {c.expectativa_pension ? <p className="mt-1 text-xs text-muted">Espera recibir {mxn(c.expectativa_pension)} al mes.</p> : null}
            </section>
            <section className="rounded-2xl border border-line bg-white p-5">
              <h3 className="text-sm font-bold">Su historia laboral <span className="font-normal text-muted">· {ts.length} {ts.length === 1 ? 'tramo' : 'tramos'}</span></h3>
              {ts.length ? <ul className="mt-2 divide-y divide-line text-sm">{ts.map((t, i) => <li key={i} className="grid grid-cols-[110px_minmax(0,1fr)_70px] gap-3 py-1.5"><span className="font-mono text-xs text-muted">{t.desde}{t.hasta !== t.desde ? `–${t.hasta}` : ''}</span><span className="truncate">{t.empleador}</span><span className="text-right text-xs text-muted">{t.anios >= 1 ? `${t.anios} años` : '< 1 año'}</span></li>)}</ul>
                : <p className="mt-1 text-sm text-muted">Sin historia laboral: falta su información oficial del IMSS. <Link href={hrefTab.resumen} className="underline">Pedirla en Datos</Link>.</p>}
            </section>
          </>
        )}

        {paso === 2 && (
          <section className="rounded-2xl border border-line bg-white p-5">
            {!vista.oportunidades.length && !vista.hallazgos.length ? <p className="text-sm text-muted">No encontramos nada urgente en su caso.</p> : null}
            <ul className="space-y-3">
              {vista.hallazgos.map((h) => (
                <li key={h.item} className="flex items-start gap-3 rounded-xl border border-line p-3"><span className={h.severidad === 'alta' ? 'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500' : 'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400'} /><div><div className="text-sm font-bold">{h.titulo}</div><div className="text-sm text-muted">{h.detalle}</div></div></li>
              ))}
              {vista.oportunidades.map((o) => (
                <li key={o.id} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2"><div className="text-sm font-bold">{o.nombre}</div><div className="text-[11px] text-muted">{o.nombre_interno} · {o.estado}{o.valor ? ` · valor est. ${mxn(o.valor)}` : ''}</div></div>
                  <p className="mt-1 text-sm">{o.frase ?? <span className="text-muted">Sin frase para el cliente todavía (falta su ficha).</span>}</p>
                  {o.motivo ? <p className="mt-1 text-xs text-muted">Por qué lo detectamos: {o.motivo}</p> : null}
                  {o.urgencia ? <p className="mt-1 text-xs font-semibold text-amber-700">Fecha límite: {fechaLarga(o.urgencia)}</p> : null}
                </li>
              ))}
            </ul>
            {vista.en_orden ? <p className="mt-3 text-xs text-muted">✓ {vista.en_orden} {Number(vista.en_orden) === 1 ? 'cosa revisada está' : 'cosas revisadas están'} en orden.</p> : null}
          </section>
        )}

        {paso === 3 && (
          <>
            <section className="rounded-2xl border border-line bg-white p-5">
              <h3 className="text-sm font-bold">Caminos cerrados <span className="font-normal text-muted">· {cams.length}</span></h3>
              {cams.length ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {cams.map((k) => {
                    const rec = ses.escenario_recomendado === k.id;
                    return (
                      <div key={k.id} className={rec ? 'rounded-2xl border-2 border-ink bg-lime/10 p-4' : 'rounded-2xl border border-line p-4'}>
                        <div className="flex items-center justify-between gap-2"><div className="text-sm font-bold">{k.etiqueta}</div>{rec ? <span className="rounded-full bg-lime px-2 py-0.5 text-[10px] font-bold">Recomendado</span> : null}</div>
                        <div className="text-xs text-muted">{k.tipo}{k.edad ? ` · retiro a los ${k.edad}` : ''}</div>
                        <div className="mt-2 text-2xl font-extrabold">{mxn(k.pension)}<span className="text-xs font-normal text-muted"> al mes</span></div>
                        <div className="text-xs text-muted">{k.costo ? `Inversión total: ${mxn(k.costo)}` : 'Sin inversión'}{k.viable ? '' : ' · no alcanza pensión'}</div>
                        {!rec ? <button disabled={pending} className={`${line} mt-3`} onClick={() => start(async () => { await marcarAsesoria(ses.id, personaId, { escenario: k.id }); router.refresh(); })}>Es el que recomiendo</button> : null}
                      </div>
                    );
                  })}
                </div>
              ) : <p className="mt-1 text-sm text-muted">Todavía no hay ninguno. Ábrelo en una herramienta, mueve las palancas y aprieta “Cerrar escenario”: aparece aquí.</p>}
            </section>
            <section className="rounded-2xl border border-line bg-white p-5">
              <h3 className="text-sm font-bold">Herramientas de este paso</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Link href={hrefTab.calculadoras} className="rounded-xl border border-line p-3 hover:bg-cream"><span className="block text-sm font-bold">Calculadora</span><span className="block text-xs text-muted">Edad, semanas, Modalidad 40, UMAs</span></Link>
                {hrefTab.infonavit ? <Link href={hrefTab.infonavit} className="rounded-xl border border-line p-3 hover:bg-cream"><span className="block text-sm font-bold">Infonavit</span><span className="block text-xs text-muted">Qué hacer con su subcuenta</span></Link> : null}
                <Link href={hrefTab.viraal} className="rounded-xl border border-line p-3 hover:bg-cream"><span className="block text-sm font-bold">Mesa de financiamiento</span><span className="block text-xs text-muted">Costo y pagos del proyecto</span></Link>
              </div>
            </section>
          </>
        )}

        {(paso === 4 || paso === 5) && (
          <section className="rounded-2xl border border-dashed border-line bg-white p-5 text-sm">
            <p className="font-bold">{paso === 4 ? 'La recomendación se escribe hoy en dos lugares:' : 'Los acuerdos viven hoy en el diagnóstico:'}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              {paso === 4 ? <li><Link href={hrefTab.relacion} className="underline">Relación → Enviar propuesta</Link>: lo que le llega al cliente y ve como “Tu plan”.</li> : null}
              <li><Link href={hrefTab.diagnostico} className="underline">Diagnóstico</Link>: {paso === 4 ? 'la sección “Estrategia y oportunidades”.' : 'acuerdos y pendientes con dueño y fecha.'}</li>
            </ul>
            <p className="mt-2 text-xs text-muted">En la siguiente entrega (3c) este paso los junta aquí mismo y arma el diagnóstico al cerrar.</p>
          </section>
        )}

        <section className="rounded-2xl border border-line bg-white p-5">
          <label className="block text-sm font-bold">Notas de este paso <span className="font-normal text-muted">· sólo las ve el equipo</span>
            <textarea value={nota} onChange={(e) => setNota(e.target.value)} onBlur={guardarNota} rows={3} placeholder="Lo que dijo, lo que le hizo ruido, lo que hay que revisar…" className="mt-2 block w-full rounded-lg border border-line px-3 py-2 text-sm font-normal" />
          </label>
          {msg ? <p className="mt-1 text-xs text-muted">{msg}</p> : null}
        </section>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {paso > 1 ? <button type="button" className={line} onClick={() => ir(paso - 1)}>← {PASOS[paso - 2].titulo}</button> : <span />}
          {paso < 5 ? <button type="button" className={dark} onClick={() => ir(paso + 1)}>Siguiente: {PASOS[paso].titulo} →</button>
            : <button type="button" disabled={pending} className={dark} onClick={() => { if (window.confirm('¿Cerramos la asesoría? Queda registrada en su historia.')) start(async () => { await marcarAsesoria(ses.id, personaId, { cerrar: true }); router.refresh(); }); }}>Cerrar asesoría</button>}
        </div>
      </div>
    </div>
  );
}
