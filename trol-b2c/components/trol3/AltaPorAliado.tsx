'use client';

// El alta que hace el aliado (128). La palomita de autorización NO viene
// marcada y el botón no se enciende sin ella: es lo único que respalda que
// contactemos a alguien que no nos buscó, así que tiene que ser un acto, no
// un descuido.

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { altaClientePorAliado } from '@/app/aliado/actions';

type R = { ok: boolean; error?: string; nueva?: boolean; por_revisar?: boolean; aviso?: string | null };

const VACIO = { telefono: '', nombre: '', curp: '', autoriza: false };

export function AltaPorAliado({ aliado }: { aliado: string }) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState(VACIO);
  const [pending, start] = useTransition();

  const curpSucia = f.curp.trim().length > 0 && f.curp.trim().length !== 18;
  const listo = f.telefono.replace(/\D/g, '').length === 10 && f.nombre.trim().length >= 3 && f.autoriza && !curpSucia;

  const enviar = () =>
    start(async () => {
      const r = (await altaClientePorAliado({
        telefono: f.telefono,
        nombre: f.nombre,
        curp: f.curp || null,
        autoriza: f.autoriza,
      })) as R;
      if (!r.ok) {
        toast.error(r.error ?? 'No se pudo');
        return;
      }
      setF(VACIO);
      setAbierto(false);
      if (r.por_revisar) {
        toast.success('Registrado. Esa persona ya estaba con nosotros; lo revisamos y te confirmamos.');
      } else {
        toast.success(r.aviso ?? 'Listo, ya lo tenemos. Nosotros lo contactamos.');
      }
    });

  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold">Pásanos a alguien directo</h2>
          <p className="text-xs text-muted">
            Si prefieres no mandarle la liga, déjanos sus datos y nosotros lo buscamos.
          </p>
        </div>
        <button onClick={() => setAbierto((v) => !v)} className="text-xs underline text-muted">
          {abierto ? 'cancelar' : 'dar de alta a alguien'}
        </button>
      </div>

      {abierto ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <input
            value={f.nombre}
            onChange={(e) => setF({ ...f, nombre: e.target.value })}
            placeholder="Nombre completo"
            className="rounded-lg border border-line px-3 py-2 text-sm"
          />
          <input
            value={f.telefono}
            onChange={(e) => setF({ ...f, telefono: e.target.value })}
            placeholder="Teléfono (10 dígitos)"
            inputMode="numeric"
            className="rounded-lg border border-line px-3 py-2 text-sm"
          />
          <div className="sm:col-span-2">
            <input
              value={f.curp}
              onChange={(e) => setF({ ...f, curp: e.target.value.toUpperCase() })}
              maxLength={18}
              placeholder="CURP (opcional)"
              className={`w-full rounded-lg border px-3 py-2 font-mono text-sm uppercase ${curpSucia ? 'border-red-400' : 'border-line'}`}
            />
            <p className="mt-1 text-[11px] text-muted">
              Con la CURP podemos revisar sus semanas y su historial antes de la primera llamada. Sin
              ella también lo damos de alta; se la pedimos nosotros.
            </p>
          </div>

          <label className="flex items-start gap-2 rounded-xl bg-cream px-3 py-2 text-xs sm:col-span-2">
            <input
              type="checkbox"
              checked={f.autoriza}
              onChange={(e) => setF({ ...f, autoriza: e.target.checked })}
              className="mt-0.5"
            />
            <span>
              Confirmo que <b>{f.nombre.trim() || 'esta persona'}</b> me autorizó a compartir sus
              datos con El Trol Financiero para que lo contacten y revisen su situación de pensión
              {f.curp.trim() ? ', incluida la consulta de su historial ante el IMSS' : ''}.
            </span>
          </label>

          <button
            disabled={pending || !listo}
            onClick={enviar}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2"
          >
            {pending ? 'Registrando…' : 'Registrarlo'}
          </button>
          <p className="text-[11px] text-muted sm:col-span-2">
            Queda registrado que {aliado} lo autorizó y en qué fecha.
          </p>
        </div>
      ) : null}
    </section>
  );
}
