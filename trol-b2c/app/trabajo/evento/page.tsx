import { requireMiembro, t3, type Any } from '@/lib/trol3/server';
import { qrConLogo } from '@/lib/marca/qr';
import { waInvitacionBot } from '@/lib/whatsapp';
import { EventoAlta, type Registrado } from '@/components/trol3/EventoAlta';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Evento · Trol equipo' };

// 179 · Trol en un evento, desde el teléfono. Registras a la persona en un pasillo (nombre,
// WhatsApp, CURP), la consulta al IMSS arranca sola, y le enseñas su cuenta: QR con su acceso
// directo (lo escanea y entra en SU teléfono, sin WhatsApp de por medio) y QR al chat con
// Lukas (abre la ventana de 24 h). Lo que registras queda atribuido al código del evento.
export default async function Evento({ searchParams }: { searchParams: { c?: string } }) {
  await requireMiembro();
  const db = t3();
  const { data: eventos } = await db.from('codigos_invitacion').select('codigo,etiqueta').eq('tipo', 'evento').eq('activo', true).order('created_at', { ascending: false });
  const lista = ((eventos ?? []) as { codigo: string; etiqueta: string | null }[]);
  const codigo = lista.find((e) => e.codigo === searchParams.c)?.codigo ?? lista[0]?.codigo ?? null;
  if (!codigo) return <p className="text-sm text-muted">No hay ningún evento activo. Crea un código de invitación de tipo «evento».</p>;
  const etiqueta = lista.find((e) => e.codigo === codigo)?.etiqueta ?? codigo;
  const { data: regs } = await db.rpc('evento_registrados', { p_codigo: codigo, p_limit: 100 });
  const waUrl = waInvitacionBot(codigo);
  const qrChat = await qrConLogo(waUrl, { tam: 640 });
  return <EventoAlta codigo={codigo} etiqueta={etiqueta} eventos={lista} registrados={(regs ?? []) as Registrado[]} qrChat={qrChat} waUrl={waUrl} />;
}
