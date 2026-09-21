'use client';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { guardarFicha } from '@/app/trabajo/actions';
import { SECCIONES_FICHA, type Ficha } from '@/lib/trol3/fichas';
import { FichaTexto } from '@/components/trol3/FichaTexto';
import { ProponerObjecion } from '@/components/trol3/ProponerObjecion';

const dark = 'rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white disabled:opacity-50';
const line = 'rounded-lg border border-line bg-white px-3 py-2 text-xs font-bold disabled:opacity-50';
const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function FichasBiblioteca({ fichas, inicial, puedeEditar }: { fichas: Ficha[]; inicial: string | null; puedeEditar: boolean }) {
  const router = useRouter();
  const [cod, setCod] = useState<string>(fichas.find((f) => f.codigo === inicial)?.codigo ?? fichas[0]?.codigo ?? '');
  const [q, setQ] = useState('');
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ficha = fichas.find((f) => f.codigo === cod) ?? null;
  const lista = useMemo(() => {
    const t = sinAcentos(q.trim()); if (!t) return fichas;
    return fichas.filter((f) => sinAcentos([f.codigo, f.titulo, f.frase, f.como_explicarlo, f.preguntas, f.oportunidades.join(' ')].filter(Boolean).join(' ')).includes(t));
  }, [fichas, q]);
  const abrir = (c: string) => { setCod(c); setEditando(false); setMsg(null); };
  const editar = () => { if (!ficha) return; setBorrador(Object.fromEntries([['titulo', ficha.titulo], ...SECCIONES_FICHA.map((s) => [s.k, (ficha[s.k] as string | null) ?? ''])])); setEditando(true); setMsg(null); };
  const guardar = () => start(async () => { if (!ficha) return; const r = await guardarFicha(ficha.codigo, borrador); if (r.ok) { setEditando(false); setMsg('Guardada. El texto anterior quedó en el historial.'); router.refresh(); } else setMsg((r as { error?: string }).error ?? 'No se guardó.'); });
  const pendientes = (f: Ficha) => /\[(CONFIRMAR|POR DEFINIR)/.test(SECCIONES_FICHA.map((s) => f[s.k] ?? '').join(' '));

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <nav className="space-y-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: mod 40, semanas, Infonavit…" className="block w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" />
        {(['tema', 'oportunidad'] as const).map((tipo) => {
          const xs = lista.filter((f) => f.tipo === tipo); if (!xs.length) return null;
          return (
            <div key={tipo}>
              <div className="px-1 text-[10px] font-bold uppercase tracking-wide text-muted">{tipo === 'tema' ? 'Temas' : 'Oportunidades'}</div>
              <ul className="mt-1 space-y-0.5">
                {xs.map((f) => <li key={f.codigo}><button type="button" onClick={() => abrir(f.codigo)} className={f.codigo === cod ? 'flex w-full items-baseline gap-2 rounded-lg bg-white px-2.5 py-2 text-left text-sm font-bold shadow-sm ring-1 ring-line' : 'flex w-full items-baseline gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-white'}><span className="w-7 shrink-0 font-mono text-[11px] text-muted">{f.codigo}</span><span className="min-w-0 flex-1">{f.titulo}</span>{pendientes(f) ? <span title="Tiene algo por confirmar" className="h-2 w-2 shrink-0 rounded-full bg-amber-400" /> : null}</button></li>)}
              </ul>
            </div>
          );
        })}
        {!lista.length ? <p className="px-1 text-sm text-muted">Nada con “{q}”.</p> : null}
      </nav>

      {ficha ? (
        <article className="rounded-2xl border border-line bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted">Ficha {ficha.codigo} · {ficha.tipo === 'tema' ? 'tema' : 'oportunidad'}{ficha.oportunidades.length ? <> · <span className="font-mono normal-case">{ficha.oportunidades.join(' · ')}</span></> : null}</div>
              {editando ? <input value={borrador.titulo ?? ''} onChange={(e) => setBorrador({ ...borrador, titulo: e.target.value })} className="mt-1 block w-full min-w-[280px] rounded-lg border border-line px-3 py-1.5 text-xl font-extrabold" /> : <h2 className="text-xl font-extrabold">{ficha.titulo}</h2>}
              {ficha.updated_at ? <p className="text-xs text-muted">Última edición: {new Date(ficha.updated_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</p> : null}
            </div>
            {puedeEditar ? (editando
              ? <div className="flex gap-2"><button type="button" className={line} disabled={pending} onClick={() => { setEditando(false); setMsg(null); }}>Cancelar</button><button type="button" className={dark} disabled={pending} onClick={guardar}>{pending ? 'Guardando…' : 'Guardar ficha'}</button></div>
              : <button type="button" className={line} onClick={editar}>Editar</button>) : <span className="text-xs text-muted">Sólo lectura · edita un administrador</span>}
          </div>
          {msg ? <p className="mt-2 text-xs text-muted">{msg}</p> : null}

          <div className="mt-5 space-y-5 text-sm">
            {SECCIONES_FICHA.map((s) => {
              const v = (ficha[s.k] as string | null) ?? '';
              if (editando) return (
                <label key={s.k} className="block">
                  <span className="text-xs font-bold">{s.titulo}{s.interno ? <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">no sale al cliente</span> : null}</span>
                  <span className="block text-[11px] text-muted">{s.ayuda}</span>
                  <textarea value={borrador[s.k] ?? ''} onChange={(e) => setBorrador({ ...borrador, [s.k]: e.target.value })} rows={s.k === 'frase' || s.k === 'en_diagnostico' ? 2 : Math.min(12, Math.max(4, (borrador[s.k] ?? '').split('\n').length + 2))} className="mt-1 block w-full rounded-lg border border-line px-3 py-2 font-mono text-[13px] leading-relaxed" />
                </label>
              );
              if (!v.trim()) return null;
              return s.k === 'frase' ? <div key={s.k} className="rounded-xl bg-lime/30 px-4 py-3"><div className="text-[10px] font-bold uppercase tracking-wide text-ink/60">{s.titulo}</div><FichaTexto texto={v} className="mt-1 text-base font-semibold" /></div>
                : s.interno ? <div key={s.k} className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50 px-4 py-3"><div className="text-[10px] font-bold uppercase tracking-wide text-amber-800">{s.titulo} · no se le enseña al cliente</div><FichaTexto texto={v} className="mt-1" /></div>
                : <div key={s.k}><div className="text-[10px] font-bold uppercase tracking-wide text-muted">{s.titulo}</div><FichaTexto texto={v} className="mt-1" /></div>;
            })}
          </div>
          {editando ? null : <div className="mt-5 border-t border-line pt-4"><ProponerObjecion key={ficha.codigo} ficha={ficha.codigo} /></div>}
          {editando ? <p className="mt-4 text-[11px] text-muted">Formato: <code>1.</code> lista numerada · <code>-</code> viñeta · <code>**negritas**</code> · <code>*cursivas*</code>. Referencias como “ver T2” u “O4” se vuelven botones en la asesoría.</p> : null}
        </article>
      ) : <p className="text-sm text-muted">No hay fichas.</p>}
    </div>
  );
}
