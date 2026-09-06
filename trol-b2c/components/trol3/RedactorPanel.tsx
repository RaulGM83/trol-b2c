'use client';

// ---------------------------------------------------------------------------
// El taller del redactor (117, paso B).
//
// Aquí se ve junto lo que en el expediente se ve suelto: todos los comentarios
// que se han dejado sobre lo que escribe la IA, el bloque de ajustes que hoy
// aplica a todo el equipo, y las versiones por las que pasó.
//
// Dos decisiones que se notan en la pantalla:
//
//   · Publicar REEMPLAZA el bloque entero, no le concatena. Un bloque que crece
//     pegando párrafos acaba contradiciéndose consigo mismo y nadie se entera.
//     Por eso el editor abre con el texto vigente completo y los comentarios se
//     "bajan" a él con un botón, para editarlos ahí antes de publicar.
//   · Revertir no borra: reactiva una versión que ya existió. La historia de lo
//     que se le dijo al modelo es justamente lo que explica un cambio de tono
//     tres meses después.
// ---------------------------------------------------------------------------

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { actualizarFeedback, activarInstrucciones, promoverInstrucciones } from '@/app/trabajo/actions';
import { TITULO_SECCION, type SeccionNarrativa } from '@/lib/diagnostico/secciones';

export type Version = {
  version: number;
  texto: string;
  nota: string | null;
  activa: boolean;
  creado_en: string;
  creado_por_nombre: string | null;
};

export type FeedbackFila = {
  id: string;
  diagnostico_id: string;
  seccion: string | null;
  comentario: string;
  instruccion: string | null;
  estado: 'abierto' | 'probado' | 'promovido' | 'descartado';
  promovida_version: number | null;
  creado_en: string;
  persona_id: string | null;
  persona_nombre: string | null;
  prompt_version: string | null;
  instrucciones_version: number | null;
};

type R = { ok: boolean; error?: string; version?: number };

const FILTROS = [
  ['abiertos', 'Sin resolver'],
  ['probados', 'Probados'],
  ['promovidos', 'Publicados'],
  ['descartados', 'Descartados'],
] as const;

type Filtro = (typeof FILTROS)[number][0];

const ESTADO_DE: Record<Filtro, FeedbackFila['estado']> = {
  abiertos: 'abierto',
  probados: 'probado',
  promovidos: 'promovido',
  descartados: 'descartado',
};

const ESTADO_TONO: Record<FeedbackFila['estado'], string> = {
  abierto: 'bg-amber-100 text-amber-800',
  probado: 'bg-cream text-ink',
  promovido: 'bg-lime text-ink',
  descartado: 'bg-gray-100 text-muted',
};

const fechaHora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const nombreSeccion = (s: string | null) =>
  s ? (TITULO_SECCION[s as SeccionNarrativa] ?? s) : 'Todo el documento';

