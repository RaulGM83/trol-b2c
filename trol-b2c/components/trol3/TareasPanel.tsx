'use client';

// ---------------------------------------------------------------------------
// Tareas — los compromisos del equipo (114).
//
// El mismo componente sirve en el expediente (las de ese cliente) y en
// /trabajo/tareas (las mías, las de todos). Cambia qué se le pasa, no cómo se
// comporta: una tarea se ve y se cierra igual esté donde esté.
//
// Lo vencido se marca fuerte a propósito. Una lista donde todo se ve igual no
// ayuda a decidir por dónde empezar, que es lo único que se le pide.
// ---------------------------------------------------------------------------

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { actualizarTarea, cerrarTarea, crearTarea } from '@/app/trabajo/actions';

export type Tarea = {
  id: string;
  persona_id: string | null;
  persona_nombre: string | null;
  titulo: string;
  detalle: string | null;
  responsable_id: string;
  responsable_nombre: string | null;
  vence_el: string | null;
  estado: 'pendiente' | 'hecha' | 'cancelada';
  origen: string;
  vencida: boolean;
  dias_para_vencer: number | null;
  hecha_en: string | null;
  nota_cierre: string | null;
};

export type MiembroOpcion = { id: string; nombre: string | null; email: string | null };

type R = { ok: boolean; error?: string };

const hoyIso = () => new Date().toISOString().slice(0, 10);

function cuando(t: Tarea): { texto: string; tono: string } {
  if (t.estado !== 'pendiente') return { texto: '', tono: '' };
  if (!t.vence_el) return { texto: 'sin fecha', tono: 'text-muted' };
  const d = t.dias_para_vencer;
  if (d === null) return { texto: '', tono: '' };
  if (d < 0) return { texto: `vencida hace ${-d} día${-d === 1 ? '' : 's'}`, tono: 'text-red-700 font-semibold' };
  if (d === 0) return { texto: 'vence hoy', tono: 'text-amber-700 font-semibold' };
  if (d === 1) return { texto: 'vence mañana', tono: 'text-amber-700' };
  return { texto: `en ${d} días`, tono: 'text-muted' };
}

