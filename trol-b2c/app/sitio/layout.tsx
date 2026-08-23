import { SitioHeader, SitioFooter } from '@/components/sitio/Chrome';

// Layout del sitio público (trol.mx). Sustituye al CMS de HubSpot.
export default function SitioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <SitioHeader />
      <main>{children}</main>
      <SitioFooter />
    </div>
  );
}
