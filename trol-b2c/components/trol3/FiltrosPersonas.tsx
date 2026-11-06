'use client';
// 300 · Filtros de "Todos los clientes": de dónde vino (asesor, aliado, evento, canal) y a quién está asignado.
// Viven en la URL para poder compartir la liga; al cambiar se regresa a la página 1.
import { useRouter, useSearchParams } from 'next/navigation';

export interface OpcionOrigen { grupo: string; clave: string; etiqueta: string; n: number }

const sel = 'rounded-lg border border-line bg-white px-2 py-1.5 text-xs';

export function FiltrosPersonas({ opciones, miembros, yo }: { opciones: OpcionOrigen[]; miembros: { id: string; nombre: string | null }[]; yo: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const origen = sp.get('origen') ?? '';
  const asignado = sp.get('asignado') ?? '';
  const ir = (k: string, v: string) => {
    const n = new URLSearchParams(sp.toString());
    if (v) n.set(k, v); else n.delete(k);
    n.delete('pag');
    router.push(`/trabajo${n.toString() ? `?${n.toString()}` : ''}`);
  };
  const grupos = Array.from(new Set(opciones.map((o) => o.grupo)));
  const mio = `miembro:${yo}`;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
      <span className="font-semibold text-muted">Origen</span>
      <select className={sel} value={origen} onChange={(e) => ir('origen', e.target.value)}>
        <option value="">Todos</option>
        {opciones.some((o) => o.clave === mio) ? <option value={mio}>Traídos por mí (alta o liga) · {opciones.find((o) => o.clave === mio)?.n}</option> : null}
        {grupos.map((g) => (
          <optgroup key={g} label={g}>
            {opciones.filter((o) => o.grupo === g && o.clave !== mio).map((o) => <option key={o.clave} value={o.clave}>{o.etiqueta} · {o.n.toLocaleString('es-MX')}</option>)}
          </optgroup>
        ))}
      </select>
      <span className="ml-2 font-semibold text-muted">Asignado a</span>
      <select className={sel} value={asignado} onChange={(e) => ir('asignado', e.target.value)}>
        <option value="">Cualquiera</option>
        <option value={yo}>Yo</option>
        {miembros.filter((m) => m.id !== yo).map((m) => <option key={m.id} value={m.id}>{(m.nombre ?? '').split(' ')[0]}</option>)}
        <option value="sin">Sin asignar</option>
      </select>
      {origen || asignado ? <button type="button" className="text-muted underline" onClick={() => router.push(sp.get('q') ? `/trabajo?q=${encodeURIComponent(sp.get('q')!)}` : '/trabajo')}>Quitar filtros</button> : null}
    </div>
  );
}
