'use client';
// 294 · "¿Tienes su NSS? Ponlo aquí" (claude/116, opción D): red de seguridad cuando la consulta por CURP
// falló o Infonavit sigue buscando el NSS. Declara el NSS y, si el aliado tiene el programa, dispara Precalix.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { agregarNssPorAliado } from '@/app/aliado/actions';

export function AgregarNss({ persona, motivo }: { persona: string; motivo: 'pension_fallida' | 'buscando_nss' | 'falta_nss' }) {
  const router = useRouter();
  const [nss, setNss] = useState('');
  const [pending, start] = useTransition();
  const limpio = nss.replace(/\D/g, '');
  const texto = motivo === 'pension_fallida'
    ? 'Mientras se resuelve lo de la CURP, con su NSS sí podemos ver su Infonavit.'
    : 'Con su NSS la precalificación Infonavit sale al instante, sin esperar al IMSS.';
  const enviar = () => start(async () => {
    const r = await agregarNssPorAliado(persona, limpio) as { ok: boolean; error?: string; estado?: string };
    if (!r.ok) { toast.error(r.error ?? 'No se pudo'); return; }
    setNss('');
    toast.success(r.estado === 'nss_distinto' ? 'Ya teníamos otro NSS para esta persona; lo revisamos nosotros.' : r.estado === 'ya_lo_teniamos' ? 'Ese NSS ya lo teníamos.' : 'NSS guardado. Estamos consultando su Infonavit.');
    router.refresh();
  });
  return (
    <div className="mt-2 rounded-lg border border-line bg-cream/60 p-2 text-xs">
      <div className="font-semibold">¿Tienes su NSS? Ponlo aquí.</div>
      <div className="text-muted">{texto}</div>
      <div className="mt-1.5 flex gap-2">
        <input value={nss} onChange={(e) => setNss(e.target.value)} inputMode="numeric" placeholder="NSS (11 dígitos)" className="w-44 rounded-lg border border-line px-2 py-1 font-mono text-xs" />
        <button disabled={pending || limpio.length !== 11} onClick={enviar} className="rounded-lg bg-ink px-3 py-1 text-xs font-bold text-white disabled:opacity-40">{pending ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </div>
  );
}
