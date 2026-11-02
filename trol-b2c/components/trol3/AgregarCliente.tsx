'use client';
// 291 · Un solo formulario para agregar un cliente (claude/116): pensión, Infonavit o ambos.
// Sustituye a `AltaPorAliado` (128) y al formulario de `InfonavitAliado` (281). Las reglas no cambian:
// la palomita de autorización NO viene marcada y el botón no se enciende sin ella — es el único
// respaldo que existe el día que alguien pregunte por qué tenemos sus datos.
//
// Con Infonavit marcado se usa `precalificarInfonavitPorAliado`, que por dentro también da de alta
// y pide el historial del IMSS si trae CURP: el cliente queda en las dos pestañas con una sola captura.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { altaClientePorAliado, precalificarInfonavitPorAliado } from '@/app/aliado/actions';

type R = { ok: boolean; error?: string; nueva?: boolean; por_revisar?: boolean; aviso?: string | null };
const VACIO = { nombre: '', telefono: '', curp: '', nss: '', infonavit: false, autoriza: false };
const inp = 'rounded-lg border border-line px-3 py-2 text-sm';

export function AgregarCliente({ aliado, programaInfonavit, abiertoInicial = false }: { aliado: string; programaInfonavit: boolean; abiertoInicial?: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [f, setF] = useState({ ...VACIO, infonavit: programaInfonavit });
  const [pending, start] = useTransition();

  const curp = f.curp.trim().toUpperCase();
  const nss = f.nss.replace(/\D/g, '');
  const curpSucia = curp.length > 0 && curp.length !== 18;
  const nssSucio = nss.length > 0 && nss.length !== 11;
  const quiereInfonavit = programaInfonavit && f.infonavit;
  // Para Infonavit hace falta CURP o NSS; para pensión sola, la CURP es opcional.
  const listo = f.telefono.replace(/\D/g, '').length === 10 && f.nombre.trim().length >= 3 && f.autoriza && !curpSucia && !nssSucio && (!quiereInfonavit || curp || nss);

  const enviar = () => start(async () => {
    const r = (quiereInfonavit
      ? await precalificarInfonavitPorAliado({ telefono: f.telefono, nombre: f.nombre, curp: curp || null, nss: nss || null, autoriza: f.autoriza })
      : await altaClientePorAliado({ telefono: f.telefono, nombre: f.nombre, curp: curp || null, autoriza: f.autoriza })) as R;
    if (!r.ok) { toast.error(r.error ?? 'No se pudo'); return; }
    setF({ ...VACIO, infonavit: programaInfonavit });
    setAbierto(false);
    toast.success(r.por_revisar ? 'Registrado. Esa persona ya estaba con nosotros; lo revisamos y te confirmamos.' : (r.aviso ?? 'Listo, ya lo tenemos. Nosotros lo contactamos.'));
    router.refresh();
  });

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white hover:opacity-90">+ Agregar cliente</button>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-ink bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">Agregar cliente</h2>
          <p className="text-xs text-muted">Nosotros lo contactamos. Con su CURP revisamos su pensión; con su NSS (o CURP) también su Infonavit.</p>
        </div>
        <button onClick={() => setAbierto(false)} className="text-xs text-muted underline">cancelar</button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <input className={inp} placeholder="Nombre completo" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        <input className={inp} placeholder="Teléfono (10 dígitos)" inputMode="numeric" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
        <input className={`${inp} font-mono uppercase ${curpSucia ? 'border-red-400' : ''}`} maxLength={18} placeholder={quiereInfonavit ? 'CURP (si no tienes el NSS)' : 'CURP (opcional, pero con ella revisamos sus semanas)'} value={f.curp} onChange={(e) => setF({ ...f, curp: e.target.value.toUpperCase() })} />
        {programaInfonavit ? (
          <input className={`${inp} font-mono ${nssSucio ? 'border-red-400' : ''}`} inputMode="numeric" placeholder="NSS (11 dígitos) — lo más rápido para Infonavit" value={f.nss} onChange={(e) => setF({ ...f, nss: e.target.value })} />
        ) : null}

        {programaInfonavit ? (
          <label className="flex items-start gap-2 text-xs sm:col-span-2">
            <input type="checkbox" checked={f.infonavit} onChange={(e) => setF({ ...f, infonavit: e.target.checked })} className="mt-0.5" />
            <span>También <b>precalificar su Infonavit</b> (cuánto tiene y qué inmueble le conviene). Necesita NSS o CURP.</span>
          </label>
        ) : null}

        <label className="flex items-start gap-2 rounded-xl bg-cream px-3 py-2 text-xs sm:col-span-2">
          <input type="checkbox" checked={f.autoriza} onChange={(e) => setF({ ...f, autoriza: e.target.checked })} className="mt-0.5" />
          <span>
            Confirmo que <b>{f.nombre.trim() || 'esta persona'}</b> me autorizó a compartir sus datos con El Trol Financiero para que lo contacten y revisen su situación de pensión
            {curp ? ', incluida la consulta de su historial ante el IMSS' : ''}{quiereInfonavit ? ', y su precalificación de crédito Infonavit' : ''}.
          </span>
        </label>

        <button disabled={pending || !listo} onClick={enviar} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">
          {pending ? 'Registrando…' : quiereInfonavit ? 'Registrar y precalificar' : 'Registrarlo'}
        </button>
        <p className="text-[11px] text-muted sm:col-span-2">Queda registrado que {aliado} lo autorizó y en qué fecha.</p>
      </div>
    </div>
  );
}
