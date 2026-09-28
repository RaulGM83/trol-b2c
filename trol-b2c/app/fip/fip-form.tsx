'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LEGAL } from '@/lib/legal';

// 190 · El alta desde la web del evento (claude/88). Tres pantallas: datos → código por SMS →
// listo. Si el navegador ya trae sesión (ya entró a /mi antes), el SMS se salta y sólo pide
// CURP + consentimiento. Todo lo que pasa después (persona, experto, beneficio, consulta al
// IMSS) lo hace la RPC trol3.alta_web_evento en una sola llamada.

const CURP_RE = /^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/;
const soloDigitos = (s: string) => s.replace(/\D/g, '');
const campo = 'mt-1 block w-full rounded-xl border border-line bg-white px-4 py-3 text-base text-ink';
const ERRORES: Record<string, string> = {
  curp_invalida: 'Revisa tu CURP: son 18 caracteres, como aparece en tu INE.',
  sin_consentimiento: 'Acepta los Términos y el Aviso de Privacidad para continuar.',
  codigo_de_evento_no_existe: 'Este registro ya no está activo. Escríbenos por WhatsApp y te ayudamos.',
  sin_sesion: 'Tu sesión expiró. Vuelve a pedir el código por SMS.',
};

type Resultado = { ok: boolean; motivo?: string; persona_id?: string; nueva?: boolean; consulta?: { estado: string; proveedor: string | null } | null };

