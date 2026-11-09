'use client';
// 301 · Precliente (claude/118): entró sin teléfono. Hasta que el aliado lo agregue, Trol no lo contacta.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { agregarTelefonoPorAliado } from '@/app/aliado/actions';

export function AgregarTelefono({ persona, nombre }: { persona: string; nombre: string }) {
  const router = useRouter();
  const [tel, setTel] = useState('');
  const [pending, start] = useTransition();
  const limpio = tel.replace(/\D/g, '');
  const enviar = () => start(async () => {
    const r = await agregarTelefonoPorAliado(persona, limpio) as { ok: boolean; error?: string };
    if (!r.ok) { toast.error(r.error ?? 'No se pudo'); return; }
    setTel('');
    toast.success('Teléfono guardado. Trol ya puede contactarlo.');
    router.refresh();
  });
  return (
    <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
      <div className="font-semibold">Sin teléfono: las consultas salen igual, pero Trol no contacta a {nombre.split(' ')[0]} hasta que lo agregues.</div>
      <div className="mt-1.5 flex gap-2">
        <input value={tel} onChange={(e) => setTel(e.target.value)} inputMode="numeric" placeholder="Teléfono (10 dígitos)" className="w-44 rounded-lg border border-line bg-white px-2 py-1 text-xs text-ink" />
        <button disabled={pending || limpio.length !== 10} onClick={enviar} className="rounded-lg bg-ink px-3 py-1 text-xs font-bold text-white disabled:opacity-40">{pending ? 'Guardando…' : 'Agregar teléfono'}</button>
      </div>
    </div>
  );
}
