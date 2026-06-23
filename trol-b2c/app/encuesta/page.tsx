// Encuesta de evaluación de AFORE (otorga puntos + alimenta el comparador).
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { EncuestaAfore } from '@/components/EncuestaAfore';

export const dynamic = 'force-dynamic';

export default async function EncuestaPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-xl px-5 py-10 text-center">
        <p className="text-sm text-muted">Entra con tu celular para evaluar tu AFORE y ganar puntos.</p>
        <Link href="/login" className="mt-4 inline-block rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white">
          Entrar
        </Link>
      </main>
    );
  }

  // Prefill de la respuesta previa (RLS limita a la fila del cliente).
  const { data: prev } = await supabase
    .from('encuesta_afore')
    .select(
      'afore, atencion, asesoria, recomendaria, comentario, infonavit_usado, interes_ahorro, estado, situacion_pensional, horizonte_retiro, situacion_laboral, ahorro_mensual, contacto_canal, contacto_horario',
    )
    .maybeSingle();

  const prefill = prev
    ? {
        afore: prev.afore ?? undefined,
        atencion: prev.atencion ?? undefined,
        asesoria: prev.asesoria ?? undefined,
        recomendaria: prev.recomendaria ?? undefined,
        comentario: prev.comentario ?? undefined,
        infonavit_usado: prev.infonavit_usado,
        interes_ahorro: prev.interes_ahorro,
        estado: prev.estado ?? undefined,
        situacion_pensional: prev.situacion_pensional ?? undefined,
        horizonte_retiro: prev.horizonte_retiro ?? undefined,
        situacion_laboral: prev.situacion_laboral ?? undefined,
        ahorro_mensual: prev.ahorro_mensual ?? undefined,
        contacto_canal: prev.contacto_canal ?? undefined,
        contacto_horario: prev.contacto_horario ?? undefined,
      }
    : undefined;

  return <EncuestaAfore prefill={prefill} />;
}
