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
};
