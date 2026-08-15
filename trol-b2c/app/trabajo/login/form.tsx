'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function LoginEmailForm() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  async function enviar() {
    setError(null); setCargando(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/trabajo` },
    });
    setCargando(false);
    if (error) return setError(error.message);
    setEnviado(true);
  }
  if (enviado) return <div className="rounded-2xl border border-line bg-white p-5 text-sm">Revisa tu correo y abre el enlace para entrar.</div>;
  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <label className="mb-1 block text-sm font-semibold">Correo</label>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@trol.mx" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <button onClick={enviar} disabled={cargando} className="mt-4 w-full rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
        {cargando ? 'Enviando…' : 'Enviar enlace'}
      </button>
    </div>
  );
}
