'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { autorizarViraal, autorizarViraalAliado } from '@/app/trabajo/actions';
import { AvisosMod40, FechaTramiteInput } from '@/components/trol3/FechaTramite';
import type { SerieINPC } from '@trol/pension-core/inpc';
import type { RegistroHistorialMod40 } from '@trol/pension-core/mod40-ventana';
import type { SemillaV2 } from '@trol/pension-core/semilla';
import { fechaMinimaTramite, isoFecha, mesaViraalDesdeSemilla, parseFechaTramite } from '@/lib/viraal/prefill';

type Prefill = Record<string, number | null>;
type Autorizacion = {
  id: number;
  banda: string | null;
  nivel: string | null;
  escenario: string | null;
  margen: number | null;
  margen_costo: number | null;
  margen_credito: number | null;
  precio: number | null;
  created_at: string;
  miembro?: string | null;
  nota?: string | null;
};

const mx = (n: number | null | undefined) => (n == null ? '—' : '$' + Math.round(n).toLocaleString('es-MX'));
const pc = (n: number | null | undefined) => (n == null ? '—' : (n * 100).toFixed(1) + '%');
const BANDA: Record<string, { label: string; cls: string }> = {
  verde: { label: 'Verde · automático', cls: 'bg-green-100 text-green-800' },
  ambar: { label: 'Ámbar · comité mayoría', cls: 'bg-amber-100 text-amber-800' },
  naranja: { label: 'Naranja · unánime + aportación', cls: 'bg-orange-100 text-orange-800' },
  rojo: { label: 'Rojo · no autorizar', cls: 'bg-red-100 text-red-700' },
};

