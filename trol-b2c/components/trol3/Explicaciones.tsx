'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function Explicaciones({ items, leidas, titulo }: { items: { clave: string; titulo: string; texto: string }[]; leidas: string[]; titulo: string }) {
  const supabase = createClient();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<string[]>(leidas);
  if (!items.length) return null;
  const abrir = async (clave: string) => {
    setAbierta(abierta === clave ? null : clave);
    if (!marcadas.includes(clave)) {
      setMarcadas([...marcadas, clave]);
      try { await supabase.schema('trol3').rpc('mi_leer_explicacion', { p_clave: clave }); } catch {}
    }
  };
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="text-sm font-bold">{titulo} <span className="ml-1 text-[11px] font-normal text-muted">+10 pts por cada una (hasta 3)</span></h2>
      <ul className="mt-2 divide-y divide-line text-sm">
        {items.map((x) => (
          <li key={x.clave}>
            <button onClick={() => abrir(x.clave)} className="flex w-full items-center justify-between py-2 text-left">
              <span className="font-semibold">{x.titulo}</span>
              <span className="text-xs text-muted">{marcadas.includes(x.clave) ? '✓' : abierta === x.clave ? '−' : '+'}</span>
            </button>
            {abierta === x.clave && <p className="pb-3 text-sm text-muted">{x.texto}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
