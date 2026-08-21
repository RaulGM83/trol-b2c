'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { fusionarPersonas, ligarFamiliares } from '@/app/trabajo/actions';
import { mensajeError } from '@/lib/trol3/errores';
import { combinarMovidas, totalMovido, type FilaMovida } from '@/lib/trol3/duplicados';

// Mismo destrabe que en ExpedienteAcciones: las actions devuelven una unión y `error`
// sólo existe en la rama de fallo.
type R = { ok: boolean; error?: string };
type Fusionada = { id: string; movidas: unknown };

const btn = 'rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-cream disabled:opacity-50';
const btnDark = 'rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50';

export type PersonaDup = {
  id: string;
  nombre: string | null;
  apellidos: string | null;
  curp: string | null;
  etapa: string | null;
  created_at: string | null;
};

// Tolera undefined: se llama sobre el resultado de find(), que puede quedarse sin match
// si la lista se recarga con otro conjunto de personas mientras el panel sigue abierto.
const nombreDe = (p?: PersonaDup | null) => (p ? [p.nombre, p.apellidos].filter(Boolean).join(' ') : '') || '(sin nombre)';

/**
 * Fusión de expedientes que sí son la misma persona. Irreversible en la práctica
 * (la absorbida queda con `merged_into`), así que va en dos pasos y con motivo obligatorio.
 */
export function FusionarGrupo({ personas, sugerido }: { personas: PersonaDup[]; sugerido: string }) {
  const router = useRouter();
  const [conservar, setConservar] = useState(sugerido);
  const [motivo, setMotivo] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<FilaMovida[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const absorber = personas.filter((p) => p.id !== conservar);

  const lanzar = () => start(async () => {
    setErr(null); setMsg(null); setDetalle([]);
    const r = await fusionarPersonas(conservar, absorber.map((p) => p.id), motivo);
    setConfirmando(false);
    if (!r.ok) { setErr(mensajeError({ message: (r as R).error })); return; }
    // `movidas` es un objeto por expediente absorbido: se aplana a texto antes de tocar el DOM.
    const fusionadas = ((r as { fusionadas?: Fusionada[] }).fusionadas ?? []);
    const filas = combinarMovidas(fusionadas.map((f) => f.movidas));
    const total = fusionadas.reduce((s, f) => s + totalMovido(f.movidas), 0);
    setDetalle(filas);
    setMsg(`Expedientes fusionados: ${fusionadas.length} sobre ${nombreDe(personas.find((p) => p.id === conservar))}${total ? ` · ${total} registros movidos` : ''}.`);
    setMotivo('');
    router.refresh();
  });

  return (
    <div className="mt-3 border-t border-line pt-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-muted">Conservar:</label>
        <select value={conservar} onChange={(e) => { setConservar(e.target.value); setConfirmando(false); }} className="rounded-lg border border-line px-2 py-1">
          {personas.map((p) => <option key={p.id} value={p.id}>{nombreDe(p)}{p.curp ? ` · ${p.curp}` : ' · sin CURP'}</option>)}
        </select>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por qué son la misma persona" className="min-w-[220px] flex-1 rounded-lg border border-line px-2 py-1" />
      </div>
      {confirmando ? (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2">
          <p className="text-amber-900">
            Se van a mover todos los datos de <b>{absorber.map(nombreDe).join(', ')}</b> a <b>{nombreDe(personas.find((p) => p.id === conservar))}</b> y el resto queda marcado como fusionado. Esto no se deshace desde aquí. ¿Confirmas?
          </p>
          <div className="mt-2 flex gap-2">
            <button disabled={pending} className={btnDark} onClick={lanzar}>{pending ? 'Fusionando…' : 'Sí, fusionar'}</button>
            <button disabled={pending} className={btn} onClick={() => setConfirmando(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button disabled={pending || !motivo.trim()} title={motivo.trim() ? '' : 'Escribe el motivo primero'} className={btnDark + ' mt-2'} onClick={() => { setErr(null); setConfirmando(true); }}>
          Fusionar {absorber.length} en 1
        </button>
      )}
      {msg && (
        <div className="mt-1">
          <p className="text-green-700">{msg}</p>
          {detalle.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-muted">Ver qué se movió</summary>
              <ul className="mt-1 space-y-0.5">
                {detalle.map((f, i) => (
                  <li key={`${f.tabla}-${i}`} className={f.conflicto ? 'text-amber-700' : 'text-muted'}>
                    <b>{f.tabla}</b>: {f.texto}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {err && <p className="mt-1 text-red-600">{err}</p>}
    </div>
  );
}

/** CURPs distintas: no se fusiona. Se ligan como familiares y se decide de quién es el número. */
export function LigarFamiliaresGrupo({ telefono, personas, sugerido }: { telefono: string; personas: PersonaDup[]; sugerido: string }) {
  const router = useRouter();
  const [dueno, setDueno] = useState(sugerido);
  const [nota, setNota] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const lanzar = () => start(async () => {
    setErr(null); setMsg(null);
    const r = await ligarFamiliares(telefono, dueno, personas.map((p) => p.id), nota);
    if (!r.ok) { setErr(mensajeError({ message: (r as R).error })); return; }
    setMsg(`Ligados como familiares. El número queda a nombre de ${nombreDe(personas.find((p) => p.id === dueno))}.`);
    setNota('');
    router.refresh();
  });

  return (
    <div className="mt-3 border-t border-line pt-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-muted">Dueño del teléfono:</label>
        <select value={dueno} onChange={(e) => setDueno(e.target.value)} className="rounded-lg border border-line px-2 py-1">
          {personas.map((p) => <option key={p.id} value={p.id}>{nombreDe(p)}{p.curp ? ` · ${p.curp}` : ' · sin CURP'}</option>)}
        </select>
        <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional): parentesco" className="min-w-[200px] flex-1 rounded-lg border border-line px-2 py-1" />
        <button disabled={pending} className={btnDark} onClick={lanzar}>{pending ? 'Ligando…' : 'Ligar como familiares'}</button>
      </div>
      {msg && <p className="mt-1 text-green-700">{msg}</p>}
      {err && <p className="mt-1 text-red-600">{err}</p>}
    </div>
  );
}
