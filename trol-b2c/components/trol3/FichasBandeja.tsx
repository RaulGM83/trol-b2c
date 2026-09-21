'use client';
// 172 · La bandeja: objeciones que proponen las reuniones (Granola) y los asesores. Sólo admin decide.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { decidirPropuestaFicha } from '@/app/trabajo/actions';

export type PropuestaFicha = { id: string; ficha_codigo: string | null; pregunta: string; respuesta: string | null; evidencia: string | null; origen: 'reunion' | 'asesor'; created_at: string; propuesta_por_nombre: string | null; persona_nombre: string | null };

function Fila({ p, fichas, puedeDecidir }: { p: PropuestaFicha; fichas: { codigo: string; titulo: string }[]; puedeDecidir: boolean }) {
  const router = useRouter();
  const [ficha, setFicha] = useState(p.ficha_codigo ?? ''); const [pregunta, setPregunta] = useState(p.pregunta); const [respuesta, setRespuesta] = useState(p.respuesta ?? '');
  const [msg, setMsg] = useState<string | null>(null); const [pending, start] = useTransition();
  const decidir = (d: 'aprobar' | 'descartar') => start(async () => { const r = await decidirPropuestaFicha(p.id, d, { ficha, pregunta, respuesta }); if (r.ok) router.refresh(); else setMsg((r as { error?: string }).error ?? 'No se pudo.'); });
  return (
    <li className="rounded-xl border border-line p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span className={p.origen === 'reunion' ? 'rounded-full bg-lime/50 px-2 py-0.5 font-bold text-ink' : 'rounded-full bg-cream px-2 py-0.5 font-bold text-ink'}>{p.origen === 'reunion' ? 'De una reunión' : `Propuesta por ${p.propuesta_por_nombre ?? 'un asesor'}`}</span>
        {p.persona_nombre ? <span>con {p.persona_nombre}</span> : null}
        <span>{new Date(p.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>
        {!p.ficha_codigo ? <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">sin ficha · ¿falta escribirla?</span> : null}
      </div>
      {puedeDecidir ? (
        <div className="mt-2 grid gap-2">
          <input value={pregunta} onChange={(e) => setPregunta(e.target.value)} className="block w-full rounded-lg border border-line px-2.5 py-1.5 font-semibold" />
          <textarea value={respuesta} onChange={(e) => setRespuesta(e.target.value)} rows={2} placeholder="La respuesta oficial de Trol" className="block w-full rounded-lg border border-line px-2.5 py-1.5" />
          {p.evidencia ? <p className="text-xs italic text-muted">Lo dijo así: “{p.evidencia}”</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <select value={ficha} onChange={(e) => setFicha(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs"><option value="">¿A qué ficha va?</option>{fichas.map((f) => <option key={f.codigo} value={f.codigo}>{f.codigo} · {f.titulo}</option>)}</select>
            <button type="button" disabled={pending || !ficha || !respuesta.trim()} onClick={() => decidir('aprobar')} className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Aprobar y agregar a la ficha</button>
            <button type="button" disabled={pending} onClick={() => decidir('descartar')} className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-50">Descartar</button>
            {msg ? <span className="text-xs text-red-600">{msg}</span> : null}
          </div>
        </div>
      ) : (
        <div className="mt-2"><p className="font-semibold">“{p.pregunta}”</p>{p.respuesta ? <p className="mt-1 text-muted">{p.respuesta}</p> : null}<p className="mt-1 text-[11px] text-muted">{p.ficha_codigo ? `Para la ficha ${p.ficha_codigo} · ` : ''}espera a que un administrador la apruebe.</p></div>
      )}
    </li>
  );
}

export function FichasBandeja({ propuestas, fichas, puedeDecidir }: { propuestas: PropuestaFicha[]; fichas: { codigo: string; titulo: string }[]; puedeDecidir: boolean }) {
  const [abierta, setAbierta] = useState(puedeDecidir && propuestas.length > 0);
  if (!propuestas.length) return null;
  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <button type="button" onClick={() => setAbierta(!abierta)} className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-bold">Por aprobar <span className="ml-1 rounded-full bg-lime px-2 py-0.5 text-xs">{propuestas.length}</span> <span className="ml-2 font-normal text-muted">objeciones reales que proponen las reuniones y el equipo</span></span>
        <span className="text-xs text-muted">{abierta ? 'Ocultar' : 'Ver'}</span>
      </button>
      {abierta ? <ul className="mt-3 space-y-2">{propuestas.map((p) => <Fila key={p.id} p={p} fichas={fichas} puedeDecidir={puedeDecidir} />)}</ul> : null}
    </section>
  );
}
