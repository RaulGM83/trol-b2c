'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { activarCliente, registrarContacto, tomarCabecera } from '@/app/trabajo/actions';

const dark = 'rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50';
const line = 'rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-bold disabled:opacity-50';

export type FilaCartera = {
  persona_id: string; motivo?: string | null; chat_abierto: boolean; telefono: string | null; no_contactar: boolean;
  oportunidad: string | null; oportunidad_id: string | null; oportunidad_estado: string | null; cabecera_id: string | null;
};

/**
 * 164 · La acción de un clic de cada renglón de la cartera. Qué botón sale lo decide el
 * motivo por el que el cliente está en la bandeja; todo lo que hace queda anotado solo,
 * que es justo lo que el equipo venía escribiendo a mano.
 */
export function CarteraAcciones({ fila, takoUrl, porActivar = false }: { fila: FilaCartera; takoUrl: string | null; porActivar?: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; texto?: string }>, exito: string) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? { ok: true, texto: r.texto ?? exito } : { ok: false, texto: r.error ?? 'No se pudo.' });
    if (r.ok) router.refresh();
  });
  const m = fila.motivo ?? '';
  const puedeActivar = !!fila.oportunidad_id && !fila.no_contactar && ['detectada', 'presentada', 'interesada'].includes(fila.oportunidad_estado ?? '');
  const activar = () => {
    if (!fila.oportunidad_id) return;
    const aviso = fila.chat_abierto
      ? `Le llegará dentro de su chat: “Encontramos algo en tu caso: ${fila.oportunidad}”.`
      : `Su chat está cerrado: saldrá la plantilla de “${fila.oportunidad}”. Sólo se puede una al día.`;
    if (!window.confirm(`${aviso}\n\n¿La mandamos?`)) return;
    run(() => activarCliente(fila.oportunidad_id as string, fila.persona_id), 'Enviado.');
  };
  const chat = takoUrl ? <a href={takoUrl} target="_blank" rel="noreferrer" className={m === 'escribio' ? dark : line}>Abrir chat</a> : null;
  const llamadas = (
    <>
      <button disabled={pending} className={line} onClick={() => run(() => registrarContacto(fila.persona_id, 'contesto'), 'Anotado: contestó.')}>Contestó</button>
      <button disabled={pending} className={line} onClick={() => run(() => registrarContacto(fila.persona_id, 'no_contesto'), 'Anotado: no contestó.')}>No contestó</button>
    </>
  );
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1.5">
        {porActivar ? (
          <>
            {puedeActivar ? <button disabled={pending} className={dark} onClick={activar}>{fila.chat_abierto ? 'Avisarle' : 'Mandar plantilla'}</button> : null}
            <button disabled={pending} className={line} onClick={() => run(() => tomarCabecera(fila.persona_id), 'Ya es tuyo.')}>Tomar</button>
          </>
        ) : m === 'escribio' ? (
          <>{chat}<button disabled={pending} className={line} onClick={() => run(() => registrarContacto(fila.persona_id, 'atendido_chat'), 'Anotado: atendido.')}>Ya lo atendí</button></>
        ) : m === 'cita' ? (
          <Link href={`/trabajo/p/${fila.persona_id}?tab=diagnostico`} className={dark}>Preparar asesoría</Link>
        ) : m === 'tramite' ? (
          <Link href={`/trabajo/p/${fila.persona_id}?tab=oportunidades`} className={dark}>Ver trámite</Link>
        ) : m === 'contactar' ? (
          <>{llamadas}{chat}</>
        ) : m === 'propuesta' ? (
          <>{puedeActivar ? <button disabled={pending} className={dark} onClick={activar}>Recordarle</button> : null}{llamadas}</>
        ) : m === 'abrio_cuenta' ? (
          <>{fila.chat_abierto ? chat : puedeActivar ? <button disabled={pending} className={dark} onClick={activar}>Mandar plantilla</button> : null}{llamadas}</>
        ) : (
          <>{puedeActivar && !fila.chat_abierto ? <button disabled={pending} className={line} onClick={activar}>Recordarle</button> : chat}</>
        )}
      </div>
      {msg ? <span className={msg.ok ? 'text-[11px] text-green-700' : 'max-w-[260px] text-right text-[11px] text-red-600'}>{msg.texto}</span> : null}
    </div>
  );
}
