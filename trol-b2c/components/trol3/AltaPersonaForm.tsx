'use client';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { altaPersona, buscarPorTelefono, type DuenoTelefono } from '@/app/trabajo/actions';

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
  // Dueño actual del teléfono: `alta_por_telefono` no crea si el número ya existe, entra a ese
  // expediente. Se avisa antes de dar clic para no "crear" encima de otra persona.
  const [dueno, setDueno] = useState<DuenoTelefono | null>(null);
  const tel10 = tel.replace(/\D/g, '').slice(-10);
  useEffect(() => {
    if (tel10.length < 10) { setDueno(null); return; }
    let vivo = true;
    const h = setTimeout(() => { buscarPorTelefono(tel10).then((d) => { if (vivo) setDueno(d); }).catch(() => { if (vivo) setDueno(null); }); }, 350);
    return () => { vivo = false; clearTimeout(h); };
  }, [tel10]);
  const curpLimpia = curp.trim().toUpperCase();
  const curpInvalida = curpLimpia.length > 0 && !CURP_RE.test(curpLimpia);
  const duenoNombre = dueno ? [dueno.nombre, dueno.apellidos].filter(Boolean).join(' ') || 'una persona sin nombre' : '';
  const curpChoca = !!(dueno?.curp && curpLimpia && dueno.curp !== curpLimpia);
  return (
    <div className="space-y-2 text-sm">
      <input value={tel} onChange={(e) => setTel(e.target.value)} placeholder="Teléfono (10 dígitos)" className={`w-full rounded-lg border px-3 py-2 ${dueno ? (curpChoca ? 'border-red-400' : 'border-amber-400') : 'border-line'}`} />
      {dueno && (
        <div className={`rounded-lg border px-3 py-2 text-xs ${curpChoca ? 'border-red-300 bg-red-50 text-red-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
          <p><span className="font-semibold">Número repetido:</span> ya es de <span className="font-semibold">{duenoNombre}</span>{dueno.curp ? <> (CURP <span className="font-mono">{dueno.curp}</span>)</> : ' (sin CURP)'}{dueno.etapa ? <> · {dueno.etapa}</> : null}.</p>
          <p className="mt-1">{curpChoca ? 'La CURP que escribiste es otra: no se puede crear con este teléfono.' : 'Al dar clic no se crea una persona nueva: se abre ese expediente.'} <Link href={`/trabajo/p/${dueno.persona_id}`} className="font-semibold underline">Abrir expediente</Link></p>
        </div>
      )}
      <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre (opcional)" className="w-full rounded-lg border border-line px-3 py-2" />
      <input value={curp} onChange={(e) => setCurp(e.target.value.toUpperCase())} maxLength={18} placeholder="CURP (opcional)" className={`w-full rounded-lg border px-3 py-2 font-mono uppercase ${curpInvalida || curpChoca ? 'border-red-400' : 'border-line'}`} />
      {curpInvalida && <p className="text-xs text-red-600">La CURP debe tener 18 caracteres válidos.</p>}
      <select value={canal} onChange={(e) => setCanal(e.target.value)} className="w-full rounded-lg border border-line px-3 py-2">
        <option value="organico">Orgánico</option><option value="meta">Meta</option><option value="referido">Referido</option><option value="referido_vip">Referido VIP</option><option value="linkedin">LinkedIn</option><option value="aliado">Aliado</option>
      </select>
      {err && <p className="text-xs text-red-600">{err} {existente && <Link href={`/trabajo/p/${existente}`} className="font-semibold underline">Abrir expediente</Link>}</p>}
      <button disabled={pending || curpInvalida || curpChoca} onClick={() => start(async () => {
        setErr(null); setExistente(null);
        const r = await altaPersona(tel, nombre, canal, curpLimpia || undefined);
        if (!r.ok) {
          const rr = r as { error?: string; persona_id?: string };
          setExistente(rr.persona_id ?? null);
          return setErr(rr.error ?? 'error');
        }
        onDone?.();
        router.push(`/trabajo/p/${(r as { persona_id?: string }).persona_id}`);
      })} className="w-full rounded-xl bg-ink px-4 py-2 font-bold text-white disabled:opacity-50">{pending ? 'Creando…' : dueno ? `Abrir expediente de ${duenoNombre}` : 'Crear / abrir'}</button>
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
