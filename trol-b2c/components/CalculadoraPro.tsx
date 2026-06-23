'use client';

import { useMemo, useState } from 'react';
import { computeLey73, computeLey97 } from '@trol/pension-core';
import { UMA } from '@trol/pension-core/tablas';
import type { SemillaV2 } from '@trol/pension-core/semilla';
import type { EntradaCalculo, Palancas, ResultadoLey73, ResultadoLey97 } from '@trol/pension-core/types';
import { WA } from '@/lib/whatsapp';
import { Stepper } from './Stepper';

const money = (n: number | null) => (n == null ? '—' : '$' + Math.round(n).toLocaleString('es-MX'));
const UMA_2026 = UMA[2026];
const HOY = new Date();

// Pantalla 4 del Inc 0 — Calculadora pro (interactiva, datos reales).
export function CalculadoraPro({ semilla }: { semilla: SemillaV2 }) {
  const { perfil, saldos, salario_60m } = semilla;
  const esLey73 = perfil.ley === 'Ley73';
  const edadActual = (HOY.getTime() - new Date(perfil.fecha_nacimiento).getTime()) / 86_400_000 / 365.25;
  const minEdad = Math.max(60, Math.round(edadActual * 2) / 2);
  const recuperables = Math.max(0, perfil.semanas.descontadas - perfil.semanas.recuperadas);

  const [edadRetiro, setEdadRetiro] = useState(65);
  const [pct, setPct] = useState<Palancas['pctTiempoCotizando']>(perfil.status_empleo === 'empleado' ? 1 : 0);
  const [umas, setUmas] = useState(25);
  const [recuperar, setRecuperar] = useState(false);
  const [mod40retro, setMod40retro] = useState(!!perfil.aplica_mod40);

  const salarioDiario = umas * UMA_2026;

  const mk = (edad: number): EntradaCalculo => ({
    perfil, saldos, salario_60m, hoy: HOY,
    palancas: {
      edadRetiro: edad, pctTiempoCotizando: pct, salarioMod40: salarioDiario,
      recuperarSemanasDescontadas: recuperar, recuperarSemanasMod40Retro: mod40retro,
      salarioCotizacionRetro: 'MAXIMO', usaCreditoInfonavit: false, ahorroVoluntarioMensual: 0,
    },
  });
  const pensionDe = (edad: number): number | null => {
    if (esLey73) return computeLey73(mk(edad)).pensionMensual;
    return computeLey97(mk(edad)).pensionAfore;
  };

  const edades = useMemo(() => {
    const out: number[] = [];
    for (let e = minEdad; e <= 65 + 1e-9; e += 0.5) out.push(Math.round(e * 10) / 10);
    return out;
  }, [minEdad]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const res = useMemo(() => (esLey73 ? computeLey73(mk(edadRetiro)) : computeLey97(mk(edadRetiro))), [edadRetiro, pct, umas, recuperar, mod40retro]);
  const r73 = esLey73 ? (res as ResultadoLey73) : null;
  const r97 = !esLey73 ? (res as ResultadoLey97) : null;
  const pension = r73 ? r73.pensionMensual : r97!.pensionAfore;
  const costo = r73 ? r73.costoTotal : 0;
  const d = r73?.detalle ?? null;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const barrido = useMemo(() => edades.map((e) => ({ edad: e, pension: pensionDe(e) })), [edades, pct, umas, recuperar, mod40retro]);

  return (
    <main className="mx-auto max-w-xl px-5 py-6">
      <header className="mb-5 flex items-center gap-2">
        <span className="text-xl font-extrabold tracking-tight">tr<span className="text-lime">o</span>l</span>
        <span className="text-xs text-muted">· calculadora pro</span>
      </header>
      <Stepper activo={3} />

      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">{perfil.nombre || 'Tu'} · calculadora</h1>
      <p className="mb-4 text-sm text-muted">
        {esLey73 ? 'Ley 73' : 'Ley 97'} · {Math.floor(edadActual)} años · {perfil.semanas.netas.toLocaleString('es-MX')} semanas
      </p>

      {/* Resultado */}
      <section className="rounded-2xl bg-ink p-5 text-white">
        <div className="text-[11px] font-bold uppercase tracking-wide text-lime">Pensión mensual</div>
        <div className="mt-1 text-4xl font-extrabold tracking-tight">{money(pension)}</div>
        <div className="mt-1 text-sm text-white/70">al retirarte a los {edadRetiro} años</div>
        {esLey73 && costo > 0 && (
          <div className="mt-3 border-t border-white/15 pt-3 text-sm text-white/80">
            Costo de la estrategia: <b className="text-white">{money(costo)}</b>
          </div>
        )}
      </section>

      {/* Palancas */}
      <section className="mt-5 flex flex-col gap-5 rounded-2xl border border-line bg-white p-5">
        <div>
          <div className="mb-1 flex justify-between text-sm">
            <span className="font-semibold">Edad de retiro</span>
            <span className="font-bold text-ink">{edadRetiro} años</span>
          </div>
          <input type="range" min={minEdad} max={65} step={0.5} value={edadRetiro}
            onChange={(e) => setEdadRetiro(+e.target.value)} className="w-full accent-[#65a30d]" />
          <div className="mt-1 text-[11px] text-muted">Los medios años importan: el factor por edad da saltos.</div>
        </div>

        <div>
          <div className="mb-1 text-sm font-semibold">¿Vas a seguir cotizando?</div>
          <div className="grid grid-cols-5 gap-1">
            {([0, 0.25, 0.5, 0.75, 1] as const).map((v) => (
              <button key={v} type="button" onClick={() => setPct(v)}
                className={`rounded-md border py-1.5 text-xs font-bold ${pct === v ? 'border-ink bg-ink text-white' : 'border-line'}`}>
                {v === 0 ? 'No' : `${v * 100}%`}
              </button>
            ))}
          </div>
        </div>

        {(pct > 0 || mod40retro) && (
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span className="font-semibold">Salario de cotización (Mod 40)</span>
              <span className="font-bold text-ink">{umas} UMA · {money(salarioDiario)}/día</span>
            </div>
            <input type="range" min={1} max={25} step={1} value={umas}
              onChange={(e) => setUmas(+e.target.value)} className="w-full accent-[#65a30d]" />
            <div className="mt-1 text-[11px] text-muted">≈ {money(salarioDiario * 30.4)}/mes de salario base de cotización.</div>
          </div>
        )}

        {recuperables > 0 && <Toggle label={`Recuperar ${recuperables} semanas descontadas`} checked={recuperar} onChange={setRecuperar} />}
        {perfil.aplica_mod40 && <Toggle label="Modalidad 40 retroactiva" checked={mod40retro} onChange={setMod40retro} />}
      </section>

      {/* Cómo se calcula (factores) */}
      {d && !r73!.negativa && (
        <section className="mt-5 rounded-2xl border border-line bg-white p-5">
          <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted">Cómo se calcula tu pensión</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Factor k="Salario promedio (250 sem)" v={`${money(d.salarioCot250)}/día`} />
            <Factor k="Semanas al retiro" v={Math.round(d.semanasRetiro).toLocaleString('es-MX')} />
            <Factor k="Factor por edad" v={`× ${d.ajusteEdad.toFixed(2)}`} />
            <Factor k="Cuantía básica (anual)" v={money(d.cuantiaBasica)} />
            <Factor k="Incrementos (anual)" v={money(d.incrementos)} />
            <Factor k="Asignaciones (15%)" v={money(d.asignaciones)} />
            <Factor k="Pensión mínima (PMG)" v={money(d.pensionMinima)} />
            <Factor k="Tope (25 UMA)" v={money(d.pensionMaxima)} />
          </div>
        </section>
      )}

      {/* Barrido por edad (medios años) */}
      <section className="mt-5 overflow-hidden rounded-xl border border-line">
        <div className="bg-cream px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted">Pensión por edad de retiro</div>
        <table className="w-full text-sm">
          <tbody>
            {barrido.map((b) => (
              <tr key={b.edad} className={`border-t border-line ${b.edad === edadRetiro ? 'bg-lime/10' : ''}`}>
                <td className="px-4 py-2.5 text-ink/70">{b.edad} años</td>
                <td className="px-4 py-2.5 text-right font-bold">{money(b.pension)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Upsell a asesorías de pago (§6) */}
      <section className="mt-6 rounded-2xl bg-ink p-5 text-white">
        <div className="text-[11px] font-bold uppercase tracking-wide text-lime">Lleva tu plan más lejos</div>
        <div className="mt-1 text-lg font-extrabold">¿Quieres tu plan pensional completo?</div>
        <p className="mt-1 text-sm text-white/70">
          Un asesor certificado arma tu estrategia paso a paso: gestorías, Modalidad 40, Infonavit y ahorro.
          Con opción de videollamada 1:1.
        </p>
        <a href="/asesoria" className="mt-3 block rounded-xl bg-lime px-4 py-3 text-center text-sm font-bold text-ink">
          Ver asesorías
        </a>
      </section>

      {/* CTAs a WhatsApp: dudas + agendar asesoría */}
      <section className="mt-4 rounded-2xl border border-line bg-white p-5">
        <div className="text-sm font-bold text-ink">¿Dudas o quieres que un asesor lo vea contigo?</div>
        <p className="mt-1 text-sm text-muted">Escríbenos por WhatsApp; te ayudamos a elegir la mejor estrategia para tu pensión.</p>
        <div className="mt-3 flex flex-col gap-2">
          <a href={WA.agendar()} target="_blank" rel="noopener noreferrer"
            className="rounded-xl bg-[#25D366] px-4 py-3 text-center text-sm font-bold text-white">
            Agendar mi asesoría
          </a>
          <a href={WA.dudas()} target="_blank" rel="noopener noreferrer"
            className="rounded-xl border border-ink px-4 py-3 text-center text-sm font-bold text-ink">
            Tengo una duda
          </a>
        </div>
      </section>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">
        Cálculo con el motor oficial de Trol y tus datos del IMSS. Es una estimación informativa, no una resolución del IMSS.
      </p>
    </main>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between text-sm">
      <span className="font-semibold">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-lime" />
    </label>
  );
}

function Factor({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[11px] text-muted">{k}</div>
      <div className="font-bold text-ink">{v}</div>
    </div>
  );
}
