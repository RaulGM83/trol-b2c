'use client';
// 235 · Modo declarado (claude/102): mientras el IMSS no contesta, con 4–7 respuestas el cliente
// ve un primer número, marcado como estimado. Vive dentro del hero de /mi; cuando llegue el
// historial real, `v_mejor_dato` pone el validado encima y el hero normal lo sustituye solo.
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { estimarDireccional, type InputManual } from '@/lib/estimacion';
import { miDeclararEstimacion } from '@/app/mi/actions';

export type MiEstimacion = {
  mostrar: boolean;
  motivo: 'sin_curp' | 'sin_consulta' | 'atorada' | 'tardando' | 'buscando' | 'ya_hay_historial';
  fecha_nacimiento: string | null;
  sexo: string | null;
  curp: boolean;
  consulta: { estado: string; proveedor: string | null; desde: string } | null;
  datos: Record<string, { valor: unknown; capa: string; en: string }>;
  afores: string[];
};

const mxn = (n: number | null) => (n == null ? '—' : '$' + Math.round(n).toLocaleString('es-MX'));
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const HOY = new Date().getFullYear();

/** Saldo AFORE grueso cuando el cliente no lo sabe: aportación RCV sobre lo cotizado, con rendimiento. */
function saldoGrueso(salarioDiario: number, anios: number): number {
  return Math.round(salarioDiario * 365 * anios * 0.065 * 1.5);
}

