import { requireMiembro, type Any } from '@/lib/trol3/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Embudo de /mi · Trol equipo' };

// Fase 5 · La vara de la cuenta del cliente (162): por semana y en PERSONAS — a quién le llegó su link,
// quién lo abrió y quién hizo algo adentro. La vista está cerrada a `authenticated`, por eso se lee
// con el cliente de servicio DESPUÉS de comprobar que quien pide es miembro.
export default async function EmbudoMi() {
  await requireMiembro();
  const { data, error } = await createAdminClient().schema('trol3').from('v_embudo_mi').select('*').order('semana', { ascending: false }).limit(16);
  const filas = (data ?? []) as Any[];
  const COLS: [string, string][] = [['recibieron', 'Recibieron link'], ['abrieron', 'Abrieron'], ['capturaron', 'Capturaron'], ['subieron', 'Subieron doc'], ['pidieron', 'Pidieron consulta'], ['al_chat', 'Fueron al chat'], ['actuaron', 'Actuaron']];
  return (
    <section className="space-y-4">
      <div><h1 className="text-xl font-extrabold">Embudo de la cuenta del cliente</h1><p className="mt-1 max-w-2xl text-sm text-muted">Por semana (lunes, hora de México) y en personas, no en eventos. “Actuaron” = capturaron un dato, subieron un documento, pidieron una consulta o apretaron un botón que abre el chat. Excluye los links que genera el asesor al abrir un expediente.</p></div>
      {error ? <p className="text-sm text-red-600">{error.message}</p> : null}
      <div className="overflow-x-auto rounded-2xl border border-line bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted"><th className="px-4 py-2.5">Semana del</th>{COLS.map(([k, l]) => <th key={k} className="px-3 py-2.5 text-right">{l}</th>)}<th className="px-3 py-2.5 text-right">% abre</th><th className="px-4 py-2.5 text-right">% actúa</th></tr></thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.semana} className="border-b border-line last:border-0">
                <td className="px-4 py-2 font-mono text-xs">{new Date(`${f.semana}T12:00:00`).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                {COLS.map(([k]) => <td key={k} className={`px-3 py-2 text-right ${k === 'actuaron' ? 'font-bold' : ''}`}>{Number(f[k] ?? 0).toLocaleString('es-MX')}</td>)}
                <td className="px-3 py-2 text-right text-muted">{f.pct_abre == null ? '—' : `${f.pct_abre}%`}</td>
                <td className="px-4 py-2 text-right font-semibold">{f.pct_actua == null ? '—' : `${f.pct_actua}%`}</td>
              </tr>
            ))}
            {!filas.length ? <tr><td colSpan={10} className="px-4 py-6 text-center text-muted">Sin datos todavía.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
