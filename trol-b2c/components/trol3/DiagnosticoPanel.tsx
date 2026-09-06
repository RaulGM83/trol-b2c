'use client';

// ---------------------------------------------------------------------------
// El diagnóstico avanzado, escrito donde ya pasó la asesoría (claude/48, 115).
//
// El orden de la pantalla es el argumento del rediseño:
//
//   1. Los HECHOS, arriba y en gris: no se editan. Salen del expediente y del
//      escenario que el asesor cerró. Si un número está mal se corrige el
//      dato, no el párrafo — de otro modo el error se tapa aquí y sigue vivo
//      en la base para el siguiente cliente.
//   2. La NARRATIVA: la IA hace el borrador, el asesor lo reescribe. Es su
//      documento; el modelo sólo le ahorra la página en blanco.
//   3. Los ACUERDOS: lo que se platicó. Sólo del asesor, sin IA de por medio.
//   4. Los PENDIENTES: no son texto. Son tareas con dueño y fecha que se
//      persiguen desde /trabajo/tareas, no desde un PDF que nadie reabre.
//
// El guardado es por bloque y al salir del campo. Nadie va a apretar "guardar"
// siete veces, y un documento que se pierde por no apretarlo no se vuelve a
// escribir.
// ---------------------------------------------------------------------------

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  cambiarEstadoDiagnostico,
  generarBorradorDiagnostico,
  guardarDiagnostico,
  ligarAsesorias,
  ligarEscenarios,
  refrescarHechosDiagnostico,
  regenerarNarrativa,
} from '@/app/trabajo/actions';
import {
  SECCIONES_NARRATIVA,
  TITULO_SECCION,
  type Narrativa,
  type SeccionNarrativa,
} from '@/lib/diagnostico/secciones';
import { TareasPanel, type MiembroOpcion, type Tarea } from '@/components/trol3/TareasPanel';
import {
  AfinarRedactor,
  type Feedback,
  type InstruccionesVigentes,
} from '@/components/trol3/AfinarRedactor';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type EscenarioCerradoOpcion = {
  id: string;
  tipo: string;
  creado_en: string;
  creado_por_nombre: string | null;
  motor_actual: boolean | null;
  resumen: Record<string, any> | null;
};

/** Un plan de vivienda guardado, como se ofrece para elegir. */
export type AsesoriaOpcion = {
  id: string;
  nombre: string | null;
  desarrollo: string | null;
  horizonte: number | null;
  efectivo: number | null;
  ventaja_corte: number | null;
  cotitular_nombre: string | null;
  created_at: string;
};

export type DiagnosticoRow = {
  id: string;
  estado: 'borrador' | 'revisado' | 'entregado';
  escenario_ids: string[];
  asesoria_ids: string[] | null;
  redactor: string | null;
  motor_version: string | null;
  prompt_version: string | null;
  instrucciones_version: number | null;
  ensayo: string | null;
  creado_en: string;
  actualizado_en: string;
  entregado_en: string | null;
  creado_por_nombre: string | null;
  contenido: { hechos?: any; narrativa?: Narrativa; acuerdos?: string } | null;
};

const TIPO_LABEL: Record<string, string> = {
  calc_ley73: 'Ley 73',
  calc_ley97: 'Ley 97',
  calc_mod40: 'Mod 40',
};

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador',
  revisado: 'Revisado',
  entregado: 'Entregado',
};

const CAPA_LABEL: Record<string, string> = {
  oficial: 'oficial',
  declarado: 'lo dijo el cliente',
  estimado: 'estimado nuestro',
  desconocido: 'sin fuente',
};

const mxn = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  maximumFractionDigits: 0,
});

const fecha = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fechaHora = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
};

type R = { ok: boolean; error?: string; aviso?: string | null; id?: string };

// ---------------------------------------------------------------------------

