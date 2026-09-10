'use client';
import { useState, useTransition } from 'react';
import { guardarContacto } from '@/app/trabajo/actions';

// Un dato de contacto que el asesor corrige en línea. El correo del cliente no
// vive en `catalogo_campos` sino en `trol3.contactos`, por eso no pasa por
// DatosTabla: lo guarda `guardar_contacto` (130), que lo deja como principal
// para campañas futuras y lo copia al legacy.
export function ContactoEditable({ personaId, tipo, valor }: { personaId: string; tipo: 'email' | 'telefono'; valor: string | null }) {
  const [edit, setEdit] = useState(false);
  const [val, setVal] = useState(valor ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const label = tipo === 'email' ? 'correo' : 'teléfono';
  if (!edit) {
    return (
      <span>
        {valor ?? <span className="text-amber-700">sin {label}</span>}
        <button className="ml-1 text-[10px] text-muted underline" onClick={() => { setVal(valor ?? ''); setEdit(true); }} title={`Corregir ${label}`}>editar</button>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <input autoFocus type={tipo === 'email' ? 'email' : 'tel'} value={val} onChange={(e) => setVal(e.target.value)} className="w-52 rounded border border-line px-1 py-0.5 text-xs" placeholder={tipo === 'email' ? 'correo@dominio.com' : '10 dígitos'} />
      <button disabled={pending || !val.trim()} className="rounded bg-ink px-2 py-0.5 text-[10px] font-semibold text-white disabled:opacity-50" onClick={() => start(async () => {
        const r = (await guardarContacto(personaId, tipo, val.trim())) as { ok: boolean; error?: string };
        if (r.ok) { setEdit(false); setMsg(null); } else setMsg(r.error === 'email_invalido' ? 'Ese correo no parece válido.' : r.error === 'telefono_invalido' ? 'Se necesitan 10 dígitos.' : r.error ?? 'error');
      })}>{pending ? '…' : 'Guardar'}</button>
      <button className="text-[10px] text-muted underline" onClick={() => { setEdit(false); setMsg(null); }}>cancelar</button>
      {msg && <span className="text-[10px] text-red-600">{msg}</span>}
    </span>
  );
}