/** Logo del Foro: mientras no tengamos el archivo, el nombre en texto (no un cuadro roto). */
export function LogoFip({ variante, className = '' }: { variante: 'blanco' | 'color'; className?: string }) {
  const [roto, setRoto] = useState(false);
  if (roto) {
    return <span className={`text-xs font-bold uppercase leading-tight tracking-wide ${variante === 'blanco' ? 'text-white' : 'text-ink'} ${className}`}>Foro Internacional<br />de Pensiones</span>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/marca/fip-${variante}.png`} alt="Foro Internacional de Pensiones" className={`w-auto ${className}`} onError={() => setRoto(true)} />;
}

export function FipForm({ codigo, telVerificado, waUrl }: { codigo: string; telVerificado: string; waUrl: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [paso, setPaso] = useState<'datos' | 'otp' | 'listo'>('datos');
  const [nombre, setNombre] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [tel, setTel] = useState(telVerificado);
  const [conSesion, setConSesion] = useState(!!telVerificado);
  const [curp, setCurp] = useState('');
  const [acepta, setAcepta] = useState(false);
  const [otp, setOtp] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [curpAjena, setCurpAjena] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const tel10 = soloDigitos(tel).slice(-10);
  const curpLimpia = curp.toUpperCase().replace(/\s/g, '');
  const e164 = () => '+52' + tel10;
  const datosOk = nombre.trim().length >= 2 && apellidos.trim().length >= 2 && tel10.length === 10 && CURP_RE.test(curpLimpia) && acepta;

  function validar(): string | null {
    if (nombre.trim().length < 2) return 'Escribe tu nombre.';
    if (apellidos.trim().length < 2) return 'Escribe tus apellidos.';
    if (tel10.length !== 10) return 'Escribe tu celular a 10 dígitos.';
    if (!CURP_RE.test(curpLimpia)) return ERRORES.curp_invalida;
    if (!acepta) return ERRORES.sin_consentimiento;
    return null;
  }

  async function darDeAlta() {
    const { data, error } = await supabase.schema('trol3').rpc('alta_web_evento', {
      p_codigo: codigo, p_nombre: nombre.trim(), p_apellidos: apellidos.trim(), p_curp: curpLimpia, p_consentimiento: true,
    });
    if (error) {
      const clave = Object.keys(ERRORES).find((k) => error.message.includes(k));
      throw new Error(clave ? ERRORES[clave] : 'No pudimos completar tu registro. Inténtalo de nuevo o escríbenos por WhatsApp.');
    }
    const r = data as Resultado;
    if (!r?.ok && r?.motivo === 'curp_de_otra_persona') { setCurpAjena(true); return; }
    setResultado(r);
    setPaso('listo');
    router.refresh();
  }

  async function continuar() {
    setError(null);
    const e = validar();
    if (e) return setError(e);
    setCargando(true);
    try {
      if (conSesion) { await darDeAlta(); return; }
      const { error } = await supabase.auth.signInWithOtp({ phone: e164() });
      if (error) throw new Error('No pudimos enviarte el SMS. Revisa el número e inténtalo de nuevo.');
      setPaso('otp');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCargando(false);
    }
  }

  async function verificar() {
    setError(null);
    setCargando(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ phone: e164(), token: soloDigitos(otp), type: 'sms' });
      if (error) throw new Error('El código no coincide o ya venció. Revísalo o pide uno nuevo.');
      await darDeAlta();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCargando(false);
    }
  }

  async function otroNumero() {
    await supabase.auth.signOut();
    setConSesion(false);
    setTel('');
  }

  if (curpAjena) {
    return (
      <div className="rounded-2xl bg-white p-6 text-ink shadow-xl">
        <h2 className="text-xl font-extrabold">Esa CURP ya está en Trol</h2>
        <p className="mt-2 text-sm text-muted">Está registrada con otro celular. Para no mezclar cuentas, lo resolvemos contigo por chat en un minuto y tu beneficio del Foro queda igual.</p>
        <a href={waUrl} className="mt-5 block w-full rounded-xl bg-ink px-4 py-3 text-center text-sm font-bold text-white">Resolverlo por WhatsApp</a>
        <button type="button" onClick={() => { setCurpAjena(false); setCurp(''); }} className="mt-3 w-full text-center text-xs text-muted hover:underline">← revisar mi CURP</button>
      </div>
    );
  }

  if (paso === 'listo') {
    const buscando = resultado?.consulta && !['completada', 'sin_resultado', 'error'].includes(resultado.consulta.estado);
    return (
      <div className="rounded-2xl bg-white p-6 text-ink shadow-xl">
        <span className="inline-block rounded-full bg-lime px-3 py-1 text-xs font-bold">Registro listo</span>
        <h2 className="mt-3 text-2xl font-extrabold">{nombre.trim().split(' ')[0]}, ya estamos en eso</h2>
        <p className="mt-2 text-sm text-muted">
          {buscando
            ? 'Estamos preparando tus cálculos. Suele tardar unos minutos; te avisamos por WhatsApp en cuanto tu cuenta tenga tus números.'
            : 'Tu cuenta quedó creada con el beneficio del Foro. Entra y ve tus números en cuanto estén.'}
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          <li className="flex gap-2"><span className="font-black text-lime">✓</span> Sesión de 20 min con tu experto de Trol, cortesía del Foro</li>
          <li className="flex gap-2"><span className="font-black text-lime">✓</span> Cashback a tu AFORE con Millas para el Retiro</li>
        </ul>
        <a href="/mi" className="mt-5 block w-full rounded-xl bg-ink px-4 py-3 text-center text-sm font-bold text-white">Entrar a mi cuenta</a>
        <a href={waUrl} className="mt-2 block w-full rounded-xl border-2 border-ink px-4 py-3 text-center text-sm font-bold">Abrir mi chat con Lukas</a>
        <p className="mt-3 text-center text-xs text-muted">Guarda este acceso: tu cuenta se abre con tu celular, sin contraseña.</p>
      </div>
    );
  }

  if (paso === 'otp') {
    return (
      <div className="rounded-2xl bg-white p-6 text-ink shadow-xl">
        <h2 className="text-xl font-extrabold">Código por SMS</h2>
        <p className="mt-1 text-sm text-muted">Lo enviamos al +52 {tel10}.</p>
        <input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6 dígitos" className={`${campo} mt-4 text-center text-2xl tracking-[0.4em]`} />
        <button type="button" onClick={verificar} disabled={cargando || soloDigitos(otp).length < 6} className="mt-4 w-full rounded-xl bg-lime px-4 py-3 text-sm font-bold text-ink disabled:opacity-60">
          {cargando ? 'Creando tu cuenta…' : 'Confirmar y crear mi cuenta'}
        </button>
        <button type="button" onClick={() => { setPaso('datos'); setOtp(''); setError(null); }} className="mt-3 w-full text-center text-xs text-muted hover:underline">← cambiar número</button>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-6 text-ink shadow-xl">
      <h2 className="text-xl font-extrabold">Activa tu asesoría básica</h2>
      <p className="mt-1 text-sm text-muted">Dos minutos. Tu cuenta se abre con tu celular, sin contraseña.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold">Nombre(s)
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="given-name" placeholder="Como en tu INE" className={campo} />
        </label>
        <label className="block text-sm font-semibold">Apellidos
          <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} autoComplete="family-name" placeholder="Paterno y materno" className={campo} />
        </label>
      </div>
      <label className="mt-3 block text-sm font-semibold">Tu celular (WhatsApp)
        {conSesion ? (
          <div className="mt-1 flex items-center justify-between rounded-xl border border-line bg-cream px-4 py-3 text-base">
            <span>+52 ····· {tel10.slice(-4)} <span className="ml-1 text-xs font-normal text-muted">ya verificado</span></span>
            <button type="button" onClick={otroNumero} className="text-xs font-semibold underline">usar otro</button>
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded-xl border border-line bg-cream px-3 py-3 text-base text-muted">+52</span>
            <input inputMode="numeric" autoComplete="tel-national" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="55 1234 5678" className={`${campo} mt-0`} />
          </div>
        )}
      </label>
      <label className="mt-3 block text-sm font-semibold">Tu CURP
        <input value={curp} onChange={(e) => setCurp(e.target.value.toUpperCase())} maxLength={18} autoCapitalize="characters" spellCheck={false} placeholder="18 caracteres, como en tu INE" className={`${campo} font-mono tracking-wider`} />
        <span className="mt-1 block text-xs font-normal text-muted">Con ella hacemos tus cálculos. Sólo para tu asesoría.</span>
      </label>
      <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs text-muted">
        <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-lime" />
        <span>
          Acepto los <a href={LEGAL.terminos} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline">Términos y Condiciones</a> y el{' '}
          <a href={LEGAL.privacidad} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline">Aviso de Privacidad</a>, y autorizo consultar mi historial del IMSS para mi asesoría.
        </span>
      </label>
      <button type="button" onClick={continuar} disabled={cargando || !datosOk} className="mt-5 w-full rounded-xl bg-lime px-4 py-3.5 text-base font-bold text-ink disabled:opacity-50">
        {cargando ? 'Un momento…' : conSesion ? 'Activar mi asesoría' : 'Enviarme el código por SMS'}
      </button>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      <p className="mt-4 text-center text-xs text-muted">
        ¿Prefieres por chat? <a href={waUrl} className="font-semibold text-ink underline">Empieza por WhatsApp</a>
      </p>
    </div>
  );
}
