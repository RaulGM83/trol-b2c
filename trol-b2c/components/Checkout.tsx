'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DiagnosticoVM } from '@/lib/diagnostico';
import type { Producto } from '@/lib/productos';
import { cashbackPuntos } from '@/lib/productos';
import { createClient } from '@/lib/supabase/client';
import { CasoResumen } from './CasoResumen';
import { Stepper } from './Stepper';

type Via = 'pago' | 'puntos';
type Metodo = 'spei' | 'tarjeta';

/** Pantalla 3 del Inc 0 — Checkout integrado con el caso a la vista (§13, §16). */
export function Checkout({ vm, producto, via }: { vm: DiagnosticoVM; producto: Producto; via: Via }) {
  const [metodo, setMetodo] = useState<Metodo>('spei'); // SPEI-first
  const [cfdi, setCfdi] = useState(false);
  const [rfc, setRfc] = useState('');
  const [pagado, setPagado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spei, setSpei] = useState<{ monto: number; referencia: string; voucher_url: string | null; clabe: string | null } | null>(null);

  // SPEI es asíncrono: mientras esperamos la transferencia, consultamos el
  // estado de la orden cada 5s y al confirmarse pasamos a la pantalla de éxito.
  useEffect(() => {
    if (!spei) return;
    const supabase = createClient();
    const iv = setInterval(async () => {
      const { data } = await supabase
        .from('ordenes_b2c')
        .select('estado')
        .eq('id', spei.referencia)
        .maybeSingle();
      if (data?.estado === 'cumplida') {
        clearInterval(iv);
        setPagado(true);
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [spei]);

  const esPuntos = via === 'puntos';
  const cashback = esPuntos ? 0 : cashbackPuntos(producto.precioMXN); // sin cashback si paga con puntos

  async function confirmar() {
    setError(null);
    if (esPuntos) {
      // Desbloqueo real con puntos (RPC atómico).
      setCargando(true);
      const supabase = createClient();
      const { data, error } = await supabase.rpc('desbloquear_con_puntos', { p_product_code: producto.code });
      setCargando(false);
      const r = data as { ok?: boolean; error?: string; saldo?: number; precio?: number } | null;
      if (error) return setError(error.message);
      if (!r?.ok) {
        if (r?.error === 'saldo_insuficiente') return setError(`Te faltan puntos (tienes ${r.saldo}, cuesta ${r.precio}).`);
        return setError('No se pudo desbloquear con puntos.');
      }
      return setPagado(true);
    }
    setCargando(true);
    const noConfig = 'El pago aún no está configurado (faltan las llaves de Mercado Pago).';
    try {
      if (metodo === 'spei') {
        // SPEI nativo: genera la CLABE y la mostramos en pantalla.
        const res = await fetch('/api/pago/spei', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_code: producto.code }),
        }).then((r) => r.json());
        setCargando(false);
        if (res?.ok) return setSpei(res);
        return setError(res?.error === 'mp_no_configurado' ? noConfig : 'No se pudo generar la CLABE.');
      }
      // Tarjeta → Checkout Pro.
      const res = await fetch('/api/pago/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_code: producto.code }),
      }).then((r) => r.json());
      if (res?.init_point) {
        window.location.href = res.init_point;
        return;
      }
      setCargando(false);
      setError(res?.error === 'mp_no_configurado' ? noConfig : 'No se pudo iniciar el pago. Intenta de nuevo.');
    } catch {
      setCargando(false);
      setError('No se pudo iniciar el pago. Intenta de nuevo.');
    }
  }

  // SPEI nativo: pantalla con la CLABE / comprobante para transferir.
  if (spei) {
    return (
      <main className="mx-auto max-w-xl px-5 py-6">
        <Stepper activo={3} />
        <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Transfiere por SPEI</h1>
        <p className="mb-4 text-sm text-muted">
          Tu acceso a <b className="text-ink">{producto.nombre}</b> se activa solo en cuanto recibamos tu transferencia.
        </p>

        <div className="rounded-2xl bg-ink p-5 text-white">
          <div className="text-[11px] font-bold uppercase tracking-wide text-lime">Monto a transferir</div>
          <div className="mt-1 text-3xl font-extrabold tracking-tight">${spei.monto} MXN</div>
          {spei.clabe && (
            <div className="mt-3 border-t border-white/15 pt-3">
              <div className="text-[11px] uppercase tracking-wide text-white/60">CLABE</div>
              <div className="text-lg font-bold tracking-wider">{spei.clabe}</div>
            </div>
          )}
          <div className="mt-3 text-xs text-white/60">Referencia: {spei.referencia.slice(0, 8)}</div>
        </div>

        {spei.voucher_url && (
          <a href={spei.voucher_url} target="_blank" rel="noopener noreferrer"
            className="mt-4 block rounded-xl bg-lime px-4 py-3 text-center text-sm font-bold text-ink">
            Ver mi CLABE y datos para transferir
          </a>
        )}

        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-cream px-4 py-3 text-sm text-ink/80">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#65a30d] opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#65a30d]" />
          </span>
          Esperando tu transferencia… se confirma sola
        </div>
        <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
          La transferencia SPEI tarda unos minutos. Puedes cerrar esta pantalla; te avisamos por WhatsApp al activarse y tu calculadora queda lista.
        </p>
      </main>
    );
  }

  // Estado post-pago (§16): éxito + avance + abrir producto + cashback.
  if (pagado) {
    return (
      <main className="mx-auto max-w-xl px-5 py-6">
        <Stepper activo={3} />
        <div className="rounded-2xl bg-ink p-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-lime text-xl font-extrabold text-ink">
            ✓
          </div>
          <h1 className="text-xl font-extrabold">
            {esPuntos ? 'Desbloqueado con puntos' : 'Pago confirmado'}
          </h1>
          <p className="mt-1 text-sm text-white/70">
            Ya tienes acceso a <b className="text-white">{producto.nombre}</b>.
          </p>
          {cashback > 0 && (
            <div className="mx-auto mt-4 inline-block rounded-full bg-lime px-3 py-1 text-sm font-bold text-ink">
              +{cashback} pts de cashback
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <Link href="/calculadora" className="rounded-xl bg-lime px-4 py-3 text-center text-sm font-bold text-ink">
            Abrir {producto.nombre}
          </Link>
          <Link href="/diagnostico" className="rounded-xl border border-line bg-white px-4 py-3 text-center text-sm font-bold text-ink">
            Volver a mi diagnóstico
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-6">
      <header className="mb-6 flex items-center gap-2">
        <span className="text-xl font-extrabold tracking-tight">
          tr<span className="text-lime">o</span>l
        </span>
        <Link href="/mejor-jugada" className="text-xs text-muted hover:underline">
          ← volver
        </Link>
      </header>

      <Stepper activo={3} />
      <h1 className="mb-3 text-2xl font-extrabold tracking-tight">
        {esPuntos ? 'Confirmar con puntos' : 'Pagar'}
      </h1>

      {/* El caso a la vista */}
      <div className="mb-4">
        <CasoResumen vm={vm} />
      </div>

      {/* Producto */}
      <section className="mb-4 rounded-2xl border border-line bg-white p-5">
        <div className="flex items-baseline justify-between">
          <span className="font-bold">{producto.nombre}</span>
          <span className="font-extrabold">
            {esPuntos ? `${producto.precioMXN} pts` : `$${producto.precioMXN}`}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">{producto.entrega}</p>
      </section>

      {!esPuntos && (
        <>
          {/* Método de pago — SPEI-first */}
          <section className="mb-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Método de pago</div>
            <div className="grid grid-cols-2 gap-2">
              {(['spei', 'tarjeta'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetodo(m)}
                  className={`rounded-xl border px-4 py-3 text-sm font-bold ${
                    metodo === m ? 'border-ink bg-ink text-white' : 'border-line bg-white text-ink'
                  }`}
                >
                  {m === 'spei' ? 'Transferencia SPEI' : 'Tarjeta'}
                </button>
              ))}
            </div>
            <div className="mt-3 rounded-xl bg-cream p-3 text-sm text-ink/80">
              {metodo === 'spei'
                ? 'Te damos una CLABE para transferir desde tu banco. Confirmamos automáticamente al recibir el pago.'
                : 'Pago con tarjeta de débito o crédito vía checkout seguro.'}
            </div>
          </section>

          {/* CFDI opcional */}
          <section className="mb-4 rounded-xl border border-line bg-white p-4">
            <label className="flex items-center justify-between">
              <span className="text-sm font-semibold">Quiero factura (CFDI)</span>
              <input type="checkbox" checked={cfdi} onChange={(e) => setCfdi(e.target.checked)} className="h-4 w-4 accent-lime" />
            </label>
            {cfdi && (
              <input
                value={rfc}
                onChange={(e) => setRfc(e.target.value.toUpperCase())}
                placeholder="RFC"
                className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-sm"
              />
            )}
          </section>
        </>
      )}

      {/* Resumen */}
      <section className="mb-4 rounded-xl bg-white p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">{esPuntos ? 'Puntos a usar' : 'Total'}</span>
          <span className="font-extrabold">{esPuntos ? `${producto.precioMXN} pts` : `$${producto.precioMXN} MXN`}</span>
        </div>
        {cashback > 0 && (
          <div className="mt-1 flex justify-between text-ink/70">
            <span>Cashback que ganas</span>
            <span className="font-bold">+{cashback} pts</span>
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={confirmar}
        disabled={cargando}
        className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {cargando ? 'Procesando…' : esPuntos ? `Usar ${producto.precioMXN} pts` : `Pagar $${producto.precioMXN}`}
      </button>
      {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}

      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">
        Pago seguro dentro de El Trol. No pedimos anticipos en efectivo ni montos garantizados.
        <br />Demo: el botón simula el pago (sin cargo real).
      </p>
    </main>
  );
}
