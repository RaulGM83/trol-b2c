import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { waInvitacionBot } from '@/lib/whatsapp';

// Link corto de invitación con marca: app.trol.mx/i/<codigo>.
// Redirige al WhatsApp del bot (Tako) con el mensaje prellenado que trae el
// código de referido. El bot detecta "ref:<codigo>" y registra la atribución.
// Antes de redirigir registramos el clic: sin eso no hay denominador y no se
// puede saber cuánta gente abrió el link contra cuánta llegó a darse de alta.

/**
 * Cuánto esperamos al registro antes de mandar a la persona a WhatsApp.
 * En serverless la función se puede congelar en cuanto devolvemos la respuesta,
 * así que un fire-and-forget se pierde: hay que esperar. Pero el clic vale
 * mucho menos que el redirect, así que la espera es corta y no bloqueante.
 */
const ESPERA_MS = 500;

async function registrarClic(codigo: string, req: Request): Promise<void> {
  if (!codigo) return;
  try {
    const h = req.headers;
    // x-forwarded-for llega como "cliente, proxy1, proxy2": el primero es quien nos visita.
    const ip = (h.get('x-forwarded-for') ?? '').split(',')[0].trim() || h.get('x-real-ip')?.trim() || null;
    // La RPC hashea la IP con sal; nunca se guarda en claro.
    const llamada = createClient().schema('trol3').rpc('registrar_clic', {
      p_codigo: codigo,
      p_user_agent: h.get('user-agent')?.slice(0, 500) ?? null,
      p_referer: h.get('referer')?.slice(0, 500) ?? null,
      p_ip: ip,
    });
    // Si pierde la carrera contra el timeout y truena después, no queremos un
    // rejection sin manejar: la neutralizamos antes de correrla.
    const neutral = Promise.resolve(llamada).then(
      () => undefined,
      () => undefined,
    );
    let reloj: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      reloj = setTimeout(resolve, ESPERA_MS);
    });
    await Promise.race([neutral, timeout]);
    if (reloj) clearTimeout(reloj);
  } catch {
    // Registrar un clic jamás debe romper el redirect.
  }
}

export async function GET(req: Request, { params }: { params: { codigo: string } }) {
  const codigo = (params.codigo ?? '').slice(0, 64);
  await registrarClic(codigo, req);
  return NextResponse.redirect(waInvitacionBot(codigo));
}
