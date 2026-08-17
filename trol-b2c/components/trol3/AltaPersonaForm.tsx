'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { altaPersona } from '@/app/trabajo/actions';

const CURP_RE = /^[A-Z]{4}\d{6}[A-Z]{6}[A-Z0-9]\d$/;

export function AltaPersonaForm({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [tel, setTel] = useState('');
  const [nombre, setNombre] = useState('');
  const [curp, setCurp] = useState('');
  const [canal, setCanal] = useState('organico');
  const [err, setErr] = useState<string | null>(null);
  const [existente, setExistente] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const curpLimpia = curp.trim().toUpperCase();
  const curpInvalida = curpLimpia.length > 0 && !CURP_RE.test(curpLimpia);
  return (
    <div className="space-y-2 text-sm">
      <input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="Teléfono (10 dígitos)" className="w-full rounded-lg border border-line px-3 py-2" />
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre (opcional)" className="w-full rounded-lg border border-line px-3 py-2" />
      <input value={curp} onChange={(e) => setCurp(e.target.value.toUpperCase())} maxLength={18} placeholder="CURP (opcional)" className={`w-full rounded-lg border px-3 py-2 font-mono uppercase ${curpInvalida ? 'border-red-400' : 'border-line'}`} />
      {curpInvalida && <p className="text-xs text-red-600">La CURP debe tener 18 caracteres válidos.</p>}
      <select value={canal} onChange={(e) => setCanal(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2">
        <option value="organico">Orgánico</option><option value="meta">Meta</option><option value="referido">Referido</option><option value="referido_vip">Referido VIP</option><option value="linkedin">LinkedIn</option><option value="aliado">Aliado</option>
      </select>
      {err && <p className="text-xs text-red-600">{err} {existente && <Link href={`/trabajo/p/${existente}`} className="font-semibold underline">Abrir expediente</Link>}</p>}
      <button disabled={pending || curpInvalida} onClick={() => start(async () => {
        setErr(null); setExistente(null);
        const r = await altaPersona(tel, nombre, canal, curpLimpia || undefined);
        if (!r.ok) {
          const rr = r as { error?: string; persona_id?: string };
          setExistente(rr.persona_id ?? null);
          return setErr(rr.error ?? 'error');
        }
        onDone?.();
        router.push(`/trabajo/p/${(r as { persona_id?: string }).persona_id}`);
      })} className="w-full rounded-xl bg-ink px-4 py-2 font-bold text-white disabled:opacity-50">{pending ? 'Creando…' : 'Crear / abrir'}</button>
    </div>
  );
}

/** Botón "Dar de alta" que despliega el formulario en un panel. */
export function AltaPersonaBoton() {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setAbierto((v) => !v)} className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white hover:opacity-90">{abierto ? 'Cerrar' : '+ Dar de alta'}</button>
      {abierto && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-2xl border border-line bg-white p-4 shadow-lg">
          <h2 className="mb-1 text-sm font-bold">Dar de alta (recepción)</h2>
          <p className="mb-3 text-xs text-muted">Solo teléfono confirmado. Tú quedas como experto asignado.</p>
          <AltaPersonaForm onDone={() => setAbierto(false)} />
        </div>
      )}
    </div>
  );
}
