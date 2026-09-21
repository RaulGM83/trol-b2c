import { requireMiembro, t3 } from '@/lib/trol3/server';
import type { Ficha } from '@/lib/trol3/fichas';
import { FichasBiblioteca } from '@/components/trol3/FichasBiblioteca';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Conocimiento · Trol' };

// 170 · La biblioteca: la versión oficial de Trol de cada tema y de cada oportunidad.
// Leen todos los miembros; edita sólo admin (RLS). Lo mismo que se abre al lado en la asesoría.
export default async function Fichas({ searchParams }: { searchParams: { f?: string } }) {
  const m = await requireMiembro();
  const { data } = await t3().from('fichas').select('codigo,tipo,titulo,oportunidades,orden,frase,cuando_aplica,como_explicarlo,preguntas,documentos,solo_asesor,en_diagnostico,updated_at').eq('activa', true).order('orden');
  const fichas = (data ?? []) as Ficha[];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold">Conocimiento</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Cómo explica Trol cada tema y cada oportunidad. Es lo que se abre al lado durante la asesoría, lo que ve el cliente como “en una frase” y lo que guía al redactor del diagnóstico.</p>
      </div>
      <FichasBiblioteca fichas={fichas} inicial={searchParams.f ?? null} puedeEditar={(m.roles ?? []).includes('admin')} />
    </div>
  );
}
