'use client';
// Contraseña del portal Infonavit: vive cifrada en la base (migración 089) y solo se
// muestra al pulsar "Revelar" — cada guardado y cada revelado quedan en la bitácora.
import { useEffect, useState, useTransition } from 'react';
import { guardarCredencial, revelarCredencial } from '@/app/trabajo/actions';

type Estado = { servicio: string; usuario: string | null; updated_at: string } | null;
type R = { ok: boolean; error?: string; credencial?: { usuario: string | null; secreto: string } | null };

export function CredencialInfonavit({ personaId, estado }: { personaId: string; estado: Estado }) {
  const [edit, setEdit] = useState(false);
  const [usuario, setUsuario] = useState('');
  const [secreto, setSecreto] = useState('');
  const [visto, setVisto] = useState<{ usuario: string | null; secreto: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Lo revelado se borra solo de pantalla a los 45 segundos.
  useEffect(() => {
    if (!visto) return;
    const t = setTimeout(() => setVisto(null), 45_000);
    return () => clearTimeout(t);
  }, [visto]);

  const fecha = estado ? new Date(estado.updated_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Mexico_City' }) : null;

  return (
    <div className="mt-3 border-t border-line pt-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold uppercase text-muted">Contraseña Infonavit</span>
        {estado && !edit ? (
          <>
            {estado.usuario ? <span>usuario <b>{estado.usuario}</b></span> : null}
            <span className="text-muted">guardada · {fecha}</span>
            {visto ? (
              <span className="rounded bg-cream px-2 py-0.5 font-mono font-semibold">{visto.secreto}</span>
            ) : (
              <button disabled={pending} className="rounded-lg border border-line px-2 py-0.5 font-semibold hover:bg-cream disabled:opacity-50" onClick={() => start(async () => {
                const r = (await revelarCredencial(personaId)) as R;
                if (!r.ok) setMsg(r.error ?? 'error'); else { setVisto(r.credencial ?? null); setMsg(null); }
              })}>{pending ? '…' : 'Revelar'}</button>
            )}
          </>
        ) : null}
        {!edit ? (
          <button className="text-muted underline" onClick={() => { setEdit(true); setMsg(null); }}>{estado ? 'cambiar' : 'guardar contraseña'}</button>
        ) : null}
      </div>
      {edit && (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <input value={usuario} onChange={(ev) => setUsuario(ev.target.value)} placeholder={estado?.usuario ?? 'usuario (opcional)'} className="w-40 rounded border border-line px-2 py-1" />
          <input value={secreto} onChange={(ev) => setSecreto(ev.target.value)} type="password" placeholder="contraseña" autoComplete="new-password" className="w-40 rounded border border-line px-2 py-1" />
          <button disabled={pending || !secreto} className="rounded bg-ink px-2 py-1 font-semibold text-white disabled:opacity-50" onClick={() => start(async () => {
            const r = (await guardarCredencial(personaId, secreto, usuario || undefined)) as R;
            if (!r.ok) setMsg(r.error ?? 'error'); else { setEdit(false); setSecreto(''); setUsuario(''); setMsg(null); }
          })}>Guardar</button>
          <button className="text-muted underline" onClick={() => { setEdit(false); setMsg(null); }}>cancelar</button>
        </div>
      )}
      {msg && <p className="mt-1 text-red-600">{msg}</p>}
      <p className="mt-1 text-[10px] text-muted">Cifrada en la bóveda; cada revelado queda en la bitácora del expediente.</p>
    </div>
  );
}
