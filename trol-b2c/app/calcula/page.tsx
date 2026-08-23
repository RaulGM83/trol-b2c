// Calculadora pública sin CURP (link de Tako para leads fríos nuevos).
// Sin login. Registra la apertura para atribución (?ref=<origen>).
// Lleva el chrome del sitio (header/footer) para que se sienta parte de trol.mx.
import { createAdminClient } from '@/lib/supabase/admin';
import { CalculadoraEspera } from '@/components/CalculadoraEspera';
import { SitioHeader, SitioFooter } from '@/components/sitio/Chrome';

export const dynamic = 'force-dynamic';

export default async function CalculaPublica({ searchParams }: { searchParams: { ref?: string } }) {
  const campania = (searchParams.ref ?? 'tako').slice(0, 40);
  try {
    const admin = createAdminClient();
    await admin.from('links_campania').insert({ cliente_id: null, campania, evento: 'calcula' });
  } catch {
    // Atribución best-effort.
  }
  return (
    <div className="min-h-screen bg-cream text-ink">
      <SitioHeader />
      <CalculadoraEspera publica campania={campania} />
      <SitioFooter />
    </div>
  );
}