export function EstimacionDeclarada({ est, linkCitas }: { est: MiEstimacion; linkCitas: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const d = est.datos;
  const anioNac = est.fecha_nacimiento ? Number(est.fecha_nacimiento.slice(0, 4)) : null;
  const edad = anioNac ? HOY - anioNac : null;
  const preguntaLey = anioNac != null && anioNac < 1980;

  // Lo que ya tenemos declarado (o validado, si lo hubiera) decide si pedimos o mostramos.
  const salarioDiario = num(d.salario_diario?.valor);
  const semanas = num(d.semanas_cotizadas?.valor);
  const cotiza = d.status_empleo ? String(d.status_empleo.valor) === 'empleado' : null;
  const leyDeclarada = d.ley ? (String(d.ley.valor) as 'Ley73' | 'Ley97') : null;
  const ley: 'Ley73' | 'Ley97' | null = leyDeclarada ?? (anioNac != null && !preguntaLey ? 'Ley97' : null);
  const saldoAfore = num(d.saldo_rcv97?.valor);
  const saldoInfonavit = num(d.saldo_infonavit?.valor);
  const completo = anioNac != null && salarioDiario != null && semanas != null && cotiza != null && ley != null;

  const [f, setF] = useState({
    anio_nacimiento: anioNac ? String(anioNac) : '',
    cotiza: cotiza == null ? '' : cotiza ? 'si' : 'no',
    sueldo_mensual: salarioDiario ? String(Math.round(salarioDiario * 30.4)) : '',
    anios_cotizados: semanas ? String(Math.round(semanas / 52)) : '',
    antes_97: leyDeclarada ? (leyDeclarada === 'Ley73' ? 'si' : 'no') : '',
    afore: d.afore_actual ? String(d.afore_actual.valor) : '',
    saldo_afore: saldoAfore ? String(saldoAfore) : '',
    saldo_infonavit: saldoInfonavit ? String(saldoInfonavit) : '',
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const vm = useMemo(() => {
    if (!completo) return null;
    const anios = Math.max(1, Math.round(semanas! / 52));
    const inp: InputManual = {
      anioNacimiento: anioNac!,
      anioPrimeraCotizacion: ley === 'Ley73' ? Math.min(1996, HOY - anios) : Math.max(1997, HOY - anios),
      anioUltimaCotizacion: cotiza ? HOY : HOY - 1,
      semanas: semanas!,
      salarioMensual: salarioDiario! * 30.4,
      sigueCotizando: !!cotiza,
      saldoAfore: saldoAfore ?? (ley === 'Ley97' ? saldoGrueso(salarioDiario!, anios) : 0),
      saldoInfonavit: saldoInfonavit ?? 0,
      incluirInfonavit: false,
    };
    return { vm: estimarDireccional(inp), saldoEstimado: saldoAfore == null && ley === 'Ley97' };
  }, [completo, anioNac, ley, cotiza, semanas, salarioDiario, saldoAfore, saldoInfonavit]);

  const guardar = () => start(async () => {
    setError(null);
    const necesita = [f.cotiza, f.sueldo_mensual, f.anios_cotizados].some((x) => !x) || (anioNac == null && !f.anio_nacimiento) || (preguntaLey && !f.antes_97);
    if (necesita) { setError('Nos falta alguna de las respuestas marcadas con *.'); return; }
    const r = await miDeclararEstimacion({
      anio_nacimiento: anioNac == null ? Number(f.anio_nacimiento) : null,
      cotiza: f.cotiza === 'si',
      sueldo_mensual: Number(f.sueldo_mensual),
      anios_cotizados: Number(f.anios_cotizados),
      antes_97: preguntaLey || anioNac == null ? (f.antes_97 === '' ? null : f.antes_97 === 'si') : false,
      afore: f.afore || null,
      saldo_afore: f.saldo_afore ? Number(f.saldo_afore) : null,
      saldo_infonavit: f.saldo_infonavit ? Number(f.saldo_infonavit) : null,
    });
    if (!r.ok) { setError(r.error ?? 'No se pudo guardar.'); return; }
    router.refresh();
  });

  const motivoTxt = est.motivo === 'atorada'
    ? 'El IMSS no nos devolvió tu historial a la primera; lo seguimos intentando.'
    : est.motivo === 'tardando'
      ? 'El IMSS está tardando más de lo normal en contestar.'
      : est.motivo === 'sin_curp'
        ? 'Sin tu CURP todavía no podemos pedir tu historial al IMSS.'
        : 'Todavía no tenemos tu información del IMSS.';

  // ── Resultado estimado ───────────────────────────────────────────────────────────────
  if (completo && vm) {
    const esc = vm.vm.escenarios;
    const e60 = esc.find((x) => x.edad === 60) ?? esc[0];
    const e65 = esc.find((x) => x.edad === 65) ?? esc[esc.length - 1];
    const negativa = !vm.vm.computable || (e65 && e65.negativa && e60 && e60.negativa);
    return (
      <div className="mt-2">
        <p className="text-sm text-white/80">{motivoTxt} Mientras, con lo que nos contaste:</p>
        {negativa ? (
          <p className="mt-2 text-sm">Con {Math.round(semanas!).toLocaleString('es-MX')} semanas todavía no alcanzas el mínimo para pensión. En tu sesión vemos cómo completarlas; no es el final del camino.</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-end gap-4">
            {e60 && !e60.negativa ? <div><div className="text-[11px] uppercase tracking-wide text-white/60">A los {e60.edad}, aprox.</div><div className="text-3xl font-extrabold">{mxn(e60.pension)}<span className="text-sm font-normal text-white/60">/mes</span></div></div> : null}
            {e65 && e65.edad !== e60?.edad && !e65.negativa ? <div><div className="text-[11px] uppercase tracking-wide text-lime">A los {e65.edad}, aprox.</div><div className="text-3xl font-extrabold text-lime">{mxn(e65.pension)}<span className="text-sm font-normal text-white/60">/mes</span></div></div> : null}
          </div>
        )}
        <div className="mt-2 text-[11px] text-white/50">
          <b className="text-white/70">Estimado</b> · {ley === 'Ley73' ? 'Ley 73' : 'Ley 97'} · {Math.round(semanas!).toLocaleString('es-MX')} semanas que nos dijiste{vm.saldoEstimado ? ' · saldo AFORE estimado' : ''}. En cuanto llegue tu información del IMSS lo afinamos; en tu sesión lo revisamos contigo.
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {linkCitas ? <a href={linkCitas} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-lime px-4 py-2 text-sm font-bold text-ink">Agendar mi sesión</a> : null}
        </div>
      </div>
    );
  }

  // ── Formulario ───────────────────────────────────────────────────────────────────────
  const inputCls = 'w-full rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-sm text-white placeholder:text-white/40';
  const label = 'text-[11px] uppercase tracking-wide text-white/60';
  return (
    <div className="mt-2">
      <p className="text-sm text-white/80">{motivoTxt} <b className="text-white">Con unas respuestas te damos un primer número</b> (un minuto; lo afinamos cuando llegue lo del IMSS).</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {anioNac == null ? (
          <div><div className={label}>Año en que naciste *</div><input inputMode="numeric" value={f.anio_nacimiento} onChange={set('anio_nacimiento')} placeholder="1975" className={inputCls} /></div>
        ) : null}
        <div><div className={label}>¿Cotizas hoy al IMSS? *</div>
          <select value={f.cotiza} onChange={set('cotiza')} className={inputCls}><option value="" className="text-ink">—</option><option value="si" className="text-ink">Sí, tengo patrón</option><option value="no" className="text-ink">No, por ahora no</option></select></div>
        <div><div className={label}>Tu sueldo mensual aprox. (bruto) *</div><input inputMode="numeric" value={f.sueldo_mensual} onChange={set('sueldo_mensual')} placeholder="25000" className={inputCls} /></div>
        <div><div className={label}>¿Cuántos años has cotizado, más o menos? *</div><input inputMode="numeric" value={f.anios_cotizados} onChange={set('anios_cotizados')} placeholder="15" className={inputCls} /></div>
        {preguntaLey || anioNac == null ? (
          <div><div className={label}>¿Empezaste a cotizar antes de julio de 1997?{preguntaLey ? ' *' : ''}</div>
            <select value={f.antes_97} onChange={set('antes_97')} className={inputCls}><option value="" className="text-ink">—</option><option value="si" className="text-ink">Sí, antes</option><option value="no" className="text-ink">No, después</option></select></div>
        ) : null}
        <div><div className={label}>¿En qué AFORE estás?</div>
          <select value={f.afore} onChange={set('afore')} className={inputCls}><option value="" className="text-ink">No sé</option>{est.afores.map((a) => <option key={a} value={a} className="text-ink">{a}</option>)}</select></div>
        <div><div className={label}>Saldo aprox. en tu AFORE</div><input inputMode="numeric" value={f.saldo_afore} onChange={set('saldo_afore')} placeholder="No sé" className={inputCls} /></div>
        <div><div className={label}>Saldo aprox. en Infonavit</div><input inputMode="numeric" value={f.saldo_infonavit} onChange={set('saldo_infonavit')} placeholder="No sé" className={inputCls} /></div>
      </div>
      {error ? <p className="mt-2 text-xs text-amber-200">{error}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" disabled={pending} onClick={guardar} className="rounded-xl bg-lime px-4 py-2 text-sm font-bold text-ink disabled:opacity-50">{pending ? 'Calculando…' : 'Ver mi primer número'}</button>
        {edad != null ? <span className="text-[11px] text-white/50">Tu edad ({edad}) la tomamos de tu CURP.</span> : null}
      </div>
    </div>
  );
}
