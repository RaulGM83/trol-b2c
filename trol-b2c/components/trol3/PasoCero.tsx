'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { baseNoSabe, declararAsesor, reevaluar } from '@/app/trabajo/actions';
import { mxn, type BaseAsesoria, type BaseCampo, type BasePregunta } from '@/lib/trol3/asesoria';

/**
 * 189 · El paso cero de la asesoría (claude/86): arriba lo que ya sabemos de él —para que vea
 * que hay información y sólo se afina—; abajo las cinco preguntas que la calculadora no
 * contesta y que son la base de cualquier recomendación. "No sabe" es respuesta válida: se
 * sigue con el estimado. Lo llena el asesor, también en persona; el cliente ve lo mismo sin
 * capas ni fechas cuando se comparte pantalla.
 */

const chip = (on: boolean) => on ? 'rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold hover:bg-cream';
const input = 'w-36 rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm';
const btn = 'rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50';
const quiet = 'rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink disabled:opacity-50';

const AFORE_LABEL: Record<string, string> = { PensionISSSTE: 'PENSIONISSSTE' };
const USO_LABEL: Record<string, string> = { vigente: 'Sí, lo estoy pagando', hace_mucho: 'Sí, hace mucho', nunca: 'Nunca lo he usado' };
const fecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const num = (v: unknown) => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export function PasoCero({ personaId, base, compartiendo, nombre, onSeguir, seguirHref }: { personaId: string; base: BaseAsesoria | null | undefined; compartiendo: boolean; nombre?: string | null; onSeguir?: () => void; seguirHref?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const tu = compartiendo;
  if (!base) return <section className="rounded-2xl border border-line bg-white p-5 text-sm text-muted">Sin datos base todavía.</section>;
  const h = base.highlights;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, exito?: string) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? (exito ?? null) : (r.error ?? 'No se guardó.'));
    if (r.ok) router.refresh();
  });
  const declarar = (campo: string, valor: unknown) => run(() => declararAsesor(personaId, campo, valor) as Promise<{ ok: boolean; error?: string }>);
  const noSabe = (campo: string, deshacer = false) => run(() => baseNoSabe(personaId, campo, deshacer) as Promise<{ ok: boolean; error?: string }>);
  const campo = (q: BasePregunta, c: string) => q.campos.find((x) => x.campo === c);
  // 189c · Al salir del paso 0 se vuelve a correr el motor de oportunidades con lo que se acaba de
  // afinar (Infonavit, AFORE, ahorros): lo que se enseña en el paso 2 ya sale con esos datos.
  const seguir = () => start(async () => {
    await reevaluar(personaId);
    if (onSeguir) onSeguir(); else if (seguirHref) router.push(seguirHref);
  });
  const falta = base.preguntas.filter((q) => q.estado === 'falta').length;

  const ley = h.ley === 'Ley73' ? 'Ley 73' : h.ley === 'Ley97' ? 'Ley 97' : null;
  const derechos = h.ley === 'Ley73' ? (h.conserva_derechos == null ? null : h.conserva_derechos ? `vigentes${h.fin_conservacion ? ` hasta ${fecha(h.fin_conservacion)}` : ''}` : 'no vigentes') : null;

  return (
    <div className="space-y-4">
      {/* ── Lo que ya sabemos ─────────────────────────────────────────── */}
      <section className="rounded-2xl bg-ink p-5 text-white">
        <div className="text-[11px] font-bold uppercase tracking-wide text-white/60">{tu ? 'Lo que ya sabemos de ti' : `Lo que ya sabemos de ${nombre?.split(' ')[0] ?? 'él'}`}</div>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
          <Dato label="Régimen" v={ley ?? '—'} />
          <Dato label="Semanas cotizadas" v={h.semanas != null ? Math.round(Number(h.semanas)).toLocaleString('es-MX') : '—'} sub={!tu && h.semanas_capa ? (h.semanas_capa === 'validado' ? 'del IMSS' : 'declaradas') : undefined} />
          {h.semanas_descontadas ? <Dato label="Semanas descontadas" v={Math.round(Number(h.semanas_descontadas)).toLocaleString('es-MX')} /> : null}
          {h.semanas_recuperadas ? <Dato label="Semanas recuperadas" v={Math.round(Number(h.semanas_recuperadas)).toLocaleString('es-MX')} /> : null}
          <Dato label="Edad" v={h.edad_decimal != null ? `${Number(h.edad_decimal).toFixed(1)} años` : h.edad != null ? `${h.edad} años` : '—'} />
          {derechos ? <Dato label="Derechos Ley 73" v={derechos} /> : null}
          <Dato label={tu ? 'Hoy te tocaría' : 'Hoy le tocaría'} v={h.pension_base ? mxn(h.pension_base) : '—'} sub={h.edad_base ? `a los ${h.edad_base}` : undefined} lime />
        </div>
        {!tu && h.datos_al ? <p className="mt-3 text-[11px] text-white/50">Información del IMSS al {fecha(h.datos_al)}{h.datos_vigentes === false ? ' · conviene actualizarla' : ''}. La máxima y los caminos van en los pasos que siguen.</p> : null}
      </section>

      {/* ── Lo que necesitamos afinar ─────────────────────────────────── */}
      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">{tu ? 'Lo que necesitamos afinar contigo' : 'Lo que necesitamos afinar'}</h3>
          <span className={base.listos === base.total ? 'rounded-full bg-lime px-2.5 py-1 text-[11px] font-bold' : 'rounded-full bg-cream px-2.5 py-1 text-[11px] font-bold'}>{base.listos} de {base.total}</span>
        </div>
        <ol className="mt-3 divide-y divide-line">
          {base.preguntas.map((q) => (
            <li key={q.n} className="py-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <span className={q.estado === 'tenemos' ? 'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white' : q.estado === 'no_sabe' ? 'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-white text-[11px] font-bold' : 'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-line bg-white text-[11px] font-bold text-muted'}>{q.estado === 'tenemos' ? '✓' : q.estado === 'no_sabe' ? '?' : q.n}</span>
                  <div>
                    <div className="text-sm font-bold">{q.titulo}</div>
                    {q.estado === 'no_sabe' ? <div className="text-xs text-muted">{tu ? 'No lo sabes por ahora: seguimos con nuestro estimado.' : 'Dijo que no sabe: seguimos con el estimado.'}</div> : null}
                  </div>
                </div>
              </div>
              <div className="mt-3 pl-9">
                {q.n === 1 ? <Afore q={q} c={campo(q, 'afore_actual')} declarar={declarar} noSabe={noSabe} pending={pending} tu={tu} /> : null}
                {q.n === 2 ? <Monto c={campo(q, 'saldo_rcv97')} placeholder="p. ej. 350000" declarar={declarar} noSabe={noSabe} pending={pending} tu={tu} conNoSabe /> : null}
                {q.n === 3 ? <Infonavit q={q} declarar={declarar} pending={pending} tu={tu} /> : null}
                {q.n === 4 ? <Expectativa q={q} declarar={declarar} noSabe={noSabe} pending={pending} tu={tu} /> : null}
                {q.n === 5 ? <Ahorros q={q} declarar={declarar} noSabe={noSabe} pending={pending} tu={tu} /> : null}
              </div>
            </li>
          ))}
        </ol>
        {msg ? <p className="mt-2 text-xs text-red-600">{msg}</p> : null}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <p className="text-xs text-muted">{falta === 0 ? (tu ? 'Con esto ya podemos arrancar.' : 'Con esto ya se puede asesorar.') : tu ? `Faltan ${falta} por afinar; si no las sabes, seguimos con lo que estimamos.` : `Faltan ${falta}. “No sabe” también cuenta: se sigue con el estimado.`}</p>
          <button type="button" disabled={pending} className="rounded-lg bg-lime px-4 py-2 text-sm font-bold text-ink disabled:opacity-50" onClick={seguir}>{pending ? 'Actualizando su caso…' : falta === 0 ? (tu ? 'Listo, vamos a tu situación →' : 'Listo para la asesoría →') : 'Seguir con lo que tenemos →'}</button>
        </div>
      </section>
    </div>
  );
}

