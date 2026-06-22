import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'El Trol · Tu diagnóstico de pensión',
  description: 'Conoce tu pensión y tu mejor jugada. Sin coyotes, sin anticipos.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
