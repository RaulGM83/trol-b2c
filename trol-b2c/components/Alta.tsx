'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { LEGAL } from '@/lib/legal';
import { WA } from '@/lib/whatsapp';

const soloDigitos = (s: string) => s.replace(/\D/g, '');
const CURP_RE = /^[A-Z]{4}\d{6}[A-Z]{6}[A-Z0-9]\d$/i;
const IMSS_URL = 'https://serviciosdigitales.imss.gob.mx/semanascotizadas-web/usuarios/IngresoAsegurado';

type Paso = 'datos' | 'otp' | 'curp' | 'listo';

/**
 * Alta de prospecto nuevo: nombre + celular (OTP) → CURP → semilla.
 * Es el camino de los referidos y del tráfico nuevo; aquí NUNCA se dice
 * "no encontramos tu información" porque no hemos buscado nada.
 * La constancia de semanas cotizadas es la SEGUNDA salida, detrás de
 * "No tengo mi CURP a la mano".
 */
export function Alta({
  rc = '',
  autenticado = false,
  telVerificado = '',
  enviada = false,
}: {
  /** cliente_id del referidor, si llegó por /r/<codigo>. */
  rc?: string;
  autenticado?: boolean;
  telVerificado?: string;
  enviada?: boolean;
}) {
  // Saltamos al CURP solo si la sesión ya trae teléfono verificado: /api/lead
  // lo exige, y una sesión autenticada SIN teléfono (p. ej. magic link cuya
  // ficha se borró) llegaría al submit con `telefono: ''` y un 400 opaco.
  const [paso, setPaso] = useState<Paso>(
    enviada ? 'listo' : autenticado && telVerificado ? 'curp' : 'datos',
  );
  const [nombre, setNombre] = useState('');
  const [tel, setTel] = useState(telVerificado);
  const [otp, setOtp] = useState('');
  const [curp, setCurp] = useState('');
  const [correo, setCorreo] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();
  const e164 = () => '+52' + soloDigitos(tel).slice(-10);

  async function enviarOtp() {
    setError(null);
    if (nombre.trim().length < 2) return setError('Escribe tu nombre.');
    if (soloDigitos(tel).length < 10) return setError('Escribe tu celular a 10 dígitos.');
    if (!acepta) return setError('Acepta los Términos y el Aviso de Privacidad para continuar.');
    setCargando(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: e164() });
    setCargando(false);
    if (error) return setError('No pudimos enviar el código. Revisa el número e intenta de nuevo.');
    setPaso('otp');
  }

  async function verificarOtp() {
    setError(null);
    setCargando(true);
    const { error } = await supabase.auth.verifyOtp({ phone: e164(), token: otp.trim(), type: 'sms' });
    if (error) {
      setCargando(false);
      return setError('Código incorrecto o vencido. Intenta de nuevo.');
    }
    // Por si ya existía una ficha con ese teléfono (idempotente).
    await supabase.rpc('vincular_cliente_actual');
    setCargando(false);
    setPaso('curp');
  }

  async function enviarCurp() {
    setError(null);
    const c = curp.trim().toUpperCase();
    if (!CURP_RE.test(c)) return setError('Revisa tu CURP (18 caracteres).');
    if (!correo.includes('@') || !correo.includes('.')) return setError('Escribe un correo válido.');
    setCargando(true);
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          curp: c,
          correo: correo.trim(),
          telefono: soloDigitos(tel).slice(-10),
          nombre: nombre.trim(),
          campania: rc ? 'referido' : 'alta',
          origen: 'alta',
          referrer: rc || undefined,
        }),
      }).then((r) => r.json());
      setCargando(false);
      if (!res?.ok) {
        return setError(
          res?.error === 'no_config'
            ? 'El registro aún no está disponible. Intenta más tarde.'
            : 'No pudimos registrarte. Revisa tus datos e intenta de nuevo.',
        );
      }
      // Marca el alta como enviada para que volver a /diagnostico no vuelva a
      // pedir el CURP mientras el historial del IMSS está en camino.
      document.cookie = 'trol_alta=1; Max-Age=' + 60 * 60 * 24 * 7 + '; path=/; SameSite=Lax';
      setPaso('listo');
    } catch {
      setCargando(false);
      setError('No pudimos registrarte. Intenta de nuevo.');
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <header className="mb-6 flex items-center gap-2">
        <span className="text-2xl font-extrabold tracking-tight">
          tr<span className="text-lime">o</span>l
        </span>
      </header>

      {/* Hero: registro, no error. */}
      <div className="mb-5 rounded-2xl bg-lime p-5">
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink/70">
          {rc ? 'Te invitó alguien que ya usa El Trol' : 'Nuevo en El Trol'}
        </div>
        <h1 className="mt-1 text-xl font-extrabold leading-tight text-ink">Vamos a crear tu perfil.</h1>
        <p className="mt-1 text-sm text-ink/80">Con tu CURP calculamos tu pensión en 1 minuto.</p>
      </div>

      <div className="rounded-2xl border border-line bg-white p-5">
        {paso === 'datos' && (
          <>
            <label className="mb-1 block text-sm font-semibold">Tu nombre</label>
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre y apellido"
              className="mb-4 w-full rounded-lg border border-line px-3 py-2 text-sm"
            />

            <label className="mb-1 block text-sm font-semibold">Tu celular</label>
            <p className="mb-3 text-xs text-muted">Te enviamos un código por SMS para crear tu cuenta.</p>
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
              {cargando ? 'Enviando…' : 'Continuar'}
            </button>
          </>
        )}

        {paso === 'otp' && (
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
              onClick={verificarOtp}
              disabled={cargando}
              className="mt-4 w-full rounded-xl bg-lime px-4 py-3 text-sm font-bold text-ink disabled:opacity-60"
            >
              {cargando ? 'Verificando…' : 'Confirmar'}
            </button>
            <button onClick={() => setPaso('datos')} className="mt-2 w-full text-center text-xs text-muted hover:underline">
              ← cambiar número
            </button>
          </>
        )}

        {paso === 'curp' && (
          <>
            <div className="text-sm font-bold text-ink">Último paso: tu CURP</div>
            <p className="mt-1 text-sm text-muted">
              Con ella traemos tu historial del IMSS y armamos tu diagnóstico real. Gratis; el trámite ante el IMSS
              no tiene costo.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <input
                value={curp}
                onChange={(e) => setCurp(e.target.value.toUpperCase())}
                placeholder="CURP"
                maxLength={18}
                className="w-full rounded-lg border border-line px-3 py-2 text-sm uppercase tracking-wide"
              />
              <input
                type="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                placeholder="Correo electrónico"
                className="w-full rounded-lg border border-line px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={enviarCurp}
              disabled={cargando}
              className="mt-4 w-full rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {cargando ? 'Registrando…' : 'Calcular mi pensión'}
            </button>
          </>
        )}

        {paso === 'listo' && (
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-lime text-xl font-extrabold text-ink">
              ✓
            </div>
            <h2 className="text-lg font-extrabold text-ink">¡Listo! Vamos por tu cálculo</h2>
            <p className="mt-1 text-sm text-muted">
              Estamos trayendo tu historial del IMSS. Te avisamos por WhatsApp en cuanto esté tu diagnóstico.
            </p>
            <Link
              href="/calcula"
              className="mt-4 block rounded-xl border border-ink px-4 py-3 text-sm font-bold text-ink"
            >
              Mientras tanto, estima tu pensión
            </Link>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {/* Salidas, en orden: primero la que no exige nada, luego la constancia. */}
      {paso === 'curp' && (
        <section className="mt-4 rounded-2xl border border-line bg-white p-5">
          <div className="text-sm font-bold text-ink">¿No tienes tu CURP a la mano?</div>
          <p className="mt-1 text-sm text-muted">
            Puedes estimar tu pensión ahora mismo con tus datos, sin CURP, y volver cuando la tengas.
          </p>
          <Link
            href="/calcula"
            className="mt-3 block rounded-xl bg-lime px-4 py-3 text-center text-sm font-bold text-ink"
          >
            Estimar sin CURP
          </Link>

          <details className="mt-4 border-t border-line pt-3">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              Prefiero mandar mi constancia de semanas cotizadas
            </summary>
            <p className="mt-2 text-sm text-muted">
              Descarga tu <b className="text-ink">Reporte de Semanas Cotizadas</b> del IMSS y nosotros armamos tu
              cálculo a mano.
            </p>
            <a
              href={IMSS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block rounded-xl border border-ink px-4 py-3 text-center text-sm font-bold text-ink"
            >
              1 · Descargar mi reporte en el IMSS
            </a>
            <a
              href={WA.altaConstancia()}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 block rounded-xl bg-[#25D366] px-4 py-3 text-center text-sm font-bold text-white"
            >
              2 · Enviármelo por WhatsApp
            </a>
          </details>
        </section>
      )}

      <p className="mt-6 text-center text-[11px] leading-relaxed text-muted">
        El trámite ante el IMSS es gratis; nunca pedimos anticipos. Entras con un código que te enviamos por SMS.
      </p>
    </main>
  );
}
