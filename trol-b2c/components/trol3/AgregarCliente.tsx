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
import { altaClientePorAliado, altaV2PorAliado } from '@/app/aliado/actions';

type R = { ok: boolean; error?: string; nueva?: boolean; por_revisar?: boolean; precliente?: boolean; aviso?: string | null; creditos_disponibles?: number | null };
const VACIO = { nombre: '', telefono: '', curp: '', nss: '', infonavit: false, autoriza: false };
const inp = 'rounded-lg border border-line px-3 py-2 text-sm';

export function AgregarCliente({ aliado, programaInfonavit, abiertoInicial = false, creditosDisponibles = null }: { aliado: string; programaInfonavit: boolean; abiertoInicial?: boolean; creditosDisponibles?: number | null }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [f, setF] = useState({ ...VACIO, infonavit: programaInfonavit });
  const [pending, start] = useTransition();

  const curp = f.curp.trim().toUpperCase();
  const nss = f.nss.replace(/\D/g, '');
  const curpSucia = curp.length > 0 && curp.length !== 18;
  const nssSucio = nss.length > 0 && nss.length !== 11;
  // 301 · Con el programa Infonavit (modelo Resag) el alta es v2: nombre + CURP y/o NSS; teléfono opcional
  // (sin él entra como precliente); las dos consultas salen solas y cuestan 1 crédito por persona.
  const v2 = programaInfonavit;
  const tel10 = f.telefono.replace(/\D/g, '');
  const telSucio = tel10.length > 0 && tel10.length !== 10;
  const quiereInfonavit = programaInfonavit && f.infonavit;
  // Sin programa: CURP obligatoria (Raúl, 3-nov) y teléfono obligatorio.
  const listo = v2
    ? f.nombre.trim().length >= 3 && f.autoriza && (curp.length === 18 || nss.length === 11) && !curpSucia && !nssSucio && !telSucio && (creditosDisponibles == null || creditosDisponibles >= 1)
    : tel10.length === 10 && f.nombre.trim().length >= 3 && f.autoriza && curp.length === 18 && !nssSucio;

  const enviar = () => start(async () => {
    const r = (v2
      ? await altaV2PorAliado({ nombre: f.nombre, curp: curp || null, nss: nss || null, telefono: tel10 || null, autoriza: f.autoriza })
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
          {v2 ? (
            <p className="text-xs text-muted">Con su CURP o su NSS consultamos IMSS e Infonavit al mismo tiempo. Cuesta <b>1 crédito por persona</b>, que se descuenta cuando llega el primer resultado{creditosDisponibles != null ? <> (tienes <b>{creditosDisponibles}</b> disponibles)</> : null}. El teléfono es opcional: sin él, Trol no lo contacta hasta que lo agregues.</p>
          ) : (
            <p className="text-xs text-muted">Nosotros lo contactamos. Con su CURP revisamos su pensión; si marcas Infonavit, también lo precalificamos (su NSS lo hace inmediato).</p>
          )}
        </div>
        <button onClick={() => setAbierto(false)} className="text-xs text-muted underline">cancelar</button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <input className={inp} placeholder="Nombre completo" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        <input className={`${inp} ${telSucio ? 'border-red-400' : ''}`} placeholder={v2 ? 'Teléfono (opcional, 10 dígitos)' : 'Teléfono (10 dígitos)'} inputMode="numeric" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
        <input className={`${inp} font-mono uppercase ${curpSucia ? 'border-red-400' : ''}`} maxLength={18} placeholder={v2 ? 'CURP (18 caracteres)' : 'CURP (18 caracteres)'} value={f.curp} onChange={(e) => setF({ ...f, curp: e.target.value.toUpperCase() })} />
        {v2 ? (
          <div>
            <input className={`${inp} w-full font-mono ${nssSucio ? 'border-red-400' : ''}`} inputMode="numeric" placeholder="NSS (11 dígitos)" value={f.nss} onChange={(e) => setF({ ...f, nss: e.target.value })} />
            <p className="mt-1 text-[11px] text-muted">Con uno basta: la CURP trae la pensión y, por el IMSS, el NSS para Infonavit; el NSS hace Infonavit inmediato y, con el historial, la CURP. Con los dos, todo a la vez.</p>
          </div>
        ) : quiereInfonavit ? (
          <div>
            <input className={`${inp} w-full font-mono ${nssSucio ? 'border-red-400' : ''}`} inputMode="numeric" placeholder="NSS (11 dígitos) — si lo tienes, ponlo" value={f.nss} onChange={(e) => setF({ ...f, nss: e.target.value })} />
            <p className="mt-1 text-[11px] text-muted">Con el NSS, Infonavit sale al instante y no depende de la consulta del IMSS. Si no lo tienes, lo puedes agregar después desde su tarjeta.</p>
          </div>
        ) : null}

        {programaInfonavit && !v2 ? (
          <label className="flex items-start gap-2 text-xs sm:col-span-2">
            <input type="checkbox" checked={f.infonavit} onChange={(e) => setF({ ...f, infonavit: e.target.checked, nss: e.target.checked ? f.nss : '' })} className="mt-0.5" />
            <span>También <b>precalificar su Infonavit</b> (cuánto tiene y qué inmueble le conviene).</span>
          </label>
        ) : null}

        <label className="flex items-start gap-2 rounded-xl bg-cream px-3 py-2 text-xs sm:col-span-2">
          <input type="checkbox" checked={f.autoriza} onChange={(e) => setF({ ...f, autoriza: e.target.checked })} className="mt-0.5" />
          <span>
            Confirmo que <b>{f.nombre.trim() || 'esta persona'}</b> me autorizó a compartir sus datos con El Trol Financiero para que lo contacten y revisen su situación de pensión
            , incluida la consulta de su historial ante el IMSS{quiereInfonavit || v2 ? ', y su precalificación de crédito Infonavit' : ''}.
          </span>
        </label>

        <button disabled={pending || !listo} onClick={enviar} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">
          {pending ? 'Registrando…' : v2 ? 'Registrar y consultar · 1 crédito' : quiereInfonavit ? 'Registrar y precalificar' : 'Registrarlo'}
        </button>
        <p className="text-[11px] text-muted sm:col-span-2">Queda registrado que {aliado} lo autorizó y en qué fecha.{v2 && creditosDisponibles != null && creditosDisponibles < 1 ? <b className="text-amber-900"> No te quedan créditos disponibles; escríbenos para recargar.</b> : null}</p>
      </div>
    </div>
  );
}
