// Lo que comparten el PDF y el PNG del material del aliado: su liga y su QR,
// armados desde la sesión del aliado (nunca desde un parámetro de la URL:
// cada aliado solo puede bajar el suyo).
import QRCode from 'qrcode';
import { requireAliado } from '@/lib/trol3/server';

export async function materialDelAliado() {
  const a = await requireAliado();
  if (!a.codigo) return null;
  const sitio = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.trol.mx';
  const link = `${sitio}/i/${a.codigo}`;
  const linkCorto = link.replace(/^https?:\/\//, '');
  const qr = await QRCode.toDataURL(link, { margin: 1, width: 480, color: { dark: '#26282B', light: '#FFFFFF' } });
  return { nombre: a.nombre, empresa: a.empresa, codigo: a.codigo, link, linkCorto, qr };
}

export const archivoBase = (codigo: string) => `trol-${codigo}`;