export function TareasPanel({
  tareas,
  miembros,
  personaId = null,
  yoId,
  titulo = 'Pendientes',
  mostrarCliente = false,
  compacto = false,
}: {
  tareas: Tarea[];
  miembros: MiembroOpcion[];
  /** Si viene, el alta queda amarrada a este cliente. */
  personaId?: string | null;
  yoId: string;
  titulo?: string;
  mostrarCliente?: boolean;
  compacto?: boolean;
}) {
  const [pending, start] = useTransition();
  const [nuevo, setNuevo] = useState('');
  const [vence, setVence] = useState('');
  const [responsable, setResponsable] = useState(yoId);
  const [verCerradas, setVerCerradas] = useState(false);

  const abiertas = tareas.filter((t) => t.estado === 'pendiente');
  const cerradas = tareas.filter((t) => t.estado !== 'pendiente');
  const visibles = verCerradas ? cerradas : abiertas;

  const correr = (fn: () => Promise<R>, exito: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(exito);
      else toast.error(r.error ?? 'No se pudo');
    });

  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold">
          {titulo}
          {abiertas.length > 0 && (
            <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-[11px] font-normal">
              {abiertas.length} abierta{abiertas.length === 1 ? '' : 's'}
            </span>
          )}
          {abiertas.some((t) => t.vencida) && (
            <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">
              {abiertas.filter((t) => t.vencida).length} vencida
              {abiertas.filter((t) => t.vencida).length === 1 ? '' : 's'}
            </span>
          )}
        </h2>
        {cerradas.length > 0 && (
          <button
            className="text-xs underline text-muted"
            onClick={() => setVerCerradas((v) => !v)}
          >
            {verCerradas ? `Ver abiertas (${abiertas.length})` : `Ver cerradas (${cerradas.length})`}
          </button>
        )}
      </div>

      {!verCerradas && (
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            placeholder="¿Qué hay que hacer?"
            className="min-w-[16rem] flex-1 rounded-lg border border-line px-2 py-1.5 text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && nuevo.trim().length >= 3) {
                correr(
                  () =>
                    crearTarea({
                      titulo: nuevo,
                      personaId,
                      responsableId: responsable,
                      venceEl: vence || null,
                    }) as Promise<R>,
                  'Tarea creada',
                );
                setNuevo('');
                setVence('');
              }
            }}
          />
          <label className="flex flex-col text-[11px] text-muted">
            Para cuándo
            <input
              type="date"
              value={vence}
              min={hoyIso()}
              onChange={(e) => setVence(e.target.value)}
              className="rounded-lg border border-line px-2 py-1 text-sm"
            />
          </label>
          <label className="flex flex-col text-[11px] text-muted">
            Quién
            <select
              value={responsable}
              onChange={(e) => setResponsable(e.target.value)}
              className="rounded-lg border border-line px-2 py-1 text-sm"
            >
              {miembros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id === yoId ? 'Yo' : (m.nombre ?? m.email ?? m.id.slice(0, 6))}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={pending || nuevo.trim().length < 3}
            className="rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            onClick={() => {
              correr(
                () =>
                  crearTarea({
                    titulo: nuevo,
                    personaId,
                    responsableId: responsable,
                    venceEl: vence || null,
                  }) as Promise<R>,
                'Tarea creada',
              );
              setNuevo('');
              setVence('');
            }}
          >
            Agregar
          </button>
        </div>
      )}

      {visibles.length === 0 ? (
        <p className="text-sm text-muted">
          {verCerradas ? 'Nada cerrado todavía.' : 'Sin pendientes.'}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {visibles.map((t) => {
            const c = cuando(t);
            return (
              <li key={t.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2 text-sm">
                {t.estado === 'pendiente' && (
                  <input
                    type="checkbox"
                    checked={false}
                    disabled={pending}
                    title="Marcar como hecha"
                    className="mt-1"
                    onChange={() =>
                      correr(
                        () => cerrarTarea(t.id, 'hecha', undefined, t.persona_id) as Promise<R>,
                        'Hecha',
                      )
                    }
                  />
                )}
                <span className={t.estado === 'pendiente' ? '' : 'text-muted line-through'}>
                  {t.titulo}
                </span>

                {mostrarCliente && t.persona_id && (
                  <Link
                    href={`/trabajo/p/${t.persona_id}`}
                    className="text-xs underline text-muted"
                  >
                    {t.persona_nombre || 'ver cliente'}
                  </Link>
                )}

                {t.estado === 'pendiente' && c.texto && (
                  <span className={`text-xs ${c.tono}`}>{c.texto}</span>
                )}
                <span className="text-xs text-muted">
                  · {t.responsable_id === yoId ? 'yo' : (t.responsable_nombre ?? '—')}
                  {t.origen !== 'manual' && ` · desde ${t.origen}`}
                </span>

                {t.estado === 'pendiente' ? (
                  <span className="ml-auto flex items-center gap-2">
                    {/* Mover la fecha es lo que más se hace con una tarea viva. */}
                    <input
                      type="date"
                      defaultValue={t.vence_el ?? ''}
                      disabled={pending}
                      title="Mover la fecha"
                      className="rounded border border-line px-1 py-0.5 text-xs"
                      onChange={(e) =>
                        correr(
                          () =>
                            actualizarTarea({
                              tareaId: t.id,
                              venceEl: e.target.value || null,
                              limpiarVence: !e.target.value,
                              personaId: t.persona_id,
                            }) as Promise<R>,
                          'Fecha actualizada',
                        )
                      }
                    />
                    <button
                      disabled={pending}
                      className="text-xs underline text-muted"
                      onClick={() =>
                        correr(
                          () =>
                            cerrarTarea(t.id, 'cancelada', undefined, t.persona_id) as Promise<R>,
                          'Cancelada',
                        )
                      }
                    >
                      cancelar
                    </button>
                  </span>
                ) : (
                  <span className="ml-auto flex items-center gap-2 text-xs text-muted">
                    {t.estado === 'cancelada' ? 'cancelada' : 'hecha'}
                    {t.nota_cierre && ` · ${t.nota_cierre}`}
                    <button
                      disabled={pending}
                      className="underline"
                      onClick={() =>
                        correr(
                          () =>
                            cerrarTarea(t.id, 'pendiente', undefined, t.persona_id) as Promise<R>,
                          'Reabierta',
                        )
                      }
                    >
                      reabrir
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!compacto && !verCerradas && abiertas.length > 0 && (
        <p className="mt-3 text-xs text-muted">
          Lo vencido va en rojo. Mover la fecha es válido; dejarla pasar en silencio, no.
        </p>
      )}
    </section>
  );
}
