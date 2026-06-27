import type { Metadata } from 'next';
import './globals.css';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.trol.mx';
const OG_TITLE = '¿Cuánto te tocaría de pensión del IMSS?';
const OG_DESC = 'Calcula tu pensión y mira tu mejor jugada con El Trol. Estimación con cifra puntual, en minutos.';

// OpenGraph + Twitter para que los links compartidos (referidos, /calcula) se
// rendericen como tarjeta con imagen+título en WhatsApp, Messenger, etc.
// Requiere el archivo /public/og.png (1200x630). Páginas específicas pueden
// sobrescribir `metadata` (p. ej. /calcula).
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'El Trol · Tu diagnóstico de pensión',
  description: OG_DESC,
  openGraph: {
    type: 'website',
    locale: 'es_MX',
    siteName: 'El Trol',
    title: OG_TITLE,
    description: OG_DESC,
    url: SITE_URL,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'El Trol · Calcula tu pensión' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: OG_TITLE,
    description: OG_DESC,
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
