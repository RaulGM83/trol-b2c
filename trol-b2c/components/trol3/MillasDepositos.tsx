'use client';
// 193 · La lista "por depositar a Millas": elegir movimientos, poner la referencia de la
// transferencia y marcarlos depositados. El cliente lo ve en su cuenta como depositado.
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { depositarCashback } from '@/app/trabajo/actions';

export type MovCashback = {
  id: string; persona_id: string; nombre: string; curp: string | null; codigo: string | null; concepto: string;
  base: number; pct: number; monto: number; estado: string; fecha: string; referencia: string | null; depositado_en: string | null; depositado_por: string | null;
};

const mxn = (n: unknown) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(Number(n ?? 0));
const fecha = (s: string) => new Date(s).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

export function MillasDepositos({ movs, ver, clabe }: { movs: MovCashback[]; ver: 'por_depositar' | 'depositado'; clabe: string | null }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set(ver === 'por_depositar' ? movs.map((m) => m.id) : []));
  const [ref, setRef] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const total = useMemo(() => movs.filter((m) => sel.has(m.id)).reduce((a, m) => a + Number(m.monto), 0), [movs, sel]);
  const pendiente = ver === 'por_depositar';
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const copiarLista = () => {
    const txt = movs.filter((m) => sel.has(m.id)).map((m) => `${m.curp ?? '(sin CURP)'}\t${m.nombre}\t${Number(m.monto).toFixed(2)}`).join('\n');
    try { navigator.clipboard?.writeText(`CURP\tNombre\tMonto\n${txt}`); setMsg({ ok: true, t: 'Lista copiada (CURP · nombre · monto), lista para mandarle a Millas.' }); } catch {}
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-extrabold">Cashback para Millas</h1>
          <p className="text-xs text-muted">10 % de lo cobrado en asesorías y 5 % en gestorías (con IVA), sólo de clientes que llegaron con Millas. {clabe ? <>CLABE de Millas: <b className="font-mono">{clabe}</b>.</> : <span className="text-amber-700">Falta la CLABE de Millas en la configuración (millas_clabe).</span>}</p>
        </div>
        <div className="flex gap-1.5 text-xs">
          <Link href="/trabajo/millas" className={pendiente ? 'rounded-full bg-ink px-3 py-1 font-bold text-white' : 'rounded-full border border-line bg-white px-3 py-1 font-semibold'}>Por depositar</Link>
          <Link href="/trabajo/millas?ver=depositado" className={!pendiente ? 'rounded-full bg-ink px-3 py-1 font-bold text-white' : 'rounded-full border border-line bg-white px-3 py-1 font-semibold'}>Depositado</Link>
        </div>
      </div>

      {pendiente && movs.length ? (
        <section className="rounded-2xl border border-lime bg-lime/10 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-auto"><div className="text-xs text-muted">Seleccionado</div><div className="text-2xl font-extrabold">{mxn(total)} <span className="text-sm font-semibold text-muted">· {sel.size} de {movs.length}</span></div></div>
            <button type="button" onClick={copiarLista} className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-bold">Copiar lista para Millas</button>
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Referencia / clave de rastreo SPEI" className="w-60 rounded-lg border border-line bg-white px-3 py-2 text-xs" />
            <button type="button" disabled={pending || !sel.size || !ref.trim()} onClick={() => start(async () => {
              const r = (await depositarCashback([...sel], ref)) as { ok: boolean; texto?: string; error?: string };
              setMsg(r.ok ? { ok: true, t: r.texto ?? 'Listo.' } : { ok: false, t: r.error ?? 'No se pudo.' });
              if (r.ok) { setRef(''); setSel(new Set()); router.refresh(); }
            })} className="rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white disabled:opacity-40">{pending ? 'Guardando…' : 'Marcar depositado'}</button>
          </div>
          {msg ? <p className={msg.ok ? 'mt-2 text-xs text-green-700' : 'mt-2 text-xs text-red-600'}>{msg.t}</p> : null}
        </section>
      ) : null}

      <section className="overflow-x-auto rounded-2xl border border-line bg-white">
        {!movs.length ? <p className="p-5 text-sm text-muted">{pendiente ? 'No hay nada por depositar.' : 'Todavía no se ha depositado nada.'}</p> : (
          <table className="w-full text-sm">
            <thead className="bg-cream/60 text-left text-[11px] uppercase tracking-wide text-muted">
              <tr>
                {pendiente ? <th className="w-8 px-3 py-2"><input type="checkbox" checked={sel.size === movs.length} onChange={(e) => setSel(new Set(e.target.checked ? movs.map((m) => m.id) : []))} /></th> : null}
                <th className="px-3 py-2">Cliente</th><th className="px-3 py-2">CURP (referencia)</th><th className="px-3 py-2">Concepto</th><th className="px-3 py-2 text-right">Cobrado</th><th className="px-3 py-2 text-right">Cashback</th><th className="px-3 py-2">{pendiente ? 'Desde' : 'Depositado'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {movs.map((m) => (
                <tr key={m.id}>
                  {pendiente ? <td className="px-3 py-2"><input type="checkbox" checked={sel.has(m.id)} onChange={() => toggle(m.id)} /></td> : null}
                  <td className="px-3 py-2"><Link href={`/trabajo/p/${m.persona_id}`} className="font-semibold hover:underline">{m.nombre || '(sin nombre)'}</Link>{m.codigo ? <span className="ml-1 text-[11px] text-muted">{m.codigo}</span> : null}</td>
                  <td className="px-3 py-2 font-mono text-xs">{m.curp ?? <span className="text-red-600">sin CURP</span>}</td>
                  <td className="px-3 py-2 text-xs">{m.concepto}</td>
                  <td className="px-3 py-2 text-right text-xs">{mxn(m.base)} · {Number(m.pct)}%</td>
                  <td className="px-3 py-2 text-right font-bold">{mxn(m.monto)}</td>
                  <td className="px-3 py-2 text-xs text-muted">{pendiente ? fecha(m.fecha) : <>{m.depositado_en ? fecha(m.depositado_en) : '—'}{m.referencia ? ` · ${m.referencia}` : ''}{m.depositado_por ? ` · ${m.depositado_por.split(' ')[0]}` : ''}</>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
