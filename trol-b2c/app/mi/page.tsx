import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getPersonaMia, t3, fmtMXN, fmtNum, fmtFecha, CHECK_LABEL, type Any } from '@/lib/trol3/server';
import { MiAcciones, CompletarDatos } from '@/components/trol3/MiAcciones';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mi expediente · Trol' };

const NIVEL_TXT: Record<number, string> = { 1: 'Poner en orden', 2: 'Aprovechar hoy', 3: 'Crecer y proteger' };

export default async function MiExpediente() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/mi');
  const pid = await getPersonaMia();
  if (!pid) return <main className="mx-auto max-w-md px-5 py-10 text-sm">No pudimos vincular tu teléfono con un expediente. Escríbenos por WhatsApp.</main>;
  const { data: x, error } = await t3().rpc('mi_expediente');
  if (error || !x) return <main className="mx-auto max-w-md px-5 py-10 text-sm">Error cargando tu expediente: {error?.message ?? 'sin datos'}. ¿Está expuesto el esquema trol3?</main>;
  const e = x as Any;
  const ck: Any[] = e.checklist ?? [];
  const alertas = ck.filter((c) => c.estado === 'alerta');
  const ops: Any[] = e.oportunidades ?? [];
  const presentadas = ops.filter((o) => ['presentada', 'en_proceso', 'ganada'].includes(o.estado));
  const detectadas = ops.filter((o) => o.estado === 'detectada');
  const datos: Any[] = e.datos ?? [];
  const porGrupo = (g: string) => datos.filter((d) => d.grupo === g);
  const faltan: Any[] = e.campos_por_completar ?? [];
  const progreso = Math.round((100 * datos.length) / Math.max(1, datos.length + faltan.length));

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 pb-24">
      <header className="mb-5 flex items-center justify-between">
        <span className="rounded-lg bg-ink px-2.5 py-1 text-xl font-extrabold tracking-tight text-white">tr<span className="text-lime">o</span>l</span>
        <div className="text-right text-xs text-muted">
          <div>{e.persona?.nombre ?? 'Tu expediente'}</div>
          <div>{e.puntos} puntos · <Link href="/referidos" className="underline">ganar más</Link></div>
        </div>
      </header>

      {/* Resumen */}
      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="text-xs uppercase tracking-wide text-muted">Tu situación hoy</div>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><div className="text-[11px] text-muted">Régimen</div><div className="text-lg font-extrabold">{e.ley ?? '—'}</div></div>
          <div><div className="text-[11px] text-muted">Semanas</div><div className="text-lg font-extrabold">{e.semanas ? fmtNum(e.semanas) : '—'}</div><div className="text-[10px] text-muted">{e.semanas_capa === 'validado' ? 'oficial' : e.semanas_capa === 'declarado' ? 'lo que nos dijiste' : ''}</div></div>
          <div><div className="text-[11px] text-muted">Pensión estimada hoy</div><div className="text-lg font-extrabold">{e.pension_base ? fmtMXN(e.pension_base) : '—'}</div></div>
          <div><div className="text-[11px] text-muted">Pensión máxima posible</div><div className="text-lg font-extrabold text-green-700">{e.pension_maxima ? fmtMXN(e.pension_maxima) : '—'}</div></div>
        </div>
        {!e.ley && <p className="mt-3 rounded-xl bg-cream p-3 text-sm">Aún no tenemos tu información oficial del IMSS. Comparte tu CURP con tu asesor o pide que la busquemos y en minutos verás tus semanas y tu régimen aquí.</p>}
        {e.ley && e.ley_vigente === false && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs">Tu información oficial es de {fmtFecha(e.ley_en)}. Puedes pedir una actualización.</p>}
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-cream"><div className="h-2 bg-lime" style={{ width: `${progreso}%` }} /></div>
        <div className="mt-1 text-[11px] text-muted">Expediente {progreso}% completo</div>
      </section>

      {/* Checklist */}
      <section className="mt-5 rounded-2xl border border-line bg-white p-5">
        <h2 className="text-sm font-bold">Orden de tu situación {alertas.length ? <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">{alertas.length} por atender</span> : null}</h2>
        <ul className="mt-2 space-y-1.5 text-sm">
          {ck.map((c) => (
            <li key={c.item} className="flex items-start gap-2">
              <span className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${c.estado === 'ok' ? 'bg-green-500' : c.estado === 'alerta' ? (c.severidad === 'alta' ? 'bg-red-500' : 'bg-amber-400') : 'bg-gray-200'}`} />
              <span>{CHECK_LABEL[c.item] ?? c.item}{c.estado === 'alerta' && c.detalle ? <span className="text-muted"> · {c.detalle}</span> : c.estado === 'sin_dato' ? <span className="text-muted"> · pendiente</span> : null}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Oportunidades */}
      <section className="mt-5 rounded-2xl border border-line bg-white p-5">
        <h2 className="text-sm font-bold">Tus oportunidades</h2>
        {!ops.length && <p className="mt-2 text-sm text-muted">Cuando tengamos tu información oficial, aquí verás qué puedes hacer para mejorar tu pensión.</p>}
        {presentadas.length ? <div className="mt-2 text-[11px] uppercase tracking-wide text-muted">Recomendadas por tu asesor</div> : null}
        <ul className="mt-1 space-y-2">
          {presentadas.map((o) => <OpCard key={o.id} o={o} destacada />)}
        </ul>
        {detectadas.length ? <div className="mt-3 text-[11px] uppercase tracking-wide text-muted">Detectadas con tu información</div> : null}
        <ul className="mt-1 space-y-2">
          {detectadas.map((o) => <OpCard key={o.id} o={o} />)}
        </ul>
      </section>

      {/* Acciones */}
      <MiAcciones tieneSemilla={!!e.tiene_semilla} cabecera={e.persona?.cabecera?.nombre ?? null} citas={e.citas ?? []} />

      {/* Completar datos */}
      <section className="mt-5 rounded-2xl border border-line bg-white p-5">
        <h2 className="text-sm font-bold">Completa tu expediente</h2>
        <p className="mb-3 text-xs text-muted">Entre más sepamos, mejor te podemos ayudar. Lo que declares se guarda como “tu versión”; si ya tenemos el dato oficial, prevalece el oficial y puedes usar la calculadora para probar escenarios.</p>
        <CompletarDatos campos={faltan.map((c) => ({ campo: c.campo, nombre: c.nombre, tipo: c.tipo, grupo: c.grupo, opciones: c.opciones ?? null }))} />
      </section>

      {/* Datos */}
      <section className="mt-5 rounded-2xl border border-line bg-white p-5">
        <h2 className="text-sm font-bold">Lo que sabemos de ti</h2>
        {[['identidad', 'Identidad'], ['imss', 'IMSS'], ['afore', 'AFORE'], ['infonavit', 'Infonavit'], ['issste', 'ISSSTE'], ['contexto', 'Sobre ti'], ['calculo', 'Cálculos de Trol']].map(([g, l]) => {
          const rows = porGrupo(g);
          if (!rows.length) return null;
          return (
            <div key={g} className="mt-3">
              <div className="text-[11px] uppercase tracking-wide text-muted">{l}</div>
              <table className="w-full text-sm"><tbody>
                {rows.map((d) => (
                  <tr key={d.campo} className="border-t border-line/70">
                    <td className="py-1 text-muted">{d.nombre}</td>
                    <td className="py-1 text-right font-medium">{d.tipo === 'bool' ? (d.valor === true ? 'Sí' : d.valor === false ? 'No' : String(d.valor)) : d.tipo === 'number' ? (/saldo|pension|costo|ingreso|infonavit|salario|expectativa/.test(d.campo) ? fmtMXN(Number(d.valor)) : fmtNum(Number(d.valor))) : d.tipo === 'date' ? fmtFecha(String(d.valor)) : String(d.valor)}</td>
                    <td className="py-1 pl-2 text-right text-[10px] text-muted">{d.capa === 'validado' ? 'oficial' : d.capa === 'calculado' ? 'Trol' : 'tú'}{d.vigente === false ? ' · antiguo' : ''}</td>
                  </tr>
                ))}
              </tbody></table>
            </div>
          );
        })}
      </section>

      {/* Documentos */}
      <section className="mt-5 rounded-2xl border border-line bg-white p-5">
        <h2 className="text-sm font-bold">Tus documentos</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {(e.documentos ?? []).map((d: Any) => (
            <li key={d.id} className="flex items-center justify-between border-t border-line/70 py-1.5">
              <span>{d.nombre ?? d.tipo} <span className="text-xs text-muted">· {fmtFecha(d.fecha)}</span></span>
              {d.url ? <a href={d.url} target="_blank" rel="noreferrer" className="text-xs underline">abrir</a> : <span className="text-xs text-muted">{d.gating === 'pago' ? `Desbloquear ${d.precio ? fmtMXN(d.precio) : ''} (hasta 50% con puntos)` : 'con puntos'}</span>}
            </li>
          ))}
          {!(e.documentos ?? []).length && <li className="text-muted">Aún no hay documentos.</li>}
        </ul>
      </section>

      {(e.interacciones ?? []).length ? (
        <section className="mt-5 rounded-2xl border border-line bg-white p-5">
          <h2 className="text-sm font-bold">Mensajes de tu asesor</h2>
          <ul className="mt-2 space-y-2 text-sm">{(e.interacciones ?? []).map((i: Any, k: number) => <li key={k} className="rounded-lg bg-cream/70 p-2"><div className="text-[11px] text-muted">{fmtFecha(i.fecha)}</div>{i.contenido}</li>)}</ul>
        </section>
      ) : null}
    </main>
  );
}

function OpCard({ o, destacada }: { o: Any; destacada?: boolean }) {
  return (
    <li className={`rounded-xl border p-3 ${destacada ? 'border-lime bg-lime/10' : 'border-line'}`}>
      <div className="flex items-baseline justify-between gap-2">
        <div><span className="mr-1 rounded-full bg-white px-2 py-0.5 text-[10px] text-muted">{NIVEL_TXT[o.nivel] ?? ''}</span><b>{o.nombre}</b></div>
        {o.valor ? <span className="text-sm font-extrabold">{fmtMXN(o.valor)}<span className="text-[10px] font-normal text-muted">/año est.</span></span> : null}
      </div>
      <p className="mt-1 text-xs text-muted">{o.descripcion}</p>
      {o.motivo && <p className="mt-1 text-xs">{o.motivo}</p>}
      {o.faltan?.length ? <p className="mt-1 text-[11px] text-amber-700">Falta: {o.faltan.join(', ')}</p> : null}
      {o.urgencia && <p className="mt-1 text-[11px] text-red-700">Fecha límite: {fmtFecha(o.urgencia)}</p>}
      <div className="mt-2 text-[11px] text-muted">{o.estado === 'presentada' ? 'Tu asesor te la recomendó' : o.estado === 'en_proceso' ? 'En proceso' : o.estado === 'ganada' ? 'Lograda' : 'Habla con tu asesor para confirmarla'}</div>
    </li>
  );
}
