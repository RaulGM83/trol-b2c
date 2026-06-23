'use client';

import { useMemo, useState } from 'react';
import { estimarDireccional, type InputManual } from '@/lib/estimacion';
import { LeadForm } from './LeadForm';

const money = (n: number | null) => (n == null ? '—' : '$' + Math.round(n).toLocaleString('es-MX'));

// Número de WhatsApp de Trol (E.164 sin +). TODO: poner el real en .env.local.
const WHATSAPP_TROL = process.env.NEXT_PUBLIC_WHATSAPP_TROL || '5215555555555';
const WA_MSG = encodeURIComponent(
  'Hola, no pudieron traer mi historial del IMSS. Les envío mi Reporte de Semanas Cotizadas para mi diagnóstico de pensión.',
);
const WA_URL = `https://wa.me/${WHATSAPP_TROL}?text=${WA_MSG}`;
// Portal oficial del IMSS para descargar el Reporte de Semanas Cotizadas.
const IMSS_URL = 'https://serviciosdigitales.imss.gob.mx/semanascotizadas-web/usuarios/IngresoAsegurado';

// Pantalla de espera útil: mientras llega el SISEC, el usuario estima su
// pensión a mano con el mismo motor (Plan Maestro §16, estado sin-CURP).
// `publica`: versión para leads fríos (link de Tako) sin sesión ni CURP.
export function CalculadoraEspera({ publica = false, campania = 'tako' }: { publica?: boolean; campania?: string }) {
  const [inp, setInp] = useState<InputManual>({
    anioNacimiento: 1965,
    anioPrimeraCotizacion: 1990,
    anioUltimaCotizacion: 2024,
    semanas: 1200,
    salarioMensual: 15000,
    sigueCotizando: true,
    saldoAfore: 0,
    saldoInfonavit: 0,
    incluirInfonavit: false,
  });
  const set = <K extends keyof InputManual>(k: K, v: InputManual[K]) => setInp((p) => ({ ...p, [k]: v }));

  const est = useMemo(() => estimarDireccional(inp), [inp]);
  const mejor = est.escenarios.reduce<{ edad: number; pension: number | null } | null>(
    (a, b) => ((b.pension ?? 0) > (a?.pension ?? 0) ? b : a),
    null,
  );

  return (
    <main className="mx-auto max-w-md px-5 py-7">
      <header className="mb-6 flex items-center gap-2">
        <span className="text-xl font-extrabold tracking-tight">
          tr<span className="text-lime">o</span>l
        </span>
      </header>

      {/* Encabezado: leads fríos (público) vs cliente en espera del SISEC */}
      <div className="mb-6 rounded-2xl bg-ink p-5 text-white">
        {publica ? (
          <>
            <span className="text-[11px] font-bold uppercase tracking-wide text-lime">Sin CURP · gratis</span>
            <h1 className="mt-2 text-xl font-extrabold leading-tight">Calcula tu pensión en 1 minuto</h1>
            <p className="mt-1 text-sm text-white/70">
              Sin dar tu CURP. Pon tus datos y mira tu estimación. Si quieres tu cálculo exacto con tu historial del
              IMSS, te ayudamos por WhatsApp.
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-lime" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-wide text-lime">Preparando tu cálculo exacto</span>
            </div>
            <h1 className="mt-2 text-xl font-extrabold leading-tight">Mientras tanto, calcula tu pensión aquí</h1>
            <p className="mt-1 text-sm text-white/70">
              Estamos trayendo tu historial del IMSS. Te avisamos por WhatsApp en cuanto esté tu cálculo oficial.
            </p>
          </>
        )}
      </div>

      <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-muted">Estima tu pensión</h2>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Año de nacimiento">
          <Input value={inp.anioNacimiento} onChange={(v) => set('anioNacimiento', v)} />
        </Field>
        <Field label="1ª cotización al IMSS">
          <Input value={inp.anioPrimeraCotizacion} onChange={(v) => set('anioPrimeraCotizacion', v)} />
        </Field>
        <Field label="Última cotización">
          <Input value={inp.anioUltimaCotizacion} onChange={(v) => set('anioUltimaCotizacion', v)} disabled={inp.sigueCotizando} />
        </Field>
        <Field label="Semanas cotizadas">
          <Input value={inp.semanas} onChange={(v) => set('semanas', v)} />
        </Field>
        <div className="col-span-2">
          <Field label="Salario mensual">
            <div className="flex items-center rounded-lg border border-line focus-within:border-ink">
              <span className="px-3 text-sm text-muted">$</span>
              <input
                type="number" step={500} value={inp.salarioMensual}
                onChange={(e) => set('salarioMensual', +e.target.value)}
                className="w-full rounded-r-lg py-2 pr-3 text-sm outline-none"
              />
            </div>
          </Field>
        </div>
      </div>

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" checked={inp.sigueCotizando} onChange={(e) => set('sigueCotizando', e.target.checked)} className="h-4 w-4 accent-lime" />
        Sigo cotizando hoy
      </label>

      {/* Ley 97: saldos del estado de cuenta para poder estimar */}
      {est.ley === 'Ley97' && (
        <div className="mt-4 rounded-xl border border-line bg-white p-4">
          <div className="text-sm font-bold text-ink">Eres Ley 97 (cuenta AFORE)</div>
          <p className="mt-1 text-xs text-muted">
            Tu pensión depende de tus saldos. Escríbelos (los ves en tu estado de cuenta de la AFORE) para estimar.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Saldo AFORE (RCV)">
              <div className="flex items-center rounded-lg border border-line focus-within:border-ink">
                <span className="px-2 text-sm text-muted">$</span>
                <input
                  type="number" step={10000} value={inp.saldoAfore ?? 0}
                  onChange={(e) => set('saldoAfore', +e.target.value)}
                  className="w-full rounded-r-lg py-2 pr-2 text-sm outline-none"
                />
              </div>
            </Field>
            <Field label="Saldo Infonavit">
              <div className="flex items-center rounded-lg border border-line focus-within:border-ink">
                <span className="px-2 text-sm text-muted">$</span>
                <input
                  type="number" step={10000} value={inp.saldoInfonavit ?? 0}
                  onChange={(e) => set('saldoInfonavit', +e.target.value)}
                  className="w-full rounded-r-lg py-2 pr-2 text-sm outline-none"
                />
              </div>
            </Field>
          </div>
          <label className="mt-3 flex cursor-pointer items-center justify-between text-sm">
            <span className="font-semibold">Incluir saldo Infonavit en la pensión</span>
            <input
              type="checkbox" checked={!!inp.incluirInfonavit}
              onChange={(e) => set('incluirInfonavit', e.target.checked)}
              className="h-4 w-4 accent-lime"
            />
          </label>
          <p className="mt-1 text-[11px] text-muted">
            Por defecto no se incluye: el Infonavit puede destinarse a vivienda.
          </p>
        </div>
      )}

      {/* Conservación de derechos (Art. 150) — solo aplica a Ley 73 */}
      {est.ley === 'Ley73' && (
        <div className={`mt-4 rounded-xl border p-4 ${est.conservacion.vigente ? 'border-lime/50 bg-lime/10' : 'border-amber-300 bg-amber-50'}`}>
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${est.conservacion.vigente ? 'bg-[#65a30d]' : 'bg-amber-500'}`} />
            <span className="text-sm font-bold text-ink">{est.conservacion.titulo}</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink/70">{est.conservacion.detalle}</p>
        </div>
      )}

      {/* Resultado */}
      <section className="mt-6">
        {est.computable ? (
          <>
            <div className="rounded-2xl bg-ink p-5 text-white">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wide text-lime">Tu pensión estimada</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/80">
                  aprox · {est.ley === 'Ley73' ? 'Ley 73' : 'Ley 97'}
                </span>
              </div>
              <div className="mt-1 text-4xl font-extrabold tracking-tight">{money(mejor?.pension ?? null)}<span className="text-base font-bold text-white/50"> /mes</span></div>
              <div className="mt-1 text-sm text-white/70">si te retiras a los {mejor?.edad ?? 65} años</div>
            </div>

            {est.ley === 'Ley73' && (
              <div className={`mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${est.cumpleSemanas ? 'bg-cream text-ink/80' : 'bg-amber-50 text-amber-800'}`}>
                <span className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${est.cumpleSemanas ? 'bg-[#65a30d]' : 'bg-amber-500'}`} />
                <span>
                  {est.cumpleSemanas
                    ? `Ya cumples el mínimo de ${est.semanasMinimas} semanas para pensionarte por Ley 73.`
                    : `Aún no llegas a las ${est.semanasMinimas} semanas que pide la Ley 73 (llevas ${inp.semanas.toLocaleString('es-MX')}). Te decimos cómo completarlas.`}
                </span>
              </div>
            )}

            <div className="mt-4 overflow-hidden rounded-xl border border-line">
              <div className="bg-cream px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-muted">Según tu edad de retiro</div>
              <table className="w-full text-sm">
                <tbody>
                  {est.escenarios.map((e) => (
                    <tr key={e.edad} className="border-t border-line">
                      <td className="px-4 py-2.5 text-ink/70">{e.edad} años</td>
                      <td className="px-4 py-2.5 text-right font-bold">{money(e.pension)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-line bg-cream p-5">
            <p className="text-sm text-ink/70">{est.nota}</p>
          </div>
        )}

        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">
          Es una estimación con los datos que pusiste, no tu pensión oficial.
          El trámite ante el IMSS es gratis y nunca te pedimos anticipos.
        </p>
      </section>

      {/* CTA primario (leads nuevos): crear cuenta + cálculo exacto */}
      {publica && (
        <section className="mt-6">
          <LeadForm campania={campania} origen="calcula" />
        </section>
      )}

      {/* Camino secundario: solo si hubo error de datos o falta el historial */}
      <section className="mt-4 rounded-2xl border border-line bg-white p-5">
        <div className="text-sm font-bold text-ink">
          {publica ? '¿Tuviste un error o no encontramos tu historial?' : '¿Tarda o no encontramos tu historial?'}
        </div>
        <p className="mt-1 text-sm text-muted">
          Mándanos tu <b className="text-ink">Reporte de Semanas Cotizadas</b> del IMSS y armamos tu cálculo oficial nosotros.
        </p>
        <a
          href={IMSS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block rounded-xl border border-ink px-4 py-3 text-center text-sm font-bold text-ink"
        >
          1 · Descargar mi reporte en el IMSS
        </a>
        <a
          href={WA_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block rounded-xl bg-[#25D366] px-4 py-3 text-center text-sm font-bold text-white"
        >
          2 · Enviármelo por WhatsApp
        </a>
        <p className="mt-2 text-[11px] text-muted">Gratis, con tu CURP y NSS en el portal oficial del IMSS.</p>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

function Input({ value, onChange, disabled = false }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <input
      type="number"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(+e.target.value)}
      className="w-full rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-ink disabled:bg-cream disabled:text-muted"
    />
  );
}
