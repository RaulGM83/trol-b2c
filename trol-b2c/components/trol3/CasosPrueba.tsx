'use client';

// ---------------------------------------------------------------------------
// Los casos congelados y el diff (118, paso C).
//
// Esta es la pieza que convierte "ajustar seguido" en algo medible. 117 quitó
// la fricción de publicar; lo que faltaba era poder contestar, antes de
// publicar, si la regla nueva mejoró un caso rompiendo otros tres.
//
// Se corre con el texto que está en el editor de arriba, ANTES de publicarlo.
// Ése es el punto: probar y después decidir, no publicar y después enterarse.
//
// Los casos se corren de uno en uno desde aquí, no en una sola llamada al
// servidor: cada uno es una llamada a OpenAI, un lote no cabe en el tiempo de
// una server action, y así se ve el avance y el que falla no tumba a los demás.
// ---------------------------------------------------------------------------

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { abrirCorrida, archivarCasoPrueba, correrCasoPrueba } from '@/app/trabajo/actions';
import { cuantoCambio, diffPalabras } from '@/lib/diagnostico/diff';
import { SECCIONES_NARRATIVA, TITULO_SECCION, type SeccionNarrativa } from '@/lib/diagnostico/secciones';

export type CasoPrueba = {
  id: string;
  etiqueta: string;
  nota: string | null;
  persona_id: string | null;
  activo: boolean;
  creado_en: string;
};

export type Corrida = {
  id: string;
  etiqueta: string | null;
  prompt_version: string | null;
  instrucciones_version: number | null;
  instrucciones_texto: string | null;
  creado_en: string;
  creado_por_nombre: string | null;
  casos: number;
  fallidos: number;
};

export type Resultado = {
  corrida_id: string;
  caso_id: string;
  narrativa: Record<string, string> | null;
  error: string | null;
};

type R = { ok: boolean; error?: string; id?: string; casos?: { id: string; etiqueta: string }[] };

const fechaHora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const nombreCorrida = (c: Corrida) =>
  `${fechaHora(c.creado_en)}${c.etiqueta ? ` · ${c.etiqueta}` : ''}${
    c.instrucciones_version ? ` · v${c.instrucciones_version}` : ' · sin publicar'
  }`;

/** El texto con lo que salió tachado y lo que entró subrayado. */
function Diff({ antes, despues }: { antes: string; despues: string }) {
  const trozos = diffPalabras(antes, despues);
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {trozos.map((t, i) =>
        t.tipo === 'igual' ? (
          <span key={i}>{t.texto}</span>
        ) : t.tipo === 'fuera' ? (
          <span key={i} className="bg-red-50 text-red-800 line-through decoration-red-400">
            {t.texto}
          </span>
        ) : (
          <span key={i} className="bg-lime/40 text-ink underline decoration-ink/30">
            {t.texto}
          </span>
        ),
      )}
    </p>
  );
}

