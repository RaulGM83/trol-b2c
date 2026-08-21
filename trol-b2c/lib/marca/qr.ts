// ============================================================================
// QR con el logotipo de Trol al centro, como SVG (se genera en el servidor).
//
// El brandbook (ver `logo.ts`) pide la versión principal en gris #26282B sobre
// fondos claros, pero el repo solo tiene `LOGO_TROL_BLANCO`, y recolorear está
// explícitamente prohibido. Así que el logo va sobre un BADGE: la blanca sobre
// un recuadro redondeado oscuro, que es la combinación que el brandbook sí
// permite (blanca = fondos oscuros) y la que ya usan el PDF de Infonavit y el
// resumen para WhatsApp.
//
// El QR se genera con corrección de errores 'H' (recupera hasta ~30% del
// símbolo), de modo que el badge tapando el centro no impide la lectura.
// ============================================================================
import QRCode from 'qrcode';
import { LOGO_TROL_BLANCO, LOGO_TROL_RATIO } from './logo';

/** Gris del brandbook (token `ink`). Fondo oscuro válido para la variante blanca. */
export const BADGE_INK = '#26282b';
/** Verde Trol (token `lime`). Ojo: el logo blanco encima queda con muy poco contraste. */
export const BADGE_LIME = '#d1f069';

/** Ancho del logo como fracción del lado del QR. Tope pedido: 20%. */
const LOGO_FRACCION = 0.2;

/**
 * Área de seguridad del brandbook: el margen alrededor del logo equivale al
 * ancho y alto de la palabra "financiero". No tenemos esa medida como dato, y
 * en el lockup esa palabra ocupa aproximadamente un cuarto de la altura total,
 * así que la aproximamos con esa fracción. Si algún día se mide de verdad, este
 * es el único número que hay que corregir.
 */
const AREA_SEGURIDAD = 0.25;

export type OpcionesQr = {
  /** Lado del SVG en px. */
  tam?: number;
  /** Color del recuadro bajo el logo. */
  badge?: string;
  /** Módulos de zona tranquila. El estándar para impresión son 4. */
  margen?: number;
};

/** Escapa lo mínimo para meter un valor dentro de un atributo XML. */
const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Devuelve el SVG del QR con el logotipo incrustado como <image> (data URI).
 * Respeta `LOGO_TROL_RATIO` para no deformar el lockup.
 */
export async function qrConLogo(texto: string, opciones: OpcionesQr = {}): Promise<string> {
  const { tam = 240, badge = BADGE_INK, margen = 2 } = opciones;

  const svg = await QRCode.toString(texto, {
    type: 'svg',
    errorCorrectionLevel: 'H',
    margin: margen,
    width: tam,
  });

  // El SVG de `qrcode` trae el símbolo en unidades de módulo: todo lo que
  // dibujemos encima tiene que ir en ese mismo sistema de coordenadas.
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!vb) return svg; // Formato inesperado: mejor un QR sin logo que uno roto.
  const lado = Number(vb[1]);
  if (!Number.isFinite(lado) || lado <= 0) return svg;

  const logoW = lado * LOGO_FRACCION;
  const logoH = logoW / LOGO_TROL_RATIO;
  const pad = logoH * AREA_SEGURIDAD;
  const cajaW = logoW + pad * 2;
  const cajaH = logoH + pad * 2;
  const cajaX = (lado - cajaW) / 2;
  const cajaY = (lado - cajaH) / 2;

  const encima =
    `<rect x="${cajaX.toFixed(3)}" y="${cajaY.toFixed(3)}" width="${cajaW.toFixed(3)}" height="${cajaH.toFixed(3)}" ` +
    `rx="${(pad * 0.9).toFixed(3)}" fill="${attr(badge)}"/>` +
    `<image href="${attr(LOGO_TROL_BLANCO)}" xlink:href="${attr(LOGO_TROL_BLANCO)}" ` +
    `x="${((lado - logoW) / 2).toFixed(3)}" y="${((lado - logoH) / 2).toFixed(3)}" ` +
    `width="${logoW.toFixed(3)}" height="${logoH.toFixed(3)}" preserveAspectRatio="xMidYMid meet"/>`;

  return svg
    .replace('<svg ', '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ')
    .replace('</svg>', `${encima}</svg>`);
}
