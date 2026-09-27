'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { BaseAsesoria, BasePregunta } from '@/lib/trol3/asesoria';

/**
 * 189 · Los cinco del paso cero, del lado del cliente (claude/86): lo que la calculadora no
 * contesta y sí cambia lo que le recomendamos. Misma lista que ve su asesor y que pregunta
 * Lukas; "no sé" es respuesta válida y no vuelve a preguntarse.
 */
const chip = (on: boolean) => on ? 'rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold hover:bg-cream';
const input = 'w-36 rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm';
const btn = 'rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50';
const mxn = (n: unknown) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(n));
const num = (v: unknown) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const USO: Record<string, string> = { vigente: 'Sí, lo estoy pagando', hace_mucho: 'Sí, hace mucho', nunca: 'Nunca lo he usado' };
const AH: Record<string, string> = { ahorro_voluntario: 'Ahorro voluntario en mi AFORE', plan_corporativo: 'Plan de retiro de mi empresa', otros_planes: 'Otros (PPR, fondos, caja)' };

export function MisCinco({ personaId, base }: { personaId: string; base: BaseAsesoria }) {
  const supabase = createClient();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const declarar = (campo: string, valor: unknown) => start(async () => {
    const { error } = await supabase.schema('trol3').rpc('declarar_mio', { p_campo: campo, p_valor: valor });
    setMsg(error ? (error.message.includes('dato_validado') ? 'Ese dato ya lo tenemos del IMSS.' : error.message) : null);
    router.refresh();
  });
  const noSe = (campo: string, deshacer = false) => start(async () => {
    const { error } = await supabase.schema('trol3').rpc('base_no_sabe', { p_persona: personaId, p_campo: campo, p_deshacer: deshacer });
    setMsg(error ? error.message : null);
    router.refresh();
  });
  const v = (k: string) => vals[k] ?? '';
  const set = (k: string, x: string) => setVals((o) => ({ ...o, [k]: x }));
  const c = (q: BasePregunta, k: string) => q.campos.find((x) => x.campo === k);
  const pendientes = base.preguntas.filter((q) => q.estado === 'falta');
  if (!pendientes.length && base.listos === base.total) return null;

  return (
    <section className="rounded-2xl border border-lime bg-lime/10 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">Lo que nos falta para asesorarte</h2>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold">{base.listos} de {base.total}</span>
      </div>
      <p className="mt-1 text-xs text-muted">Son {base.total} cosas que tu información del IMSS no dice y que cambian lo que te conviene. Si alguna no la sabes, dinos “no sé” y seguimos con nuestro estimado.</p>
      <ol className="mt-3 divide-y divide-line/60">
        {base.preguntas.filter((q) => q.estado !== 'tenemos').map((q) => (
          <li key={q.n} className="py-3">
            <div className="text-sm font-bold">{q.titulo}{q.estado === 'no_sabe' ? <span className="ml-2 text-xs font-normal text-muted">dijiste que no sabes · puedes cambiarlo</span> : null}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {q.n === 1 ? <>
                {(c(q, 'afore_actual')?.opciones ?? []).map((o) => <button key={o} type="button" disabled={pending} className={chip(false)} onClick={() => declarar('afore_actual', o)}>{o}</button>)}
                <button type="button" disabled={pending} className={chip(q.estado === 'no_sabe')} onClick={() => noSe('afore_actual', q.estado === 'no_sabe')}>No sé</button>
              </> : null}
              {q.n === 2 ? <>
                {num(c(q, 'saldo_rcv97')?.estimado) != null ? <span className="text-xs text-muted">Estimamos {mxn(c(q, 'saldo_rcv97')?.estimado)} ·</span> : null}
                <input type="number" inputMode="numeric" min={0} className={input} placeholder="$ aproximado" value={v('saldo_rcv97')} onChange={(e) => set('saldo_rcv97', e.target.value)} />
                <button type="button" disabled={pending || num(v('saldo_rcv97')) == null} className={btn} onClick={() => { declarar('saldo_rcv97', num(v('saldo_rcv97'))); set('saldo_rcv97', ''); }}>Guardar</button>
                <button type="button" disabled={pending} className={chip(q.estado === 'no_sabe')} onClick={() => noSe('saldo_rcv97', q.estado === 'no_sabe')}>No sé</button>
              </> : null}
              {q.n === 3 ? <>
                {['vigente', 'hace_mucho', 'nunca'].map((o) => <button key={o} type="button" disabled={pending} className={chip(false)} onClick={() => declarar('credito_infonavit_uso', o)}>{USO[o]}</button>)}
              </> : null}
              {q.n === 4 ? <>
                <input type="number" inputMode="numeric" min={0} className={input} placeholder="$ al mes" value={v('expectativa_pension_mxn')} onChange={(e) => set('expectativa_pension_mxn', e.target.value)} />
                <input type="number" inputMode="numeric" min={40} max={90} className="w-24 rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm" placeholder="edad" value={v('edad_retiro_deseada')} onChange={(e) => set('edad_retiro_deseada', e.target.value)} />
                <button type="button" disabled={pending || (num(v('expectativa_pension_mxn')) == null && num(v('edad_retiro_deseada')) == null)} className={btn} onClick={() => { if (num(v('expectativa_pension_mxn')) != null) declarar('expectativa_pension_mxn', num(v('expectativa_pension_mxn'))); if (num(v('edad_retiro_deseada')) != null) declarar('edad_retiro_deseada', num(v('edad_retiro_deseada'))); set('expectativa_pension_mxn', ''); set('edad_retiro_deseada', ''); }}>Guardar</button>
                <button type="button" disabled={pending} className={chip(q.estado === 'no_sabe')} onClick={() => noSe('expectativa_pension_mxn', q.estado === 'no_sabe')}>No lo he pensado</button>
              </> : null}
              {q.n === 5 ? <>
                <button type="button" disabled={pending} className={chip(false)} onClick={() => declarar('ahorro_voluntario', 0)}>No tengo otros ahorros</button>
                <button type="button" disabled={pending} className={chip(q.estado === 'no_sabe')} onClick={() => noSe('ahorro_voluntario', q.estado === 'no_sabe')}>No sé</button>
                <div className="grid w-full gap-2 pt-1 sm:grid-cols-3">
                  {q.campos.filter((k) => !k.campo.endsWith('_mensual')).map((k) => { const m = q.campos.find((x) => x.campo === `${k.campo}_mensual`); return (
                    <div key={k.campo} className="rounded-xl border border-line bg-white p-2">
                      <div className="text-[11px] text-muted">{AH[k.campo] ?? k.nombre}</div>
                      <div className="mt-1 flex items-center gap-1">
                        <input type="number" inputMode="numeric" min={0} className="w-24 rounded-lg border border-line bg-white px-2 py-1 text-sm" placeholder="saldo $" value={v(k.campo)} onChange={(e) => set(k.campo, e.target.value)} />
                        <button type="button" disabled={pending || num(v(k.campo)) == null} className={btn} onClick={() => { declarar(k.campo, num(v(k.campo))); set(k.campo, ''); }}>OK</button>
                      </div>
                      {m ? <div className="mt-1 flex items-center gap-1">
                        <input type="number" inputMode="numeric" min={0} className="w-24 rounded-lg border border-line bg-white px-2 py-1 text-sm" placeholder="$ al mes" value={v(m.campo)} onChange={(e) => set(m.campo, e.target.value)} />
                        <button type="button" disabled={pending || num(v(m.campo)) == null} className={btn} onClick={() => { declarar(m.campo, num(v(m.campo))); set(m.campo, ''); }}>OK</button>
                      </div> : null}
                    </div>
                  ); })}
                </div>
              </> : null}
            </div>
          </li>
        ))}
      </ol>
      {msg ? <p className="mt-2 text-xs text-red-600">{msg}</p> : null}
    </section>
  );
}