export function CasosPrueba({
  casos,
  corridas,
  resultados,
  /** Lo que hay ahora mismo en el editor de arriba. Es lo que se prueba. */
  textoEnEditor,
}: {
  casos: CasoPrueba[];
  corridas: Corrida[];
  resultados: Resultado[];
  textoEnEditor: string;
}) {
  const [pending, start] = useTransition();
  const [avance, setAvance] = useState<string | null>(null);
  const [etiqueta, setEtiqueta] = useState('');
  const [verArchivados, setVerArchivados] = useState(false);
  const [caso, setCaso] = useState<string>(casos.find((c) => c.activo)?.id ?? '');

  // Por default se compara la más nueva contra la anterior, que es la pregunta
  // que uno trae al abrir: "¿qué cambió con lo último que probé?"
  const [b, setB] = useState<string>(corridas[0]?.id ?? '');
  const [a, setA] = useState<string>(corridas[1]?.id ?? '');

  const activos = casos.filter((c) => c.activo);
  const archivados = casos.filter((c) => !c.activo);

  const resultadoDe = (corridaId: string, casoId: string) =>
    resultados.find((r) => r.corrida_id === corridaId && r.caso_id === casoId) ?? null;

  const rA = a && caso ? resultadoDe(a, caso) : null;
  const rB = b && caso ? resultadoDe(b, caso) : null;

  const correrTodos = () =>
    start(async () => {
      const abierta = (await abrirCorrida(textoEnEditor || null, etiqueta || null)) as R;
      if (!abierta.ok || !abierta.id) {
        toast.error(abierta.error ?? 'No se pudo abrir la corrida');
        return;
      }
      const lista = abierta.casos ?? [];
      let fallos = 0;
      for (let i = 0; i < lista.length; i++) {
        setAvance(`${i + 1} de ${lista.length} · ${lista[i].etiqueta}`);
        const r = (await correrCasoPrueba(abierta.id, lista[i].id)) as R & { escribio?: boolean };
        if (!r.ok || r.escribio === false) fallos++;
      }
      setAvance(null);
      setEtiqueta('');
      if (fallos === 0) toast.success(`Corrieron los ${lista.length} casos`);
      else toast.warning(`${lista.length - fallos} de ${lista.length}; ${fallos} con error`);
    });

  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold">
          Casos congelados
          <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-[11px] font-normal">
            {activos.length} activo{activos.length === 1 ? '' : 's'}
          </span>
        </h2>
        {archivados.length ? (
          <button onClick={() => setVerArchivados((v) => !v)} className="text-xs underline text-muted">
            {verArchivados ? 'ocultar archivados' : `ver ${archivados.length} archivado${archivados.length === 1 ? '' : 's'}`}
          </button>
        ) : null}
      </div>
      <p className="mb-3 text-xs text-muted">
        Sus hechos <b>no se refrescan</b>: es lo que hace que la diferencia entre dos corridas hable
        del prompt y no de que cambió un dato. Se congelan desde la pestaña Diagnóstico de un
        expediente, sobre un borrador que ya revisaste.
      </p>

      {activos.length === 0 ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Todavía no hay casos. Abre un diagnóstico que ya hayas revisado y usa{' '}
          <b>Congelar como caso de prueba</b> en el bloque de afinar. Con tres o cuatro que cubran
          Ley 73, Ley 97 con rescate, Ley 97 en PMG y uno con ISSSTE, ya se puede medir.
        </p>
      ) : (
        <>
          <ul className="space-y-1 text-sm">
            {(verArchivados ? casos : activos).map((c) => (
              <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-line px-3 py-1.5">
                <span className={c.activo ? '' : 'text-muted line-through'}>
                  {c.etiqueta}
                  {c.nota ? <span className="ml-2 text-xs text-muted">{c.nota}</span> : null}
                </span>
                <button
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = (await archivarCasoPrueba(c.id, !c.activo)) as R;
                      if (r.ok) toast.success(c.activo ? 'Archivado' : 'De vuelta');
                      else toast.error(r.error ?? 'No se pudo');
                    })
                  }
                  className="text-xs underline text-muted disabled:opacity-50"
                >
                  {c.activo ? 'Archivar' : 'Reactivar'}
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
              placeholder="Qué estás probando"
              className="min-w-[14rem] flex-1 rounded-lg border border-line px-2 py-1.5 text-sm"
            />
            <button
              disabled={pending}
              onClick={correrTodos}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {avance ? `Corriendo ${avance}` : pending ? 'Corriendo…' : 'Correr con el texto del editor'}
            </button>
          </div>
          <p className="mt-1 text-xs text-muted">
            {textoEnEditor.trim()
              ? 'Usa el texto que tienes arriba, esté publicado o no.'
              : 'El editor está vacío: esto corre el prompt base solo, que es justo la línea contra la que conviene comparar.'}
          </p>
        </>
      )}

      {/* ---- El diff ---- */}
      {corridas.length >= 1 && activos.length > 0 ? (
        <div className="mt-6 border-t border-line pt-4">
          <h3 className="mb-2 text-sm font-bold">Qué cambió</h3>
          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            <label className="text-xs text-muted">
              Caso
              <select
                value={caso}
                onChange={(e) => setCaso(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line px-2 py-1.5 text-sm text-ink"
              >
                {activos.map((c) => (
                  <option key={c.id} value={c.id}>{c.etiqueta}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              Antes
              <select
                value={a}
                onChange={(e) => setA(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line px-2 py-1.5 text-sm text-ink"
              >
                <option value="">—</option>
                {corridas.map((c) => (
                  <option key={c.id} value={c.id}>{nombreCorrida(c)}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              Después
              <select
                value={b}
                onChange={(e) => setB(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line px-2 py-1.5 text-sm text-ink"
              >
                <option value="">—</option>
                {corridas.map((c) => (
                  <option key={c.id} value={c.id}>{nombreCorrida(c)}</option>
                ))}
              </select>
            </label>
          </div>

          {!a || !b ? (
            <p className="text-sm text-muted">
              {corridas.length < 2
                ? 'Falta una segunda corrida para comparar. Corre los casos otra vez con el texto cambiado.'
                : 'Elige las dos corridas a comparar.'}
            </p>
          ) : a === b ? (
            <p className="text-sm text-muted">Son la misma corrida.</p>
          ) : rA?.error || rB?.error ? (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              Este caso falló en una de las dos corridas: {rA?.error ?? rB?.error}. Vuelve a
              correrlo antes de comparar — un fallo no es un texto que se acortó.
            </p>
          ) : !rA || !rB ? (
            <p className="text-sm text-muted">
              Este caso no corrió en una de las dos corridas (se congeló después, o se archivó).
            </p>
          ) : (
            <div className="space-y-4">
              {SECCIONES_NARRATIVA.map((s) => {
                const antes = rA.narrativa?.[s] ?? '';
                const despues = rB.narrativa?.[s] ?? '';
                if (!antes && !despues) return null;
                const { fuera, dentro } = cuantoCambio(diffPalabras(antes, despues));
                const igual = fuera === 0 && dentro === 0;
                return (
                  <details key={s} open={!igual} className="rounded-xl border border-line p-3">
                    <summary className="cursor-pointer text-sm font-bold">
                      {TITULO_SECCION[s as SeccionNarrativa]}
                      {igual ? (
                        <span className="ml-2 text-xs font-normal text-muted">sin cambios</span>
                      ) : (
                        <span className="ml-2 text-xs font-normal">
                          <span className="text-red-700">−{fuera}</span>{' '}
                          <span className="text-ink">+{dentro}</span>
                          <span className="text-muted"> palabras</span>
                        </span>
                      )}
                    </summary>
                    <div className="mt-2">
                      {igual ? (
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{despues}</p>
                      ) : (
                        <Diff antes={antes} despues={despues} />
                      )}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
