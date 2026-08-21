'use client';
import { useState } from 'react';

export type LinkAsesor = {
  codigo: string;
  etiqueta: string;
  url: string;
  /** SVG del QR, generado en el servidor. */
  svg: string;
  esMio: boolean;
  altas: number;
  clics: number;
};

const btn = 'rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-cream disabled:opacity-50';

function CopiarBoton({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      className={btn}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1800);
        } catch {
          // Sin permiso de portapapeles (http, permisos del navegador): que al
          // menos pueda seleccionarlo a mano desde el input de abajo.
          setCopiado(false);
        }
      }}
    >
      {copiado ? '¡Copiado!' : 'Copiar'}
    </button>
  );
}

export function LinksEquipo({ links }: { links: LinkAsesor[] }) {
  const [qr, setQr] = useState<string | null>(null);
  if (!links.length) return <p className="text-sm text-muted">No hay códigos de asesor registrados.</p>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {links.map((l) => (
        <li key={l.codigo} className={`rounded-xl border p-3 ${l.esMio ? 'border-lime bg-lime/10' : 'border-line bg-white'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-bold">
                {l.etiqueta}
                {l.esMio ? <span className="ml-2 rounded bg-lime px-1.5 py-0.5 text-[10px] font-semibold text-ink">tuyo</span> : null}
              </div>
              <div className="text-[11px] text-muted">
                {l.clics ? `${l.clics} clics · ` : ''}{l.altas} altas
              </div>
            </div>
            <div className="flex gap-1">
              <CopiarBoton url={l.url} />
              <button className={btn} onClick={() => setQr(qr === l.codigo ? null : l.codigo)}>QR</button>
            </div>
          </div>
          <input
            readOnly
            value={l.url}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-2 w-full rounded-lg border border-line bg-white px-2 py-1 font-mono text-[11px]"
          />
          {qr === l.codigo && (
            <div className="mt-2 flex flex-col items-center gap-1 rounded-lg bg-white p-3">
              {/* SVG generado por nosotros en el servidor, no viene de fuera. */}
              <div className="h-40 w-40 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: l.svg }} />
              <span className="text-[10px] text-muted">{l.codigo}</span>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
