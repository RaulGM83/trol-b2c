import type { RazonNegativa73 } from '@trol/pension-core/types';
import { WA } from '@/lib/whatsapp';
import { BadgeNegativa } from './NegativaPension';

const money = (n: number) => '$' + Math.round(n).toLocaleString('es-MX');

/**
 * Negativa de Ley 73. Dos causas independientes:
 *  · faltan semanas (< 500, Art. 162 LSS 73)
 *  · perdió la conservación de derechos (Art. 150) y no la reactiva (Art. 151)
 *
 * Cuando el bloqueo es SOLO la conservación, la pensión sigue existiendo: se
 * muestra condicionada a reactivar. Y si además tiene las semanas de Ley 97,
 * esa es la ruta que le queda mientras no reactive.
 */
export function NegativaLey73({
  razon,
  pensionSiReactiva,
  regimenEfectivo,
  pensionLey97,
  edadProyecto = 65,
}: {
  razon: RazonNegativa73;
  pensionSiReactiva: number | null;
  regimenEfectivo: 'Ley73' | 'Ley97' | 'ninguno';
  pensionLey97: number | null;
  edadProyecto?: number;
}) {
  const soloConservacion = razon.pierdeConservacion && !razon.faltanSemanas;

  return (
    <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
      <div className="flex items-center gap-2">
        <BadgeNegativa />
        <span className="text-[11px] font-bold uppercase tracking-wide text-amber-900/70">
          Tu escenario hoy · Ley 73
        </span>
      </div>

      <h2 className="mt-2 text-lg font-extrabold leading-tight text-ink">
        {soloConservacion
          ? 'Tienes las semanas, pero tus derechos de Ley 73 están suspendidos.'
          : razon.pierdeConservacion
            ? 'Te faltan semanas y tus derechos de Ley 73 están suspendidos.'
            : 'Con tus semanas de hoy, el IMSS no te otorgaría pensión.'}
      </h2>

      <div className="mt-3 rounded-xl bg-white/70 p-4">
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-ink/70">Semanas que tienes</span>
          <span className="text-right font-bold">{razon.semanasActuales.toLocaleString('es-MX')}</span>
          <span className="text-ink/70">Mínimo de Ley 73</span>
          <span className="text-right font-bold">{razon.semanasRequeridas.toLocaleString('es-MX')}</span>
          {razon.faltanSemanas && (
            <>
              <span className="border-t border-amber-200 pt-2 font-semibold text-ink">Te faltan</span>
              <span className="border-t border-amber-200 pt-2 text-right font-extrabold text-amber-900">
                {razon.semanasFaltantes.toLocaleString('es-MX')} semanas
              </span>
            </>
          )}
        </div>

        {razon.pierdeConservacion && (
          <div className="mt-3 border-t border-amber-200 pt-3 text-sm">
            <div className="font-semibold text-ink">Conservación de derechos</div>
            <p className="mt-1 text-ink/70">
              Llevas <b className="text-ink">{Math.round(razon.gapMeses / 12)} años</b> sin cotizar
              {razon.finConservacion &&
                ` y tu periodo de conservación venció en ${razon.finConservacion.slice(0, 4)}`}
              . Tus semanas no se pierden, pero para usarlas hay que reactivarlas.
            </p>
            <p className="mt-2 text-ink/70">
              {razon.semanasParaReactivar === 0
                ? 'Como la interrupción no pasa de 3 años, en cuanto vuelvas a cotizar te reconocen todas tus semanas.'
                : `Necesitas ${razon.semanasParaReactivar} semanas de nuevas cotizaciones (unos ${Math.round(razon.semanasParaReactivar / 4)} meses) para que te reconozcan las anteriores.`}
            </p>
          </div>
        )}
      </div>

      {/* La pensión existe: solo está condicionada a reactivar. */}
      {pensionSiReactiva != null && (
        <div className="mt-3 rounded-xl bg-white/70 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted">Si reactivas</div>
          <div className="mt-1 text-3xl font-extrabold tracking-tight text-ink">
            {money(pensionSiReactiva)}
            <span className="text-base font-bold text-ink/50"> /mes</span>
          </div>
          <p className="mt-1 text-sm text-ink/70">
            Es la pensión de Ley 73 que te corresponde por tus semanas y tu salario. Vuelve a cotizar y la recuperas.
          </p>
        </div>
      )}

      {/* Ruta alterna mientras no reactive. */}
      {regimenEfectivo === 'Ley97' && pensionLey97 != null && (
        <div className="mt-3 rounded-xl bg-white/70 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted">
            Mientras tanto, por Ley 97
          </div>
          <div className="mt-1 text-2xl font-extrabold tracking-tight text-ink">
            {money(pensionLey97)}
            <span className="text-base font-bold text-ink/50"> /mes</span>
          </div>
          <p className="mt-1 text-sm text-ink/70">
            Sí alcanzas las semanas que pide la Ley 97, así que podrías pensionarte con el saldo de tu AFORE.
            {pensionSiReactiva != null && pensionSiReactiva > pensionLey97 && (
              <>
                {' '}
                Ojo: reactivando tu Ley 73 te tocarían{' '}
                <b className="text-ink">{money(pensionSiReactiva - pensionLey97)} más al mes</b>.
              </>
            )}
          </p>
        </div>
      )}

      <div className="mt-3 rounded-xl bg-ink p-4 text-white">
        <div className="text-[11px] font-bold uppercase tracking-wide text-lime">Cómo se revierte</div>
        <p className="mt-1 text-sm text-white/80">
          {razon.pierdeConservacion
            ? `Volver a cotizar —por un empleo o por tu cuenta con Modalidad 10 o 40— reactiva tus derechos y suma semanas al mismo tiempo. Si sigues hasta los ${edadProyecto}, tu caso cambia por completo.`
            : `Cotizando de nuevo completas las ${razon.semanasFaltantes.toLocaleString('es-MX')} semanas que faltan. Puedes hacerlo por un empleo o por tu cuenta con Modalidad 10 o 40.`}
        </p>
        <a
          href={WA.negativaLey73()}
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