export function RedactorPanel({
  versiones,
  feedback,
  promptVersion,
}: {
  versiones: Version[];
  feedback: FeedbackFila[];
  /** La del prompt base, que vive en el repo y sólo cambia con un deploy. */
  promptVersion: string;
}) {
  const vigente = versiones.find((v) => v.activa) ?? null;

  const [pending, start] = useTransition();
  const [texto, setTexto] = useState(vigente?.texto ?? '');
  const [nota, setNota] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('abiertos');
  const [verHistorial, setVerHistorial] = useState(false);

  const sucio = texto.trim() !== (vigente?.texto ?? '').trim();

  const correr = (fn: () => Promise<R>, exito: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error ?? 'No se pudo');
        return;
      }
      toast.success(exito);
    });

  const conteos = Object.fromEntries(
    FILTROS.map(([k]) => [k, feedback.filter((f) => f.estado === ESTADO_DE[k]).length]),
  ) as Record<Filtro, number>;

  const visibles = feedback.filter((f) => f.estado === ESTADO_DE[filtro]);

  /** Baja una instrucción al editor en vez de publicarla suelta. */
  const bajarAlBloque = (f: FeedbackFila) => {
    const linea = (f.instruccion ?? f.comentario).trim();
    if (texto.includes(linea)) {
      toast.info('Esa instrucción ya está en el bloque');
      return;
    }
    setTexto((t) => (t.trim() ? `${t.trim()}\n\n${linea}` : linea));
    toast.success('Agregada al editor — revísala y publica');
  };

  return (
    <div className="space-y-4">
      {/* ---- El bloque vigente ---- */}
      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold">
            Ajustes vigentes
            {vigente ? (
              <span className="ml-2 rounded-full bg-lime px-2 py-0.5 text-[11px] font-semibold text-ink">
                v{vigente.version}
              </span>
            ) : (
              <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-[11px] font-normal">ninguno</span>
            )}
          </h2>
          <span className="text-xs text-muted">
            prompt base <b>{promptVersion}</b> · sólo cambia con deploy
          </span>
        </div>
        <p className="mb-3 text-xs text-muted">
          Se le pegan al final del prompt base y mandan sobre él. Aplican a todos los diagnósticos
          que genere cualquier asesor, desde el siguiente que se escriba. Publicar{' '}
          <b>reemplaza</b> el bloque completo: lo que borres de aquí deja de aplicar.
          {vigente ? (
            <>
              {' '}
              Vigente desde {fechaHora(vigente.creado_en)}
              {vigente.creado_por_nombre ? ` · ${vigente.creado_por_nombre}` : ''}
              {vigente.nota ? ` · ${vigente.nota}` : ''}.
            </>
          ) : null}
        </p>

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={Math.min(24, Math.max(8, texto.split('\n').length + 2))}
          placeholder="Reglas que corrigen al prompt base. Una por párrafo, en el mismo tono en que le hablarías al modelo."
          className="w-full rounded-lg border border-line px-3 py-2 text-sm leading-relaxed"
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Qué cambia (para el historial)"
            className="min-w-[16rem] flex-1 rounded-lg border border-line px-2 py-1.5 text-sm"
          />
          <button
            disabled={pending || !sucio || texto.trim().length < 5}
            onClick={() =>
              correr(async () => {
                const r = (await promoverInstrucciones(texto, nota || null)) as R;
                if (r.ok) setNota('');
                return r;
              }, 'Publicado para el equipo')
            }
            className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? 'Publicando…' : 'Publicar nueva versión'}
          </button>
          {sucio ? (
            <button
              onClick={() => setTexto(vigente?.texto ?? '')}
              className="text-xs underline text-muted"
            >
              Descartar mis cambios
            </button>
          ) : (
            <span className="text-xs text-muted">Sin cambios frente a lo vigente</span>
          )}
        </div>
      </section>

      {/* ---- La historia ---- */}
      <section className="rounded-2xl border border-line bg-white p-5">
        <button
          onClick={() => setVerHistorial((v) => !v)}
          className="flex w-full items-baseline justify-between gap-2 text-left"
        >
          <h2 className="text-sm font-bold">
            Historial
            <span className="ml-2 rounded-full bg-cream px-2 py-0.5 text-[11px] font-normal">
              {versiones.length} versión{versiones.length === 1 ? '' : 'es'}
            </span>
          </h2>
          <span className="text-xs text-muted">{verHistorial ? 'ocultar' : 'ver'}</span>
        </button>

        {verHistorial ? (
          versiones.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              Todavía no se ha publicado ningún ajuste. El redactor está corriendo con el prompt
              base tal como está en el repo.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {versiones.map((v) => (
                <li key={v.version} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-semibold">
                      v{v.version}
                      {v.activa ? (
                        <span className="ml-2 rounded-full bg-lime px-2 py-0.5 text-[11px]">vigente</span>
                      ) : null}
                      {v.nota ? <span className="ml-2 font-normal text-muted">{v.nota}</span> : null}
                    </span>
                    <span className="text-xs text-muted">
                      {fechaHora(v.creado_en)}
                      {v.creado_por_nombre ? ` · ${v.creado_por_nombre}` : ''}
                    </span>
                  </div>
                  <details className="mt-1 text-xs">
                    <summary className="cursor-pointer text-muted">Ver el texto</summary>
                    <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-cream p-2">{v.texto}</pre>
                  </details>
                  {!v.activa ? (
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      <button
                        disabled={pending}
                        onClick={() =>
                          correr(
                            () => activarInstrucciones(v.version) as Promise<R>,
                            `Vigente otra vez la v${v.version}`,
                          )
                        }
                        className="underline text-muted disabled:opacity-50"
                      >
                        Volver a ésta
                      </button>
                      <button onClick={() => setTexto(v.texto)} className="underline text-muted">
                        Cargarla en el editor
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        ) : null}
      </section>

      {/* ---- Los comentarios acumulados ---- */}
      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-sm font-bold">Comentarios</h2>
          {FILTROS.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFiltro(k)}
              className={`rounded-full border px-3 py-1 text-xs ${
                filtro === k ? 'bg-ink text-white' : 'border-line hover:bg-cream'
              }`}
            >
              {label}
              {conteos[k] > 0 && <span className="ml-1 opacity-70">{conteos[k]}</span>}
            </button>
          ))}
        </div>

        {visibles.length === 0 ? (
          <p className="text-sm text-muted">
            {filtro === 'abiertos'
              ? 'Nada pendiente. Los comentarios se dejan desde la pestaña Diagnóstico de cada expediente.'
              : 'Nada aquí.'}
          </p>
        ) : (
          <ul className="space-y-2">
            {visibles.map((f) => (
              <li key={f.id} className="rounded-xl border border-line p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">
                    {nombreSeccion(f.seccion)}
                    {f.persona_id ? (
                      <Link
                        href={`/trabajo/p/${f.persona_id}?tab=diagnostico`}
                        className="ml-2 font-normal underline text-muted"
                      >
                        {f.persona_nombre?.trim() || 'ver expediente'}
                      </Link>
                    ) : null}
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

                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                  <span>
                    {fechaHora(f.creado_en)}
                    {f.prompt_version ? ` · escrito con ${f.prompt_version}` : ''}
                    {f.instrucciones_version ? ` + v${f.instrucciones_version}` : ''}
                  </span>
                  <button
                    disabled={pending}
                    onClick={() => bajarAlBloque(f)}
                    className="underline disabled:opacity-50"
                  >
                    Bajar al bloque
                  </button>
                  {f.estado !== 'promovido' && vigente ? (
                    <button
                      disabled={pending}
                      onClick={() =>
                        correr(
                          () =>
                            actualizarFeedback({
                              id: f.id,
                              personaId: f.persona_id ?? '',
                              estado: 'promovido',
                              version: vigente.version,
                            }) as Promise<R>,
                          `Marcado como publicado en la v${vigente.version}`,
                        )
                      }
                      className="underline disabled:opacity-50"
                    >
                      Ya quedó en v{vigente.version}
                    </button>
                  ) : null}
                  {f.estado === 'abierto' ? (
                    <button
                      disabled={pending}
                      onClick={() =>
                        correr(
                          () =>
                            actualizarFeedback({
                              id: f.id,
                              personaId: f.persona_id ?? '',
                              estado: 'probado',
                            }) as Promise<R>,
                          'Marcado como probado',
                        )
                      }
                      className="underline disabled:opacity-50"
                    >
                      Marcar probado
                    </button>
                  ) : null}
                  {f.estado === 'descartado' ? (
                    <button
                      disabled={pending}
                      onClick={() =>
                        correr(
                          () =>
                            actualizarFeedback({
                              id: f.id,
                              personaId: f.persona_id ?? '',
                              estado: 'abierto',
                            }) as Promise<R>,
                          'Reabierto',
                        )
                      }
                      className="underline disabled:opacity-50"
                    >
                      Reabrir
                    </button>
                  ) : (
                    <button
                      disabled={pending}
                      onClick={() =>
                        correr(
                          () =>
                            actualizarFeedback({
                              id: f.id,
                              personaId: f.persona_id ?? '',
                              estado: 'descartado',
                            }) as Promise<R>,
                          'Descartado',
                        )
                      }
                      className="underline disabled:opacity-50"
                    >
                      Descartar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