function Dato({ label, v, sub, lime }: { label: string; v: string; sub?: string; lime?: boolean }) {
  return <div><div className="text-[10px] uppercase tracking-wide text-white/60">{label}</div><div className={lime ? 'text-lg font-extrabold text-lime' : 'text-lg font-extrabold'}>{v}</div>{sub ? <div className="text-[11px] text-white/50">{sub}</div> : null}</div>;
}

function Meta({ c, tu }: { c?: BaseCampo; tu: boolean }) {
  if (tu || !c?.valor || !c.en) return null;
  return <span className="text-[11px] text-muted">{c.capa === 'validado' ? 'del IMSS' : 'declarado'} · {fecha(c.en)}</span>;
}

function Afore({ q, c, declarar, noSabe, pending, tu }: { q: BasePregunta; c?: BaseCampo; declarar: (campo: string, v: unknown) => void; noSabe: (campo: string, deshacer?: boolean) => void; pending: boolean; tu: boolean }) {
  const actual = typeof c?.valor === 'string' ? c.valor : null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(c?.opciones ?? []).map((o) => <button key={o} type="button" disabled={pending} className={chip(actual === o)} onClick={() => declarar('afore_actual', o)}>{AFORE_LABEL[o] ?? o}</button>)}
      <button type="button" disabled={pending} className={chip(q.estado === 'no_sabe')} onClick={() => noSabe('afore_actual', q.estado === 'no_sabe')}>{tu ? 'No sé' : 'No sabe'}</button>
      <Meta c={c} tu={tu} />
      {q.estado === 'no_sabe' && !tu ? <span className="text-[11px] text-amber-700">Se asume que hay que registrarla o traspasarla a una buena.</span> : null}
    </div>
  );
}

