'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// 193 · Hero Ley 97 (claude/88): si todavía no nos dijo su meta, se la pedimos ahí mismo.
// Es la misma pregunta 4 del paso cero (expectativa_pension_mxn + edad_retiro_deseada).
export function MetaRetiro({ edadSugerida }: { edadSugerida?: number | null }) {
  const supabase = createClient();
  const router = useRouter();
  const [monto, setMonto] = useState('');
  const [edad, setEdad] = useState(edadSugerida ? String(edadSugerida) : '65');
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const m = Number(monto); const ed = Number(edad);
  const listo = m > 0 && ed >= 50 && ed <= 80;
  return (
    <div className="mt-3 rounded-2xl bg-white/10 p-3">
      <div className="text-sm font-semibold">¿Con cuánto te gustaría retirarte, y a qué edad?</div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-white/70">$</span>
        <input type="number" inputMode="numeric" min={0} value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="al mes, de hoy" className="w-36 rounded-lg bg-white px-2.5 py-1.5 text-ink" />
        <span className="text-white/70">a los</span>
        <input type="number" inputMode="numeric" min={50} max={80} value={edad} onChange={(e) => setEdad(e.target.value)} className="w-16 rounded-lg bg-white px-2.5 py-1.5 text-ink" />
        <button type="button" disabled={!listo || pending} onClick={() => start(async () => {
          setErr(null);
          const a = await supabase.schema('trol3').rpc('declarar_mio', { p_campo: 'expectativa_pension_mxn', p_valor: m });
          const b = await supabase.schema('trol3').rpc('declarar_mio', { p_campo: 'edad_retiro_deseada', p_valor: ed });
          if (a.error || b.error) setErr('No se pudo guardar. Inténtalo de nuevo.');
          router.refresh();
        })} className="rounded-lg bg-lime px-3 py-1.5 text-sm font-bold text-ink disabled:opacity-40">{pending ? 'Guardando…' : 'Ver cómo voy'}</button>
      </div>
      {err ? <p className="mt-1 text-xs text-red-300">{err}</p> : null}
    </div>
  );
}
