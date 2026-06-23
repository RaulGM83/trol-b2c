'use client';

import { useState } from 'react';
import { LEGAL } from '@/lib/legal';

const soloDigitos = (s: string) => s.replace(/\D/g, '');
const CURP_RE = /^[A-Z]{4}\d{6}[A-Z]{6}[A-Z0-9]\d$/i;

// CTA de captura para leads nuevos (sin cuenta): crea el contacto en HubSpot
// vía webhook (n8n) y arranca el cálculo oficial con su historial del IMSS.
export function LeadForm({ campania = 'tako', origen = 'calcula' }: { campania?: string; origen?: string }) {
  const [curp, setCurp] = useState('');
  const [correo, setCorreo] = useState('');
  const [tel, setTel] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  async function enviar() {
    setError(null);
    const c = curp.trim().toUpperCase();
    const t = soloDigitos(tel).slice(-10);
    if (!CURP_RE.test(c)) return setError('Revisa tu CURP (18 caracteres).');
    if (!correo.includes('@') || !correo.includes('.')) return setError('Escribe un correo válido.');
    if (t.length < 10) return setError('Escribe tu celular a 10 dígitos.');
    if (!acepta) return setError('Acepta los Términos y el Aviso de Privacidad.');

    setCargando(true);
    const refM = document.cookie.match(/(?:^|; )trol_ref=([^;]+)/);
    const referrer = refM ? decodeURIComponent(refM[1]) : undefined;
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curp: c, correo: correo.trim(), telefono: t, campania, origen, referrer }),
      }).then((r) => r.json());
      setCargando(false);
      if (res?.ok) return setListo(true);
      if (res?.error === 'no_config') return setError('El registro aún no está disponible. Intenta más tarde.');
      return setError('No pudimos registrarte. Revisa tus datos e intenta de nuevo.');
    } catch {
      setCargando(false);
      setError('No pudimos registrarte. Intenta de nuevo.');
    }
  }

  if (listo) {
    return (
      <div className="rounded-2xl bg-ink p-6 text-center text-white">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-lime text-xl font-extrabold text-ink">
          ✓
        </div>
        <h3 className="text-lg font-extrabold">¡Listo! Vamos por tu cálculo exacto</h3>
        <p className="mt-1 text-sm text-white/70">
          Estamos trayendo tu historial del IMSS. Te contactamos por WhatsApp y correo con tu diagnóstico.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-5">
      <div className="text-sm font-bold text-ink">Quiero mi cálculo exacto</div>
      <p className="mt-1 text-sm text-muted">
        Con tu CURP traemos tu historial del IMSS y armamos tu diagnóstico real. Gratis; el trámite ante el IMSS no
        tiene costo.
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
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-line bg-cream px-3 py-2 text-sm text-muted">+52</span>
          <input
            inputMode="numeric"
            value={tel}
            onChange={(e) => setTel(e.target.value)}
            placeholder="Celular (10 dígitos)"
            className="w-full rounded-lg border border-line px-3 py-2 text-sm"
          />
        </div>
      </div>

      <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-muted">
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
        onClick={enviar}
        disabled={cargando || !acepta}
        className="mt-4 w-full rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
      >
        {cargando ? 'Registrando…' : 'Crear mi cuenta y calcular'}
      </button>
      {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}