function Monto({ c, placeholder, declarar, noSabe, pending, tu, conNoSabe, campoNoSabe }: { c?: BaseCampo; placeholder: string; declarar: (campo: string, v: unknown) => void; noSabe: (campo: string, deshacer?: boolean) => void; pending: boolean; tu: boolean; conNoSabe?: boolean; campoNoSabe?: string }) {
  const [v, setV] = useState<string>('');
  if (!c) return null;
  const actual = num(c.valor); const est = num(c.estimado);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {actual != null ? <span className="text-sm font-bold">{mxn(actual)}</span> : est != null ? <span className="text-sm text-muted">{tu ? 'Estimamos' : 'Estimado'} <b className="text-ink">{mxn(est)}</b></span> : null}
      <input type="number" inputMode="numeric" min={0} className={input} placeholder={actual != null ? 'corregir…' : placeholder} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && num(v) != null) { declarar(c.campo, num(v)); setV(''); } }} />
      <button type="button" disabled={pending || num(v) == null} className={btn} onClick={() => { declarar(c.campo, num(v)); setV(''); }}>Guardar</button>
      {conNoSabe ? <button type="button" disabled={pending} className={chip(c.no_sabe)} onClick={() => noSabe(campoNoSabe ?? c.campo, c.no_sabe)}>{tu ? 'No sé' : 'No sabe'}</button> : null}
      <Meta c={c} tu={tu} />
    </div>
  );
}

function Infonavit({ q, declarar, pending, tu }: { q: BasePregunta; declarar: (campo: string, v: unknown) => void; pending: boolean; tu: boolean }) {
  const uso = q.campos.find((x) => x.campo === 'credito_infonavit_uso');
  const saldo = q.campos.find((x) => x.campo === 'saldo_infonavit');
  const actual = typeof uso?.valor === 'string' ? uso.valor : null;
  const [v, setV] = useState<string>('');
  const s = num(saldo?.valor); const est = num(saldo?.estimado);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {(uso?.opciones ?? ['vigente', 'hace_mucho', 'nunca']).map((o) => <button key={o} type="button" disabled={pending} className={chip(actual === o)} onClick={() => declarar('credito_infonavit_uso', o)}>{USO_LABEL[o] ?? o}</button>)}
        <Meta c={uso} tu={tu} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">{tu ? 'En tu subcuenta' : 'Subcuenta'}:</span>
        {s != null ? <b>{mxn(s)}</b> : est != null ? <span className="text-muted">{tu ? 'estimamos' : 'estimado'} <b className="text-ink">{mxn(est)}</b></span> : <span className="text-muted">sin dato</span>}
        {saldo ? <>
          <input type="number" inputMode="numeric" min={0} className={input} placeholder={s != null ? 'corregir…' : 'si lo sabe…'} value={v} onChange={(e) => setV(e.target.value)} />
          <button type="button" disabled={pending || num(v) == null} className={btn} onClick={() => { declarar('saldo_infonavit', num(v)); setV(''); }}>Guardar</button>
          <Meta c={saldo} tu={tu} />
        </> : null}
        {!tu && actual === 'nunca' && s == null ? <span className="text-[11px] text-amber-700">Nunca lo ha usado: vale la pena consultar el saldo por nuestra cuenta.</span> : null}
      </div>
    </div>
  );
}

