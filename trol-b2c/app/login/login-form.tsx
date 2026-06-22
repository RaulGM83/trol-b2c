'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LEGAL } from '@/lib/legal';

const soloDigitos = (s: string) => s.replace(/\D/g, '');

export function LoginForm({ initialTel = '' }: { initialTel?: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [paso, setPaso] = useState<'tel' | 'otp'>('tel');
  const [tel, setTel] = useState(initialTel);
  const [otp, setOtp] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acepta, setAcepta] = useState(false);

  const e164 = () => '+52' + soloDigitos(tel).slice(-10); // México

  async function enviarOtp() {
    setError(null);
    if (soloDigitos(tel).length < 10) return setError('Escribe tu celular a 10 dígitos.');
    if (!acepta) return setError('Acepta los Términos y el Aviso de Privacidad para continuar.');
    setCargando(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: e164() });
    setCargando(false);
    if (error) return setError(error.message);
    setPaso('otp');
  }

  async function verificar() {
    setError(null);
    setCargando(true);
    const { error } = await supabase.auth.verifyOtp({ phone: e164(), token: otp, type: 'sms' });
    if (error) {
      setCargando(false);
      return setError(error.message);
    }
    // Vincula este login con su ficha de cliente por teléfono (idempotente).
    await supabase.rpc('vincular_cliente_actual');
    setCargando(false);
    router.push('/diagnostico');
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      {paso === 'tel' ? (
        <>
          <label className="mb-1 block text-sm font-semibold">Tu celular</label>
          <p className="mb-3 text-xs text-muted">Te enviamos un código por SMS para entrar a tu diagnóstico.</p>
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-line bg-cream px-3 py-2 text-sm text-muted">+52</span>
            <input
              inputMode="numeric"
              value={tel}
              onChange={(e) => setTel(e.target.value)}
              placeholder="55 1234 5678"
              className="w-full rounded-lg border border-line px-3 py-2 text-sm"
            />
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={acepta}
              onChange={(e) => setAcepta(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-lime"
            />
            <span>
              Acepto los{' '}
              <a href={LEGAL.terminos} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline">
                Términos y Condiciones
              </a>{' '}
              y el{' '}
              <a href={LEGAL.privacidad} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline">
                Aviso de Privacidad
              </a>
              , y autorizo consultar mi historial del IMSS para mi diagnóstico.
            </span>
          </label>
          <button
            onClick={enviarOtp}
            disabled={cargando || !acepta}
            className="mt-4 w-full rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {cargando ? 'Enviando…' : 'Enviar código'}
          </button>
        </>
      ) : (
        <>
          <label className="mb-1 block text-sm font-semibold">Código por SMS</label>
          <p className="mb-3 text-xs text-muted">Lo enviamos al +52 {soloDigitos(tel).slice(-10)}.</p>
          <input
            inputMode="numeric"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="6 dígitos"
            className="w-full rounded-lg border border-line px-3 py-2 text-center text-lg tracking-widest"
          />
          <button
            onClick={verificar}
            disabled={cargando}
            className="mt-4 w-full rounded-xl bg-lime px-4 py-3 text-sm font-bold text-ink disabled:opacity-60"
          >
            {cargando ? 'Verificando…' : 'Entrar'}
          </button>
          <button onClick={() => setPaso('tel')} className="mt-2 w-full text-center text-xs text-muted hover:underline">
            ← cambiar número
          </button>
        </>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
