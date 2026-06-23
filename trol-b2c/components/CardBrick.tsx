'use client';

import { useEffect, useRef } from 'react';

// SDK de Mercado Pago cargado por CDN (sin dependencia npm).
declare global {
  interface Window {
    MercadoPago?: new (
      key: string,
      opts?: { locale?: string },
    ) => { bricks: () => { create: (type: string, el: string, settings: unknown) => void } };
  }
}

// Card Payment Brick in-page (iframe seguro de MP, PCI lo maneja MP).
export function CardBrick({
  amount,
  productCode,
  onApproved,
  onError,
}: {
  amount: number;
  productCode: string;
  onApproved: () => void;
  onError: (msg: string) => void;
}) {
  const inited = useRef(false);

  useEffect(() => {
    if (inited.current) return;
    inited.current = true;
    const pk = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY;
    if (!pk) {
      onError('El pago con tarjeta aún no está configurado.');
      return;
    }

    const build = () => {
      try {
        const mp = new window.MercadoPago!(pk, { locale: 'es-MX' });
        mp.bricks().create('cardPayment', 'cardPaymentBrick', {
          initialization: { amount },
          callbacks: {
            onReady: () => {},
            onError: () => onError('No se pudo cargar el formulario de tarjeta.'),
            onSubmit: (formData: unknown) =>
              new Promise<void>((resolve) => {
                fetch('/api/pago/tarjeta', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...(formData as object), product_code: productCode }),
                })
                  .then((r) => r.json())
                  .then((res) => {
                    if (res?.ok && res.estado === 'approved') onApproved();
                    else onError(res?.error || 'El pago no se aprobó. Intenta con otra tarjeta.');
                    resolve();
                  })
                  .catch(() => {
                    onError('No se pudo procesar el pago. Intenta de nuevo.');
                    resolve();
                  });
              }),
          },
        });
      } catch {
        onError('No se pudo inicializar el pago con tarjeta.');
      }
    };

    if (window.MercadoPago) {
      build();
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://sdk.mercadopago.com/js/v2';
    s.async = true;
    s.onload = build;
    s.onerror = () => onError('No se pudo cargar Mercado Pago.');
    document.body.appendChild(s);
  }, [amount, productCode, onApproved, onError]);

  return <div id="cardPaymentBrick" className="mt-2" />;
}
