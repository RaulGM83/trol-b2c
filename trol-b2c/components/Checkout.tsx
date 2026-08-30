'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DiagnosticoVM } from '@/lib/diagnostico';
import type { Producto } from '@/lib/productos';
import { cashbackPuntos, calcularMixto, SPEI_MINIMO_MXN } from '@/lib/productos';
import { createClient } from '@/lib/supabase/client';
import { WA, BOOKING_URL } from '@/lib/whatsapp';
import { CasoResumen } from './CasoResumen';
import { CardBrick } from './CardBrick';

type Via = 'pago' | 'puntos';
type Metodo = 'spei' | 'tarjeta';

/** Encabezado propio del checkout, mismo lenguaje visual que /mi. */
function CheckoutHeader() {
  return (
    <header className="mb-5 flex items-center justify-between">
      <span className="rounded-lg bg-ink px-2.5 py-1 text-xl font-extrabold tracking-tight text-white"><img src="/marca/logo-trol-blanco.svg" alt="Trol financiero" className="inline-block h-[1.35em] w-auto align-middle" /></span>
      <Link href="/mi" className="text-xs text-muted hover:underline">← Mi expediente</Link>
    </header>
  );
}

/** Checkout integrado a /mi, con el caso a la vista cuando existe (§13, §16). */
export function Checkout({
  vm,
  producto,
  via,
  saldoPuntos = 0,
  mixInicial = false,
}: {
  vm: DiagnosticoVM | null;
  producto: Producto;
  via: Via;
  saldoPuntos?: number;
  mixInicial?: boolean;
}) {
  const [metodo, setMetodo] = useState<Metodo>('spei'); // SPEI-first
  // Pago mixto: aplica los puntos disponibles y paga solo el resto. Los puntos
  // se debitan hasta que el pago se confirma (webhook), nunca antes.
  const mixto = calcularMixto(producto.precioMXN, saldoPuntos);
  const mixtoDisponible = via === 'pago' && mixto.puntos > 0 && saldoPuntos < producto.precioMXN;
  const [usarPuntos, setUsarPuntos] = useState(mixInicial && mixtoDisponible);
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
  // Con pago mixto, SPEI solo si el resto alcanza el mínimo de MP ($100).
  const speiPermitido = !usarPuntos || mixto.speiDisponible;
  const metodoEfectivo: Metodo = speiPermitido ? metodo : 'tarjeta';
  const montoAPagar = usarPuntos ? mixto.resto : producto.precioMXN;
  const cashback = esPuntos ? 0 : cashbackPuntos(montoAPagar); // 10% de lo pagado en efectivo

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
      // El pago dispara el refresh de Jordan vía webhook; el desbloqueo por
      // puntos no pasa por MP, así que lo pedimos aquí (activa al Segmento B
      // sin semilla). Fire-and-forget: no bloquea la pantalla de éxito.
      fetch('/api/refrescar', { method: 'POST' }).catch(() => {});
      return setPagado(true);
    }
    setCargando(true);
    const noConfig = 'El pago aún no está configurado (faltan las llaves de Mercado Pago).';
    try {
      if (metodoEfectivo === 'spei') {
        // SPEI nativo: genera la CLABE y la mostramos en pantalla.
        const res = await fetch('/api/pago/spei', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_code: producto.code, usar_puntos: usarPuntos }),
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
        <CheckoutHeader />
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
          <div className="mt-3 border-t border-white/15 pt-3 text-xs text-white/70">
            En tu banco el beneficiario aparecerá como <b className="text-white">Mercado Pago</b> (o STP):
            es nuestro procesador de pagos, es correcto.
          </div>
          <div className="mt-2 text-xs text-white/60">Referencia: {spei.referencia.slice(0, 8)}</div>
        </div>

        {spei.voucher_url && (
          <a href={spei.voucher_url} target="_blank" rel="noopener noreferrer"
            className="mt-4 block rounded-xl bg-lime px-4 py-3 text-center text-sm font-bold text-ink">
            Ver mi CLABE y datos para transferir
          </a>
        )}

        {/* La CLABE a la mano en su WhatsApp: no se pierde al cambiar de app
            (la mayoría transfiere desde el celular). */}
        <a
          href={WA.claveSpei({
            clabe: spei.clabe,
            monto: spei.monto,
            referencia: spei.referencia,
            producto: producto.nombre,
            voucherUrl: spei.voucher_url,
          })}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block rounded-xl bg-[#25D366] px-4 py-3 text-center text-sm font-bold text-white"
        >
          Mandarme los datos por WhatsApp
        </a>

        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-cream px-4 py-3 text-sm text-ink/80">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#65a30d] opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#65a30d]" />
          </span>
          Esperando tu transferencia… se confirma sola
        </div>
        <p className="mt-3 text-center text-[11px] leading-relaxed text-muted">
          La transferencia SPEI tarda unos minutos. Puedes cerrar esta pantalla; te avisamos por WhatsApp al activarse y tu acceso queda listo.
        </p>
      </main>
    );
  }

  // Estado post-pago (§16): éxito + avance + abrir producto + cashback.
  if (pagado) {
    return (
      <main className="mx-auto max-w-xl px-5 py-6">
        <CheckoutHeader />
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

        {/* Siguiente paso según el producto (§16) */}
        <div className="mt-4 flex flex-col gap-2">
          {producto.tipo === 'herramienta' && (
            <Link href="/mi?tab=calculadora" className="rounded-xl bg-lime px-4 py-3 text-center text-sm font-bold text-ink">
              Abrir {producto.nombre}
            </Link>
          )}

          {producto.tipo === 'asesoria' && producto.incluyeSesion && (
            <>
              <p className="mb-1 text-center text-sm text-muted">
                Agenda tu videollamada 1:1 con un asesor:
              </p>
              {BOOKING_URL && (
                <a
                  href={BOOKING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl bg-lime px-4 py-3 text-center text-sm font-bold text-ink"
                >
                  Elegir horario en el calendario
                </a>
              )}
              <a
                href={WA.agendarSesion()}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-[#25D366] px-4 py-3 text-center text-sm font-bold text-white"
              >
                Agendar por WhatsApp
              </a>
            </>
          )}

          {producto.tipo === 'asesoria' && !producto.incluyeSesion && (
            <div className="rounded-xl bg-cream px-4 py-3 text-center text-sm text-ink/80">
              Estamos preparando tu <b>diagnóstico avanzado</b>. Te lo enviamos por WhatsApp en un máximo de 2 días hábiles.
            </div>
          )}

          <Link href="/mi" className="rounded-xl border border-line bg-white px-4 py-3 text-center text-sm font-bold text-ink">
            Volver a mi expediente
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-6">
      <CheckoutHeader />
      <h1 className="mb-3 text-2xl font-extrabold tracking-tight">
        {esPuntos ? 'Confirmar con puntos' : 'Pagar'}
      </h1>

      {/* El caso a la vista, cuando ya existe el cálculo */}
      {vm && (
        <div className="mb-4">
          <CasoResumen vm={vm} />
        </div>
      )}

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
          {/* Pago mixto: aplica tus puntos y paga solo el resto */}
          {mixtoDisponible && (
            <section className="mb-4 rounded-xl border border-lime bg-white p-4">
              <label className="flex items-center justify-between gap-3">
                <span className="text-sm">
                  <span className="font-bold text-ink">Usar mis {mixto.puntos} pts</span>{' '}
                  <span className="text-muted">y pagar solo ${mixto.resto}</span>
                </span>
                <input
                  type="checkbox"
                  checked={usarPuntos}
                  onChange={(e) => setUsarPuntos(e.target.checked)}
                  className="h-4 w-4 accent-lime"
                />
              </label>
              {usarPuntos && (
                <p className="mt-2 text-[11px] text-muted">
                  Tus puntos se descuentan hasta que el pago se confirma.
                  {!mixto.speiDisponible &&
                    ` Como el resto es menor a $${SPEI_MINIMO_MXN} (mínimo de SPEI), se paga con tarjeta.`}
                </p>
              )}
            </section>
          )}

          {/* Método de pago — SPEI-first */}
          <section className="mb-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted">Método de pago</div>
            <div className="grid grid-cols-2 gap-2">
              {(['spei', 'tarjeta'] as const).map((m) => {
                const deshabilitado = m === 'spei' && !speiPermitido;
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={deshabilitado}
                    onClick={() => setMetodo(m)}
                    className={`rounded-xl border px-4 py-3 text-sm font-bold ${
                      deshabilitado
                        ? 'cursor-not-allowed border-line bg-cream text-muted'
                        : metodoEfectivo === m
                          ? 'border-ink bg-ink text-white'
                          : 'border-line bg-white text-ink'
                    }`}
                  >
                    {m === 'spei' ? 'Transferencia SPEI' : 'Tarjeta'}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 rounded-xl bg-cream p-3 text-sm text-ink/80">
              {!speiPermitido
                ? `SPEI requiere un mínimo de $${SPEI_MINIMO_MXN}; tu resto con puntos se paga con tarjeta aquí mismo.`
                : metodoEfectivo === 'spei'
                  ? 'Te damos una CLABE para transferir desde tu banco. Confirmamos automáticamente al recibir el pago.'
                  : 'Paga con tarjeta de débito o crédito aquí mismo, de forma segura.'}
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
        {usarPuntos && !esPuntos && (
          <>
            <div className="flex justify-between text-ink/70">
              <span>{producto.nombre}</span>
              <span>${producto.precioMXN}</span>
            </div>
            <div className="mt-1 flex justify-between text-ink/70">
              <span>Tus puntos</span>
              <span className="font-bold">−{mixto.puntos} pts</span>
            </div>
          </>
        )}
        <div className={`flex justify-between ${usarPuntos && !esPuntos ? 'mt-1 border-t border-line pt-2' : ''}`}>
          <span className="text-muted">{esPuntos ? 'Puntos a usar' : 'Total a pagar'}</span>
          <span className="font-extrabold">{esPuntos ? `${producto.precioMXN} pts` : `$${montoAPagar} MXN`}</span>
        </div>
        {cashback > 0 && (
          <div className="mt-1 flex justify-between text-ink/70">
            <span>Cashback que ganas</span>
            <span className="font-bold">+{cashback} pts</span>
          </div>
        )}
      </section>

      {!esPuntos && metodoEfectivo === 'tarjeta' ? (
        // Tarjeta in-page: el Brick de MP trae su propio botón de pago.
        // key: re-monta el Brick si cambia el monto (toggle de puntos).
        <CardBrick
          key={montoAPagar}
          amount={montoAPagar}
          productCode={producto.code}
          usarPuntos={usarPuntos}
          onApproved={() => setPagado(true)}
          onError={(e) => setError(e)}
        />
      ) : (
        <button
          type="button"
          onClick={confirmar}
          disabled={cargando}
          className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
        >
          {cargando ? 'Procesando…' : esPuntos ? `Usar ${producto.precioMXN} pts` : `Pagar $${montoAPagar}`}
        </button>
      )}
      {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}

      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">
        Pago seguro dentro de El Trol. No pedimos anticipos en efectivo ni montos garantizados.
      </p>
    </main>
  );
}
