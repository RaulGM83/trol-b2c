'use client';
// 301 · Camino mínimo (claude/118): Infonavit no respondió en 2 minutos y el aliado tiene al cliente enfrente.
// Captura saldo de vivienda, salario mensual y si está cotizando; con eso sale una propuesta preliminar.
// Cuando Precalix responde, sus cifras mandan.
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { capturarInfonavitPorAliado } from '@/app/aliado/actions';

const inp = 'w-40 rounded-lg border border-line bg-white px-2 py-1 text-xs text-ink';

export function CapturaInfonavit({ persona, desde }: { persona: string; desde: string | null }) {
  const router = useRouter();
  const [saldo, setSaldo] = useState('');
  const [salario, setSalario] = useState('');
  const [cotiza, setCotiza] = useState(true);
  const [pending, start] = useTransition();
  const [faltan, setFaltan] = useState(() => (desde ? Math.max(0, Math.ceil((new Date(desde).getTime() - Date.now()) / 1000)) : 0));
  useEffect(() => {
    if (faltan <= 0) return;
    const t = setInterval(() => setFaltan((f) => { if (f <= 1) { clearInterval(t); router.refresh(); return 0; } return f - 1; }), 1000);
    return () => clearInterval(t);
  }, [faltan > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const num = (s: string) => Number(s.replace(/[^\d.]/g, ''));
  const listo = num(saldo) > 0 && num(salario) > 0;
  const enviar = () => start(async () => {
    const r = await capturarInfonavitPorAliado({ personaId: persona, saldo: num(saldo), salarioMensual: num(salario), cotiza }) as { ok: boolean; error?: string };
    if (!r.ok) { toast.error(r.error ?? 'No se pudo'); return; }
    toast.success('Listo: armamos la propuesta con esos datos.');
    router.refresh();
  });

  if (faltan > 0) {
    return <p className="mt-2 text-xs text-muted">Infonavit suele responder en un par de minutos. Si no responde, en {faltan}s podrás capturar sus datos a mano.</p>;
  }
  return (
    <div className="mt-2 rounded-lg border border-line bg-cream/60 p-2 text-xs">
      <div className="font-semibold">Infonavit no ha respondido. Si tienes al cliente enfrente, captura sus datos y te damos la propuesta preliminar.</div>
      <div className="text-muted">Los dos primeros números vienen en su app Mi Cuenta Infonavit o en su estado de cuenta de AFORE. Cuando Infonavit responda, sus cifras mandan.</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <input value={saldo} onChange={(e) => setSaldo(e.target.value)} inputMode="numeric" placeholder="Saldo de vivienda $" className={inp} />
        <input value={salario} onChange={(e) => setSalario(e.target.value)} inputMode="numeric" placeholder="Salario mensual $" className={inp} />
        <label className="flex items-center gap-1"><input type="checkbox" checked={cotiza} onChange={(e) => setCotiza(e.target.checked)} /> Está cotizando (trabaja con patrón)</label>
        <button disabled={pending || !listo} onClick={enviar} className="rounded-lg bg-ink px-3 py-1 text-xs font-bold text-white disabled:opacity-40">{pending ? 'Guardando…' : 'Armar propuesta'}</button>
      </div>
    </div>
  );
}
