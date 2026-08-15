'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { altaPersona } from '@/app/trabajo/actions';

export function AltaPersonaForm() {
  const router = useRouter();
  const [tel, setTel] = useState('');
  const [nombre, setNombre] = useState('');
  const [canal, setCanal] = useState('organico');
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2 text-sm">
      <input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="Teléfono (10 dígitos)" className="w-full rounded-lg border border-line px-3 py-2" />
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre (opcional)" className="w-full rounded-lg border border-line px-3 py-2" />
      <select value={canal} onChange={(e) => setCanal(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2">
        <option value="organico">Orgánico</option><option value="meta">Meta</option><option value="referido">Referido</option><option value="referido_vip">Referido VIP</option><option value="linkedin">LinkedIn</option><option value="aliado">Aliado</option>
      </select>
      {err && <p className="text-xs text-red-600">{err}</p>}
      <button disabled={pending} onClick={() => start(async () => {
        setErr(null);
        const r = await altaPersona(tel, nombre, canal);
        if (!r.ok) return setErr((r as { error?: string }).error ?? 'error');
        router.push(`/trabajo/p/${(r as { persona_id?: string }).persona_id}`);
      })} className="w-full rounded-xl bg-ink px-4 py-2 font-bold text-white disabled:opacity-50">{pending ? 'Creando…' : 'Crear / abrir'}</button>
    </div>
  );
}
