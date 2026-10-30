'use client';
// 281 · Broker Infonavit (claude/114): precalificar con CURP o NSS y compartir la propuesta base.
// Sólo Infonavit: lo de pensión lo trabaja Trol por dentro y no se muestra aquí.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { precalificarInfonavitPorAliado, subirDocumentoInfonavitPorAliado } from '@/app/aliado/actions';
import { DOCS_INFONAVIT, ETAPAS_INFONAVIT } from '@/lib/aliado/infonavit';

export interface FilaInfonavitAliado {
  persona_id: string; nombre: string | null; resultado: string; saldo: number | null; monto_credito: number | null;
  pide_infonavit_en: string; precalificado_en: string | null;
  etapa?: string | null; etapa_en?: string | null; docs?: string[] | null;
  cotizacion?: { texto: string; opciones: { plazo: number; nombre: string; ubicacion: string | null; pone_al_mes: number; recibe_al_vender: number; ficha_url: string | null }[] } | null;
  sin_cotizacion?: string | null;
}

const mxn0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const money = (n: number | null | undefined) => (n == null ? '—' : mxn0.format(n));
const RES: Record<string, [string, string]> = {
  procesando: ['Consultando…', 'bg-cream text-ink'],
  buscando_nss: ['Buscando su NSS en el IMSS…', 'bg-cream text-ink'],
  falta_nss: ['Falta el NSS', 'bg-amber-100 text-amber-900'],
  con_monto: ['Precalifica', 'bg-emerald-100 text-emerald-900'],
  credito_vigente: ['Ya tiene un crédito Infonavit vigente', 'bg-red-100 text-red-900'],
  sin_relacion: ['Sin relación laboral vigente', 'bg-red-100 text-red-900'],
  no_califica: ['No precalifica por ahora', 'bg-red-100 text-red-900'],
  ya_cliente: ['Ya era cliente de Trol: lo revisamos', 'bg-amber-100 text-amber-900'],
};
const VACIO = { nombre: '', telefono: '', curp: '', nss: '', autoriza: false };
const inp = 'w-full rounded-lg border border-line px-3 py-2 text-sm';
const btn = 'rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-cream';

/** 282 · Dónde va la operación (lo mueve el equipo de Trol). */
function Etapas({ etapa }: { etapa: string | null | undefined }) {
  const i = ETAPAS_INFONAVIT.findIndex((e) => e.clave === etapa);
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
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer font-semibold">Documentos · {DOCS_INFONAVIT.filter((d) => docs.includes(d.tipo)).length} de {DOCS_INFONAVIT.length}{subiendo ? ' · subiendo…' : ''}</summary>
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

export function InfonavitAliado({ filas, comision }: { filas: FilaInfonavitAliado[]; comision: number }) {
  const router = useRouter();
  const [f, setF] = useState(VACIO);
  const [pending, start] = useTransition();
  const curpOk = !f.curp.trim() || f.curp.trim().length === 18;
  const nssOk = !f.nss.trim() || f.nss.replace(/\D/g, '').length === 11;
  const listo = f.telefono.replace(/\D/g, '').length === 10 && f.nombre.trim().length >= 3 && (f.curp.trim() || f.nss.trim()) && curpOk && nssOk && f.autoriza;
  const enviar = () => start(async () => {
    const r = await precalificarInfonavitPorAliado({ ...f, curp: f.curp || null, nss: f.nss || null }) as { ok: boolean; error?: string; aviso?: string | null; por_revisar?: boolean };
    if (!r.ok) { toast.error(r.error ?? 'No se pudo'); return; }
    setF(VACIO);
    toast.success(r.por_revisar ? 'Registrado. Esa persona ya estaba con nosotros; lo revisamos y te confirmamos.' : (r.aviso ?? 'Listo, estamos consultando su Infonavit.'));
    router.refresh();
  });
  const copiar = async (t: string) => { try { await navigator.clipboard.writeText(t); toast.success('Mensaje copiado'); } catch { toast.error('No pude copiar'); } };

  return (
    <section className="rounded-2xl border-2 border-ink bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">Precalifica Infonavit</h2>
          <p className="text-xs text-muted">Con la CURP o el NSS te decimos cuánto tiene y qué inmueble le conviene. Ganas <b>{money(comision)}</b> por inmueble (IVA incluido) cuando firma escrituras.</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <input className={inp} placeholder="Nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
        <input className={inp} placeholder="Teléfono (10 dígitos)" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
        <input className={inp} placeholder="NSS (11 dígitos) — lo más rápido" value={f.nss} onChange={(e) => setF({ ...f, nss: e.target.value })} />
        <input className={inp} placeholder="CURP (si no tienes el NSS)" value={f.curp} onChange={(e) => setF({ ...f, curp: e.target.value.toUpperCase() })} />
      </div>
      <label className="mt-2 flex items-start gap-2 text-xs">
        <input type="checkbox" checked={f.autoriza} onChange={(e) => setF({ ...f, autoriza: e.target.checked })} className="mt-0.5" />
        <span>La persona me autorizó a compartir sus datos con El Trol Financiero para consultar su precalificación Infonavit y que la contacten con una propuesta.</span>
      </label>
      <button disabled={!listo || pending} onClick={enviar} className="mt-3 rounded-xl bg-ink px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{pending ? 'Enviando…' : 'Precalificar'}</button>

      {filas.length ? (
        <ul className="mt-4 space-y-2">
          {filas.map((r) => {
            const [label, cls] = RES[r.resultado] ?? [r.resultado, 'bg-cream text-ink'];
            return (
              <li key={r.persona_id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="flex-1 text-sm">{r.nombre ?? 'Sin nombre'}</b>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>
                </div>
                {r.resultado === 'con_monto' ? (
                  <>
                    <Etapas etapa={r.etapa} />
                    <div className="mt-1 text-xs text-muted">Saldo de vivienda <b className="text-ink">{money(r.saldo)}</b> · crédito hasta <b className="text-ink">{money(r.monto_credito)}</b></div>
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
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
