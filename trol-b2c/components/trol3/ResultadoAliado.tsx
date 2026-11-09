'use client';
// 291 · La pestaña Pensión de un cliente del aliado (claude/116): qué dice el IMSS, cuánto vale, qué
// oportunidades hay, y los botones para comprar la asesoría con sus créditos. Todo viene de
// v_resultado_aliado (filtra por current_aliado_id()). Aquí no se calcula nada.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { comprarAsesoriaPorAliado } from '@/app/aliado/actions';
import { AgregarNss } from '@/components/trol3/AgregarNss';
import { SubirSisec } from '@/components/trol3/SubirSisec';
import { CopiarMensaje } from '@/components/trol3/CopiarMensaje';

export interface OportunidadAliado { codigo: string; nombre: string | null; frase: string | null; estado: string }
export interface CompraAliado { producto: string; nombre: string; en: string | null }
export interface FilaResultadoAliado {
  referido_id: string; persona_id: string; nombre: string | null; apellidos: string | null; referido_en: string;
  estado: 'consultando' | 'listo' | 'fallida' | 'falta_curp' | 'ya_cliente' | string;
  edad: number | null; ley: string | null; semanas: number | null; status_empleo: string | null;
  conserva_derechos: boolean | null; fin_conservacion: string | null; afore_actual: string | null;
  pension_base: number | null; pension_maxima: number | null; saldo_rcv97: number | null;
  saldo_infonavit: number | null; infonavit_monto_credito: number | null; credito_infonavit_vigente: boolean | null; inconsistencia_imss: string | null;
  oportunidades: OportunidadAliado[] | null; compras: CompraAliado[] | null;
  diagnostico_estado: 'en_elaboracion' | 'listo' | null; diagnostico_doc_id: string | null; proxima_sesion: string | null;
  /** 301 · precliente (sin teléfono), si ya se cobró el crédito y si conviene que suba el SISEC. */
  precliente?: boolean | null; tiene_telefono?: boolean | null; tiene_curp?: boolean | null; consulta_en?: string | null; cobrado_en?: string | null; sugerir_sisec?: boolean | null;
}
export interface ProductoAliado { codigo: 'diagnostico_avanzado' | 'diagnostico_avanzado_sesion'; nombre: string; creditos: number; mxn: number }

