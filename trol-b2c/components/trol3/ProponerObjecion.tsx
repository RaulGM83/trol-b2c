'use client';
// 172 · "Esto me lo preguntaron": un asesor propone una objeción para la ficha. Llega a la bandeja de Conocimiento.
import { useState, useTransition } from 'react';
import { proponerObjecion } from '@/app/trabajo/actions';

export function ProponerObjecion({ ficha, personaId }: { ficha: string | null; personaId?: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [pregunta, setPregunta] = useState(''); const [respuesta, setRespuesta] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!abierto) return <div><button type="button" onClick={() => { setAbierto(true); setMsg(null); }} className="text-xs font-semibold underline">+ Me preguntaron algo que no está aquí</button>{msg ? <span className="ml-2 text-xs text-muted">{msg}</span> : null}</div>;
  return (
    <div className="rounded-xl border border-line bg-cream/60 p-3 text-xs">
      <label className="block font-semibold">Lo que preguntó u objetó el cliente<input value={pregunta} onChange={(e) => setPregunta(e.target.value)} placeholder="¿Y si el IMSS me rechaza el trámite?" className="mt-1 block w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm font-normal" /></label>
      <label className="mt-2 block font-semibold">Cómo lo contestaste <span className="font-normal text-muted">(opcional; la versión oficial la decide quien aprueba)</span><textarea value={respuesta} onChange={(e) => setRespuesta(e.target.value)} rows={2} className="mt-1 block w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm font-normal" /></label>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" disabled={pending || pregunta.trim().length < 8} className="rounded-lg bg-ink px-3 py-1.5 font-bold text-white disabled:opacity-50" onClick={() => start(async () => { const r = await proponerObjecion(ficha, pregunta, respuesta, personaId ?? null); if (r.ok) { setPregunta(''); setRespuesta(''); setAbierto(false); setMsg('Enviada a la bandeja de Conocimiento.'); } else setMsg((r as { error?: string }).error ?? 'No se envió.'); })}>{pending ? 'Enviando…' : 'Proponer'}</button>
        <button type="button" className="underline" onClick={() => setAbierto(false)}>Cancelar</button>
        {msg ? <span className="text-red-600">{msg}</span> : null}
      </div>
    </div>
  );
}
