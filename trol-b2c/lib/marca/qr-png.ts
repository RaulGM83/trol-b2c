// ============================================================================
// Rasterizado del QR a PNG. Va en el NAVEGADOR a propósito: el servidor no
// tiene rasterizador (ni sharp ni resvg), y el canvas del navegador hace el
// trabajo sin sumar dependencias.
//
// Para imprenta hacen falta los dos formatos: el SVG es lo que prefiere
// cualquier imprenta, pero no todas digieren un <image> con data URI embebido,
// y eso no se descubre el día del cierre.
// ============================================================================

/** Nombre de archivo estable para descargas: trol-qr-<codigo>.<ext> */
export const nombreArchivoQr = (codigo: string, ext: 'svg' | 'png') =>
  `trol-qr-${codigo.replace(/[^a-zA-Z0-9_-]/g, '')}.${ext}`;

/**
 * Fija el tamaño intrínseco del SVG sin tocar el viewBox.
 *
 * MEDIDO: en Chrome esto NO cambia la nitidez. `drawImage(img, 0, 0, 2048, 2048)`
 * sobre un SVG declarado a 240 px ya rasteriza vectorialmente al tamaño de
 * destino — comparando ambos caminos sale exactamente el mismo 0.91% de píxeles
 * de gris intermedio. Se conserva de todos modos porque deja explícito el tamaño
 * al que se quiere rasterizar y no todos los motores tratan igual el tamaño
 * intrínseco de un SVG cargado en un <img>.
 *
 * El `[^>]*?` acota la sustitución a la etiqueta <svg> de apertura: dentro del
 * documento hay otro width/height, el del <image> del logotipo, que no se toca.
 */
export function escalarSvg(svg: string, lado: number): string {
  return svg.replace(/(<svg[^>]*?)width="[\d.]+" height="[\d.]+"/, `$1width="${lado}" height="${lado}"`);
}

export const svgABlob = (svg: string) => new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });

/** Rasteriza el SVG a un PNG cuadrado de `lado` px. Solo navegador. */
export async function svgAPng(svg: string, lado: number): Promise<Blob> {
  const url = URL.createObjectURL(svgABlob(escalarSvg(svg, lado)));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('No se pudo leer el SVG.'));
      img.src = url;
    });
    const lienzo = document.createElement('canvas');
    lienzo.width = lado;
    lienzo.height = lado;
    const ctx = lienzo.getContext('2d');
    if (!ctx) throw new Error('Este navegador no da canvas 2D.');
    // Fondo explícito: un PNG con alfa sobre papel de color arruinaría el contraste.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, lado, lado);
    ctx.drawImage(img, 0, 0, lado, lado);
    const blob = await new Promise<Blob | null>((resolve) => lienzo.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('El navegador no pudo generar el PNG.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Dispara la descarga de un blob con el nombre dado. */
export function descargar(nombre: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revocar de inmediato cancela la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
