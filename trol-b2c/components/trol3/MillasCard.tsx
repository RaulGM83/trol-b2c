'use client';
import { useState } from 'react';

// 192 · Millas para el Retiro dentro de la cuenta (claude/88): ahorrar desde aquí (la CLABE de
// Millas con su CURP como referencia, copiar con un clic) y el cashback que le regresa a su
// AFORE por lo que paga en Trol (10 % asesorías · 5 % gestorías). Se queda igual para los
// clientes que Millas nos mande después.
export type MiMillas = {
  clabe: string | null; link: string | null; referencia: string | null;
  pct: { asesoria: number; gestoria: number };
  movimientos: { id: string; concepto: string; base: number; pct: number; monto: number; estado: 'por_depositar' | 'depositado'; fecha: string; depositado_en: string | null }[];
  por_depositar: number; depositado: number;
};

const mxn = (n: unknown) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(Number(n ?? 0));
const fecha = (s: string) => new Date(s).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });

function Copiar({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" onClick={() => { try { navigator.clipboard?.writeText(valor); setOk(true); setTimeout(() => setOk(false), 1500); } catch {} }}
      className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 text-left">
      <span><span className="block text-[11px] text-muted">{etiqueta}</span><span className="block font-mono text-sm font-bold tracking-wide">{valor}</span></span>
      <span className="shrink-0 rounded-full bg-cream px-2.5 py-1 text-[11px] font-bold">{ok ? 'Copiado' : 'Copiar'}</span>
    </button>
  );
}

export function MillasCard({ m }: { m: MiMillas }) {
  const [abierto, setAbierto] = useState(false);
  const total = Number(m.por_depositar) + Number(m.depositado);
  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold">Ahorra para tu retiro desde aquí</h2>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/millas-color.png" alt="Millas para el Retiro" className="h-7 w-auto" />
      </div>
      <p className="mt-1 text-xs text-muted">
        Con Millas para el Retiro, lo que pagues en Trol regresa a tu AFORE: <b className="text-ink">{m.pct.asesoria}% en asesorías</b> y <b className="text-ink">{m.pct.gestoria}% en gestorías</b>. Y puedes abonar a tu ahorro cuando quieras, por transferencia.
      </p>

      {total > 0 ? (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 rounded-xl bg-lime/20 p-3">
          <div><div className="text-[11px] uppercase tracking-wide text-muted">Van a tu AFORE vía Millas</div><div className="text-2xl font-extrabold">{mxn(total)}</div></div>
          {Number(m.por_depositar) > 0 ? <div className="self-end text-xs text-muted">{mxn(m.por_depositar)} por depositar{Number(m.depositado) > 0 ? ` · ${mxn(m.depositado)} ya depositados` : ''}</div> : null}
        </div>
      ) : null}

      {m.clabe ? (
        <div className="mt-3 space-y-2">
          <Copiar valor={m.clabe} etiqueta="CLABE de Millas para el Retiro" />
          {m.referencia ? <Copiar valor={m.referencia} etiqueta="Referencia (tu CURP): así saben que el ahorro es tuyo" /> : null}
          <p className="text-[11px] text-muted">Transfiere desde tu banco a esa CLABE poniendo tu CURP como referencia o concepto. Millas lo abona a tu cuenta de ahorro para el retiro.{m.link ? <> También puedes hacerlo <a href={m.link} target="_blank" rel="noopener noreferrer" className="font-semibold underline">desde Millas</a>.</> : null}</p>
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-cream p-3 text-xs text-muted">Muy pronto verás aquí la cuenta para transferir tu ahorro, con tu CURP como referencia.{m.link ? <> Mientras, puedes hacerlo <a href={m.link} target="_blank" rel="noopener noreferrer" className="font-semibold underline">desde Millas</a>.</> : null}</p>
      )}

      {m.movimientos.length ? (
        <div className="mt-3">
          <button type="button" onClick={() => setAbierto(!abierto)} className="text-xs font-semibold underline">{abierto ? 'Ocultar el detalle' : `Ver el detalle de tu cashback (${m.movimientos.length})`}</button>
          {abierto ? (
            <ul className="mt-2 divide-y divide-line text-sm">
              {m.movimientos.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2 py-2">
                  <span><span className="block font-semibold">{x.concepto}</span><span className="block text-[11px] text-muted">{fecha(x.fecha)} · {x.pct}% de {mxn(x.base)} · {x.estado === 'depositado' ? `depositado${x.depositado_en ? ` el ${fecha(x.depositado_en)}` : ''}` : 'por depositar'}</span></span>
                  <b>{mxn(x.monto)}</b>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
