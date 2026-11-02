'use client';

// La liga del aliado, para compartir. El QR se arma en el servidor y llega ya
// hecho: es una imagen, no una librería que el navegador tenga que cargar.

import { useState } from 'react';

export function LinkAliado({ link, qr, infonavit = false }: { link: string; qr: string | null; infonavit?: boolean }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-[240px] flex-1">
          <h2 className="mb-1 text-sm font-bold">Tu liga para compartir</h2>
          <p className="mb-3 text-xs text-muted">
            Quien la abra entra por WhatsApp con nosotros y queda registrado como tuyo.
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-line bg-cream px-2 py-1.5 text-xs text-ink"
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 1500);
                } catch {
                  /* noop */
                }
              }}
              className="shrink-0 rounded-lg border border-ink px-2.5 py-1.5 text-xs font-bold text-ink hover:bg-cream"
            >
              {copiado ? '¡Copiada!' : 'Copiar'}
            </button>
          </div>
          {qr ? (
            <a href={qr} download="mi-qr-trol.png" className="mt-2 inline-block text-xs text-muted underline">
              Descargar el QR
            </a>
          ) : null}
        </div>
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="Código QR de tu liga" className="h-36 w-36 rounded-xl border border-line" />
        ) : null}
      </div>

      {/* Material listo para compartir: sale al vuelo con SU liga y SU QR,
          así que siempre está al día y no hay archivos que versionar.
          291: el de Infonavit sólo si el aliado tiene el programa. */}
      <div className="mt-5 border-t border-line pt-4">
        <h3 className="mb-1 text-sm font-bold">Material para tus clientes</h3>
        <p className="mb-3 text-xs text-muted">
          Una página por tema, con tu nombre, tu liga y tu QR. Mándala por WhatsApp o imprímela.
        </p>
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Pensión del IMSS</div>
            <div className="flex flex-wrap gap-2">
              <a href="/aliado/material/pdf" className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white hover:opacity-90">
                Descargar PDF (una página)
              </a>
              <a href="/aliado/material/whatsapp" className="rounded-lg border border-ink px-3 py-1.5 text-xs font-bold text-ink hover:bg-cream">
                Descargar imagen para WhatsApp
              </a>
            </div>
          </div>
          {infonavit ? (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Infonavit: tu saldo como inversión</div>
              <div className="flex flex-wrap gap-2">
                <a href="/aliado/material/infonavit/pdf" className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white hover:opacity-90">
                  Descargar PDF (una página)
                </a>
                <a href="/aliado/material/infonavit/whatsapp" className="rounded-lg border border-ink px-3 py-1.5 text-xs font-bold text-ink hover:bg-cream">
                  Descargar imagen para WhatsApp
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
