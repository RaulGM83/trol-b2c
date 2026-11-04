'use client';
// 297c · Copiar un mensaje sin depender del portapapeles (Raúl, 4-nov: "aún sale no se puede copiar").
// `navigator.clipboard` falla en Safari viejo, en webviews, en iframes y si el click no cuenta como gesto.
// Orden: clipboard → execCommand('copy') con un textarea → si nada jala, se muestra el texto seleccionado
// para copiarlo a mano. Además "Abrir en WhatsApp" (wa.me con el texto) no necesita portapapeles.
import { useState } from 'react';
import { toast } from 'sonner';

export async function copiarTexto(t: string): Promise<boolean> {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(t); return true; } } catch { /* sigue */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, t.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

export const linkWhatsApp = (t: string) => `https://wa.me/?text=${encodeURIComponent(t)}`;

/** Botón "copiar" + "WhatsApp"; si no se pudo copiar, despliega el texto seleccionado. */
export function CopiarMensaje({ texto, etiqueta, className }: { texto: string; etiqueta: string; className: string }) {
  const [mostrar, setMostrar] = useState(false);
  const onCopiar = async () => {
    if (await copiarTexto(texto)) { toast.success('Mensaje copiado'); setMostrar(false); return; }
    setMostrar(true);
    toast.error('Tu navegador no deja copiar; selecciona el texto o ábrelo en WhatsApp');
  };
  return (
    <>
      <button type="button" className={className} onClick={onCopiar}>{etiqueta}</button>
      <a className={className} href={linkWhatsApp(texto)} target="_blank" rel="noreferrer">WhatsApp</a>
      {mostrar ? (
        <textarea readOnly value={texto} rows={6} onFocus={(e) => e.currentTarget.select()} autoFocus
          className="mt-1 w-full rounded-lg border border-line bg-white p-2 text-[11px]" />
      ) : null}
    </>
  );
}
