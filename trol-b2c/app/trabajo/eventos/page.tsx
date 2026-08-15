import Link from 'next/link';
import { requireMiembro, t3, fmtFecha, type Any } from '@/lib/trol3/server';

export const dynamic = 'force-dynamic';

const LABEL: Record<string, string> = {
  persona_alta: 'Alta', persona_reingreso: 'Reingreso', dato_nuevo: 'Dato nuevo', consulta_solicitada: 'Consulta solicitada', consulta_completada: 'Consulta completada', consulta_sin_resultado: 'Consulta sin resultado', consulta_error: 'Consulta con error',
  oportunidad_detectada: 'Oportunidad detectada', oportunidad_presentada: 'Oportunidad presentada', oportunidad_en_proceso: 'Oportunidad en proceso', oportunidad_ganada: 'Oportunidad ganada', oportunidad_perdida: 'Oportunidad perdida', handoff: 'Pide humano', cabecera_asignada: 'Cabecera asignada', orden_pagada: 'Pago', orden_cumplida: 'Orden cumplida', cita_creada: 'Cita',
};

export default async function Actividad({ searchParams }: { searchParams: { tipo?: string } }) {
  await requireMiembro();
  const db = t3();
  let q = db.from('eventos').select('id,tipo,actor_tipo,payload,created_at,persona_id,personas(nombre,apellidos)').order('id', { ascending: false }).limit(150);
  if (searchParams.tipo) q = q.eq('tipo', searchParams.tipo); else q = q.neq('tipo', 'dato_nuevo');
  const { data, error } = await q;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <h1 className="mr-3 text-xl font-extrabold">Actividad</h1>
        {['', 'handoff', 'persona_alta', 'consulta_completada', 'oportunidad_presentada', 'orden_pagada', 'dato_nuevo'].map((t) => (
          <Link key={t} href={t ? `/trabajo/eventos?tipo=${t}` : '/trabajo/eventos'} className={`rounded-full border px-3 py-1 ${(searchParams.tipo ?? '') === t ? 'bg-ink text-white' : ''}`}>{t ? LABEL[t] ?? t : 'Todo (sin datos)'}</Link>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error.message}</p>}
      <ul className="divide-y divide-line rounded-2xl border border-line bg-white text-sm">
        {(data ?? []).map((e: Any) => (
          <li key={e.id} className="flex flex-wrap items-baseline gap-2 px-4 py-2">
            <span className="w-28 shrink-0 text-xs text-muted">{fmtFecha(e.created_at)} {new Date(e.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
            <span className="rounded-full bg-cream px-2 py-0.5 text-xs">{LABEL[e.tipo] ?? e.tipo}</span>
            {e.persona_id && <Link href={`/trabajo/p/${e.persona_id}`} className="font-semibold hover:underline">{e.personas?.nombre ?? '(sin nombre)'} {e.personas?.apellidos ?? ''}</Link>}
            <span className="text-xs text-muted">{e.actor_tipo} · {Object.entries(e.payload ?? {}).filter(([k]) => !['consulta_id', 'oportunidad_id', 'orden_id'].includes(k)).map(([k, v]) => `${k}: ${v}`).join(' · ')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
