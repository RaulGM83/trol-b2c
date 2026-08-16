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
  // Alta manual: el cliente descarga su Reporte de Semanas (constancia) del IMSS
  // y nos lo manda por WhatsApp para armar su diagnóstico.
  altaConstancia: () =>
    waLink('Hola, les mando mi Reporte de Semanas Cotizadas (constancia) del IMSS para mi diagnóstico de pensión.'),
  // Negativa de pensión: el cliente vio que aún no cumple requisitos y quiere
  // revisar opciones (recuperar semanas, Modalidad 40, etc.) con un experto.
  negativaLey73: () =>
    waLink('Hola, vi mi diagnóstico Ley 73 y todavía no cumplo los requisitos de pensión. Quiero revisar mis opciones con un experto.'),
  negativaLey97: () =>
    waLink('Hola, vi mi diagnóstico Ley 97 y todavía no cumplo los requisitos de pensión. Quiero revisar mis opciones con un experto.'),
  // Tras pagar la sesión 1:1: el cliente nos pide el horario por WhatsApp.
  agendarSesion: () =>
    waLink('Hola, ya pagué mi Diagnóstico avanzado + sesión en El Trol y quiero agendar mi videollamada 1:1.'),
  // Asesoría básica gratuita: el paso humano después del diagnóstico.
  asesoriaBasica: () =>
    waLink('Hola, ya vi mi diagnóstico en app.trol.mx y quiero mi asesoría básica gratuita para entender mi mejor siguiente paso.'),
  // Compara Afore — unlock v1: el cliente manda su estado de cuenta por chat y
  // el equipo captura el saldo manualmente (el parser automático es F2).
  comparaAfore: () =>
    waLink(
      'Hola, vi mi comparativo de AFORE en app.trol.mx y quiero el siguiente paso: comparar contra mi saldo real (les mando mi estado de cuenta), localizar mi AFORE o actualizar mis datos.',
    ),
  // Traspaso a SURA (aliado): la conversión estrella del comparativo.
  traspasoSura: () =>
    waLink(
      'Hola, vi mi comparativo de AFORE en app.trol.mx y quiero cambiarme a SURA. ¿Me ayudan con el trámite?',
    ),
  // Espera de SPEI: el cliente se lleva los datos completos a su WhatsApp.
  // Incluye TODO el contexto para que el bot/asesor pueda ayudar: producto,
  // monto, CLABE, beneficiario (Mercado Pago, el procesador de pagos de El
  // Trol) y el comprobante con los datos oficiales.
  claveSpei: (args: {
    clabe: string | null;
    monto: number;
    referencia: string;
    producto: string;
    voucherUrl: string | null;
  }) =>
    waLink(
      `Hola, estoy pagando "${args.producto}" en El Trol por transferencia SPEI y quiero mis datos a la mano:\n` +
        `• Monto exacto: $${args.monto} MXN\n` +
        (args.clabe ? `• CLABE: ${args.clabe}\n` : '') +
        `• El beneficiario aparecerá como *Mercado Pago* (o STP) — es el procesador de pagos de El Trol, es correcto.\n` +
        (args.voucherUrl ? `• Ficha oficial con los datos: ${args.voucherUrl}\n` : '') +
        `• Referencia de mi orden: ${args.referencia.slice(0, 8)}\n` +
        `Mi acceso se activa solo unos minutos después de transferir.`,
    ),
};

// Calendario externo (Calendly/booking) para auto-agendar la sesión pagada.
// Configurable en .env.local; si no está, solo mostramos la opción de WhatsApp.
export const BOOKING_URL = process.env.NEXT_PUBLIC_BOOKING_URL || '';

// Link de invitación que abre el WhatsApp del bot (Tako) con el código de
// referido en el texto. El bot detecta "ref:<codigo>" en el primer mensaje y
// registra la atribución. `codigo` = id legacy del cliente que refiere.
export function waInvitacionBot(codigo: string): string {
  const msg = `Hola, quiero ver mi pensión del IMSS con Trol 🧮 ref:${codigo}`;
  return `https://wa.me/${WHATSAPP_TROL}?text=${encodeURIComponent(msg)}`;
}

// Mensaje para que el cliente comparta su invitación por WhatsApp. `invitacion`
// es el link waInvitacionBot (abre el bot con el código).
export function waCompartirReferido(invitacion: string): string {
  const msg =
    `Te comparto El Trol para ver y mejorar tu pensión del IMSS 🧮 Yo ya vi la mía. ` +
    `Entra con mi invitación por WhatsApp y los dos ganamos puntos: ${invitacion}`;
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}
