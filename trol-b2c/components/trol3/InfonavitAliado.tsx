'use client';
// 281/282 · Broker Infonavit (claude/114): lo que el aliado ve de la precalificación de un cliente —
// resultado, saldo y crédito, las dos opciones con fichas, las 7 etapas y los documentos que puede subir.
// 291 (claude/116): ya no es una sección con su propio formulario; es la pestaña Infonavit de la tarjeta
// del cliente en `ClientesAliado`. El formulario vive en `AgregarCliente`.
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { subirDocumentoInfonavitPorAliado } from '@/app/aliado/actions';
import { DOCS_INFONAVIT, ETAPAS_INFONAVIT } from '@/lib/aliado/infonavit';

export interface FilaInfonavitAliado {
  persona_id: string; nombre: string | null; resultado: string; saldo: number | null; monto_credito: number | null;
  pide_infonavit_en: string; precalificado_en: string | null;
  etapa?: string | null; etapa_en?: string | null; docs?: string[] | null;
  cotizacion?: { texto: string; opciones: { plazo: number; nombre: string; ubicacion: string | null; pone_al_mes: number; recibe_al_vender: number; ficha_url: string | null }[] } | null;
  sin_cotizacion?: string | null;
}

const mxn0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
export const money = (n: number | null | undefined) => (n == null ? '—' : mxn0.format(n));

/** Resultado de la precalificación dicho como se le diría al aliado. */
export const RES_INFONAVIT: Record<string, [string, string]> = {
  procesando: ['Consultando…', 'bg-cream text-ink'],
  buscando_nss: ['Buscando su NSS en el IMSS…', 'bg-cream text-ink'],
  falta_nss: ['Falta el NSS', 'bg-amber-100 text-amber-900'],
  con_monto: ['Precalifica', 'bg-emerald-100 text-emerald-900'],
  credito_vigente: ['Ya tiene un crédito Infonavit vigente', 'bg-red-100 text-red-900'],
  sin_relacion: ['Sin relación laboral vigente', 'bg-red-100 text-red-900'],
  no_califica: ['No precalifica por ahora', 'bg-red-100 text-red-900'],
  ya_cliente: ['Ya era cliente de Trol: lo revisamos', 'bg-amber-100 text-amber-900'],
};

export const etapaIndice = (etapa: string | null | undefined) => ETAPAS_INFONAVIT.findIndex((e) => e.clave === etapa);
export const etapaNombre = (etapa: string | null | undefined) => ETAPAS_INFONAVIT.find((e) => e.clave === etapa)?.nombre ?? null;
export const docsFaltantes = (docs: string[] | null | undefined) => DOCS_INFONAVIT.filter((d) => !(docs ?? []).includes(d.tipo)).length;

const btn = 'rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-cream';

/** 282 · Dónde va la operación (lo mueve el equipo de Trol). */
function Etapas({ etapa }: { etapa: string | null | undefined }) {
  const i = etapaIndice(etapa);
  return (
    <ol className="mt-2 flex flex-wrap gap-1 text-[10px]">
      {ETAPAS_INFONAVIT.map((e, k) => (
        <li key={e.clave} className={`rounded-full px-2 py-0.5 font-semibold ${k < i ? 'bg-emerald-100 text-emerald-900' : k === i ? 'bg-ink text-white' : 'bg-cream text-muted'}`}>{k + 1}. {e.nombre}</li>
      ))}
    </ol>
  );
}

