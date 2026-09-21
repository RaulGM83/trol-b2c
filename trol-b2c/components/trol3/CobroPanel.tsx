'use client';
import { useState, useTransition } from 'react';
import { registrarCobro } from '@/app/trabajo/actions';

/**
 * 163 · "Cobrado". El dinero entra por el chat (link de Mercado Pago o SPEI con
 * comprobante); lo que se olvidaba era lo de después. Aquí el experto registra el
 * pago y el sistema cumple solo: pide la consulta o habilita el beneficio, lo deja
 * escrito en la cuenta del cliente y se lo confirma por WhatsApp.
 */
export function CobroPanel({ personaId, productos }: { personaId: string; productos: { codigo: string; nombre: string; precio: number; tipo: string }[] }) {
  const [codigo, setCodigo] = useState(productos[0]?.codigo ?? '');
  const [medio, setMedio] = useState('transferencia');
  const [ref, setRef] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pending, start] = useTransition();
  const p = productos.find((x) => x.codigo === codigo);
  const dispara = p?.tipo === 'extraccion';
  if (!productos.length) return null;
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <h2 className="mb-1 text-sm font-bold">Registrar un cobro</h2>
      <p className="mb-3 text-xs text-muted">Cuando el cliente ya te pagó por el chat. Al registrarlo, Trol cumple solo: pide la consulta o habilita lo que compró, lo anota en su cuenta y se lo confirma por WhatsApp.</p>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select value={codigo} onChange={(e) => { setCodigo(e.target.value); setMsg(null); }} className="rounded-lg border border-line px-2 py-1.5">
          {productos.map((x) => <option key={x.codigo} value={x.codigo}>{x.nombre} · ${x.precio}</option>)}
        </select>
        <select value={medio} onChange={(e) => setMedio(e.target.value)} className="rounded-lg border border-line px-2 py-1.5">
          <option value="transferencia">Transferencia / SPEI</option>
          <option value="mercadopago_link">Link de Mercado Pago</option>
          <option value="efectivo">Efectivo</option>
        </select>
        <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Referencia (p. ej. SPEI 20-sep, folio MP)" className="min-w-[200px] flex-1 rounded-lg border border-line px-2 py-1.5" />
        <button disabled={pending || !codigo} className="rounded-lg bg-ink px-3 py-1.5 font-semibold text-white disabled:opacity-50" onClick={() => {
          if (dispara && !window.confirm(`Esto pide una consulta de verdad (tiene costo para Trol). ¿Confirmas que ${p?.nombre} ya está pagado?`)) return;
          start(async () => {
            const r = await registrarCobro(personaId, codigo, medio, ref);
            setMsg(r.ok ? { ok: true, texto: (r as { texto?: string }).texto ?? 'Cobro registrado.' } : { ok: false, texto: (r as { error?: string }).error ?? 'No se pudo registrar.' });
            if (r.ok) setRef('');
          });
        }}>{pending ? 'Registrando…' : 'Cobrado'}</button>
      </div>
      {dispara ? <p className="mt-2 text-[11px] text-amber-700">Este producto dispara una consulta real al confirmarlo.</p> : null}
      {msg ? <p className={msg.ok ? 'mt-2 text-xs text-green-700' : 'mt-2 text-xs text-red-600'}>{msg.texto}</p> : null}
    </section>
  );
}
