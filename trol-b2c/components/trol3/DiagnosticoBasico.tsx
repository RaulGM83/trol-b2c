'use client';
// Diagnóstico básico por chat (claude/91): vista previa de la imagen y los tres botones
// que el asesor necesita para mandarlo por WhatsApp. Nada se arma hasta que lo abre.
import { useState } from 'react';
import { diagnosticoBasicoMensaje, registrarDiagnosticoBasico } from '@/app/trabajo/actions';

export function DiagnosticoBasico({ personaId, nombre }: { personaId: string; nombre: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [v, setV] = useState(0); // para volver a pedir la imagen si cambió algo
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [conLink, setConLink] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const src = `/trabajo/p/${personaId}/diagnostico-basico?v=${v}`;
  const archivo = `diagnostico-${(nombre ?? 'cliente').toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.png`;

  const avisar = (t: string) => { setAviso(t); setTimeout(() => setAviso(null), 1800); };
  const abrir = async () => {
    setAbierto(true);
    const r = (await diagnosticoBasicoMensaje(personaId)) as { ok: boolean; mensaje?: string; conLink?: boolean; error?: string };
    if (r.ok) { setMensaje(r.mensaje ?? ''); setConLink(!!r.conLink); } else setAviso(r.error ?? 'No se pudo armar');
  };
  const copiarImagen = async () => {
    try {
      const blob = await (await fetch(src)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      avisar('Imagen copiada: pégala en el chat');
      void registrarDiagnosticoBasico(personaId, 'imagen');
    } catch {
      avisar('Tu navegador no deja copiar imágenes: usa Descargar');
    }
  };
  const descargar = () => {
    const a = document.createElement('a');
    a.href = src; a.download = archivo; a.click();
    void registrarDiagnosticoBasico(personaId, 'descarga');
  };
  const copiarMensaje = async () => {
    if (!mensaje) return;
    try {
      await navigator.clipboard.writeText(mensaje);
      avisar('Mensaje copiado');
      void registrarDiagnosticoBasico(personaId, 'mensaje');
    } catch { /* noop */ }
  };

  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-muted">Diagnóstico básico</div>
        {abierto ? <button type="button" onClick={() => setV((x) => x + 1)} className="text-[11px] underline">Actualizar</button> : null}
      </div>
      {!abierto ? (
        <>
          <p className="mt-2 text-sm">Una imagen con su situación y lo que encontramos, para mandar por WhatsApp con la liga a su cuenta. Sin montos en las oportunidades.</p>
          <button type="button" onClick={abrir} className="mt-3 rounded-lg bg-lime px-3 py-2 text-xs font-bold text-ink">Preparar diagnóstico básico</button>
        </>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="Diagnóstico básico" className="mt-3 w-full rounded-xl border border-line" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={copiarImagen} className="rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white">Copiar imagen</button>
            <button type="button" onClick={descargar} className="rounded-lg border border-line bg-white px-3 py-2 text-xs font-bold">Descargar</button>
            <button type="button" onClick={copiarMensaje} disabled={!mensaje} className="rounded-lg border border-ink bg-white px-3 py-2 text-xs font-bold disabled:opacity-40">Copiar mensaje</button>
          </div>
          {mensaje ? <p className="mt-2 whitespace-pre-wrap rounded-lg bg-cream p-2 text-xs">{mensaje}</p> : null}
          {!conLink ? <p className="mt-1 text-[11px] text-amber-700">No hay liga a su cuenta: el mensaje va sin link.</p> : null}
          {aviso ? <p className="mt-2 text-[11px] font-semibold">{aviso}</p> : null}
        </>
      )}
    </section>
  );
}
