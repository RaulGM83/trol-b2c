// Calculadora pública sin CURP (link de Tako para leads fríos nuevos).
// Sin login. Registra la apertura para atribución (?ref=<origen>).
import { createAdminClient } from '@/lib/supabase/admin';
import { CalculadoraEspera } from '@/components/CalculadoraEspera';

export const dynamic = 'force-dynamic';

export default async function CalculaPublica({ searchParams }: { searchParams: { ref?: string } }) {
  const campania = (searchParams.ref ?? 'tako').slice(0, 40);
  try {
    const admin = createAdminClient();
    await admin.from('links_campania').insert({ cliente_id: null, campania, evento: 'calcula' });
  } catch {
    // Atribución best-effort.
  }
  return <CalculadoraEspera publica campania={campania} />;
}