/** 282 · El broker sube lo que falte; nunca ve los archivos, sólo si ya está. */
function Documentos({ personaId, docs }: { personaId: string; docs: string[] }) {
  const router = useRouter();
  const [subiendo, start] = useTransition();
  const subir = (tipo: string, file: File | undefined) => {
    if (!file) return;
    const fd = new FormData(); fd.set('persona_id', personaId); fd.set('tipo', tipo); fd.set('archivo', file);
    start(async () => {
      const r = await subirDocumentoInfonavitPorAliado(fd) as { ok: boolean; error?: string };
      if (r.ok) { toast.success('Documento recibido'); router.refresh(); } else toast.error(r.error ?? 'No se pudo subir');
    });
  };
  const faltan = docsFaltantes(docs);
  return (
    <details className="mt-2 text-xs" open={faltan > 0}>
      <summary className="cursor-pointer font-semibold">Documentos · {DOCS_INFONAVIT.length - faltan} de {DOCS_INFONAVIT.length}{subiendo ? ' · subiendo…' : ''}</summary>
      <ul className="mt-1 space-y-1">
        {DOCS_INFONAVIT.map((d) => (
          <li key={d.tipo} className="flex flex-wrap items-center gap-2">
            <span className={docs.includes(d.tipo) ? 'text-emerald-800' : ''}>{docs.includes(d.tipo) ? '✓' : '○'} {d.nombre}{d.nota ? <span className="text-muted"> ({d.nota})</span> : null}</span>
            {!docs.includes(d.tipo) ? (
              <label className="cursor-pointer underline">subir<input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => subir(d.tipo, e.target.files?.[0])} /></label>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-muted">Las referencias, el taller y las firmas los vemos directo con tu cliente.</p>
    </details>
  );
}

/** La pestaña Infonavit de un cliente. `r` es null cuando nunca se pidió precalificación. */
export function InfonavitDetalle({ r, comision }: { r: FilaInfonavitAliado | null; comision: number }) {
  const copiar = async (t: string) => { try { await navigator.clipboard.writeText(t); toast.success('Mensaje copiado'); } catch { toast.error('No pude copiar'); } };
  if (!r) {
    return <p className="text-xs text-muted">Todavía no has pedido su precalificación Infonavit. Agrégalo otra vez con la opción Infonavit marcada (con su NSS es inmediato) y te decimos cuánto tiene y qué inmueble le conviene. Ganas <b>{money(comision)}</b> por inmueble (IVA incluido) cuando firma escrituras.</p>;
  }
  const [label, cls] = RES_INFONAVIT[r.resultado] ?? [r.resultado, 'bg-cream text-ink'];
  return (
    <div>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>
      {r.resultado === 'con_monto' ? (
        <>
          <Etapas etapa={r.etapa} />
          <div className="mt-2 text-xs text-muted">Saldo de vivienda <b className="text-ink">{money(r.saldo)}</b> · crédito hasta <b className="text-ink">{money(r.monto_credito)}</b> · ganas <b className="text-ink">{money(comision)}</b> al escriturar</div>
          {r.cotizacion ? (
            <>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {r.cotizacion.opciones.map((o) => (
                  <div key={o.plazo} className="rounded-lg bg-cream p-2 text-xs">
                    <div className="font-bold">{o.nombre}</div>
                    {o.ubicacion ? <div className="text-muted">{o.ubicacion}</div> : null}
                    <div className="mt-1">Si vende en {o.plazo} meses: pone {o.pone_al_mes > 0 ? money(o.pone_al_mes) : '$0'} al mes y recibe <b>{money(o.recibe_al_vender)}</b></div>
                    {o.ficha_url ? <a href={o.ficha_url} target="_blank" rel="noreferrer" className="underline">Ficha del inmueble</a> : null}
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className={btn} onClick={() => copiar(r.cotizacion!.texto)}>Copiar mensaje para tu cliente</button>
                <a className={btn} href={`/aliado/infonavit/${r.persona_id}`} target="_blank" rel="noreferrer">Imagen para WhatsApp</a>
              </div>
            </>
          ) : <div className="mt-1 text-xs text-muted">{r.sin_cotizacion ?? 'Armando la propuesta…'}</div>}
          <Documentos personaId={r.persona_id} docs={r.docs ?? []} />
        </>
      ) : r.resultado === 'falta_nss' ? (
        <p className="mt-1 text-xs text-muted">Sin NSS ni CURP no podemos consultar. Mándanos su NSS.</p>
      ) : null}
    </div>
  );
}
