'use client';

// ---------------------------------------------------------------------------
// Afinar el redactor (117). Sólo lo ve quien tiene el rol admin.
//
// El ciclo que esto habilita es corto a propósito: lees el borrador, dices qué
// faltó, lo pruebas SOBRE ESTE documento, y sólo cuando te convence lo publicas
// para el equipo. Lo que hace que iterar seguido no sea riesgoso no es ir
// despacio: es que cada paso tenga un alcance declarado.
//
//   comentario  no afecta a nadie — queda como materia prima
//   ensayo      afecta sólo a este documento al regenerarlo
//   vigente     afecta a todos los asesores, con historial y vuelta atrás
//
// Publicar NO requiere deploy: el bloque vive en la base. El prompt base sigue
// en el repo, y cada tanto los ajustes probados se consolidan ahí — si no, en
// tres meses el prompt es un base coherente más veinte parches que se pelean.
// ---------------------------------------------------------------------------

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import Link from 'next/link';

import {
  actualizarFeedback,
  congelarCasoPrueba,
  crearFeedback,
  guardarEnsayo,
  promoverInstrucciones,
  regenerarNarrativa,
} from '@/app/trabajo/actions';
import { SECCIONES_NARRATIVA, TITULO_SECCION, type SeccionNarrativa } from '@/lib/diagnostico/secciones';

export type Feedback = {
  id: string;
  seccion: string | null;
  comentario: string;
  instruccion: string | null;
  estado: 'abierto' | 'probado' | 'promovido' | 'descartado';
  promovida_version: number | null;
  creado_en: string;
};

export type InstruccionesVigentes = { version: number; texto: string; nota: string | null } | null;

type R = { ok: boolean; error?: string; version?: number };

const ESTADO_TONO: Record<Feedback['estado'], string> = {
  abierto: 'bg-amber-100 text-amber-800',
  probado: 'bg-cream text-ink',
  promovido: 'bg-lime text-ink',
  descartado: 'bg-gray-100 text-muted',
};

