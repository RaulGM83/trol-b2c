'use client';
// 301 · El aliado sube la constancia de semanas del IMSS (claude/118): cuando Trol no la consigue (CURP mal,
// IMSS caído) o cuando él ya la tiene. PDF original, con texto, con la CURP del cliente. Mismo crédito.
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { subirSisecPorAliado } from '@/app/aliado/actions';

export function SubirSisec({ persona, destacado }: { persona: string; destacado: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const subir = (file: File | undefined) => {
    if (!file) return;
    const fd = new FormData(); fd.set('persona_id', persona); fd.set('archivo', file);
    start(async () => {
      const r = await subirSisecPorAliado(fd) as { ok: boolean; error?: string; aviso?: string };
      if (r.ok) { toast.success(r.aviso ?? 'Constancia recibida'); router.refresh(); } else toast.error(r.error ?? 'No se pudo subir');
    });
  };
  return (
    <div className={`mt-2 rounded-lg p-2 text-xs ${destacado ? 'border border-amber-300 bg-amber-50 text-amber-900' : 'border border-line bg-white text-muted'}`}>
      <span className={destacado ? 'font-semibold' : ''}>
        {destacado ? '¿Tienes su constancia de semanas cotizadas (SISEC)? Súbela y sacamos sus cálculos sin esperar al IMSS.' : 'Si tienes su constancia de semanas cotizadas (PDF original del IMSS), súbela aquí.'}
      </span>{' '}
      <label className="cursor-pointer font-semibold underline">
        {pending ? 'subiendo…' : 'Subir PDF'}
        <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={pending} onChange={(e) => subir(e.target.files?.[0])} />
      </label>
      <div className="mt-0.5 text-[11px] opacity-80">Debe ser el PDF que descarga el IMSS (no foto ni escaneo) y traer la CURP de tu cliente. Usa el mismo crédito de la persona, no uno más.</div>
    </div>
  );
}
