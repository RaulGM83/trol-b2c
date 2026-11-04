'use client';
// 281/282 · Broker Infonavit (claude/114): lo que el aliado ve de la precalificación de un cliente —
// resultado, saldo y crédito, las dos opciones con fichas, las 7 etapas y los documentos que puede subir.
// 291 (claude/116): ya no es una sección con su propio formulario; es la pestaña Infonavit de la tarjeta
// del cliente en `ClientesAliado`. El formulario vive en `AgregarCliente`.
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { subirDocumentoInfonavitPorAliado } from '@/app/aliado/actions';
import { AgregarNss } from '@/components/trol3/AgregarNss';
import { DOCS_INFONAVIT, ETAPAS_INFONAVIT } from '@/lib/aliado/infonavit';

export interface FilaInfonavitAliado {
  persona_id: string; nombre: string | null; resultado: string; saldo: number | null; monto_credito: number | null;
  pide_infonavit_en: string; precalificado_en: string | null;
  etapa?: string | null; etapa_en?: string | null; docs?: string[] | null;
  /** 293 · Seguimiento real del trámite (oportunidades.tramite_infonavit). */
  fechas?: Record<string, string> | null; inmueble?: string | null; inmueble_ubicacion?: string | null; casa?: string | null;
  conyugal?: boolean | null; co_titular?: string | null; comision_estado?: 'devengada' | 'pagada' | string | null;
  cotizacion?: {
    texto: string;
    /** 297 · Sin historial del IMSS: salario y monto de Infonavit, edad de la CURP, Ley 97 asumida. */
    preliminar?: boolean;
    edad_por_nss?: boolean;
    /** 296 · Mensaje de un solo inmueble, por plazo. */
    textos_por_plazo?: Record<number, string>;
    opciones: {
      plazo: number; nombre: string; ubicacion: string | null; pone_al_mes: number; recibe_al_vender: number; ficha_url: string | null;
      /** 296 · De dónde sale lo que recibe. */
      desglose?: { entra_saldo: number; plusvalia: number; aportaciones: number; capital_pagado: number; comision_venta: number } | null;
    }[];
  } | null;
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
  saldo_bajo: ['No precalifica: saldo bajo', 'bg-red-100 text-red-900'],
  en_tramite: ['En trámite', 'bg-ink text-white'],
  ya_cliente: ['Ya era cliente de Trol: lo revisamos', 'bg-amber-100 text-amber-900'],
};

export const etapaIndice = (etapa: string | null | undefined) => ETAPAS_INFONAVIT.findIndex((e) => e.clave === etapa);
export const etapaNombre = (etapa: string | null | undefined) => ETAPAS_INFONAVIT.find((e) => e.clave === etapa)?.nombre ?? null;
/** Acta de matrimonio sólo cuenta como faltante en crédito conyugal (si es casado y va solo, se pide por WhatsApp). */
export const docsFaltantes = (docs: string[] | null | undefined, conyugal = false) =>
  DOCS_INFONAVIT.filter((d) => !(docs ?? []).includes(d.tipo) && (conyugal || d.tipo !== 'acta_matrimonio')).length;
const fechaCorta = (d: string | null | undefined) => (d ? new Date(d + (d.length === 10 ? 'T12:00:00' : '')).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : null);

const btn = 'rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-cream';

