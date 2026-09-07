'use client';

// ---------------------------------------------------------------------------
// Los aliados que REFIEREN (122). No confundir con la pestaña de Aliados, que
// son los que COMPRAN consultas: ahí el cliente es del aliado, aquí es de Trol
// desde el día uno y el aliado nos lo presentó.
//
// La pantalla está ordenada por lo que hay que HACER, no por lo que hay que
// mirar: primero lo que espera una decisión, luego lo que se debe pagar, y
// hasta abajo la lista completa. Un tablero que abre con totales bonitos y
// esconde los pendientes tres scrolls abajo no se usa.
// ---------------------------------------------------------------------------

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  altaAliado,
  decidirReferido,
  guardarComisionAliado,
  pagarComisiones,
} from '@/app/trabajo/actions';

/* eslint-disable @typescript-eslint/no-explicit-any */

export type AliadoFila = {
  id: string;
  nombre: string;
  empresa: string | null;
  email: string | null;
  telefono: string | null;
  tipo: string;
  comision_pct: number | null;
  activo: boolean;
  codigo: string | null;
  referidos: number;
  atribuidos: number;
  devengado: number;
  pagado: number;
};

export type ReferidoFila = {
  referido_id: string;
  aliado_id: string;
  aliado_nombre: string;
  persona_id: string;
  nombre: string | null;
  apellidos: string | null;
  estado: string;
  origen: string;
  referido_en: string;
  etapa: string | null;
  ultima_cita: string | null;
  diagnostico_entregado_en: string | null;
  pension_estimada: number | null;
  productos_contratados: string | null;
  comision_devengada: number | null;
};

export type ComisionFila = {
  id: string;
  aliado_id: string;
  aliado_nombre: string;
  persona_id: string;
  persona_nombre: string | null;
  base: number;
  pct: number;
  monto: number;
  estado: string;
  creado_en: string;
  pagada_en: string | null;
};

type R = { ok: boolean; error?: string; id?: string; n?: number };

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const fecha = (s: string | null) =>
  !s ? '—' : new Date(s).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

const TIPOS: [string, string][] = [
  ['asesor_seguros', 'Asesor de seguros'],
  ['contador', 'Contador'],
  ['despacho', 'Despacho'],
  ['promotor', 'Promotor'],
  ['otro', 'Otro'],
];

const nombreDe = (r: ReferidoFila) => [r.nombre, r.apellidos].filter(Boolean).join(' ').trim() || 'Sin nombre';

