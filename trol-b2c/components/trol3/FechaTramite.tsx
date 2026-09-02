'use client';

// Fecha de inicio de trámite + avisos de la ventana de reingreso a Mod 40.
// Se comparte entre la Mesa Viraal y la pestaña Calculadoras: una sola pieza,
// un solo copy. Los avisos AVISAN, nunca bloquean (igual que el checklist).

import type { VentanaMod40 } from '@/lib/imss/mod40-ventana';

/**
 * La ventana llega con `Date` cuando viene del motor en vivo (pestaña
 * Calculadoras) y con ISO cuando viene de un snapshot ya serializado (Mesa
 * Viraal, o una fila releída de `trol3.escenarios`). Se aceptan las dos.
 */
type VentanaPintable = Omit<VentanaMod40, 'ultimaBaja' | 'fechaLimite'> & {
  ultimaBaja: Date | string | null;
  fechaLimite: Date | string | null;
};

const fmtFecha = (d: Date | string | null) => {
  if (!d) return '—';
  const fecha = d instanceof Date ? d : new Date(`${String(d).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(fecha.getTime())) return '—';
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(fecha);
};

export function FechaTramiteInput({
  value,
  onChange,
  min,
  id = 'fecha-tramite',
  hint = 'Todo el proyecto se calcula a esta fecha: ventana, meses de retroactivo, UMA y edad.',
}: {
  /** ISO YYYY-MM-DD. */
  value: string;
  onChange: (iso: string) => void;
  /**
   * Fecha más temprana admisible (ISO): el día que el cliente cumple 60, o hoy
   * si ya los cumplió. El trámite ES el de la pensión y no puede ser antes. El
   * motor aplica el mismo piso; esto solo evita que el picker deje pedirlo.
   */
  min?: string;
  id?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        Fecha de inicio de trámite
      </label>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        // Una fecha vacía dejaría el proyecto sin ancla: se ignora el borrado.
        // Una anterior al piso tampoco entra: el picker la bloquea, pero un
        // teclado puede colarla.
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          onChange(min && v < min ? min : v);
        }}
        className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm tabular-nums"
      />
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}

const TONO = {
  vencida: 'border-red-200 bg-red-50 text-red-800',
  por_vencer: 'border-amber-200 bg-amber-50 text-amber-800',
  vigente: 'border-line bg-cream/60 text-ink',
} as const;

/**
 * Caja de avisos del proyecto a la fecha elegida. Con última modalidad Mod 40
 * la fecha límite se enseña SIEMPRE, aunque la ventana siga abierta: es el dato
 * que decide si el caso existe.
 */
export function AvisosMod40({
  ventana,
  avisos,
  className = '',
}: {
  ventana: VentanaPintable | null;
  avisos: string[];
  className?: string;
}) {
  if (!ventana && avisos.length === 0) return null;
  const estado = ventana?.estado ?? 'vigente';
  const tono = TONO[estado];
  const titulo =
    estado === 'vencida'
      ? 'La ventana de reingreso ya venció a esta fecha'
      : estado === 'por_vencer'
        ? 'La ventana de reingreso está por vencer'
        : ventana?.sinBaja
          ? 'Sin baja: no hay periodo retroactivo'
          : 'Ventana de reingreso';

  return (
    <div className={`rounded-xl border px-3 py-2.5 text-xs ${tono} ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <b className="text-[13px]">{titulo}</b>
        {ventana?.fechaLimite && (
          <span className="tabular-nums">
            Límite: <b>{fmtFecha(ventana.fechaLimite)}</b>
            {ventana.plazo === '12m' ? ' · 12 meses (art. 220)' : ventana.plazo === '5a' ? ' · 5 años (art. 219)' : ''}
            {ventana.limiteDelExpediente ? ' · dato del expediente' : ''}
          </span>
        )}
      </div>
      {avisos.length > 0 && (
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          {avisos.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
