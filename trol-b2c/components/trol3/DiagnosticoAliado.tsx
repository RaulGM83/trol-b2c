'use client';
// 302d · El diagnóstico del aliado (claude/120): elige sus escenarios cerrados, escribe quién lo elabora y lo genera.
// Sale firmado "Elaborado por {nombre} · {empresa} · con la calculadora de El Trol Financiero · no revisado por Trol".
// Después puede pedir la revisión de Trol (10 cr): el equipo lo corrige y lo re-firma.
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { generarDiagnosticoAliado, pedirRevisionTrol } from '@/app/aliado/actions';

type Esc = { id: string; tipo: string; creado_en: string; resumen: { etiqueta?: string; pension_mensual?: number } | null };
type Diag = { id: string; estado: string; autor_tipo: string; elaborado_por: string | null; entregado_en: string | null; revision_pedida_en: string | null; revisado_en: string | null };

const mxn0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const fecha = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
const TIPO: Record<string, string> = { calc_ley73: 'Ley 73', calc_ley97: 'Ley 97', calc_mod40: 'Mod 40' };
const btn = 'rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-cream disabled:opacity-40';

export function DiagnosticoAliado({ persona, nombreAliado, empresa, creditos }: { persona: string; nombreAliado: string; empresa: string | null; creditos?: number | null }) {
  const router = useRouter();
  const [escs, setEscs] = useState<Esc[] | null>(null);
  const [diags, setDiags] = useState<Diag[]>([]);
  const [sel, setSel] = useState<string[]>([]);
  const [elaboradoPor, setElaboradoPor] = useState(nombreAliado);
  const [tick, setTick] = useState(0);
  const [pending, start] = useTransition();
  const [confirmarRev, setConfirmarRev] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const sb = createClient();
      const [{ data: e }, { data: d }] = await Promise.all([
        sb.schema('trol3').from('v_escenarios_cerrados').select('id,tipo,creado_en,resumen').eq('persona_id', persona).order('creado_en', { ascending: false }).limit(20),
        sb.schema('trol3').from('diagnosticos').select('id,estado,autor_tipo,elaborado_por,entregado_en,revision_pedida_en,revisado_en').eq('persona_id', persona).order('creado_en', { ascending: false }).limit(5),
      ]);
      if (!vivo) return;
      setEscs((e ?? []) as Esc[]);
      setDiags((d ?? []) as Diag[]);
    })();
    return () => { vivo = false; };
  }, [persona, tick]);

  const generar = () => start(async () => {
    const r = await generarDiagnosticoAliado({ personaId: persona, escenarioIds: sel, elaboradoPor }) as { ok: boolean; error?: string; aviso?: string | null };
    if (!r.ok) { toast.error(r.error ?? 'No se pudo'); return; }
    toast.success(r.aviso ?? 'Diagnóstico generado. Ya puedes verlo en PDF.');
    setSel([]); setTick((t) => t + 1); router.refresh();
  });
  const revisar = (id: string) => start(async () => {
    const r = await pedirRevisionTrol(id) as { ok: boolean; error?: string; repetida?: boolean; creditos_restantes?: number | null };
    setConfirmarRev(null);
    if (!r.ok) { toast.error(r.error ?? 'No se pudo'); return; }
    toast.success(r.repetida ? 'Ya la habías pedido.' : `Listo: Trol lo revisa en 2 días hábiles. Te quedan ${r.creditos_restantes ?? '—'} créditos.`);
    setTick((t) => t + 1); router.refresh();
  });

  const entregado = diags.find((d) => d.estado === 'entregado') ?? null;

  return (
    <section className="rounded-2xl border-2 border-ink bg-white p-5">
      <h2 className="text-sm font-bold">Tu diagnóstico</h2>
      <p className="text-xs text-muted">Elige los escenarios que cerraste arriba y genera el documento. Sale firmado como elaborado por ti{empresa ? ` (${empresa})` : ''}, con la calculadora de Trol y sin revisión de Trol.</p>

      {entregado ? (
        <div className="mt-3 rounded-xl border border-line bg-cream/60 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${entregado.autor_tipo === 'aliado_revisado' ? 'bg-emerald-100 text-emerald-900' : 'bg-ink text-white'}`}>
              {entregado.autor_tipo === 'aliado_revisado' ? 'Revisado por Trol' : entregado.autor_tipo === 'aliado' ? 'Elaborado por ti' : 'Elaborado por Trol'}
            </span>
            <span>{entregado.elaborado_por ? `Elaborado por ${entregado.elaborado_por} · ` : ''}{fecha(entregado.entregado_en)}</span>
            <a className={btn} href={`/aliado/diagnostico/${persona}`} target="_blank" rel="noreferrer">Ver PDF</a>
            {entregado.autor_tipo === 'aliado' && !entregado.revision_pedida_en ? (
              confirmarRev === entregado.id ? (
                <span className="flex flex-wrap items-center gap-2 rounded-lg border border-ink bg-white px-2 py-1">
                  Se descuentan <b>10 créditos</b> ($200){creditos != null ? ` de tus ${creditos}` : ''}. Trol lo revisa, lo corrige y lo re-firma.
                  <button className="rounded-lg bg-ink px-3 py-1 text-xs font-bold text-white disabled:opacity-40" disabled={pending || (creditos != null && creditos < 10)} onClick={() => revisar(entregado.id)}>{pending ? 'Pidiendo…' : 'Confirmar'}</button>
                  <button className={btn} onClick={() => setConfirmarRev(null)}>Cancelar</button>
                </span>
              ) : (
                <button className={btn} onClick={() => setConfirmarRev(entregado.id)}>Pedir revisión a Trol · 10 cr</button>
              )
            ) : entregado.revision_pedida_en && entregado.autor_tipo === 'aliado' ? (
              <span className="text-muted">Revisión pedida {fecha(entregado.revision_pedida_en)} · Trol lo está revisando</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Escenarios cerrados <button className="ml-1 font-normal normal-case underline" onClick={() => setTick((t) => t + 1)}>actualizar</button></div>
      {escs == null ? (
        <p className="mt-1 text-xs text-muted">Cargando…</p>
      ) : escs.length === 0 ? (
        <p className="mt-1 text-xs text-muted">Todavía no has cerrado ningún escenario. En la calculadora, ponle nombre y usa “Cerrar escenario”.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-xs">
          {escs.map((e) => (
            <li key={e.id} className="flex items-center gap-2">
              <input type="checkbox" checked={sel.includes(e.id)} onChange={(ev) => setSel(ev.target.checked ? [...sel, e.id] : sel.filter((x) => x !== e.id))} />
              <span className="font-semibold">{e.resumen?.etiqueta ?? TIPO[e.tipo] ?? e.tipo}</span>
              <span className="text-muted">{TIPO[e.tipo] ?? e.tipo}{e.resumen?.pension_mensual != null ? ` · ${mxn0.format(Number(e.resumen.pension_mensual))}/mes` : ''} · {fecha(e.creado_en)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <label className="text-muted">Elaborado por</label>
        <input value={elaboradoPor} onChange={(e) => setElaboradoPor(e.target.value)} className="w-56 rounded-lg border border-line px-2 py-1 text-xs" placeholder="Nombre de quien elabora" />
        <button disabled={pending || sel.length === 0 || elaboradoPor.trim().length < 3} onClick={generar} className="rounded-lg bg-ink px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40">
          {pending ? 'Generando (1–2 min)…' : entregado ? 'Generar uno nuevo' : 'Generar diagnóstico'}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-muted">El documento lo redacta la IA de Trol a partir de los datos del IMSS y tus escenarios; revísalo antes de entregarlo a tu cliente.</p>
    </section>
  );
}
