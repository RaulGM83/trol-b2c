import type { RazonNegativa97, SalidaNegativa97 } from '@trol/pension-core/types';
import { WA } from '@/lib/whatsapp';

const money = (n: number) => '$' + Math.round(n).toLocaleString('es-MX');

/** 138 semanas → "~2 años 8 meses". Las semanas solas no dicen cuánto falta. */
export function semanasATiempo(semanas: number): string {
  const meses = Math.round((semanas / 52) * 12);
  const a = Math.floor(meses / 12);
  const m = meses % 12;
  if (a === 0) return `${m} ${m === 1 ? 'mes' : 'meses'}`;
  if (m === 0) return `${a} ${a === 1 ? 'año' : 'años'}`;
  return `${a} ${a === 1 ? 'año' : 'años'} ${m} ${m === 1 ? 'mes' : 'meses'}`;
}

/** Píldora de estatus. Sustituye al monto: no hay cifra que pintar. */
export function BadgeNegativa({ tono = 'claro' }: { tono?: 'claro' | 'oscuro' }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
        tono === 'oscuro' ? 'bg-amber-400 text-ink' : 'bg-amber-100 text-amber-900'
      }`}
    >
      Negativa
    </span>
  );
}

/**
 * Bloque de negativa de pensión: estatus + razón + salida.
 * La negativa es un RESULTADO, no un campo vacío. En Ley 97 significa que no
 * se pensiona pero retira su saldo en una sola exhibición y le devuelven
 * vivienda (Art. 154 LSS); la palanca para revertirla es seguir cotizando.
 */
export function NegativaPension({
  razon,
  salida,
  reversibleCotizando = false,
  edadProyecto = 65,
}: {
  razon: RazonNegativa97 | null;
  salida: SalidaNegativa97 | null;
  reversibleCotizando?: boolean;
  edadProyecto?: number;
}) {
  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
      <div className="flex items-center gap-2">
        <BadgeNegativa />
        <span className="text-[11px] font-bold uppercase tracking-wide text-amber-900/70">
          Escenario base
        </span>
      </div>

      <h2 className="mt-2 text-lg font-extrabold leading-tight text-ink">
        {razon
          ? `Con ${razon.semanasActuales.toLocaleString('es-MX')} semanas y sin cotizar, no alcanzas el mínimo.`
          : 'Con tus semanas de hoy, el IMSS no te otorgaría pensión.'}
      </h2>

      {/* Razón: lo que tiene vs. lo que exige SU año de retiro. */}
      {razon && (
        <div className="mt-3 rounded-xl bg-white/70 p-4">
          <p className="mb-3 text-sm text-ink/80">
            Te faltan{' '}
            <b className="text-ink">
              {razon.semanasFaltantes.toLocaleString('es-MX')} semanas
            </b>{' '}
            (~{semanasATiempo(razon.semanasFaltantes)} cotizando).
          </p>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-ink/70">Semanas que tienes</span>
            <span className="text-right font-bold">{razon.semanasActuales.toLocaleString('es-MX')}</span>
            <span className="text-ink/70">Las que pide tu retiro en {razon.anioRetiro}</span>
            <span className="text-right font-bold">{razon.semanasRequeridas.toLocaleString('es-MX')}</span>
            <span className="border-t border-amber-200 pt-2 font-semibold text-ink">Te faltan</span>
            <span className="border-t border-amber-200 pt-2 text-right font-extrabold text-amber-900">
              {razon.semanasFaltantes.toLocaleString('es-MX')} semanas
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink/60">
            El mínimo sube cada año por la reforma de 2020: 750 semanas en 2021 y +25 cada año hasta 1,000 en 2031.
          </p>
        </div>
      )}

      {/* Salida: qué pasa con su dinero si acepta la negativa. */}
      {salida && (
        <div className="mt-3 rounded-xl bg-white/70 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted">
            Qué pasa con tu dinero
          </div>
          <p className="mt-1 text-sm text-ink/80">
            No se pierde: te lo entregan en una sola exhibición y te devuelven tu vivienda.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-ink/70">Tu AFORE (retiro único)</span>
            <span className="text-right font-bold">{money(salida.retiroUnaExhibicion)}</span>
            <span className="text-ink/70">Devolución de vivienda</span>
            <span className="text-right font-bold">{money(salida.devolucionVivienda)}</span>
            {salida.ahorroVoluntario > 0 && (
              <>
                <span className="text-ink/70">Ahorro voluntario</span>
                <span className="text-right font-bold">{money(salida.ahorroVoluntario)}</span>
              </>
            )}
            <span className="border-t border-amber-200 pt-2 font-semibold text-ink">Total estimado</span>
            <span className="border-t border-amber-200 pt-2 text-right font-extrabold">
              {money(salida.total)}
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-ink/60">
            Proyectado a tu fecha de retiro. Si tienes crédito Infonavit vigente, la devolución de vivienda es $0.
          </p>
        </div>
      )}

      {/* Palanca + ruteo a asesoría. */}
      <div className="mt-3 rounded-xl bg-ink p-4 text-white">
        <div className="text-[11px] font-bold uppercase tracking-wide text-lime">Cómo se revierte</div>
        <p className="mt-1 text-sm text-white/80">
          {reversibleCotizando
            ? `Cotizando de nuevo —por tu empleo o por tu cuenta con Modalidad 10 o 40— completas las semanas que faltan y sí te pensionas. Si sigues cotizando hasta los ${edadProyecto}, tu caso cambia.`
            : 'Cotizar de nuevo suma semanas, aunque con tu horizonte actual todavía no bastaría. Puede haber semanas no reconocidas o periodos que sí cuentan: vale la pena revisarlo con un asesor.'}
        </p>
        <a
          href={WA.negativaLey97()}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 block rounded-xl bg-lime px-4 py-3 text-center text-sm font-bold text-ink"
        >
          Revisar mi caso con un asesor · gratis
        </a>
      </div>
    </section>
  );
}