export function MesaViraal({
  personaId,
  consultaAliadoId,
  prefill,
  historial,
  semilla,
  saldosLiquidos = null,
  historialLaboral = null,
  limiteInscripcionMod40 = null,
  serieINPC,
  hoyIso,
}: {
  personaId?: string;
  consultaAliadoId?: string;
  prefill: Prefill;
  historial: Autorizacion[];
  /** Semilla del cliente: la mesa recalcula el proyecto en vivo con ella. */
  semilla?: SemillaV2 | null;
  /** AFORE disponible + Infonavit, ya corregidos por el asesor si los capturó. */
  saldosLiquidos?: number | null;
  /** Historia laboral, para clasificar la última baja (art. 219 / 220 LSS). */
  historialLaboral?: RegistroHistorialMod40[] | null;
  /** `limite_inscripcion_mod40` del expediente: manda sobre el cálculo local. */
  limiteInscripcionMod40?: string | null;
  /**
   * Serie INPC de `trol3.inpc_mensual`, bajada en el servidor. La mesa recalcula
   * en el navegador, así que la serie tiene que viajar con ella; sin la prop, el
   * motor cae al fallback embebido de pension-core.
   */
  serieINPC?: SerieINPC;
  /** Hoy según el servidor, para que el default no dependa del reloj del navegador. */
  hoyIso: string;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [alto, setAlto] = useState(1600);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Variante del proyecto: sin/con recuperación de semanas descontadas.
  const [recuperar, setRecuperar] = useState(false);
  const [listo, setListo] = useState(false);
  // Fecha de inicio de trámite: default hoy, la mueve el asesor y todo se
  // recalcula. Se congela en los `inputs` de la autorización.
  const [fechaTramite, setFechaTramite] = useState(hoyIso);
  // El trámite es el de la pensión: nunca antes de cumplir 60. El motor recorre
  // igual, pero el picker no debe dejar pedir algo que no va a calcular.
  const minIso = useMemo(() => {
    const m = semilla ? fechaMinimaTramite(semilla.perfil.fecha_nacimiento) : null;
    const iso = m ? isoFecha(m) : hoyIso;
    return iso > hoyIso ? iso : hoyIso;
  }, [semilla, hoyIso]);
  const fechaEfectiva = fechaTramite < minIso ? minIso : fechaTramite;

  const datos = useMemo(() => {
    if (!semilla) return null;
    const f = parseFechaTramite(fechaEfectiva) ?? parseFechaTramite(minIso) ?? new Date();
    return mesaViraalDesdeSemilla(semilla, saldosLiquidos, f, {
      historial: historialLaboral,
      limiteInscripcionMod40,
      serieINPC,
    });
  }, [semilla, saldosLiquidos, fechaEfectiva, minIso, historialLaboral, limiteInscripcionMod40, serieINPC]);

  const variante = datos ? (recuperar && datos.con ? datos.con : datos.sin) : null;
  const prefillActivo: Prefill = variante ? { ...prefill, ...variante.prefill } : prefill;

  // El listener de `message` se registra una vez y congelaría los valores del
  // primer render: la autorización guardaría la fecha original aunque el asesor
  // la haya movido. Este ref siempre trae lo de AHORA.
  const vivo = useRef({ datos, variante, recuperar, fechaTramite: fechaEfectiva, prefillActivo });
  vivo.current = { datos, variante, recuperar, fechaTramite: fechaEfectiva, prefillActivo };

  useEffect(() => {
    // La fecha viaja al iframe como string: la calculadora la muestra y la
    // arrastra a `inputs`, pero quien la manda es esta pantalla.
    if (listo) {
      ref.current?.contentWindow?.postMessage(
        { type: 'viraal_prefill', payload: { ...prefillActivo, fechaTramite: fechaEfectiva, fechaMinimaTramite: minIso } },
        '*',
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recuperar, listo, fechaEfectiva, minIso, datos]);

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      const d = (e.data ?? {}) as { type?: string; height?: number; fecha?: string; payload?: Record<string, unknown> };
      if (!d.type) return;
      if (d.type === 'viraal_ready') {
        setListo(true);
        const v = vivo.current;
        ref.current?.contentWindow?.postMessage({ type: 'viraal_prefill', payload: { ...v.prefillActivo, fechaTramite: v.fechaTramite, fechaMinimaTramite: minIso } }, '*');
      } else if (d.type === 'viraal_height' && d.height) {
        setAlto(Math.max(600, Math.min(4000, d.height + 24)));
      } else if (d.type === 'viraal_fecha' && typeof d.fecha === 'string') {
        // La cambiaron dentro del iframe: aquí es donde se recalcula.
        setFechaTramite(d.fecha);
      } else if (d.type === 'viraal_autorizar' && d.payload) {
        void autorizar(d.payload);
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  async function autorizar(payload: Record<string, unknown>) {
    const banda = String(payload.banda ?? '');
    const aviso = banda === 'rojo'
      ? 'Este escenario está en ROJO (no autorizar por política). ¿Registrar la autorización de todas formas?'
      : '¿Autorizar este proyecto y registrar el caso con estos números?';
    if (!window.confirm(aviso)) return;
    const nota = window.prompt('Nota de la autorización (opcional): motivo de excepción, condición del comité, etc.', '') ?? '';
    setGuardando(true);
    setMsg(null);
    // El caso lleva los datos del cliente y la variante usada (para el PDF y auditoría).
    // La fecha de trámite queda CONGELADA aquí: el PDF y la auditoría tienen
    // que poder decir a qué fecha se autorizaron estos números. Se lee del ref
    // porque esta función la invoca un listener registrado en el primer render.
    const v = vivo.current;
    // El snapshot de la variante activa: la MISMA corrida del motor que produjo
    // los números que el asesor está viendo. Va tal cual a trol3.escenarios y de
    // ahí salen los campos que se imprimen. Sin él no se autoriza: la fila
    // inmutable es el punto de todo esto.
    const snapshot = v.variante?.snapshot ?? null;
    const ventana = snapshot?.ventana ?? null;
    const inputs = {
      ...((payload.inputs as Record<string, unknown> | undefined) ?? {}),
      cliente: v.datos?.cliente ?? null,
      recuperar_semanas: v.recuperar,
      semanas_retiro: v.variante?.semanas_retiro ?? null,
      fecha_tramite: v.fechaTramite,
      motor_version: snapshot?.inputs.motor_version ?? null,
      ventana_mod40: ventana
        ? {
            estado: ventana.estado,
            plazo: ventana.plazo,
            ultima_modalidad: ventana.ultimaModalidad,
            ultima_baja: ventana.ultimaBaja,
            fecha_limite: ventana.fechaLimite,
          }
        : null,
      avisos: snapshot?.avisos ?? v.datos?.avisos ?? [],
    };
    const r = consultaAliadoId
      ? await autorizarViraalAliado(consultaAliadoId, { ...payload, inputs, nota }, snapshot)
      : await autorizarViraal(personaId as string, { ...payload, inputs, nota }, snapshot);
    setGuardando(false);
    if (r.ok) {
      const escenarioId = (r as { escenarioId?: string | null }).escenarioId ?? null;
      setMsg(escenarioId ? '✓ Escenario autorizado y guardado · generando PDF…' : '✓ Autorización registrada · generando PDF…');
      const id = (r as { id?: number }).id;
      if (id) window.open(`/trabajo/viraal/pdf/${id}`, '_blank');
      setTimeout(() => window.location.reload(), 1300);
    } else {
      setMsg(`Error: ${(r as { error?: string }).error ?? 'no se pudo guardar'}`);
    }
  }

  const c = datos?.cliente;
  return (
    <div className="space-y-4">
      {c && (
        <section className="rounded-2xl border border-line bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold">{c.nombre || 'Cliente'} <span className="ml-2 font-mono text-xs font-normal text-muted">{c.curp || '—'}{c.nss ? ` · NSS ${c.nss}` : ''}</span></h2>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>{c.edad != null ? `${c.edad} años` : 'edad —'}</span>
                <span>{c.ley}{c.aplica_mod40 ? ' · aplica Mod40' : ' · no aplica Mod40'}</span>
                <span>Semanas: <b className="text-ink">{c.semanas_cotizadas}</b> cotizadas · {c.semanas_descontadas} descontadas · {c.semanas_recuperadas} recuperadas</span>
                <span>Salario diario: <b className="text-ink">{mx(c.salario_diario)}</b></span>
                {c.meses_retro != null && (
                  <span>
                    Retroactivo: <b className="text-ink">{c.meses_retro} meses</b>
                    {fechaEfectiva === hoyIso ? ' (a hoy)' : ` (al ${fechaEfectiva})`}
                  </span>
                )}
              </div>
              <div className="mt-3 max-w-xs">
                <FechaTramiteInput
                  value={fechaEfectiva}
                  min={minIso}
                  onChange={setFechaTramite}
                  id="viraal-fecha-tramite"
                  hint={
                    minIso === hoyIso
                      ? 'Es también la fecha de pensión. Todo el proyecto se calcula ahí: ventana, meses de retroactivo, UMA y semanas.'
                      : `Es también la fecha de pensión, así que no puede ser antes del ${minIso}, el día que cumple 60.`
                  }
                />
                {fechaEfectiva !== minIso && (
                  <button
                    type="button"
                    onClick={() => setFechaTramite(minIso)}
                    className="mt-1 text-xs font-semibold text-ink underline"
                  >
                    {minIso === hoyIso ? 'Volver a hoy' : `Volver al ${minIso}`}
                  </button>
                )}
              </div>
            </div>
            <div className="text-right text-xs">
              {datos?.con ? (
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2">
                  <input type="checkbox" checked={recuperar} onChange={(e) => setRecuperar(e.target.checked)} />
                  <span>Recuperar <b>{c.semanas_recuperables}</b> semanas descontadas por desempleo</span>
                </label>
              ) : (
                <span className="text-muted">Sin semanas descontadas por recuperar</span>
              )}
              {variante && (
                <div className="mt-1 text-muted">Pensión con proyecto: <b className="text-ink">{mx(variante.pension)}</b>{variante.semanas_retiro != null ? ` · ${variante.semanas_retiro} semanas al retiro` : ''}</div>
              )}
              {!datos?.sin && <div className="mt-1 text-red-600">No pude calcular el proyecto Mod40 a esa fecha con la semilla; la mesa muestra los valores del expediente.</div>}
            </div>
          </div>
          <AvisosMod40 ventana={datos?.ventana ?? null} avisos={datos?.avisos ?? []} className="mt-3" />
        </section>
      )}
      <div className="rounded-2xl border border-line bg-white p-3">
        <div className="mb-2 flex items-center justify-between px-2">
          <h2 className="text-sm font-bold">Mesa Viraal — autorización del proyecto</h2>
          {guardando ? <span className="text-xs text-muted">Guardando…</span> : msg ? <span className="text-xs font-semibold text-ink">{msg}</span> : <span className="text-xs text-muted">Pre-llenada con el expediente (usa el saldo ajustado si lo corregiste) · “Autorizar proyecto” registra el caso y genera el PDF</span>}
        </div>
        <iframe ref={ref} src="/viraal/calc.html" title="Mesa Viraal" style={{ width: '100%', height: alto, border: 0, borderRadius: 12 }} />
      </div>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-3 text-sm font-bold">Autorizaciones registradas <span className="ml-1 text-xs font-normal text-muted">{historial.length}</span></h2>
        {historial.length === 0 ? (
          <p className="text-sm text-muted">Aún no hay autorizaciones guardadas para este caso.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr className="border-b border-line">
                  <th className="py-1 pr-3 font-semibold">Fecha</th>
                  <th className="py-1 pr-3 font-semibold">Banda</th>
                  <th className="py-1 pr-3 font-semibold">Escenario</th>
                  <th className="py-1 pr-3 text-right font-semibold">Margen</th>
                  <th className="py-1 pr-3 text-right font-semibold">s/costo</th>
                  <th className="py-1 pr-3 text-right font-semibold">s/crédito</th>
                  <th className="py-1 pr-3 font-semibold">Por</th>
                  <th className="py-1 pr-3 font-semibold">Resumen</th>
                </tr>
              </thead>
              <tbody>
                {historial.map((a) => (
                  <tr key={a.id} className="border-b border-line/60">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{new Date(a.created_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                    <td className="py-1.5 pr-3"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${BANDA[a.banda ?? '']?.cls ?? 'bg-gray-100 text-gray-700'}`}>{BANDA[a.banda ?? '']?.label ?? a.banda ?? '—'}</span></td>
                    <td className="py-1.5 pr-3">{a.nivel ? `${a.nivel} · ${a.escenario ?? ''}` : a.escenario ?? '—'}{a.nota ? <span className="block text-[10px] text-muted">{a.nota}</span> : null}</td>
                    <td className="py-1.5 pr-3 text-right font-semibold">{mx(a.margen)}</td>
                    <td className="py-1.5 pr-3 text-right">{pc(a.margen_costo)}</td>
                    <td className="py-1.5 pr-3 text-right">{pc(a.margen_credito)}</td>
                    <td className="py-1.5 pr-3">{a.miembro ?? '—'}</td>
                    <td className="py-1.5 pr-3"><a href={`/trabajo/viraal/pdf/${a.id}`} target="_blank" rel="noreferrer" className="font-semibold text-ink underline">PDF</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
