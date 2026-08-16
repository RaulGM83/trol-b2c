// Página de referidos: link personal del cliente + stats.
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { ReferidosView } from '@/components/ReferidosView';

export const dynamic = 'force-dynamic';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.trol.mx';

export default async function ReferidosPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-xl px-5 py-10 text-center">
        <p className="text-sm text-muted">Entra con tu celular para obtener tu link de invitación.</p>
        <Link href="/login" className="mt-4 inline-block rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white">
          Entrar
        </Link>
      </main>
    );
  }

  const { data: cli } = await supabase
    .from('clientes')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  // Código corto y reconocible (<nombre>-<4>); se genera la primera vez.
  let codigo = cli?.id as string | undefined;
  if (cli) {
    const { data: cod } = await supabase.schema('trol3').rpc('codigo_referido', { p_cliente: cli.id });
    if (cod) codigo = cod as string;
  }

  if (!cli) {
    return (
      <main className="mx-auto max-w-xl px-5 py-10 text-center">
        <p className="text-sm text-muted">Tu ficha aún no está lista; en cuanto tengas tu diagnóstico podrás invitar.</p>
        <Link href="/mi" className="mt-4 inline-block rounded-xl bg-ink px-4 py-3 text-sm font-bold text-white">
          Ir a mi expediente
        </Link>
      </main>
    );
  }

  const { data: refs } = await supabase
    .from('referidos')
    .select('puntos_etapa1_otorgados')
    .eq('referrer_cliente_id', cli.id);

  const invitados = refs?.length ?? 0;
  const confirmados = (refs ?? []).filter((r) => r.puntos_etapa1_otorgados).length;

  return (
    <ReferidosView url={`${SITE}/i/${codigo}`} invitados={invitados} confirmados={confirmados} puntos={confirmados * 100} />
  );
}