export function AfinarRedactor({
  diagnosticoId,
  personaId,
  ensayo: ensayoGuardado,
  feedback,
  vigentes,
  promptVersion,
  instruccionesVersion,
  bloqueado,
}: {
  diagnosticoId: string;
  personaId: string;
  ensayo: string | null;
  feedback: Feedback[];
  vigentes: InstruccionesVigentes;
  promptVersion: string | null;
  instruccionesVersion: number | null;
  bloqueado: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pending, start] = useTransition();

  const [seccion, setSeccion] = useState<string>('');
  const [comentario, setComentario] = useState('');
  const [instruccion, setInstruccion] = useState('');
  const [ensayo, setEnsayo] = useState(ensayoGuardado ?? '');
  const [etiquetaCaso, setEtiquetaCaso] = useState('');

  const correr = (fn: () => Promise<R>, exito: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error ?? 'No se pudo');
        return;
      }
      toast.success(exito);
    });

  const abiertos = feedback.filter((f) => f.estado === 'abierto');

  return (
    <section className="rounded-2xl border border-dashed border-line bg-white p-5">
      <button
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-baseline justify-between gap-2 text-left"
      >
        <h2 className="text-sm font-bold">
          Afinar el redactor
          <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-[11px] font-normal">
            sólo tú
          </span>
          {abiertos.length > 0 && (
            <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
              {abiertos.length} sin resolver
            </span>
          )}
        </h2>
        <span className="text-xs text-muted">{abierto ? 'ocultar' : 'abrir'}</span>
      </button>

      {!abierto ? null : (
        <div className="mt-4 space-y-6">
          <p className="text-xs text-muted">
            Escribió con el prompt <b>{promptVersion ?? '—'}</b>
            {instruccionesVersion
              ? <> y los ajustes <b>v{instruccionesVersion}</b></>
              : ' y sin ajustes encima'}
            . Hoy vigente:{' '}
            {vigentes ? <b>v{vigentes.version}</b> : <span>ninguno</span>}
            {vigentes && instruccionesVersion !== vigentes.version ? (
              <span className="ml-1 text-amber-700">
                — este borrador es anterior; regenéralo para verlo con lo vigente.
              </span>
            ) : null}
          </p>

          {/* ---- 1. El comentario. No afecta a nadie. ---- */}
          <div>
            <h3 className="mb-1 text-sm font-bold">Qué le faltó</h3>
            <p className="mb-2 text-xs text-muted">
              Queda pegado a este documento. No cambia nada por sí solo: es la materia prima.
            </p>
            <div className="space-y-2">
              <select
                value={seccion}
                onChange={(e) => setSeccion(e.target.value)}
                className="rounded-lg border border-line px-2 py-1.5 text-sm"
              >
                <option value="">Todo el documento</option>
                {SECCIONES_NARRATIVA.map((s) => (
                  <option key={s} value={s}>
                    {TITULO_SECCION[s as SeccionNarrativa]}
                  </option>
                ))}
              </select>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                rows={3}
                placeholder="Ej.: le faltó decir que el rescate lo paga la constructora, no el cliente."
                className="w-full rounded-lg border border-line px-3 py-2 text-sm"
              />
              <textarea
                value={instruccion}
                onChange={(e) => setInstruccion(e.target.value)}
                rows={2}
                placeholder="Opcional: la regla ya redactada, si ya sabes cómo decírsela al modelo."
                className="w-full rounded-lg border border-line px-3 py-2 text-sm"
              />
              <button
                disabled={pending || comentario.trim().length < 5}
                onClick={() =>
                  correr(async () => {
                    const r = (await crearFeedback({
                      diagnosticoId,
                      personaId,
                      comentario,
                      seccion: seccion || null,
                      instruccion: instruccion.trim() || null,
                    })) as R;
                    if (r.ok) {
                      setComentario('');
                      setInstruccion('');
                    }
                    return r;
                  }, 'Comentario guardado')
                }
                className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-cream disabled:opacity-50"
              >
                Guardar comentario
              </button>
            </div>
          </div>

          {feedback.length ? (
            <ul className="space-y-2">
              {feedback.map((f) => (
                <li key={f.id} className="rounded-xl border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">
                      {f.seccion
                        ? (TITULO_SECCION[f.seccion as SeccionNarrativa] ?? f.seccion)
                        : 'Todo el documento'}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ESTADO_TONO[f.estado]}`}>
                      {f.estado}
                      {f.promovida_version ? ` · v${f.promovida_version}` : ''}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{f.comentario}</p>
                  {f.instruccion ? (
                    <p className="mt-1 rounded-lg bg-cream px-2 py-1 text-xs whitespace-pre-wrap">
                      {f.instruccion}
                    </p>
                  ) : null}
                  {f.estado === 'abierto' || f.estado === 'probado' ? (
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      {f.instruccion ? (
                        <button
                          disabled={pending || bloqueado}
                          onClick={() => {
                            setEnsayo(f.instruccion ?? '');
                            correr(
                              () =>
                                guardarEnsayo(diagnosticoId, personaId, f.instruccion ?? '') as Promise<R>,
                              'Cargada como ensayo — ya puedes regenerar',
                            );
                          }}
                          className="underline text-muted disabled:opacity-50"
                        >
                          Probarla aquí
                        </button>
                      ) : null}
                      <button
                        disabled={pending}
                        onClick={() =>
                          correr(
                            () =>
                              actualizarFeedback({
                                id: f.id,
                                personaId,
                                estado: 'descartado',
                              }) as Promise<R>,
                            'Descartado',
                          )
                        }
                        className="underline text-muted disabled:opacity-50"
                      >
                        Descartar
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {/* ---- 2. El ensayo. Sólo este documento. ---- */}
          <div className="rounded-xl bg-cream/60 p-4">
            <h3 className="mb-1 text-sm font-bold">Probar una instrucción aquí</h3>
            <p className="mb-2 text-xs text-muted">
              Se le pega al prompt al regenerar <b>este</b> documento y manda sobre todo lo demás.
              Ningún otro asesor la ve. Regenera las veces que quieras.
            </p>
            <textarea
              value={ensayo}
              onChange={(e) => setEnsayo(e.target.value)}
              rows={4}
              placeholder="Ej.: en la sección de Infonavit, di siempre quién paga el rescate y cuánto cuesta si el saldo es menor a $169,000."
              className="w-full rounded-lg border border-line px-3 py-2 text-sm"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                disabled={pending || bloqueado}
                onClick={() =>
                  correr(
                    () => guardarEnsayo(diagnosticoId, personaId, ensayo) as Promise<R>,
                    'Ensayo guardado',
                  )
                }
                className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm hover:bg-cream disabled:opacity-50"
              >
                Guardar ensayo
              </button>
              <button
                disabled={pending || bloqueado}
                onClick={() =>
                  start(async () => {
                    const g = (await guardarEnsayo(diagnosticoId, personaId, ensayo)) as R;
                    if (!g.ok) {
                      toast.error(g.error ?? 'No se pudo guardar el ensayo');
                      return;
                    }
                    const r = (await regenerarNarrativa(diagnosticoId, personaId)) as R;
                    if (r.ok) toast.success('Rehecho con el ensayo');
                    else toast.error(r.error ?? 'No se pudo');
                  })
                }
                className="rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {pending ? 'Escribiendo…' : 'Guardar y regenerar'}
              </button>
              {ensayoGuardado ? (
                <button
                  disabled={pending || bloqueado}
                  onClick={() => {
                    setEnsayo('');
                    correr(
                      () => guardarEnsayo(diagnosticoId, personaId, '') as Promise<R>,
                      'Ensayo quitado',
                    );
                  }}
                  className="text-sm underline text-muted disabled:opacity-50"
                >
                  Quitar
                </button>
              ) : null}
            </div>
          </div>

          {/* ---- 3. Publicar. Todos los asesores. ---- */}
          <div>
            <h3 className="mb-1 text-sm font-bold">Publicar para el equipo</h3>
            <p className="mb-2 text-xs text-muted">
              Sube el ensayo al bloque vigente: desde ahí aplica a todos los diagnósticos que
              genere cualquiera. No requiere deploy y se puede revertir.
              {vigentes ? (
                <>
                  {' '}
                  Reemplaza a la <b>v{vigentes.version}</b>, así que pega el texto completo, no
                  sólo lo nuevo.
                </>
              ) : null}
            </p>
            {vigentes ? (
              <details className="mb-2 text-xs">
                <summary className="cursor-pointer text-muted">
                  Ver lo vigente (v{vigentes.version})
                </summary>
                <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-cream p-2">{vigentes.texto}</pre>
              </details>
            ) : null}
            <button
              disabled={pending || ensayo.trim().length < 5}
              onClick={() =>
                correr(
                  () => promoverInstrucciones(ensayo, `desde el diagnóstico ${diagnosticoId.slice(0, 8)}`) as Promise<R>,
                  'Publicado para el equipo',
                )
              }
              className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-cream disabled:opacity-50"
            >
              Publicar el ensayo como vigente
            </button>
            <p className="mt-2 text-xs text-muted">
              Antes de publicar conviene correrlo contra los casos congelados en{' '}
              <Link href="/trabajo/redactor" className="underline">
                el taller del redactor
              </Link>
              : ahí se ve si la regla nueva mejoró este caso rompiendo otros tres.
            </p>
          </div>

          {/* ---- Congelar este caso ---- */}
          <div className="border-t border-line pt-4">
            <h3 className="mb-1 text-sm font-bold">Congelar como caso de prueba</h3>
            <p className="mb-2 text-xs text-muted">
              Guarda los hechos de este documento —tal como están hoy— para volver a escribirlos con
              cada ajuste futuro y comparar. <b>No se refrescan nunca</b>: eso es lo que hace que la
              diferencia entre dos corridas hable del prompt y no de que cambió un dato.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={etiquetaCaso}
                onChange={(e) => setEtiquetaCaso(e.target.value)}
                placeholder="Cómo llamarlo (ej.: Ley 97 con rescate)"
                className="min-w-[16rem] flex-1 rounded-lg border border-line px-2 py-1.5 text-sm"
              />
              <button
                disabled={pending || etiquetaCaso.trim().length < 3}
                onClick={() =>
                  correr(async () => {
                    const r = (await congelarCasoPrueba(diagnosticoId, etiquetaCaso)) as R;
                    if (r.ok) setEtiquetaCaso('');
                    return r;
                  }, 'Congelado — ya entra en las corridas')
                }
                className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-cream disabled:opacity-50"
              >
                Congelar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
