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
  // Alta de prospecto nuevo (/alta): no hubo búsqueda fallida que reportar,
  // simplemente prefiere mandar su constancia en vez de dar su CURP.
  altaConstancia: () =>
    waLink('Hola, me estoy registrando en El Trol y prefiero enviarles mi Reporte de Semanas Cotizadas en vez de mi CURP para que armen mi diagnóstico de pensión.'),
  // Tras pagar la sesión 1:1: el cliente nos pide el horario por WhatsApp.
  agendarSesion: () =>
    waLink('Hola, ya pagué mi Diagnóstico avanzado + sesión en El Trol y quiero agendar mi videollamada 1:1.'),
  // Negativa de pensión Ley 97: el caso NO es autoservicio. Necesita asesor
  // para revisar semanas no reconocidas y armar la ruta de cotización.
  // En Ley 97 no aplica la Modalidad 40 (es de la fórmula de Ley 73): las vías
  // son cotizar con un empleador o pagar la Modalidad 10 por cuenta propia.
  negativaLey97: () =>
    waLink(
      'Hola, vi en app.trol.mx que con mis semanas actuales el IMSS me negaría la pensión (Ley 97). Quiero revisar mi caso: cuántas semanas me faltan, si hay periodos que no me están contando y cómo completarlas cotizando con un empleador o con Modalidad 10.',
    ),
  // Negativa Ley 73: casi siempre es conservación de derechos (Art. 150/151),
  // que se resuelve reactivando. Requiere asesor para armar la ruta.
  negativaLey73: () =>
    waLink(
      'Hola, vi en app.trol.mx que hoy no podría pensionarme por Ley 73. Quiero revisar mi caso: si es por semanas o por conservación de derechos, cuánto tengo que cotizar para reactivarlos y qué me conviene más.',
    ),
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

// Mensaje para que el cliente comparta su link de referido por WhatsApp.
export function waCompartirReferido(url: string): string {
  const msg =
    `Te comparto El Trol para calcular tu pensión del IMSS 🧮 Yo ya vi la mía. ` +
    `Entra con mi invitación y los dos ganamos puntos: ${url}`;
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}
