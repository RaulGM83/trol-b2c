'use client';

import { useState } from 'react';
import Link from 'next/link';
import { waCompartirReferido } from '@/lib/whatsapp';

export function ReferidosView({
  url,
  invitados,
  confirmados,
  puntos,
}: {
  url: string;
  invitados: number;
  confirmados: number;
  puntos: number;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      /* noop */
    }
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-6">
      <header className="mb-6 flex items-center gap-2">
        <span className="text-xl font-extrabold tracking-tight">
          tr<span className="text-lime">o</span>l
        </span>
        <Link href="/diagnostico" className="text-xs text-muted hover:underline">
          ← volver
        </Link>
      </header>

      <section className="rounded-2xl bg-lime p-5">
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink/70">Invita y gana</div>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-ink">Trae a quien quieras cuidar su pensión</h1>
        <p className="mt-1 text-sm text-ink/80">
          Por cada persona que entre con tu invitación y llegue a su diagnóstico, ganas <b>100 puntos</b> — y tu
          invitado empieza con <b>50</b>. Los puntos te desbloquean la calculadora y tus asesorías.
        </p>
      </section>

      {/* Link personal */}
      <section className="mt-5 rounded-2xl border border-line bg-white p-5">
        <div className="text-[11px] font-bold uppercase tracking-wide text-muted">Tu link personal</div>
        <div className="mt-2 break-all rounded-lg border border-line bg-cream px-3 py-2 text-sm text-ink">{url}</div>
        <div className="mt-3 flex flex-col gap-2">
          <a
            href={waCompartirReferido(url)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-[#25D366] px-4 py-3 text-center text-sm font-bold text-white"
          >
            Compartir por WhatsApp
          </a>
          <button
            onClick={copiar}
            className="rounded-xl border border-ink px-4 py-3 text-center text-sm font-bold text-ink"
          >
            {copiado ? '¡Copiado!' : 'Copiar mi link'}
          </button>
        </div>
      </section>

      {/* Stats */}
      <section className="mt-5 grid grid-cols-3 gap-3">
        <Stat n={invitados} label="Invitados" />
        <Stat n={confirmados} label="Llegaron a diagnóstico" />
        <Stat n={puntos} label="Puntos ganados" />
      </section>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-muted">
        Los puntos se acreditan cuando tu invitado entra y llega a su diagnóstico, aunque no compre nada.
      </p>
    </main>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3 text-center">
      <div className="text-2xl font-extrabold tracking-tight text-ink">{n.toLocaleString('es-MX')}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}