export function ReferidoresPanel({
  aliados,
  porRevisar,
  referidos,
  comisiones,
  sitio,
  esAdmin,
}: {
  aliados: AliadoFila[];
  porRevisar: ReferidoFila[];
  referidos: ReferidoFila[];
  comisiones: ComisionFila[];
  /** Para armar el link que se le pasa al aliado. */
  sitio: string;
  esAdmin: boolean;
}) {
  const [pending, start] = useTransition();
  const [abrirAlta, setAbrirAlta] = useState(false);
  const [nuevo, setNuevo] = useState({ nombre: '', empresa: '', email: '', telefono: '', tipo: 'asesor_seguros', pct: '' });
  const [pcts, setPcts] = useState<Record<string, string>>({});
  const [seleccion, setSeleccion] = useState<string[]>([]);

  const correr = (fn: () => Promise<R>, exito: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error ?? 'No se pudo');
        return;
      }
      toast.success(exito);
    });

  const devengadas = comisiones.filter((c) => c.estado === 'devengada');
  const sinTerminos = aliados.filter((a) => a.activo && a.comision_pct == null);

  return (
    <div className="space-y-4">
      {/* ---- Lo que espera una decisión ---- */}
      {porRevisar.length ? (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <h2 className="text-sm font-bold text-amber-900">
            {porRevisar.length} referencia{porRevisar.length === 1 ? '' : 's'} esperando tu decisión
          </h2>
          <p className="mb-3 text-xs text-amber-800">
            Estas personas ya eran clientes de Trol cuando llegó la referencia. Hasta que decidas,
            el aliado no las ve y no devengan comisión.
          </p>
          <ul className="space-y-2">
            {porRevisar.map((r) => (
              <li key={r.referido_id} className="rounded-xl border border-amber-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">
                    <Link href={`/trabajo/p/${r.persona_id}`} className="underline">
                      {nombreDe(r)}
                    </Link>
                    <span className="ml-2 font-normal text-muted">
                      referida por {r.aliado_nombre} · {fecha(r.referido_en)} · {r.origen}
                    </span>
                  </span>
                  <span className="text-xs text-muted">
                    {r.etapa ? `etapa ${r.etapa}` : ''}
                    {r.ultima_cita ? ` · última cita ${fecha(r.ultima_cita)}` : ''}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  <button
                    disabled={pending}
                    onClick={() =>
                      correr(() => decidirReferido(r.referido_id, 'atribuido') as Promise<R>, 'Atribuida al aliado')
                    }
                    className="rounded-lg bg-ink px-3 py-1.5 font-semibold text-white disabled:opacity-50"
                  >
                    Sí es suya
                  </button>
                  <button
                    disabled={pending}
                    onClick={() =>
                      correr(() => decidirReferido(r.referido_id, 'rechazado') as Promise<R>, 'Rechazada')
                    }
                    className="rounded-lg border border-line px-3 py-1.5 hover:bg-cream disabled:opacity-50"
                  >
                    No cuenta
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---- Lo que se debe ---- */}
      {devengadas.length ? (
        <section className="rounded-2xl border border-line bg-white p-5">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold">
              Por pagar
              <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-[11px] font-normal">
                {mxn.format(devengadas.reduce((s, c) => s + Number(c.monto), 0))}
              </span>
            </h2>
            {esAdmin ? (
              <button
                disabled={pending || seleccion.length === 0}
                onClick={() =>
                  correr(async () => {
                    const r = (await pagarComisiones(seleccion)) as R;
                    if (r.ok) setSeleccion([]);
                    return r;
                  }, `Marcadas ${seleccion.length} como pagadas`)
                }
                className="rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                Marcar pagadas ({seleccion.length})
              </button>
            ) : (
              <span className="text-xs text-muted">Sólo la dirección puede marcarlas pagadas</span>
            )}
          </div>
          <ul className="space-y-1 text-sm">
            {devengadas.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2">
                {esAdmin ? (
                  <input
                    type="checkbox"
                    checked={seleccion.includes(c.id)}
                    onChange={() =>
                      setSeleccion((v) => (v.includes(c.id) ? v.filter((x) => x !== c.id) : [...v, c.id]))
                    }
                  />
                ) : null}
                <span className="flex-1">
                  <b>{c.aliado_nombre}</b>
                  <span className="text-muted">
                    {' '}· por{' '}
                    <Link href={`/trabajo/p/${c.persona_id}`} className="underline">
                      {c.persona_nombre ?? 'cliente'}
                    </Link>
                    {' '}· {fecha(c.creado_en)}
                  </span>
                </span>
                <span className="text-xs text-muted">
                  {mxn.format(Number(c.base))} × {Math.round(Number(c.pct) * 100)}%
                </span>
                <span className="font-semibold">{mxn.format(Number(c.monto))}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ---- Los aliados ---- */}
      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold">
            Aliados referidores
            <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-[11px] font-normal">{aliados.length}</span>
          </h2>
          <button onClick={() => setAbrirAlta((v) => !v)} className="text-xs underline text-muted">
            {abrirAlta ? 'cancelar' : 'dar de alta uno'}
          </button>
        </div>

        {sinTerminos.length ? (
          <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {sinTerminos.map((a) => a.nombre).join(', ')} no {sinTerminos.length === 1 ? 'tiene' : 'tienen'} comisión
            pactada. Sus referidos se registran igual, pero <b>no devengan nada</b> hasta que pongas el porcentaje.
          </p>
        ) : null}

        {abrirAlta ? (
          <div className="mb-4 grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-2">
            <input
              value={nuevo.nombre}
              onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
              placeholder="Nombre"
              className="rounded-lg border border-line px-2 py-1.5 text-sm"
            />
            <input
              value={nuevo.empresa}
              onChange={(e) => setNuevo({ ...nuevo, empresa: e.target.value })}
              placeholder="Empresa"
              className="rounded-lg border border-line px-2 py-1.5 text-sm"
            />
            <input
              value={nuevo.email}
              onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
              placeholder="Correo"
              className="rounded-lg border border-line px-2 py-1.5 text-sm"
            />
            <input
              value={nuevo.telefono}
              onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })}
              placeholder="Teléfono"
              className="rounded-lg border border-line px-2 py-1.5 text-sm"
            />
            <select
              value={nuevo.tipo}
              onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value })}
              className="rounded-lg border border-line px-2 py-1.5 text-sm"
            >
              {TIPOS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <div className="flex items-center gap-2">
              <input
                value={nuevo.pct}
                onChange={(e) => setNuevo({ ...nuevo, pct: e.target.value })}
                placeholder="Comisión %"
                inputMode="decimal"
                className="w-28 rounded-lg border border-line px-2 py-1.5 text-sm"
              />
              <span className="text-xs text-muted">sobre la oportunidad ganada</span>
            </div>
            <button
              disabled={pending || nuevo.nombre.trim().length < 3}
              onClick={() =>
                correr(async () => {
                  const r = (await altaAliado({
                    nombre: nuevo.nombre,
                    empresa: nuevo.empresa || null,
                    email: nuevo.email || null,
                    telefono: nuevo.telefono || null,
                    tipo: nuevo.tipo,
                    comisionPct: nuevo.pct ? Number(nuevo.pct) / 100 : null,
                  })) as R;
                  if (r.ok) {
                    setNuevo({ nombre: '', empresa: '', email: '', telefono: '', tipo: 'asesor_seguros', pct: '' });
                    setAbrirAlta(false);
                  }
                  return r;
                }, 'Aliado dado de alta con su link')
              }
              className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2"
            >
              Dar de alta
            </button>
          </div>
        ) : null}

        <ul className="space-y-2">
          {aliados.map((a) => (
            <li key={a.id} className="rounded-xl border border-line p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">
                  {a.nombre}
                  {a.empresa ? <span className="font-normal text-muted"> · {a.empresa}</span> : null}
                  {!a.activo ? (
                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-muted">inactivo</span>
                  ) : null}
                </span>
                <span className="text-xs text-muted">
                  {a.referidos} referido{a.referidos === 1 ? '' : 's'}
                  {a.atribuidos !== a.referidos ? ` (${a.atribuidos} atribuidos)` : ''}
                  {Number(a.devengado) > 0 ? ` · ${mxn.format(Number(a.devengado))} devengado` : ''}
                </span>
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                {a.codigo ? (
                  <>
                    <code className="rounded bg-cream px-2 py-0.5 text-ink">{sitio}/i/{a.codigo}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard?.writeText(`${sitio}/i/${a.codigo}`);
                        toast.success('Link copiado');
                      }}
                      className="underline"
                    >
                      copiar
                    </button>
                  </>
                ) : (
                  <span className="text-amber-700">sin link</span>
                )}
                {a.email ? <span>{a.email}</span> : null}
                {a.telefono ? <span>{a.telefono}</span> : null}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted">Comisión</span>
                <input
                  value={pcts[a.id] ?? (a.comision_pct == null ? '' : String(Math.round(Number(a.comision_pct) * 1000) / 10))}
                  onChange={(e) => setPcts({ ...pcts, [a.id]: e.target.value })}
                  placeholder="—"
                  inputMode="decimal"
                  className="w-20 rounded-lg border border-line px-2 py-1 text-sm"
                />
                <span className="text-muted">% de la oportunidad ganada</span>
                <button
                  disabled={pending || !(pcts[a.id] ?? '').trim()}
                  onClick={() =>
                    correr(
                      () => guardarComisionAliado(a.id, Number(pcts[a.id]) / 100) as Promise<R>,
                      'Comisión pactada',
                    )
                  }
                  className="underline text-muted disabled:opacity-40"
                >
                  guardar
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Todos los referidos ---- */}
      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="mb-1 text-sm font-bold">Referidos</h2>
        <p className="mb-3 text-xs text-muted">
          Lo mismo que ve el aliado de cada uno: avance y resultado. Nunca saldos ni expediente.
        </p>
        {referidos.length === 0 ? (
          <p className="text-sm text-muted">Todavía no hay referidos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr className="border-b border-line">
                  <th className="py-1 pr-3 font-semibold">Persona</th>
                  <th className="py-1 pr-3 font-semibold">Aliado</th>
                  <th className="py-1 pr-3 font-semibold">Etapa</th>
                  <th className="py-1 pr-3 font-semibold">Diagnóstico</th>
                  <th className="py-1 pr-3 font-semibold">Contrató</th>
                  <th className="py-1 pr-3 text-right font-semibold">Pensión est.</th>
                  <th className="py-1 text-right font-semibold">Comisión</th>
                </tr>
              </thead>
              <tbody>
                {referidos.map((r) => (
                  <tr key={r.referido_id} className="border-b border-line/60 align-top">
                    <td className="py-1.5 pr-3">
                      <Link href={`/trabajo/p/${r.persona_id}`} className="underline">
                        {nombreDe(r)}
                      </Link>
                      {r.estado !== 'atribuido' ? (
                        <span className="ml-1 text-[10px] text-muted">({r.estado})</span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3">{r.aliado_nombre}</td>
                    <td className="py-1.5 pr-3">{r.etapa ?? '—'}</td>
                    <td className="py-1.5 pr-3">{fecha(r.diagnostico_entregado_en)}</td>
                    <td className="py-1.5 pr-3">{r.productos_contratados ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-right">
                      {r.pension_estimada == null ? '—' : mxn.format(Number(r.pension_estimada))}
                    </td>
                    <td className="py-1.5 text-right font-semibold">
                      {Number(r.comision_devengada ?? 0) > 0 ? mxn.format(Number(r.comision_devengada)) : '—'}
                    </td>
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
