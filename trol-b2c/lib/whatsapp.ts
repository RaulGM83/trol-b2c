// Enlaces a WhatsApp (Tako) con mensajes prellenados. Número en .env.local.
const WHATSAPP_TROL = process.env.NEXT_PUBLIC_WHATSAPP_TROL || '5215555555555';

export function waLink(mensaje: string): string {
  return `https://wa.me/${WHATSAPP_TROL}?text=${encodeURIComponent(mensaje)}`;
}

export const WA = {
  dudas: () => waLink('Hola, tengo dudas sobre mi diagnóstico de pensión en El Trol.'),
  agendar: () => waLink('Hola, quiero agendar una asesoría de pensión con El Trol.'),
  hoja: () =>
    waLink('Hola, no pudieron traer mi historial del IMSS. Les envío mi Reporte de Semanas Cotizadas para mi diagnóstico de pensión.'),
  // Tras pagar la sesión 1:1: el cliente nos pide el horario por WhatsApp.
  agendarSesion: () =>
    waLink('Hola, ya pagué mi Diagnóstico avanzado + sesión en El Trol y quiero agendar mi videollamada 1:1.'),
};

// Calendario externo (Calendly/booking) para auto-agendar la sesión pagada.
// Configurable en .env.local; si no está, solo mostramos la opción de WhatsApp.
export const BOOKING_URL = process.env.NEXT_PUBLIC_BOOKING_URL || '';

// Mensaje para que el cliente comparta su link de referido por WhatsApp.
export function waCompartirReferido(url: string): string {
  const msg =
    `Te comparto El Trol para calcular tu pensión del IMSS 🧮 Yo ya vi la mía. ` +
    `Entra con mi invitación y los dos ganamos puntos: ${url}`;
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}