/** 282 · Dónde va la operación (lo mueve el equipo de Trol). */
function Etapas({ etapa, fechas }: { etapa: string | null | undefined; fechas?: Record<string, string> | null }) {
  const i = etapaIndice(etapa);
  return (
    <>
      <ol className="mt-2 flex flex-wrap gap-1 text-[10px]">
        {ETAPAS_INFONAVIT.map((e, k) => {
          const f = fechaCorta(fechas?.[e.clave]);
          return (
            <li key={e.clave} className={`rounded-full px-2 py-0.5 font-semibold ${k < i ? 'bg-emerald-100 text-emerald-900' : k === i ? 'bg-ink text-white' : 'bg-cream text-muted'}`}>
              {k + 1}. {e.nombre}{f ? <span className="font-normal opacity-80"> · {f}</span> : null}
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** 282 · El broker sube lo que falte; nunca ve los archivos, sólo si ya está. */
function Documentos({ personaId, docs, conyugal }: { personaId: string; docs: string[]; conyugal: boolean }) {
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
  const faltan = docsFaltantes(docs, conyugal);
  const total = conyugal ? DOCS_INFONAVIT.length : DOCS_INFONAVIT.length - 1;
  return (
    <details className="mt-2 text-xs" open={faltan > 0}>
      <summary className="cursor-pointer font-semibold">Documentos · {total - faltan} de {total}{!conyugal ? ' (+ acta de matrimonio si es casado)' : ''}{subiendo ? ' · subiendo…' : ''}</summary>
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
  const enTramite = r.resultado === 'en_tramite';
  const [label, cls] = enTramite && r.etapa === 'entregado' ? ['Entregado', 'bg-emerald-100 text-emerald-900'] : (RES_INFONAVIT[r.resultado] ?? [r.resultado, 'bg-cream text-ink']);
  return (
    <div>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>
      {r.resultado === 'con_monto' || enTramite ? (
        <>
          <Etapas etapa={r.etapa} fechas={r.fechas} />
          <div className="mt-2 text-xs text-muted">{r.saldo != null ? <>Saldo de vivienda <b className="text-ink">{money(r.saldo)}</b> · </> : null}{r.monto_credito != null ? <>crédito hasta <b className="text-ink">{money(r.monto_credito)}</b> · </> : null}{r.comision_estado === 'pagada' ? <b className="text-emerald-800">comisión {money(comision)} pagada</b> : r.comision_estado === 'devengada' ? <b className="text-emerald-800">comisión {money(comision)} por pagarte</b> : <>ganas <b className="text-ink">{money(comision)}</b> al escriturar</>}</div>
          {r.inmueble || r.conyugal ? (
            <div className="mt-1 text-xs">
              {r.inmueble ? <span><b>Inmueble:</b> {r.inmueble}{r.casa ? ` · ${r.casa}` : ''}{r.inmueble_ubicacion ? <span className="text-muted"> · {r.inmueble_ubicacion}</span> : null}</span> : null}
              {r.conyugal ? <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-[11px] font-semibold">Crédito conyugal{r.co_titular ? ` con ${r.co_titular}` : ''}</span> : null}
            </div>
          ) : null}
          {!enTramite && r.cotizacion ? (
            <>
              {r.cotizacion.preliminar ? (
                <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">
                  <b>Propuesta preliminar.</b> Todavía no tenemos su historial del IMSS; usa su saldo y el monto que Infonavit le autoriza{r.cotizacion.edad_por_nss ? ' y su edad estimada por el NSS (pídele la CURP)' : ''}. Si le interesa, Trol la afina con el historial.
                </div>
              ) : null}
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {r.cotizacion.opciones.map((o) => (
                  <div key={o.plazo} className="rounded-lg bg-cream p-2 text-xs">
                    <div className="font-bold">{o.nombre}</div>
                    {o.ubicacion ? <div className="text-muted">{o.ubicacion}</div> : null}
                    <div className="mt-1">Si vende en {o.plazo} meses: pone {o.pone_al_mes > 0 ? money(o.pone_al_mes) : '$0'} al mes y recibe <b>{money(o.recibe_al_vender)}</b></div>
                    {o.desglose ? (
                      <details className="mt-1 text-[11px] text-muted">
                        <summary className="cursor-pointer">De dónde sale lo que recibe</summary>
                        <ul className="mt-1 space-y-0.5">
                          <li>Su saldo de vivienda que entra (neto de gastos): <b className="text-ink">{money(o.desglose.entra_saldo)}</b></li>
                          <li>+ Plusvalía estimada: <b className="text-ink">{money(o.desglose.plusvalia)}</b></li>
                          <li>+ Aportaciones de su patrón que abonan al crédito: <b className="text-ink">{money(o.desglose.aportaciones)}</b></li>
                          <li>+ Capital que paga con la mensualidad: <b className="text-ink">{money(o.desglose.capital_pagado)}</b></li>
                          <li>− Comisión de venta: <b className="text-ink">{money(o.desglose.comision_venta)}</b></li>
                          <li>= Recibe al vender: <b className="text-ink">{money(o.recibe_al_vender)}</b></li>
                        </ul>
                      </details>
                    ) : null}
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {o.ficha_url ? <a href={o.ficha_url} target="_blank" rel="noreferrer" className="underline">Ficha</a> : null}
                      <a className={btn} href={`/aliado/infonavit/${r.persona_id}?plazo=${o.plazo}`} target="_blank" rel="noreferrer">Imagen sólo este</a>
                      {r.cotizacion?.textos_por_plazo?.[o.plazo] ? <button className={btn} onClick={() => copiar(r.cotizacion!.textos_por_plazo![o.plazo])}>Mensaje sólo este</button> : null}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className={btn} onClick={() => copiar(r.cotizacion!.texto)}>Mensaje con las dos opciones</button>
                <a className={btn} href={`/aliado/infonavit/${r.persona_id}`} target="_blank" rel="noreferrer">Imagen con las dos opciones</a>
              </div>
            </>
          ) : !enTramite ? <div className="mt-1 text-xs text-muted">{r.sin_cotizacion ?? 'Armando la propuesta…'}</div> : null}
          {etapaIndice(r.etapa) <= 1 ? <Documentos personaId={r.persona_id} docs={r.docs ?? []} conyugal={!!r.conyugal} /> : null}
          <div className="mt-2"><a href="/aliado/inventario" className="text-xs underline text-muted">Ver todo el inventario y para qué saldo aplica cada inmueble</a></div>
        </>
      ) : r.resultado === 'saldo_bajo' ? (
        <p className="mt-1 text-xs text-muted">Saldo de vivienda <b className="text-ink">{money(r.saldo)}</b>: todavía es bajo para esta opción. Vale la pena volver a revisarlo más adelante; mientras, su pensión sí la trabajamos.</p>
      ) : r.resultado === 'falta_nss' || r.resultado === 'buscando_nss' ? (
        <AgregarNss persona={r.persona_id} motivo={r.resultado} />
      ) : null}
    </div>
  );
}
