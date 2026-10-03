// /encuesta · Opinión sobre la AFORE (216, claude/97). Vive en trol3: la AFORE ya conocida se
// confirma en vez de preguntarse; la opinión previa se precarga para corregirla.
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { EncuestaAfore, type OpinionPrevia } from '@/components/EncuestaAfore';

export const dynamic = 'force-dynamic';

export default async function EncuestaPage({ searchParams }: { searchParams: { volver?: string } }) {
  // Regreso contextual: quien llega desde el comparativo vuelve a él al terminar.
  const volverHref = searchParams.volver === 'comparativo' ? '/comparativo' : '/mi';
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-xl px-5 py-10 text-center">
        <p className="text-sm text-muted">Entra con tu celular para evaluar tu AFORE.</p>
        <Link href="/login" className="mt-4 inline-block rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white">Entrar</Link>
      </main>
    );
  }

  const t3 = supabase.schema('trol3');
  const [{ data: pid }, { data: previa }] = await Promise.all([
    t3.rpc('current_persona_id'),
    t3.from('opiniones_afore').select('afore,atencion,asesoria,recomendaria,comentario,actualizado_en').maybeSingle(),
  ]);
  // La AFORE que ya tenemos (validada o declarada): RLS deja ver sólo los datos propios.
  const { data: aforeDato } = pid
    ? await t3.from('v_mejor_dato').select('valor').eq('persona_id', pid as string).eq('campo', 'afore_actual').maybeSingle()
    : { data: null };
  const raw = (aforeDato as { valor?: unknown } | null)?.valor;
  const aforeConocida = typeof raw === 'string' ? raw : raw != null ? String(raw) : null;

  return (
    <EncuestaAfore
      aforeConocida={aforeConocida}
      previa={(previa ?? null) as OpinionPrevia}
      volverHref={volverHref}
      puntosYaDados={!!previa}
    />
  );
}
