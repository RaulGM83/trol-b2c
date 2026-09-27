import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMiembro, t3 } from '@/lib/trol3/server';
import { PASOS_TODOS, PASO_CLIENTE, caminos, mxn, type VistaAsesoria } from '@/lib/trol3/asesoria';
import { HistoriaLaboral } from '@/components/trol3/HistoriaLaboral';
import { PasoCero } from '@/components/trol3/PasoCero';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tu asesoría · Trol' };

// 168 · "Presentar": lo que el cliente ve cuando el asesor comparte pantalla. Vive FUERA de
// /trabajo a propósito: sin menú, sin buscador, sin nombres de otros clientes. Aquí nunca se
// pintan honorarios, valores estimados, nombres internos ni notas; y lo que cuesta cada camino
// sólo si el asesor prendió "mostrar costos" en la sesión.
const fechaLarga = (iso?: string | null) => (iso ? new Date(`${String(iso).slice(0, 10)}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : null);

// 189 · Paso 0 también aquí: en persona (evento, tablet) el asesor llena los cinco delante del
// cliente, en grande. `?modo=evento` corta la sesión en el paso 2 y ofrece agendar: los caminos
// y la recomendación dependen de saldos que en un stand todavía son estimados.
export default async function Presentar({ params, searchParams }: { params: { id: string }; searchParams: { paso?: string; modo?: string } }) {
  await requireMiembro();
  const db = t3();
  const [{ data }, { data: lc }] = await Promise.all([db.rpc('asesoria_vista', { p_persona: params.id }), db.rpc('link_citas_para', { p_persona: params.id })]);
  const v = (data ?? null) as VistaAsesoria | null;
  if (!v) notFound();
  const evento = searchParams.modo === 'evento';
  const base = v.base ?? null;
  const pasoDefecto = v.sesion?.estado === 'abierta' ? v.sesion.paso : (base && base.listos < base.total ? 0 : 1);
  const pasoPedido = searchParams.paso != null && /^[0-5]$/.test(searchParams.paso) ? Number(searchParams.paso) : pasoDefecto;
  const ultimo = evento ? 2 : 5;
  const paso = Math.min(Math.max(pasoPedido, 0), ultimo);
  const pasosVisibles = PASOS_TODOS.filter((p) => p.n <= ultimo);
  const linkCitas = ((lc as { link?: string } | null)?.link) ?? null;
  const c = v.cliente; const num = v.numeros;
  const nombre = [c.nombre, c.apellidos].filter(Boolean).join(' ');
  const brecha = num.pension_base && num.pension_maxima ? Number(num.pension_maxima) - Number(num.pension_base) : null;
  const cams = caminos(v).filter((k) => k.pension != null).slice(0, 3);
  const maxPension = Math.max(1, ...cams.map((k) => Number(k.pension)), Number(num.pension_base ?? 0));
  const costos = !!v.sesion?.mostrar_costos;
  const rec = v.sesion?.escenario_recomendado ?? null;
  const href = (n: number) => `/presentar/${params.id}?paso=${n}${evento ? '&modo=evento' : ''}`;

  return (
    <div className="flex min-h-screen flex-col bg-white text-ink">
      <header className="flex items-center justify-between px-6 py-5 sm:px-14">
        <span className="rounded-lg bg-ink px-3 py-1 text-xl font-extrabold tracking-tight text-white"><img src="/marca/logo-trol-blanco.svg" alt="Trol financiero" className="inline-block h-[1.3em] w-auto align-middle" /></span>
        <span className="text-sm text-muted">{nombre}{v.experto ? ` · con ${v.experto}, de Trol` : ''}</span>
      </header>

      <main className="flex flex-1 flex-col gap-7 px-6 pb-8 sm:px-14">
        <div>
          <div className="text-sm font-bold uppercase tracking-wide text-muted">{paso === 0 ? 'Antes de empezar' : `Paso ${paso} de ${ultimo}`}</div>
          <h1 className="mt-1 text-4xl font-extrabold tracking-tight">{PASO_CLIENTE[paso]}</h1>
        </div>

        {paso === 0 && (
          <div className="max-w-5xl [&_.text-\[10px\]]:text-xs [&_.text-\[11px\]]:text-sm [&_.text-lg]:text-2xl [&_.text-sm]:text-lg [&_.text-xs]:text-base [&_input]:text-lg [&_input]:py-2.5 [&_button]:text-base [&_button]:py-2.5">
            <PasoCero personaId={params.id} base={base} compartiendo nombre={c.nombre as string | null} seguirHref={href(1)} />
          </div>
        )}

        {paso === 1 && (
          <>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="rounded-3xl bg-ink p-7 text-white"><div className="text-sm uppercase tracking-wide text-white/60">Hoy te tocaría</div><div className="mt-1 text-5xl font-extrabold">{mxn(num.pension_base)}</div><div className="mt-1 text-white/60">al mes</div></div>
              <div className="rounded-3xl bg-lime p-7"><div className="text-sm uppercase tracking-wide text-ink/70">Podrías lograr</div><div className="mt-1 text-5xl font-extrabold">{mxn(num.pension_maxima)}</div><div className="mt-1 text-ink/70">al mes</div></div>
            </div>
            {brecha && brecha > 0 ? <p className="max-w-3xl text-xl leading-relaxed">Entre una y otra hay <b>{mxn(brecha)} cada mes</b>. Hoy vemos qué te separa de ahí.</p> : null}
            <p className="text-base text-muted">{[c.ley === 'Ley73' ? 'Ley 73' : c.ley === 'Ley97' ? 'Ley 97' : null, c.semanas ? `${Math.round(Number(c.semanas)).toLocaleString('es-MX')} semanas cotizadas` : null, c.edad ? `${c.edad} años` : null].filter(Boolean).join(' · ')}</p>
            {v.historial?.length ? (
              <section className="max-w-5xl">
                <h2 className="text-lg font-bold">Tu historia laboral</h2>
                <HistoriaLaboral historial={v.historial} grande />
              </section>
            ) : null}
          </>
        )}

        {paso === 2 && (
          <ul className="grid max-w-5xl gap-4 sm:grid-cols-2">
            {v.hallazgos.map((h) => <li key={h.item} className="rounded-3xl border-2 border-line p-6"><div className="text-xl font-bold">{h.titulo}</div><p className="mt-2 text-lg leading-relaxed text-muted">{h.detalle}</p></li>)}
            {v.oportunidades.map((o) => <li key={o.id} className="rounded-3xl border-2 border-line p-6"><div className="text-xl font-bold">{o.nombre}</div>{o.frase ? <p className="mt-2 text-lg leading-relaxed text-muted">{o.frase}</p> : null}{o.urgencia ? <p className="mt-3 text-base font-semibold text-amber-700">Fecha límite: {fechaLarga(o.urgencia)}</p> : null}</li>)}
            {!v.hallazgos.length && !v.oportunidades.length ? <li className="rounded-3xl border-2 border-line p-6 text-xl">No encontramos nada urgente en tu caso. Es buena noticia.</li> : null}
          </ul>
        )}

        {paso === 3 && (
          cams.length ? (
            <div className="grid gap-5 lg:grid-cols-3">
              {cams.map((k) => (
                <div key={k.id} className={k.id === rec ? 'flex flex-col gap-2 rounded-3xl border-[3px] border-ink p-6' : 'flex flex-col gap-2 rounded-3xl border-2 border-line p-6'}>
                  <div className="text-lg font-bold">{k.etiqueta}</div>
                  <div className="text-base text-muted">{k.edad ? `Te retiras a los ${k.edad}` : k.tipo}</div>
                  <div className="text-5xl font-extrabold tracking-tight">{mxn(k.pension)}</div>
                  <div className="text-sm text-muted">al mes, de por vida</div>
                  <div className="mt-1 h-3 overflow-hidden rounded-full bg-cream"><div className={k.id === rec ? 'h-3 bg-lime' : 'h-3 bg-ink'} style={{ width: `${Math.round((100 * Number(k.pension)) / maxPension)}%` }} /></div>
                  {costos && k.costo ? <div className="mt-2 text-base">Inversión: <b>{mxn(k.costo)}</b></div> : null}
                </div>
              ))}
            </div>
          ) : <p className="text-xl text-muted">Aquí vamos a comparar tus caminos en cuanto los armemos juntos.</p>
        )}

        {paso === 4 && (() => {
          const k = caminos(v).find((x) => x.id === rec) ?? null;
          // 169 · Si ya hay propuesta escrita, el porqué va con las palabras del asesor.
          const prop = v.oportunidades.find((o) => o.propuesta?.texto) ?? null;
          if (!k && prop) return (
            <div className="max-w-3xl rounded-3xl bg-lime p-8">
              <div className="text-sm font-bold uppercase tracking-wide text-ink/70">Lo que te recomendamos</div>
              <div className="mt-1 text-3xl font-extrabold">{prop.nombre}</div>
              {prop.propuesta?.pension_con_plan ? <div className="mt-4 text-6xl font-extrabold tracking-tight">{mxn(prop.propuesta.pension_con_plan)}<span className="text-xl font-normal text-ink/70"> al mes</span></div> : null}
              <p className="mt-4 whitespace-pre-wrap text-xl leading-relaxed">{prop.propuesta?.texto}</p>
              {prop.propuesta?.costo ? <p className="mt-2 text-lg">Inversión: <b>{mxn(prop.propuesta.costo)}</b></p> : null}
            </div>
          );
          return k ? (
            <div className="max-w-3xl rounded-3xl bg-lime p-8">
              <div className="text-sm font-bold uppercase tracking-wide text-ink/70">El camino que te recomendamos</div>
              <div className="mt-1 text-3xl font-extrabold">{k.etiqueta}</div>
              <div className="mt-4 text-6xl font-extrabold tracking-tight">{mxn(k.pension)}<span className="text-xl font-normal text-ink/70"> al mes</span></div>
              {num.pension_base && k.pension ? <p className="mt-3 text-xl">Son <b>{mxn(Number(k.pension) - Number(num.pension_base))} más cada mes</b> que como estás hoy.</p> : null}
              {k.costo ? <p className="mt-2 text-lg">Inversión: <b>{mxn(k.costo)}</b>{k.edad ? ` · retiro a los ${k.edad}` : ''}</p> : null}
              {prop?.propuesta?.texto ? <p className="mt-5 whitespace-pre-wrap border-t border-ink/15 pt-4 text-lg leading-relaxed">{prop.propuesta.texto}</p> : null}
            </div>
          ) : <p className="text-xl text-muted">Tu experto está por marcar el camino que te recomienda.</p>;
        })()}

        {paso === 5 && (
          <div className="max-w-3xl space-y-6">
            {v.diagnostico?.acuerdos?.trim() ? <p className="whitespace-pre-wrap text-xl leading-relaxed">{v.diagnostico.acuerdos.trim()}</p> : null}
            {v.pendientes?.length ? (
              <ul className="divide-y divide-line rounded-3xl border border-line">
                {v.pendientes.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-6 py-4">
                    <span className="text-lg font-bold">{t.titulo}</span>
                    <span className="text-sm text-muted">{[t.responsable ? `${t.responsable}, de Trol` : null, t.vence_el ? `para el ${fechaLarga(t.vence_el)}` : null].filter(Boolean).join(' · ')}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className={v.diagnostico?.acuerdos?.trim() || v.pendientes?.length ? 'text-sm text-muted' : 'text-xl leading-relaxed'}>Lo que acordamos hoy queda escrito en tu diagnóstico y en tu cuenta Trol, con quién hace cada cosa y para cuándo.</p>
          </div>
        )}

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-4 pt-6">
          <div className="flex items-center gap-2">
            {pasosVisibles.map((p) => <Link key={p.n} href={href(p.n)} aria-label={`Paso ${p.n}: ${PASO_CLIENTE[p.n]}`} className={p.n <= paso ? 'h-2 w-10 rounded-full bg-ink' : 'h-2 w-10 rounded-full bg-line'} />)}
          </div>
          <div className="flex items-center gap-2 text-sm">
            {paso > 0 ? <Link href={href(paso - 1)} className="rounded-xl border border-line px-4 py-2 font-bold">← Anterior</Link> : null}
            {paso < ultimo ? <Link href={href(paso + 1)} className="rounded-xl bg-ink px-4 py-2 font-bold text-white">Siguiente →</Link> : null}
            {evento && paso === ultimo ? (linkCitas
              ? <a href={linkCitas} target="_blank" rel="noreferrer" className="rounded-xl bg-lime px-5 py-2.5 text-base font-bold text-ink">Agendemos tu asesoría →</a>
              : <span className="rounded-xl bg-lime px-5 py-2.5 text-base font-bold text-ink">Lo que sigue: tu asesoría con un experto</span>) : null}
          </div>
          <p className="w-full text-xs text-muted">Son proyecciones hechas con tu información del IMSS; no son una resolución del instituto. El trámite ante el IMSS es gratis.</p>
        </footer>
      </main>
    </div>
  );
}
