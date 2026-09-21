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

// El taller del redactor le cambia el texto a todos los diagnósticos que se
// generen después, así que sólo lo ve quien puede entrar (117). El RLS ya lo
// impide en la base; esto es para no enseñar una puerta que no abre.
const ITEMS_ADMIN: [string, string][] = [['/trabajo/redactor', 'Redactor']];

// Fase 5 · "Negocio": cómo va la operación y el embudo. Lo ve todo el equipo.
const ITEMS_NEGOCIO: [string, string][] = [
  ['/trabajo/hoy', 'Operación'],
  ['/trabajo/lista', 'Oportunidades'],
  ['/trabajo/embudo', 'Embudo'],
  ['/trabajo/embudo-mi', 'Embudo de /mi'],
  ['/trabajo/eventos', 'Actividad'],
  ['/trabajo/personas', 'Todos los clientes'],
];

export function NavNegocio({ aviso = 0 }: { aviso?: number }) {
  return <NavDesplegable titulo="Negocio" items={ITEMS_NEGOCIO} aviso={aviso} />;
}

export function NavGestion({ admin = false }: { admin?: boolean }) {
  return <NavDesplegable titulo="Gestión" items={admin ? [...ITEMS, ...ITEMS_ADMIN] : ITEMS} />;
}

function NavDesplegable({ titulo, items, aviso = 0 }: { titulo: string; items: [string, string][]; aviso?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const activa = items.some(([h]) => pathname?.startsWith(h));

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const cerrar = (ev: MouseEvent) => { if (ref.current && !ref.current.contains(ev.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} className={`rounded-lg px-2 py-1 hover:bg-cream ${activa ? 'font-semibold' : ''}`}>{titulo}{aviso > 0 ? <span className="ml-1 rounded-full bg-lime px-1.5 text-[10px] font-bold text-ink">{aviso}</span> : null} ▾</button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-xl border border-line bg-white p-1 shadow-lg">
          {items.map(([h, l]) => <Link key={h} href={h} className="block rounded-lg px-2 py-1 hover:bg-cream" onClick={() => setOpen(false)}>{l}</Link>)}
        </div>
      )}
    </div>
  );
}
