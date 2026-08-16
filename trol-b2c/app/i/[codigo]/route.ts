import { NextResponse } from 'next/server';
import { waInvitacionBot } from '@/lib/whatsapp';

// Link corto de invitación con marca: app.trol.mx/i/<codigo>.
// Redirige al WhatsApp del bot (Tako) con el mensaje prellenado que trae el
// código de referido. El bot detecta "ref:<codigo>" y registra la atribución.
export function GET(_req: Request, { params }: { params: { codigo: string } }) {
  return NextResponse.redirect(waInvitacionBot(params.codigo));
}
