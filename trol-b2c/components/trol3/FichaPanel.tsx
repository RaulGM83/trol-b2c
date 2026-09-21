'use client';
// 170 · La ficha al lado, sin salir del paso de la asesoría. Es del equipo: AsesoriaSesion no la abre en modo Compartiendo.
import { useEffect } from 'react';
import Link from 'next/link';
import { SECCIONES_FICHA, type Ficha } from '@/lib/trol3/fichas';
import { FichaTexto } from '@/components/trol3/FichaTexto';
import { ProponerObjecion } from '@/components/trol3/ProponerObjecion';

export function FichaPanel({ ficha, fichas, personaId, onAbrir, onCerrar }: { ficha: Ficha; fichas: Ficha[]; personaId?: string | null; onAbrir: (codigo: string) => void; onCerrar: () => void }) {
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [onCerrar]);
  // "ver T2", "ficha O4": las referencias cruzadas se vuelven botones.
  const refs = Array.from(new Set((`${ficha.como_explicarlo ?? ''} ${ficha.preguntas ?? ''} ${ficha.documentos ?? ''}`.match(/\b[TO]\d{1,2}\b/g) ?? []))).filter((c) => c !== ficha.codigo && fichas.some((f) => f.codigo === c));
  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[440px] flex-col border-l border-line bg-white shadow-2xl" role="dialog" aria-label={`Ficha ${ficha.titulo}`}>
      <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div><div className="text-[10px] font-bold uppercase tracking-wide text-muted">Ficha {ficha.codigo} · {ficha.tipo === 'tema' ? 'tema' : 'oportunidad'}</div><h3 className="text-base font-extrabold leading-tight">{ficha.titulo}</h3></div>
        <button type="button" onClick={onCerrar} className="rounded-lg border border-line px-2.5 py-1 text-xs font-bold hover:bg-cream" aria-label="Cerrar ficha">Cerrar ✕</button>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
        {SECCIONES_FICHA.map((s) => {
          const v = ficha[s.k] as string | null; if (!v?.trim()) return null;
          return s.k === 'frase' ? <div key={s.k} className="rounded-xl bg-lime/30 px-4 py-3"><div className="text-[10px] font-bold uppercase tracking-wide text-ink/60">{s.titulo}</div><FichaTexto texto={v} className="mt-1 text-[15px] font-semibold" /></div>
            : s.interno ? <div key={s.k} className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50 px-4 py-3"><div className="text-[10px] font-bold uppercase tracking-wide text-amber-800">{s.titulo} · no se le enseña al cliente</div><FichaTexto texto={v} className="mt-1" /></div>
            : <div key={s.k}><div className="text-[10px] font-bold uppercase tracking-wide text-muted">{s.titulo}</div><FichaTexto texto={v} className="mt-1" /></div>;
        })}
        <ProponerObjecion key={ficha.codigo} ficha={ficha.codigo} personaId={personaId ?? null} />
        {refs.length ? <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-3 text-xs"><span className="text-muted">Relacionadas:</span>{refs.map((c) => <button key={c} type="button" onClick={() => onAbrir(c)} className="rounded-full border border-line px-2.5 py-1 font-semibold hover:bg-cream">{c} · {fichas.find((f) => f.codigo === c)?.titulo}</button>)}</div> : null}
      </div>
      <footer className="border-t border-line px-5 py-3 text-xs text-muted">Versión oficial de Trol. <Link href={`/trabajo/fichas?f=${ficha.codigo}`} className="underline">Ver o corregir en Conocimiento</Link></footer>
    </aside>
  );
}
