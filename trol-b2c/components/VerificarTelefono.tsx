'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Stepper } from './Stepper';

// Step-up auth para sesiones de magic link (entraron sin OTP): antes de pagar
// o gastar puntos, verifica el celular por SMS UNA vez (phone_change de
// Supabase agrega el teléfono al mismo usuario; no crea otro).
export function VerificarTelefono({ telInicial }: { telInicial: string }) {
  const router = useRouter();
  const [paso, setPaso] = useState<'tel' | 'codigo'>('tel');
  const [tel, setTel] = useState(telInicial);
  const [codigo, setCodigo] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const soloDigitos = (s: string) => s.replace(/\D/g, '');
  const e164 = () => '+52' + soloDigitos(tel).slice(-10);

  async function enviar() {
    setError(null);
    if (soloDigitos(tel).length < 10) return setError('Escribe tu celular a 10 dígitos.');
    setCargando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ phone: e164() });
    setCargando(false);
    if (error) return setError('No pudimos enviar el código. Revisa el número e intenta de nuevo.');
    setPaso('codigo');
  }

  async function verificar() {
    setError(null);
    setCargando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ phone: e164(), token: codigo.trim(), type: 'phone_change' });
    setCargando(false);
    if (error) return setError('Código incorrecto o vencido. Intenta de nuevo.');
    router.refresh(); // el checkout se re-renderiza ya con teléfono verificado
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-6">
      <header className="mb-6 flex items-center gap-2">
        <span className="text-xl font-extrabold tracking-tight">
          tr<span className="text-lime">o</span>l
        </span>
      </header>
      <Stepper activo={3} />

      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Confirma tu celular</h1>
      <p className="mb-5 text-sm text-muted">
        Por tu seguridad, antes de pagar o usar tus puntos verificamos tu celular una sola vez con un
        código por SMS.
      </p>

      {paso === 'tel' ? (
        <>
          <input
            value={tel}
            onChange={(e) => setTel(e.target.value)}
            inputMode="numeric"
            placeholder="Tu celular a 10 dígitos"
            className="mb-3 w-full rounded-xl border border-line px-4 py-3 text-sm"
          />
          <button
            onClick={enviar}
            disabled={cargando}
            className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {cargando ? 'Enviando…' : 'Enviarme el código'}
          </button>
        </>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">Lo enviamos al +52 {soloDigitos(tel).slice(-10)}.</p>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            inputMode="numeric"
            placeholder="Código de 6 dígitos"
            className="mb-3 w-full rounded-xl border border-line px-4 py-3 text-center text-lg font-bold tracking-widest"
          />
          <button
            onClick={verificar}
            disabled={cargando}
            className="w-full rounded-xl bg-lime px-4 py-3 text-sm font-bold text-ink disabled:opacity-60"
          >
            {cargando ? 'Verificando…' : 'Confirmar y continuar'}
          </button>
          <button onClick={() => setPaso('tel')} className="mt-2 w-full text-center text-xs text-muted hover:underline">
            Cambiar número / reenviar
          </button>
        </>
      )}
      {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}

      <p className="mt-6 text-center text-[11px] leading-relaxed text-muted">
        El trámite ante el IMSS es gratis. Nunca pedimos datos de tu banca por este medio.
      </p>
    </main>
  );
}
