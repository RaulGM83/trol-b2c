// ============================================================================
// Alta de prospecto nuevo: referidos y tráfico nuevo (estado `no_match`).
// El default de un visitante que no reconocemos es REGISTRO, nunca un error:
// el copy "no encontramos tu información" exige que hayamos buscado un
// identificador real (token /e/, teléfono verificado, CURP) y aquí no hay
// ninguno. Ver lib/cliente.ts para la separación no_match / match_sin_historia.
// ============================================================================
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Alta } from '@/components/Alta';
import { getSesionCliente } from '@/lib/cliente';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const soloDigitos = (s: string) => s.replace(/\D/g, '');

export default async function AltaPage({ searchParams }: { searchParams: { rc?: string } }) {
  const jar = cookies();
  // Código del referidor: la URL primero (sobrevive al navegador in-app de
  // WhatsApp), la cookie como respaldo.
  const rc = (searchParams.rc || jar.get('trol_ref')?.value || '').slice(0, 64);

  const sesion = await getSesionCliente();
  // Ya lo conocemos (con o sin semilla): su diagnóstico decide qué ve.
  if (sesion.autenticado && sesion.motivo !== 'no_match') redirect('/diagnostico');

  // Si ya verificó su celular en este dispositivo, el alta arranca en el CURP.
  let telVerificado = '';
  if (sesion.autenticado) {
    const {
      data: { user },
    } = await createClient().auth.getUser();
    telVerificado = soloDigitos(user?.phone ?? '').slice(-10);
  }

  return (
    <Alta
      rc={rc}
      autenticado={sesion.autenticado}
      telVerificado={telVerificado}
      enviada={jar.get('trol_alta')?.value === '1'}
    />
  );
}