function Expectativa({ q, declarar, noSabe, pending, tu }: { q: BasePregunta; declarar: (campo: string, v: unknown) => void; noSabe: (campo: string, deshacer?: boolean) => void; pending: boolean; tu: boolean }) {
  const exp = q.campos.find((x) => x.campo === 'expectativa_pension_mxn');
  const edad = q.campos.find((x) => x.campo === 'edad_retiro_deseada');
  const [m, setM] = useState(''); const [e, setE] = useState('');
  const guardar = () => { if (num(m) != null) declarar('expectativa_pension_mxn', num(m)); if (num(e) != null) declarar('edad_retiro_deseada', num(e)); setM(''); setE(''); };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {num(exp?.valor) != null ? <b>{mxn(exp?.valor)} al mes</b> : null}
      {num(edad?.valor) != null ? <b>a los {String(edad?.valor)}</b> : null}
      <input type="number" inputMode="numeric" min={0} className={input} placeholder={num(exp?.valor) != null ? 'otro monto…' : '$ al mes'} value={m} onChange={(x) => setM(x.target.value)} />
      <input type="number" inputMode="numeric" min={40} max={90} className="w-24 rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm" placeholder={num(edad?.valor) != null ? 'otra edad…' : 'edad'} value={e} onChange={(x) => setE(x.target.value)} />
      <button type="button" disabled={pending || (num(m) == null && num(e) == null)} className={btn} onClick={guardar}>Guardar</button>
      <button type="button" disabled={pending} className={chip(q.estado === 'no_sabe')} onClick={() => noSabe('expectativa_pension_mxn', q.estado === 'no_sabe')}>{tu ? 'No lo he pensado' : 'No lo ha pensado'}</button>
      <Meta c={exp} tu={tu} />
    </div>
  );
}

function Ahorros({ q, declarar, noSabe, pending, tu }: { q: BasePregunta; declarar: (campo: string, v: unknown) => void; noSabe: (campo: string, deshacer?: boolean) => void; pending: boolean; tu: boolean }) {
  const LBL: Record<string, string> = { ahorro_voluntario: 'Ahorro voluntario en la AFORE', plan_corporativo: 'Plan de retiro de la empresa', otros_planes: 'Otros (PPR, fondos, caja)' };
  const [vals, setVals] = useState<Record<string, string>>({});
  // 189c · cada opción trae saldo y aportación mensual (campo + '_mensual')
  const saldos = q.campos.filter((c) => !c.campo.endsWith('_mensual'));
  const mensual = (c: BaseCampo) => q.campos.find((x) => x.campo === `${c.campo}_mensual`);
  const conAlgo = saldos.some((c) => num(c.valor) != null && Number(c.valor) > 0);
  const dijoNo = saldos.some((c) => num(c.valor) === 0) && !conAlgo;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" disabled={pending} className={chip(dijoNo)} onClick={() => declarar('ahorro_voluntario', 0)}>{tu ? 'No tengo otros ahorros' : 'No tiene'}</button>
        <button type="button" disabled={pending} className={chip(q.estado === 'no_sabe')} onClick={() => noSabe('ahorro_voluntario', q.estado === 'no_sabe')}>{tu ? 'No sé' : 'No sabe'}</button>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {saldos.map((c) => { const m = mensual(c); return (
          <div key={c.campo} className="rounded-xl border border-line p-2.5">
            <div className="text-[11px] text-muted">{LBL[c.campo] ?? c.nombre}</div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="w-14 text-[11px] text-muted">Saldo</span>
              {num(c.valor) != null ? <b className="text-sm">{mxn(c.valor)}</b> : num(c.estimado) != null ? <span className="text-xs text-muted">est. {mxn(c.estimado)}</span> : null}
              <input type="number" inputMode="numeric" min={0} className="w-24 rounded-lg border border-line bg-white px-2 py-1 text-sm" placeholder="$" value={vals[c.campo] ?? ''} onChange={(e) => setVals((x) => ({ ...x, [c.campo]: e.target.value }))} />
              <button type="button" disabled={pending || num(vals[c.campo]) == null} className={quiet} onClick={() => { declarar(c.campo, num(vals[c.campo])); setVals((x) => ({ ...x, [c.campo]: '' })); }}>OK</button>
            </div>
            {m ? <div className="mt-1 flex items-center gap-1.5">
              <span className="w-14 text-[11px] text-muted">Al mes</span>
              {num(m.valor) != null ? <b className="text-sm">{mxn(m.valor)}</b> : null}
              <input type="number" inputMode="numeric" min={0} className="w-24 rounded-lg border border-line bg-white px-2 py-1 text-sm" placeholder="$ / mes" value={vals[m.campo] ?? ''} onChange={(e) => setVals((x) => ({ ...x, [m.campo]: e.target.value }))} />
              <button type="button" disabled={pending || num(vals[m.campo]) == null} className={quiet} onClick={() => { declarar(m.campo, num(vals[m.campo])); setVals((x) => ({ ...x, [m.campo]: '' })); }}>OK</button>
            </div> : null}
            <Meta c={c} tu={tu} />
          </div>
        ); })}
      </div>
    </div>
  );
}
