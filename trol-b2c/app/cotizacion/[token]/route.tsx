/**
 * 289 · Imagen pública y temporal de la cotización inicial Infonavit (la manda el bot por WhatsApp).
 * La liga es /cotizacion/<token>.png; el token caduca a los 30 días (trol3.links_cotizacion).
 */
import { t3admin, type Any } from '@/lib/trol3/server';
import { cargarCotizacionInicial } from '@/lib/infonavit/cotizacion-inicial-server';
import { imagenCotizacion } from '@/lib/infonavit/cotizacion-png';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const token = params.token.replace(/\.png$/i, '');
  if (!/^[a-f0-9]{24}$/.test(token)) return new Response('No encontrado', { status: 404 });
  const db = t3admin();
  const { data: l } = await db.from('links_cotizacion').select('persona_id,expira_en').eq('token', token).maybeSingle();
  if (!l || new Date((l as Any).expira_en) < new Date()) return new Response('Esta liga ya no está disponible', { status: 404 });
  const c = await cargarCotizacionInicial((l as Any).persona_id, { db, voz: 'trol' });
  if (!c.ok) return new Response('No disponible', { status: 404 });
  return imagenCotizacion(c);
}
