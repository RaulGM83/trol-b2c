import { requireMiembro, t3 } from '@/lib/trol3/server';
import type { Ficha } from '@/lib/trol3/fichas';
import { FichasBiblioteca } from '@/components/trol3/FichasBiblioteca';
import { FichasBandeja, type PropuestaFicha } from '@/components/trol3/FichasBandeja';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Conocimiento · Trol' };

// 170 · La biblioteca: la versión oficial de Trol de cada tema y de cada oportunidad.
// Leen todos los miembros; edita sólo admin (RLS). Lo mismo que se abre al lado en la asesoría.
export default async function Fichas({ searchParams }: { searchParams: { f?: string } }) {
  const m = await requireMiembro();
  const { data } = await t3().from('fichas').select('codigo,tipo,titulo,oportunidades,orden,frase,cuando_aplica,como_explicarlo,preguntas,documentos,solo_asesor,en_diagnostico,updated_at').eq('activa', true).order('orden');
  const fichas = (data ?? []) as Ficha[];
  // 172 · La bandeja: lo que proponen las reuniones y el equipo, pendiente de aprobar.
  const db = t3();
  const { data: props } = await db.from('fichas_propuestas').select('id,ficha_codigo,pregunta,respuesta,evidencia,origen,created_at,propuesta_por,persona_id').eq('estado', 'pendiente').order('created_at', { ascending: false }).limit(50);
  const filas = (props ?? []) as { id: string; ficha_codigo: string | null; pregunta: string; respuesta: string | null; evidencia: string | null; origen: 'reunion' | 'asesor'; created_at: string; propuesta_por: string | null; persona_id: string | null }[];
  const [{ data: ms }, { data: ps }] = await Promise.all([
    db.from('miembros').select('id,nombre').in('id', Array.from(new Set(filas.map((f) => f.propuesta_por).filter(Boolean))) as string[]),
    db.from('personas').select('id,nombre').in('id', Array.from(new Set(filas.map((f) => f.persona_id).filter(Boolean))) as string[]),
  ]);
  const nom = (xs: unknown, id: string | null) => ((xs ?? []) as { id: string; nombre: string | null }[]).find((x) => x.id === id)?.nombre ?? null;
  const propuestas: PropuestaFicha[] = filas.map((f) => ({ id: f.id, ficha_codigo: f.ficha_codigo, pregunta: f.pregunta, respuesta: f.respuesta, evidencia: f.evidencia, origen: f.origen, created_at: f.created_at, propuesta_por_nombre: nom(ms, f.propuesta_por), persona_nombre: nom(ps, f.persona_id) }));
  const esAdmin = (m.roles ?? []).includes('admin');
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Conocimiento</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Cómo explica Trol cada tema y cada oportunidad. Es lo que se abre al lado durante la asesoría, lo que ve el cliente como “en una frase” y lo que guía al redactor del diagnóstico.</p>
      </div>
      <FichasBandeja propuestas={propuestas} fichas={fichas.map((f) => ({ codigo: f.codigo, titulo: f.titulo }))} puedeDecidir={esAdmin} />
      <FichasBiblioteca fichas={fichas} inicial={searchParams.f ?? null} puedeEditar={esAdmin} />
    </div>
  );
}
