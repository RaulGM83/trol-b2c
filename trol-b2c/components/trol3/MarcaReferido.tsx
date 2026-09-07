'use client';

// ---------------------------------------------------------------------------
// Quién trajo a este cliente, dentro del expediente (125).
//
// Son dos piezas porque son dos cosas distintas. `MarcaReferido` es un dato y
// va en línea con los demás de la cabecera. `DecisionReferido` es un pendiente
// —alguien tiene que resolverlo— y por eso ocupa su propio bloque en vez de
// esconderse dentro de una frase.
//
// La decisión vive aquí y no sólo en la pantalla de aliados a propósito: se
// decide mejor viendo al cliente —cuándo entró, quién lo venía atendiendo— que
// en una bandeja de pendientes fuera de contexto.
// ---------------------------------------------------------------------------

import Link from 'next/link';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { decidirReferido } from '@/app/trabajo/actions';

type R = { ok: boolean; error?: string };

export function MarcaReferido({ aliadoNombre, estado }: { aliadoNombre: string; estado: string }) {
  if (estado === 'rechazado') {
    return <span>{aliadoNombre} lo refirió, sin atribuir</span>;
  }
  return (
    <span>
      referido por{' '}
      <Link href="/trabajo/aliados/referidores" className="font-semibold text-ink underline decoration-dotted">
        {aliadoNombre}
      </Link>
      {estado === 'por_revisar' ? ' (sin decidir)' : ''}
    </span>
  );
}

export function DecisionReferido({
  referidoId,
  aliadoNombre,
  personaId,
}: {
  referidoId: string;
  aliadoNombre: string;
  personaId: string;
}) {
  const [pending, start] = useTransition();

  const decidir = (a: 'atribuido' | 'rechazado', exito: string) =>
    start(async () => {
      const r = (await decidirReferido(referidoId, a, null, personaId)) as R;
      if (!r.ok) toast.error(r.error ?? 'No se pudo');
      else toast.success(exito);
    });

  return (
    <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs">
      <b className="text-amber-900">{aliadoNombre} dice que es suyo.</b>{' '}
      <span className="text-amber-800">
        Esta persona ya era cliente cuando llegó la referencia. Mientras no decidas, él no la ve y
        no devenga comisión.
      </span>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          disabled={pending}
          onClick={() => decidir('atribuido', 'Atribuida al aliado')}
          className="rounded-lg bg-ink px-3 py-1 font-semibold text-white disabled:opacity-50"
        >
          Sí es suya
        </button>
        <button
          disabled={pending}
          onClick={() => decidir('rechazado', 'Rechazada')}
          className="rounded-lg border border-line bg-white px-3 py-1 hover:bg-cream disabled:opacity-50"
        >
          No cuenta
        </button>
      </div>
    </div>
  );
}
