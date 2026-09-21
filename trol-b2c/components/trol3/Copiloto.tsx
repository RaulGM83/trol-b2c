'use client';
// 172 · El copiloto dentro de la asesoría: la preparación del caso y las preguntas preparadas del paso.
// Es del equipo: AsesoriaSesion no lo pinta en modo Compartiendo. Contesta sólo con fichas + expediente.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { prepararAsesoriaCopiloto, preguntarCopiloto } from '@/app/trabajo/actions';
import { BOTONES_COPILOTO, type PreparacionVista } from '@/lib/trol3/copiloto-botones';
import { FichaTexto } from '@/components/trol3/FichaTexto';

/** "[O5]" dentro del texto → botón que abre la ficha. */
function ConFichas({ texto, onFicha, validas }: { texto: string; onFicha: (c: string) => void; validas: Set<string> }) {
  const partes = texto.split(/(\[[TO]\d{1,2}\])/g);
  return <>{partes.map((p, i) => { const m = /^\[([TO]\d{1,2})\]$/.exec(p); return m && validas.has(m[1]) ? <button key={i} type="button" onClick={() => onFicha(m[1])} className="mx-0.5 rounded-full bg-lime px-1.5 text-[10px] font-bold text-ink align-middle">{m[1]}</button> : <span key={i}>{p}</span>; })}</>;
}

export function Copiloto({ asesoriaId, personaId, paso, preparacion, respuestas, fichasValidas, onFicha }: {
  asesoriaId: string; personaId: string; paso: number; preparacion: PreparacionVista | null;
  respuestas: Record<string, { texto: string; en: string }>; fichasValidas: string[]; onFicha: (c: string) => void;
}) {
  const router = useRouter();
  const [prep, setPrep] = useState<PreparacionVista | null>(preparacion);
  const [resp, setResp] = useState(respuestas);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [verPrep, setVerPrep] = useState(paso === 1 && !!preparacion);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const validas = new Set(fichasValidas);
  const botones = BOTONES_COPILOTO[paso] ?? [];

  const preparar = () => { setOcupado('prep'); setError(null); start(async () => { const r = (await prepararAsesoriaCopiloto(asesoriaId, personaId)) as { ok: boolean; error?: string; preparacion?: PreparacionVista }; setOcupado(null); if (r.ok && r.preparacion) { setPrep(r.preparacion); setVerPrep(true); router.refresh(); } else setError(r.error ?? 'No se pudo preparar.'); }); };
  const preguntar = (clave: string, forzar = false) => {
    if (resp[clave] && !forzar) { setAbierta(abierta === clave ? null : clave); return; }
    setOcupado(clave); setError(null); setAbierta(clave);
    start(async () => { const r = (await preguntarCopiloto(asesoriaId, personaId, paso, clave)) as { ok: boolean; error?: string; texto?: string }; setOcupado(null); if (r.ok && r.texto) setResp((x) => ({ ...x, [clave]: { texto: r.texto as string, en: new Date().toISOString() } })); else { setError(r.error ?? 'No contestó.'); setAbierta(null); } });
  };

  return (
    <section className="rounded-xl border border-line bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Copiloto</span>
        <button type="button" disabled={ocupado !== null} onClick={() => (prep ? setVerPrep(!verPrep) : preparar())} className={verPrep ? 'rounded-full bg-ink px-3 py-1 text-xs font-bold text-white' : 'rounded-full border border-line px-3 py-1 text-xs font-bold hover:bg-cream disabled:opacity-50'}>{ocupado === 'prep' ? 'Preparando…' : prep ? 'Preparación del caso' : 'Prepárame la asesoría'}</button>
        {botones.map((b) => <button key={b.clave} type="button" disabled={ocupado !== null} onClick={() => preguntar(b.clave)} className={abierta === b.clave ? 'rounded-full bg-ink px-3 py-1 text-xs font-bold text-white' : 'rounded-full border border-line px-3 py-1 text-xs font-semibold hover:bg-cream disabled:opacity-50'}>{ocupado === b.clave ? 'Pensando…' : b.texto}{resp[b.clave] && abierta !== b.clave ? ' ·' : ''}</button>)}
      </div>
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

      {abierta && resp[abierta] ? (
        <div className="mt-3 border-t border-line pt-3 text-sm">
          <div className="whitespace-pre-wrap leading-relaxed"><ConFichas texto={resp[abierta].texto} onFicha={onFicha} validas={validas} /></div>
          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted"><span>Sale sólo de las fichas y de su expediente. Verifica antes de decirlo.</span><button type="button" className="underline" disabled={ocupado !== null} onClick={() => preguntar(abierta, true)}>Volver a preguntar</button></div>
        </div>
      ) : null}

      {verPrep && prep ? (
        <div className="mt-3 space-y-3 border-t border-line pt-3 text-sm">
          <p className="leading-relaxed"><ConFichas texto={prep.resumen} onFicha={onFicha} validas={validas} /></p>
          {prep.orden.length ? <div><div className="text-[10px] font-bold uppercase tracking-wide text-muted">Orden sugerido</div><ol className="mt-1 list-decimal space-y-1 pl-5">{prep.orden.map((x, i) => <li key={i}><ConFichas texto={x} onFicha={onFicha} validas={validas} /></li>)}</ol></div> : null}
          {prep.objeciones.length ? <div><div className="text-[10px] font-bold uppercase tracking-wide text-muted">Lo que probablemente pregunte</div><ul className="mt-1 space-y-1.5">{prep.objeciones.map((o, i) => <li key={i}><i>“{o.pregunta}”</i> — <ConFichas texto={o.respuesta} onFicha={onFicha} validas={validas} />{o.ficha && validas.has(o.ficha) ? <button type="button" onClick={() => onFicha(o.ficha as string)} className="ml-1 rounded-full bg-lime px-1.5 text-[10px] font-bold">{o.ficha}</button> : null}</li>)}</ul></div> : null}
          {prep.cuidado.length ? <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-3 py-2"><div className="text-[10px] font-bold uppercase tracking-wide text-amber-800">Cuidado</div><ul className="mt-1 list-disc space-y-1 pl-5">{prep.cuidado.map((x, i) => <li key={i}><ConFichas texto={x} onFicha={onFicha} validas={validas} /></li>)}</ul></div> : null}
          <div className="flex items-center gap-3 text-[11px] text-muted"><span>Preparada el {new Date(prep.generado_en).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} con las fichas y su expediente.</span><button type="button" className="underline" disabled={ocupado !== null} onClick={preparar}>{ocupado === 'prep' ? 'Preparando…' : 'Volver a preparar'}</button></div>
        </div>
      ) : null}
    </section>
  );
}
