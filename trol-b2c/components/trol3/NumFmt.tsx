'use client';
// 230 · Campo numérico con formato: dinero con separadores de miles, porcentajes capturados
// como 6.0 (no 0.06), decimales a uno y enteros. Mientras se edita se muestra el texto crudo;
// al salir se formatea. El valor que sube al estado siempre es el número del motor.
import { useState } from 'react';

export type TipoNum = 'dinero' | 'pct' | 'dec1' | 'entero';
const mxn0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

export function fmtNum(v: number, tipo: TipoNum): string {
  if (!Number.isFinite(v)) return '';
  if (tipo === 'dinero') return mxn0.format(v);
  if (tipo === 'pct') return (v * 100).toFixed(1);
  if (tipo === 'dec1') return v.toFixed(1);
  return String(Math.round(v));
}
function crudo(v: number, tipo: TipoNum): string {
  if (!Number.isFinite(v)) return '';
  if (tipo === 'dinero' || tipo === 'entero') return String(Math.round(v));
  if (tipo === 'pct') return (v * 100).toFixed(1).replace(/\.0$/, '');
  return v.toFixed(1).replace(/\.0$/, '');
}
function parse(s: string, tipo: TipoNum): number | null {
  const limpio = s.replace(/[^0-9.\-]/g, '');
  if (limpio === '' || limpio === '-' || limpio === '.') return null;
  const n = Number(limpio);
  if (!Number.isFinite(n)) return null;
  return tipo === 'pct' ? n / 100 : n;
}

export function NumFmt({ value, onChange, tipo, sufijo, className, placeholder }: {
  value: number; onChange: (n: number) => void; tipo: TipoNum; sufijo?: string; className?: string; placeholder?: string;
}) {
  const [foco, setFoco] = useState(false);
  const [txt, setTxt] = useState('');
  const sufijoFinal = sufijo ?? (tipo === 'pct' ? '%' : undefined);
  return (
    <div className="flex items-center gap-1">
      <input
        inputMode="decimal"
        value={foco ? txt : fmtNum(value, tipo)}
        placeholder={placeholder}
        onFocus={(e) => { setFoco(true); setTxt(crudo(value, tipo)); requestAnimationFrame(() => e.target.select()); }}
        onChange={(e) => { setTxt(e.target.value); const n = parse(e.target.value, tipo); if (n != null) onChange(n); }}
        onBlur={() => setFoco(false)}
        className={className ?? 'w-full rounded-lg border border-line px-2 py-1 text-sm tabular-nums'}
      />
      {sufijoFinal ? <span className="text-[11px] text-muted">{sufijoFinal}</span> : null}
    </div>
  );
}