const mxn0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const money = (n: number | null | undefined) => (n == null ? '—' : mxn0.format(n));
const fecha = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fechaHora = (d: string | null | undefined) => (d ? new Date(d).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—');
export const leyLabel = (l: string | null) => (l ? `Ley ${l.replace(/^Ley\s*/i, '')}` : null);

/** Estado de pensión dicho para el aliado (chip de la lista y encabezado de la pestaña). */
export function estadoPension(r: FilaResultadoAliado): [string, string] {
  if (r.estado === 'ya_cliente') return ['Ya era cliente de Trol', 'bg-amber-100 text-amber-900'];
  if (r.diagnostico_estado === 'listo') return ['Diagnóstico listo', 'bg-emerald-100 text-emerald-900'];
  if ((r.compras ?? []).length) return [r.diagnostico_estado === 'en_elaboracion' ? 'Diagnóstico en elaboración' : 'Cálculos pedidos', 'bg-ink text-white'];
  if (r.estado === 'listo') return ['Listo', 'bg-emerald-100 text-emerald-900'];
  if (r.estado === 'fallida') return ['No se pudo consultar', 'bg-amber-100 text-amber-900'];
  if (r.estado === 'falta_curp') return [r.tiene_curp === false && r.sugerir_sisec ? 'Sin CURP: sube su SISEC' : 'Falta la CURP', 'bg-amber-100 text-amber-900'];
  return ['Consultando al IMSS…', 'bg-cream text-ink'];
}

const EMPLEO: Record<string, string> = { empleado: 'Sí, cotiza hoy', desempleado: 'No cotiza hoy', pensionado: 'Ya está pensionado' };
const btn = 'rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-cream disabled:opacity-40';

function Dato({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{k}</div>
      <div className="text-sm font-semibold">{v ?? '—'}</div>
    </div>
  );
}

export function mensajeParaCliente(r: FilaResultadoAliado, aliado: string) {
  const nombre = r.nombre || 'Hola';
  const partes = [`${nombre}, ya revisamos tu información del IMSS con El Trol Financiero.`];
  const datos: string[] = [];
  if (r.edad != null) datos.push(`${r.edad} años`);
  if (r.ley) datos.push(leyLabel(r.ley)!);
  if (r.semanas != null) datos.push(`${r.semanas.toLocaleString('es-MX')} semanas cotizadas`);
  if (datos.length) partes.push(`Lo que tenemos: ${datos.join(' · ')}.`);
  if (r.pension_base != null && r.pension_base > 0) {
    partes.push(`Tu pensión estimada hoy ronda ${money(r.pension_base)} al mes; en la asesoría vemos cómo subirla.`);
  } else if (r.saldo_rcv97 != null && r.saldo_rcv97 > 0) {
    partes.push(`Tu ahorro para el retiro ronda ${money(r.saldo_rcv97)}.`);
  }
  const ops = (r.oportunidades ?? []).map((o) => o.nombre).filter(Boolean);
  if (ops.length) partes.push(`Vemos estas oportunidades: ${ops.join(', ')}.`);
  partes.push(`Te van a contactar de Trol para explicarte con calma. Cualquier duda, aquí estoy. — ${aliado}`);
  return partes.join('\n');
}

function Comprar({ persona, productos, creditos, tieneWallet, compras }: {
  persona: string; productos: ProductoAliado[]; creditos: number | null; tieneWallet: boolean; compras: CompraAliado[];
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState<ProductoAliado | null>(null);
  const [pending, start] = useTransition();
  const comprado = new Set(compras.map((c) => c.producto));
  // La completa incluye los cálculos: si ya compró la completa no se ofrece nada; si compró
  // cálculos, sólo la completa.
  const tieneCompleta = comprado.has('diagnostico_avanzado_sesion');
  const ofrecer = productos.filter((p) => !tieneCompleta && !comprado.has(p.codigo));
  if (!ofrecer.length) return null;

  const confirmar = (p: ProductoAliado) => start(async () => {
    const r = await comprarAsesoriaPorAliado(persona, p.codigo) as { ok: boolean; error?: string; repetida?: boolean; creditos_restantes?: number | null };
    setConfirmando(null);
    if (!r.ok) { toast.error(r.error ?? 'No se pudo'); return; }
    toast.success(r.repetida ? 'Ya la habías pedido; no se cobró de nuevo.' : `Listo. Nos ponemos a trabajar. Te quedan ${r.creditos_restantes ?? '—'} créditos.`);
    router.refresh();
  });

  if (confirmando) {
    const alcanza = (creditos ?? 0) >= confirmando.creditos;
    return (
      <div className="mt-2 rounded-lg border border-ink bg-cream p-3 text-xs">
        <b>{confirmando.nombre}</b> · se descuentan <b>{confirmando.creditos} créditos</b> ({money(confirmando.mxn)}) de tus {creditos ?? 0}.
        {!alcanza ? <div className="mt-1 text-amber-900">No te alcanzan. Escríbenos para recargar.</div> : null}
        <div className="mt-2 flex gap-2">
          <button className="rounded-lg bg-ink px-3 py-1 text-xs font-bold text-white disabled:opacity-40" disabled={pending || !alcanza} onClick={() => confirmar(confirmando)}>{pending ? 'Pidiendo…' : 'Confirmar'}</button>
          <button className={btn} disabled={pending} onClick={() => setConfirmando(null)}>Cancelar</button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {ofrecer.map((p) => (
        <button key={p.codigo} className={btn} disabled={!tieneWallet} title={!tieneWallet ? 'Tu cuenta todavía no tiene créditos' : undefined} onClick={() => setConfirmando(p)}>
          Pedir {p.codigo === 'diagnostico_avanzado_sesion' ? 'asesoría completa' : 'cálculos'} · {p.creditos} cr
        </button>
      ))}
    </div>
  );
}

/** La pestaña Pensión de un cliente. */
export function PensionDetalle({ r, productos, creditos, tieneWallet, aliado, puedeNss = false, tieneInfonavit = false }: {
  r: FilaResultadoAliado; productos: ProductoAliado[]; creditos: number | null; tieneWallet: boolean; aliado: string;
  /** 294 · El aliado tiene el programa Infonavit: si la CURP falló, con el NSS se puede seguir por ahí. */
  puedeNss?: boolean; tieneInfonavit?: boolean;
}) {
  const [label, cls] = estadoPension(r);
  const ops = r.oportunidades ?? [];
  const compras = r.compras ?? [];
  const ley73 = /73/.test(r.ley ?? '');

  return (
    <div>
      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>

      {r.estado === 'fallida' ? (
        <>
          <p className="mt-2 text-xs text-amber-900">No pudimos consultar su información con esa CURP. Pídele a tu cliente que la revise; si está bien escrita, podemos ayudarle: escríbenos.</p>
          {puedeNss && !tieneInfonavit ? <AgregarNss persona={r.persona_id} motivo="pension_fallida" /> : null}
        </>
      ) : null}
      {r.estado === 'falta_curp' ? (
        <p className="mt-2 text-xs text-amber-900">Sin CURP no podemos consultar su información al IMSS. {puedeNss ? 'Si entró con NSS, Infonavit sigue su curso y, al llegar su historial, la CURP se completa sola. ' : ''}Mándanosla o agrégalo otra vez con ella.</p>
      ) : null}
      {/* 301 · SISEC subido por el aliado: siempre disponible; destacado cuando Trol no lo consigue. */}
      {r.estado !== 'ya_cliente' && r.estado !== 'listo' && puedeNss ? <SubirSisec persona={r.persona_id} destacado={!!r.sugerir_sisec} /> : null}

      {r.estado === 'listo' ? (
        <>
          <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Lo que dice el IMSS</div>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            <Dato k="Edad" v={r.edad != null ? `${r.edad} años` : null} />
            <Dato k="Ley" v={leyLabel(r.ley)} />
            <Dato k="Semanas" v={r.semanas != null ? r.semanas.toLocaleString('es-MX') : null} />
            <Dato k="Cotiza hoy" v={r.status_empleo ? EMPLEO[r.status_empleo] ?? r.status_empleo : null} />
            <Dato k="Derechos" v={r.conserva_derechos == null ? null : r.conserva_derechos ? `Vigentes${r.fin_conservacion ? ` hasta ${fecha(r.fin_conservacion)}` : ''}` : 'Hay que reactivarlos'} />
            <Dato k="AFORE" v={r.afore_actual} />
          </div>

          <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Lo que vale</div>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ley73 ? (
              <Dato k="Pensión estimada hoy" v={r.pension_base != null && r.pension_base > 0 ? `${money(r.pension_base)} / mes` : 'Por calcular'} />
            ) : (
              <Dato k="Ahorro para el retiro (estimado)" v={r.saldo_rcv97 != null && r.saldo_rcv97 > 0 ? money(r.saldo_rcv97) : 'Por calcular'} />
            )}
            {r.saldo_infonavit != null && r.saldo_infonavit > 0 ? (
              <Dato k="Infonavit" v={r.credito_infonavit_vigente ? `Saldo ${money(r.saldo_infonavit)} · ya tiene un crédito vigente` : `Saldo ${money(r.saldo_infonavit)}${r.infonavit_monto_credito ? ` · crédito hasta ${money(r.infonavit_monto_credito)}` : ''}`} />
            ) : null}
          </div>

          <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Oportunidades</div>
          {ops.length ? (
            <ul className="mt-1 space-y-1 text-xs">
              {ops.map((o) => (
                <li key={o.codigo} className="flex flex-wrap items-baseline gap-1">
                  <span className="font-semibold">{o.nombre ?? o.codigo}</span>
                  {o.frase ? <span className="text-muted">— {o.frase}</span> : null}
                  {o.estado === 'en_proceso' ? <span className="rounded-full bg-emerald-100 px-1.5 text-[10px] font-semibold text-emerald-900">en proceso</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-muted">Por ahora no vemos una oportunidad clara; en la asesoría se revisa a detalle.</p>
          )}
        </>
      ) : null}

      {(r.estado === 'listo' || compras.length) && r.estado !== 'ya_cliente' ? (
        <>
          <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Qué sigue</div>
          {compras.length ? (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              {compras.map((c) => (
                <span key={c.producto} className="rounded-full bg-cream px-2 py-0.5 font-semibold">{c.nombre} · {fecha(c.en)}</span>
              ))}
              {r.diagnostico_estado === 'listo' && r.diagnostico_doc_id ? (
                <a className={btn} href={`/aliado/diagnostico/${r.persona_id}`} target="_blank" rel="noreferrer">Ver diagnóstico (PDF)</a>
              ) : r.diagnostico_estado === 'en_elaboracion' ? (
                <span className="text-muted">Diagnóstico en elaboración</span>
              ) : (
                <span className="text-muted">Pedido: estamos haciendo los cálculos</span>
              )}
              {r.proxima_sesion ? <span className="text-muted">· Sesión {fechaHora(r.proxima_sesion)}</span> : null}
            </div>
          ) : null}
          <Comprar persona={r.persona_id} productos={productos} creditos={creditos} tieneWallet={tieneWallet} compras={compras} />
          {r.estado === 'listo' ? (
            <div className="mt-2">
              <CopiarMensaje texto={mensajeParaCliente(r, aliado)} etiqueta="Copiar mensaje para tu cliente" className={btn} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
