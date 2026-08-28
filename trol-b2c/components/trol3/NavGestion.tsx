'use client';
// Agrupa las secciones de gestión (Inmuebles, Duplicados, Atribución) en un desplegable
// para despejar la barra de /trabajo. Se cierra al navegar o al hacer clic fuera.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS: [string, string][] = [
  ['/trabajo/proyectos', 'Inmuebles'],
  ['/trabajo/duplicados', 'Duplicados'],
  ['/trabajo/atribucion', 'Atribución'],
];

export function NavGestion() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const activa = ITEMS.some(([h]) => pathname?.startsWith(h));

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const cerrar = (ev: MouseEvent) => { if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} className={`rounded-lg px-2 py-1 hover:bg-cream ${activa ? 'font-semibold' : ''}`}>Gestión ▾</button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-36 rounded-xl border border-line bg-white p-1 shadow-lg">
          {ITEMS.map(([h, l]) => <Link key={h} href={h} className="block rounded-lg px-2 py-1 hover:bg-cream" onClick={() => setOpen(false)}>{l}</Link>)}
        </div>
      )}
    </div>
  );
}