/** Un dato con su procedencia. La capa se dice siempre: es media respuesta. */
function Hecho({ label, d, money = false }: { label: string; d: any; money?: boolean }) {
  const v = d && typeof d === 'object' && 'valor' in d ? d.valor : d;
  const capa = d && typeof d === 'object' && 'capa' in d ? (d.capa as string) : null;
  const texto =
    v === null || v === undefined || v === ''
      ? '—'
      : typeof v === 'boolean'
        ? v
          ? 'Sí'
          : 'No'
        : money && typeof v === 'number'
          ? mxn.format(v)
          : typeof v === 'number'
            ? new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 }).format(v)
            : /^\d{4}-\d{2}-\d{2}/.test(String(v))
              ? fecha(String(v))
              : String(v);
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="text-sm font-semibold">{texto}</div>
      {capa && v !== null && v !== undefined && v !== '' ? (
        <div className="text-[11px] text-muted">{CAPA_LABEL[capa] ?? capa}</div>
      ) : null}
    </div>
  );
}

function Hechos({ h }: { h: any }) {
  if (!h) return <p className="text-sm text-muted">Este diagnóstico no guardó hechos.</p>;
  const escs: any[] = Array.isArray(h.escenarios) ? h.escenarios : [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Hecho label="Edad" d={h.cliente?.edad} />
        <Hecho label="Ley" d={h.cliente?.ley} />
        <Hecho label="Cotiza" d={h.cliente?.status_empleo} />
        <Hecho label="Semanas" d={h.imss?.semanas_cotizadas} />
        <Hecho label="Conserva derechos" d={h.imss?.conserva_derechos} />
        <Hecho label="Fin de conservación" d={h.imss?.fin_conservacion} />
        <Hecho label="Saldo AFORE (RCV)" d={h.saldos?.afore_rcv97} money />
        <Hecho label="Saldo Infonavit" d={h.saldos?.infonavit} money />
      </div>

      {escs.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="py-1 pr-3">Escenario</th>
                <th className="py-1 pr-3">Cerrado</th>
                <th className="py-1 pr-3 text-right">Cuenta individual</th>
                <th className="py-1 pr-3 text-right">Pensión total</th>
                <th className="py-1">Vivienda</th>
              </tr>
            </thead>
            <tbody>
              {escs.map((s) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="py-1.5 pr-3">{TIPO_LABEL[`calc_${s.calculadora}`] ?? s.calculadora}</td>
                  <td className="py-1.5 pr-3 text-muted">{fecha(s.cerrado_en)}</td>
                  <td className="py-1.5 pr-3 text-right">
                    {s.pension_cuenta_individual == null ? '—' : mxn.format(s.pension_cuenta_individual)}
                    {s.en_pmg ? <span className="ml-1 text-[11px] text-amber-700">en PMG</span> : null}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-semibold">
                    {s.pension_total == null ? '—' : mxn.format(s.pension_total)}
                  </td>
                  <td className="py-1.5 text-muted">
                    {s.destino_infonavit === 'rescate'
                      ? 'rescatada'
                      : s.destino_infonavit === 'vivienda'
                        ? 'para su casa'
                        : s.destino_infonavit === 'pension'
                          ? 'a la pensión'
                          : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="text-xs text-muted">
        Estos números no se editan aquí. Salen del expediente y del escenario cerrado: si alguno está
        mal, corrige el dato o cierra otro escenario y vuelve a refrescar los hechos.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Una sección de la narrativa. Se guarda al salir del campo, y sólo si cambió. */
function Seccion({
  seccion,
  valor,
  onGuardar,
  bloqueado,
}: {
  seccion: SeccionNarrativa;
  valor: string;
  onGuardar: (texto: string) => void;
  bloqueado: boolean;
}) {
  const [texto, setTexto] = useState(valor);
  const [original, setOriginal] = useState(valor);
  const sucio = texto !== original;

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label className="text-sm font-bold">{TITULO_SECCION[seccion]}</label>
        <span className="text-[11px] text-muted">
          {sucio ? 'sin guardar' : texto.trim() ? `${texto.trim().split(/\s+/).length} palabras` : 'vacía'}
        </span>
      </div>
      <textarea
        value={texto}
        disabled={bloqueado}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          if (!sucio) return;
          setOriginal(texto);
          onGuardar(texto);
        }}
        rows={Math.min(14, Math.max(4, Math.ceil(texto.length / 90) + 1))}
        className="w-full rounded-lg border border-line px-3 py-2 text-sm leading-relaxed disabled:bg-cream disabled:text-muted"
        placeholder="Todavía sin texto. Escríbelo o pide el borrador a la IA."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

export function DiagnosticoPanel({
  personaId,
  diagnostico,
  escenarios,
  asesorias,
  tareas,
  miembros,
  yoId,
  esAdmin = false,
  feedback = [],
  vigentes = null,
}: {
  personaId: string;
  diagnostico: DiagnosticoRow | null;
  escenarios: EscenarioCerradoOpcion[];
  asesorias: AsesoriaOpcion[];
  tareas: Tarea[];
  miembros: MiembroOpcion[];
  yoId: string;
  /** Afinar el prompt es de quien responde por el producto, no de cada asesor. */
  esAdmin?: boolean;
  feedback?: Feedback[];
  vigentes?: InstruccionesVigentes;
}) {
  const [pending, start] = useTransition();
  // Por default se marcan todos: el asesor cerró uno por calculadora y el
  // documento los junta, que es justo lo que pidió el rediseño.
  const [elegidos, setElegidos] = useState<string[]>(
    diagnostico?.escenario_ids?.length ? diagnostico.escenario_ids : escenarios.map((e) => e.id),
  );
  // El plan de vivienda NO viene todo marcado como los escenarios: hay quien
  // guarda tres tanteando, y ninguna debe colarse sola al documento. Se marca
  // la más reciente, que es la que casi siempre se acaba de presentar.
  const [planes, setPlanes] = useState<string[]>(
    diagnostico?.asesoria_ids?.length
      ? diagnostico.asesoria_ids
      : asesorias.length
        ? [asesorias[0].id]
        : [],
  );

  const correr = (fn: () => Promise<R>, exito: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error ?? 'No se pudo');
        return;
      }
      // Hay acciones que salen a medias: el borrador se abre pero la IA falla,
      // o el documento queda entregado pero el PDF no se guarda. El aviso trae
      // la frase completa y se muestra tal cual — media victoria no se cuenta
      // como victoria ni como error.
      if (r.aviso) toast.warning(r.aviso);
      else toast.success(exito);
    });

  const narrativa = diagnostico?.contenido?.narrativa ?? {};
  const acuerdos = diagnostico?.contenido?.acuerdos ?? '';
  const bloqueado = diagnostico?.estado === 'entregado';

  // ---- Todavía no hay documento: elegir sobre qué escribir.
  if (!diagnostico) {
    return (
      <div className="space-y-4">
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="text-sm font-bold">Diagnóstico avanzado</h2>
          <p className="mt-1 text-sm text-muted">
            Se escribe sobre los escenarios que cerraste con el cliente, no sobre la semilla. Elige
            cuáles entran y la IA arma el borrador; tú lo reescribes.
          </p>

          {escenarios.length === 0 ? (
            <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Todavía no hay ningún escenario cerrado. Ve a <b>Calculadoras</b>, arma el que le vas a
              presentar y ciérralo; ése es el que este documento va a contar.
            </p>
          ) : (
            <>
              <ul className="mt-4 space-y-2">
                {escenarios.map((e) => (
                  <li key={e.id} className="flex items-start gap-2 rounded-xl border border-line p-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={elegidos.includes(e.id)}
                      onChange={() =>
                        setElegidos((v) =>
                          v.includes(e.id) ? v.filter((x) => x !== e.id) : [...v, e.id],
                        )
                      }
                    />
                    <div className="text-sm">
                      <div className="font-semibold">
                        {TIPO_LABEL[e.tipo] ?? e.tipo}
                        {e.resumen?.etiqueta ? (
                          <span className="font-normal text-muted"> · {e.resumen.etiqueta}</span>
                        ) : null}
                        {e.motor_actual === false ? (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            motor anterior
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-muted">
                        {fechaHora(e.creado_en)}
                        {e.creado_por_nombre ? ` · ${e.creado_por_nombre}` : ''}
                        {e.resumen?.pension_mensual
                          ? ` · ${mxn.format(Number(e.resumen.pension_mensual))} al mes`
                          : ''}
                        {e.resumen?.edad_retiro ? ` a los ${e.resumen.edad_retiro}` : ''}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {asesorias.length ? (
                <div className="mt-5">
                  <h3 className="text-sm font-bold">Plan de vivienda</h3>
                  <p className="mb-2 text-xs text-muted">
                    Comprar el inmueble no compite con la pensión: es el primer tiempo de la misma
                    estrategia, y al corte el efectivo puede pasar al ahorro. Marca el que le
                    presentaste — si no marcas ninguno, el documento habla de Infonavit en general.
                  </p>
                  <ul className="space-y-2">
                    {asesorias.map((a) => (
                      <li key={a.id} className="flex items-start gap-2 rounded-xl border border-line p-3">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={planes.includes(a.id)}
                          onChange={() =>
                            setPlanes((v) => (v.includes(a.id) ? v.filter((x) => x !== a.id) : [...v, a.id]))
                          }
                        />
                        <div className="text-sm">
                          <div className="font-semibold">
                            {a.desarrollo ?? a.nombre ?? 'Plan sin nombre'}
                            {a.horizonte ? <span className="font-normal text-muted"> · {a.horizonte} meses</span> : null}
                          </div>
                          <div className="text-xs text-muted">
                            {fechaHora(a.created_at)}
                            {a.efectivo != null ? ` · ${mxn.format(Number(a.efectivo))} al corte` : ''}
                            {a.ventaja_corte != null
                              ? ` · ventaja ${mxn.format(Number(a.ventaja_corte))}`
                              : ''}
                            {a.cotitular_nombre ? ` · con ${a.cotitular_nombre}` : ''}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <button
                disabled={pending || elegidos.length === 0}
                onClick={() =>
                  correr(
                    () => generarBorradorDiagnostico(personaId, elegidos, planes) as Promise<R>,
                    'Borrador listo',
                  )
                }
                className="mt-4 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {pending ? 'Escribiendo…' : 'Generar borrador'}
              </button>
            </>
          )}
        </section>
      </div>
    );
  }

  // ---- Ya hay documento.
  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold">
            Diagnóstico avanzado
            <span
              className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                diagnostico.estado === 'entregado'
                  ? 'bg-lime text-ink'
                  : diagnostico.estado === 'revisado'
                    ? 'bg-cream text-ink'
                    : 'bg-amber-100 text-amber-800'
              }`}
            >
              {ESTADO_LABEL[diagnostico.estado]}
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {(['borrador', 'revisado', 'entregado'] as const).map((s) =>
              s === diagnostico.estado ? null : (
                <button
                  key={s}
                  disabled={pending}
                  onClick={() =>
                    correr(
                      () => cambiarEstadoDiagnostico(diagnostico.id, personaId, s) as Promise<R>,
                      `Marcado como ${ESTADO_LABEL[s].toLowerCase()}`,
                    )
                  }
                  className="rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-cream disabled:opacity-50"
                >
                  Marcar {ESTADO_LABEL[s].toLowerCase()}
                </button>
              ),
            )}
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">
          Abierto {fechaHora(diagnostico.creado_en)}
          {diagnostico.creado_por_nombre ? ` por ${diagnostico.creado_por_nombre}` : ''} · editado{' '}
          {fechaHora(diagnostico.actualizado_en)}
          {diagnostico.redactor ? ` · borrador de ${diagnostico.redactor}` : ' · sin borrador de IA'}
          {diagnostico.motor_version ? ` · motor ${diagnostico.motor_version}` : ''}
        </p>
        <a
          href={`/trabajo/diagnostico/pdf/${diagnostico.id}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-cream"
        >
          Ver el PDF{bloqueado ? '' : ' (con marca de borrador)'}
        </a>

        {bloqueado ? (
          <p className="mt-3 rounded-xl bg-cream px-3 py-2 text-xs">
            Entregado el {fecha(diagnostico.entregado_en)}. Para cambiarlo, regrésalo a borrador.
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-line bg-cream/60 p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold">Los hechos</h2>
          <button
            disabled={pending || bloqueado}
            onClick={() =>
              correr(
                () =>
                  refrescarHechosDiagnostico(
                    diagnostico.id,
                    personaId,
                    diagnostico.escenario_ids,
                  ) as Promise<R>,
                'Hechos al día',
              )
            }
            className="text-xs underline text-muted disabled:opacity-50"
          >
            Refrescar con los datos de hoy
          </button>
        </div>
        <Hechos h={diagnostico.contenido?.hechos} />

        <div className="mt-4 border-t border-line pt-3">
          <h3 className="mb-1 text-sm font-bold">Escenarios que dan las cifras</h3>
          <p className="mb-2 text-xs text-muted">
            Si cerraste uno mejor después, cámbialo aquí en vez de abrir otro diagnóstico: lo que
            ya escribiste se conserva.
          </p>
          {escenarios.length === 0 ? (
            <p className="text-sm text-muted">No hay escenarios cerrados en este expediente.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {escenarios.map((e) => (
                <li key={e.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={bloqueado}
                    checked={elegidos.includes(e.id)}
                    onChange={() =>
                      setElegidos((v) => (v.includes(e.id) ? v.filter((x) => x !== e.id) : [...v, e.id]))
                    }
                  />
                  <span>
                    {TIPO_LABEL[e.tipo] ?? e.tipo}
                    <span className="text-xs text-muted">
                      {' · '}
                      {fechaHora(e.creado_en)}
                      {e.resumen?.pension_mensual
                        ? ` · ${mxn.format(Number(e.resumen.pension_mensual))} al mes`
                        : ''}
                      {e.resumen?.edad_retiro ? ` a los ${e.resumen.edad_retiro}` : ''}
                    </span>
                    {e.motor_actual === false ? (
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                        motor anterior
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button
            disabled={pending || bloqueado || elegidos.length === 0}
            onClick={() =>
              start(async () => {
                const l = (await ligarEscenarios(diagnostico.id, personaId, elegidos)) as R;
                if (!l.ok) {
                  toast.error(l.error ?? 'No se pudo');
                  return;
                }
                const r = (await refrescarHechosDiagnostico(
                  diagnostico.id, personaId, elegidos,
                )) as R;
                if (r.ok) toast.success('Hechos al día con estos escenarios');
                else toast.error(r.error ?? 'No se pudo');
              })
            }
            className="mt-2 text-xs underline text-muted disabled:opacity-50"
          >
            Guardar y refrescar los hechos
          </button>
        </div>

        {asesorias.length ? (
          <div className="mt-4 border-t border-line pt-3">
            <h3 className="mb-1 text-sm font-bold">Plan de vivienda</h3>
            <ul className="space-y-1 text-sm">
              {asesorias.map((a) => (
                <li key={a.id} className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={bloqueado}
                    checked={planes.includes(a.id)}
                    onChange={() =>
                      setPlanes((v) => (v.includes(a.id) ? v.filter((x) => x !== a.id) : [...v, a.id]))
                    }
                  />
                  <span>
                    {a.desarrollo ?? a.nombre ?? 'Plan sin nombre'}
                    <span className="text-xs text-muted">
                      {a.horizonte ? ` · ${a.horizonte} meses` : ''}
                      {a.efectivo != null ? ` · ${mxn.format(Number(a.efectivo))} al corte` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {/* Cambiar la liga no reescribe el texto: primero se ve qué entró. */}
            <button
              disabled={pending || bloqueado}
              onClick={() =>
                start(async () => {
                  const l = (await ligarAsesorias(diagnostico.id, personaId, planes)) as R;
                  if (!l.ok) {
                    toast.error(l.error ?? 'No se pudo');
                    return;
                  }
                  const r = (await refrescarHechosDiagnostico(
                    diagnostico.id, personaId, diagnostico.escenario_ids,
                  )) as R;
                  if (r.ok) toast.success('Hechos al día con estos planes');
                  else toast.error(r.error ?? 'No se pudo');
                })
              }
              className="mt-2 text-xs underline text-muted disabled:opacity-50"
            >
              Guardar y refrescar los hechos
            </button>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold">La narrativa</h2>
          <button
            disabled={pending || bloqueado}
            onClick={() =>
              correr(
                () => regenerarNarrativa(diagnostico.id, personaId) as Promise<R>,
                'Borrador rehecho',
              )
            }
            className="text-xs underline text-muted disabled:opacity-50"
          >
            Rehacer el borrador con IA
          </button>
        </div>
        <p className="mb-4 text-xs text-muted">
          Se guarda solo al salir de cada campo. Rehacer el borrador <b>pisa</b> lo que hayas escrito.
        </p>
        <div className="space-y-5">
          {SECCIONES_NARRATIVA.map((s) => (
            <Seccion
              key={s}
              seccion={s}
              valor={narrativa[s] ?? ''}
              bloqueado={bloqueado}
              onGuardar={(texto) =>
                correr(
                  () =>
                    guardarDiagnostico({
                      diagnosticoId: diagnostico.id,
                      personaId,
                      narrativa: { [s]: texto },
                    }) as Promise<R>,
                  'Guardado',
                )
              }
            />
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-1 text-sm font-bold">Lo que acordamos</h2>
        <p className="mb-2 text-xs text-muted">
          Lo que se platicó en la sesión y lo que se propuso. Esto no lo escribe la IA.
        </p>
        <Acuerdos
          valor={acuerdos}
          bloqueado={bloqueado}
          onGuardar={(texto) =>
            correr(
              () =>
                guardarDiagnostico({
                  diagnosticoId: diagnostico.id,
                  personaId,
                  acuerdos: texto,
                }) as Promise<R>,
              'Guardado',
            )
          }
        />
      </section>

      <TareasPanel
        tareas={tareas}
        miembros={miembros}
        personaId={personaId}
        yoId={yoId}
        titulo="Lo que sigue"
        origen="diagnostico"
        origenId={diagnostico.id}
      />

      {esAdmin ? (
        <AfinarRedactor
          diagnosticoId={diagnostico.id}
          personaId={personaId}
          ensayo={diagnostico.ensayo}
          feedback={feedback}
          vigentes={vigentes}
          promptVersion={diagnostico.prompt_version}
          instruccionesVersion={diagnostico.instrucciones_version}
          bloqueado={bloqueado}
        />
      ) : null}
    </div>
  );
}

function Acuerdos({
  valor,
  onGuardar,
  bloqueado,
}: {
  valor: string;
  onGuardar: (t: string) => void;
  bloqueado: boolean;
}) {
  const [texto, setTexto] = useState(valor);
  const [original, setOriginal] = useState(valor);
  return (
    <textarea
      value={texto}
      disabled={bloqueado}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        if (texto === original) return;
        setOriginal(texto);
        onGuardar(texto);
      }}
      rows={6}
      className="w-full rounded-lg border border-line px-3 py-2 text-sm leading-relaxed disabled:bg-cream disabled:text-muted"
      placeholder="Le explicamos… quedó de… el siguiente paso es…"
    />
  );
}
