'use client';
// 313 · Revisión de un artículo o guía antes de publicarlo. Se guarda primero y
// se publica después: publicar toma lo último guardado.
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { guardarContenido, cambiarEstadoContenido } from '@/app/trabajo/contenido/actions';
import type { Contenido, Pregunta } from '@/lib/blog/contenido';

const campo = 'w-full rounded-lg border border-line px-3 py-2 text-sm';
const etiqueta = 'mb-1 block text-xs font-semibold text-muted';
const aFecha = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }) : '');

export function ContenidoEditor({ c, admin, urlPublica }: { c: Contenido; admin: boolean; urlPublica: string | null }) {
  const router = useRouter();
  const [pend, start] = useTransition();
  const [titulo, setTitulo] = useState(c.titulo);
  const [resumen, setResumen] = useState(c.resumen);
  const [cuerpo, setCuerpo] = useState(c.cuerpo_md);
  const [autor, setAutor] = useState(c.autor);
  const [slug, setSlug] = useState(c.slug);
  const [codigo, setCodigo] = useState(c.codigo_atribucion ?? '');
  const [actualizado, setActualizado] = useState(aFecha(c.actualizado_en));
  const [preguntas, setPreguntas] = useState<Pregunta[]>(c.preguntas ?? []);
  const [sucio, setSucio] = useState(false);

  const publicado = c.estado === 'publicado';
  const puedeEditar = !publicado || admin;
  const cambia = <T,>(set: (v: T) => void) => (v: T) => { set(v); setSucio(true); };

  const guardar = () =>
    start(async () => {
      const r = await guardarContenido(c.id, { titulo, resumen, cuerpo_md: cuerpo, autor, slug, codigo_atribucion: codigo, actualizado_en: actualizado, preguntas });
      if (!r.ok) { toast.error(r.error); return; }
      setSucio(false);
      toast.success('Guardado');
      router.refresh();
    });

  const estado = (nuevo: 'publicado' | 'borrador') =>
    start(async () => {
      if (sucio) { toast.error('Guarda los cambios antes de publicar.'); return; }
      const r = await cambiarEstadoContenido(c.id, nuevo);
      if (!r.ok) { toast.error(r.error); return; }
      toast.success(nuevo === 'publicado' ? 'Publicado. Aparece en el sitio en unos minutos.' : 'Regresó a borrador y salió del sitio.');
      router.refresh();
    });

  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${publicado ? 'bg-lime text-ink' : 'bg-cream text-ink'}`}>{publicado ? 'Publicado' : 'Borrador'}</span>
        <span className="text-xs text-muted">{c.tipo === 'guia' ? 'Guía' : 'Artículo'} · {c.pilar}</span>
        {c.requiere_revision_legal ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Requiere revisión de fondo antes de publicar</span> : null}
        {publicado && urlPublica ? <a href={urlPublica} target="_blank" rel="noopener" className="text-xs underline">Ver en el sitio</a> : null}
        <div className="ml-auto flex gap-2">
          {puedeEditar ? <button onClick={guardar} disabled={pend || !sucio} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold disabled:opacity-40">Guardar</button> : null}
          {admin && !publicado ? <button onClick={() => estado('publicado')} disabled={pend} className="rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40">Publicar</button> : null}
          {admin && publicado ? <button onClick={() => estado('borrador')} disabled={pend} className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold disabled:opacity-40">Regresar a borrador</button> : null}
        </div>
      </div>
      {c.notas ? <p className="mt-3 rounded-lg bg-cream p-3 text-sm"><span className="font-semibold">Notas de quien lo redactó:</span> {c.notas}</p> : null}
      {!admin ? <p className="mt-3 text-xs text-muted">Puedes corregir el borrador. Publicar le toca a un administrador.</p> : null}

      <fieldset disabled={!puedeEditar || pend} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className={etiqueta}>Título</span><input className={campo} value={titulo} onChange={(e) => cambia(setTitulo)(e.target.value)} /></label>
        <label className="sm:col-span-2"><span className={etiqueta}>Resumen (aparece en el blog, en buscadores y al inicio del artículo)</span><textarea className={campo} rows={2} value={resumen} onChange={(e) => cambia(setResumen)(e.target.value)} /></label>
        <label><span className={etiqueta}>Dirección (slug)</span><input className={campo} value={slug} onChange={(e) => cambia(setSlug)(e.target.value)} /></label>
        <label><span className={etiqueta}>Autor</span><input className={campo} value={autor} onChange={(e) => cambia(setAutor)(e.target.value)} /></label>
        <label><span className={etiqueta}>Código de atribución del botón a WhatsApp</span><input className={campo} value={codigo} placeholder="blog" onChange={(e) => cambia(setCodigo)(e.target.value)} /></label>
        <label><span className={etiqueta}>Fecha de actualización visible</span><input type="date" className={campo} value={actualizado} onChange={(e) => cambia(setActualizado)(e.target.value)} /></label>
        <label className="sm:col-span-2"><span className={etiqueta}>Cuerpo (Markdown)</span><textarea className={`${campo} font-mono`} rows={18} value={cuerpo} onChange={(e) => cambia(setCuerpo)(e.target.value)} /></label>
        <div className="sm:col-span-2">
          <span className={etiqueta}>Preguntas frecuentes</span>
          <div className="space-y-3">
            {preguntas.map((q, i) => (
              <div key={i} className="rounded-lg border border-line p-3">
                <input className={campo} placeholder="Pregunta" value={q.pregunta} onChange={(e) => cambia(setPreguntas)(preguntas.map((x, j) => (j === i ? { ...x, pregunta: e.target.value } : x)))} />
                <textarea className={`${campo} mt-2`} rows={2} placeholder="Respuesta" value={q.respuesta} onChange={(e) => cambia(setPreguntas)(preguntas.map((x, j) => (j === i ? { ...x, respuesta: e.target.value } : x)))} />
                <button type="button" className="mt-1 text-xs text-muted underline" onClick={() => cambia(setPreguntas)(preguntas.filter((_, j) => j !== i))}>Quitar</button>
              </div>
            ))}
            <button type="button" className="rounded-lg border border-line px-3 py-1.5 text-xs font-semibold" onClick={() => cambia(setPreguntas)([...preguntas, { pregunta: '', respuesta: '' }])}>Agregar pregunta</button>
          </div>
        </div>
      </fieldset>
      {sucio ? <p className="mt-3 text-xs text-amber-800">Hay cambios sin guardar; la vista previa muestra lo último guardado.</p> : null}
    </section>
  );
}
