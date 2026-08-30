import Link from 'next/link';
import type { ComparativoVM } from '@/lib/contrafactual';
import { milesTexto, pesos, posicionAforeDeclarada } from '@/lib/contrafactual';
import { PUNTOS_ENCUESTA } from '@/lib/afores';
import { SaldoRealCard } from './SaldoRealCard';

// ============================================================================
// /comparativo — "esto tendrías si te hubieras mantenido en una de las que HOY
// son las mejores AFOREs de tu generación", simulado con la historia laboral
// real del cliente (motor contrafactual-1.5). Reglas de la experiencia:
//   · Solo números del motor; el saldo real entra hasta el unlock.
//   · "Rondaría" + redondeo a miles, siempre (frescura SISEC hasta 2 años).
//   · Las AFOREs y el IRN oficial SÍ se nombran aquí (nunca en el WhatsApp).
//   · La encuesta es el camino ligero para capturar la AFORE actual (+50 pts).
//   · No publicable (cobertura fuera de ±30%) → sin cifras, CTA a actualizar.
// ============================================================================

export function ComparativoPersonal({
  nombre,
  vm,
  aforeActual,
  encuestaContestada,
  irnAfore,
  unlockHref,
  traspasoHref,
  saldoDeclarado = null,
  retirosDesempleo = 0,
}: {
  nombre: string;
  vm: ComparativoVM;
  /** AFORE declarada en la encuesta (nombre del catálogo) o null. */
  aforeActual: string | null;
  encuestaContestada: boolean;
  /** IRN oficial CONSAR de su AFORE para su generación (si la declaró). */
  irnAfore?: { irn: number; periodo: string | null } | null;
  /** Destino del unlock v1 (WhatsApp: enviar estado de cuenta, captura manual). */
  unlockHref: string;
  /** WhatsApp Tako: "quiero cambiarme a SURA" (aliado de El Trol). */
  traspasoHref: string;
  /** Saldo real ya declarado por el cliente (saldos_declarados) o null. */
  saldoDeclarado?: number | null;
  /** Semanas descontadas netas por retiros por desempleo (advertencia). */
  retirosDesempleo?: number;
}) {
  const pos = posicionAforeDeclarada(vm, aforeActual);
  // Generaciones "empatadas" (SIEFOREs conservadoras, p.ej. SB Pensiones):
  // si la brecha top-baja es ≤2% de la mediana (o negativa por ruido de
  // ranking en ventanas cortas), no vendemos una diferencia que no existe.
  const brechaChica = vm.brechaTopBaja < Math.max(vm.mediana * 0.02, 10_000);
  // Tira de rango (hero C+B): eje acotado al rango baja→top con padding 35%.
  // Con base común tan grande (p.ej. 1.56M→1.78M) las barras desde cero salen
  // casi idénticas; la tira hace protagonista a la brecha y el eje acotado va
  // implícito en el diseño de rango (los tres montos están etiquetados).
  const span = Math.max(1, vm.top - vm.baja);
  const dLo = vm.baja - span * 0.35;
  const dHi = vm.top + span * 0.35;
  const sx = (v: number) => 30 + ((v - dLo) / (dHi - dLo)) * 460;
  const sxLabel = (v: number) => Math.min(452, Math.max(68, sx(v)));

  return (
    <main className="mx-auto max-w-xl px-5 py-6">
      <header className="mb-6 flex items-center gap-2">
        <span className="text-xl font-extrabold tracking-tight">
          <img src="/marca/logo-trol-blanco.svg" alt="Trol financiero" className="inline-block h-[1.35em] w-auto align-middle" />
        </span>
        <span className="text-xs text-muted">· tu comparativo de AFORE</span>
        <Link href="/diagnostico" className="ml-auto text-xs text-muted hover:underline">
          ← mi diagnóstico
        </Link>
      </header>

      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">Hola, {nombre}</h1>
      <p className="mb-5 text-sm text-muted">
        Hicimos números con <b className="text-ink">tu historia laboral real</b>: simulamos tus aportaciones,
        mes a mes, en cada AFORE con los precios históricos de CONSAR.
      </p>

      {vm.publicable ? (
        <>
          {/* Hero C+B: número héroe (la brecha) + tira de rango como evidencia */}
          <section className="mb-4 rounded-2xl bg-ink p-5 text-white">
            {brechaChica ? (
              <>
                <div className="text-[11px] font-bold uppercase tracking-wide text-lime">Tu ahorro simulado</div>
                <div className="mt-1 text-5xl font-extrabold tracking-tight text-lime">{milesTexto(vm.mediana)}</div>
                <p className="mt-2 text-sm text-white/70">
                  rondaría tu ahorro en prácticamente <b className="text-white">cualquier AFORE de tu generación</b> —
                  con tu historia quedaron casi empatadas. Aquí lo que más pesa ya no es la AFORE, sino tu estrategia
                  de retiro.
                </p>
                <p className="mt-3 border-t border-white/15 pt-3 text-[12px] text-white/50">
                  Simulado con tu historia laboral real y precios históricos de CONSAR. Los montos <i>rondan</i>: son
                  simulación, no tu saldo.
                </p>
              </>
            ) : (
              <>
                {/* "Tu elección de AFORE vale $X": ni pérdida consumada (no sabemos
                    dónde estuvo) ni apuesta futura — el tamaño de la decisión.
                    La personalización de "te costó / jugó a tu favor" vive en las
                    cards de AFORE declarada y saldo real, donde sí es afirmable. */}
                <div className="text-[11px] font-bold uppercase tracking-wide text-lime">
                  Tu elección de AFORE vale
                </div>
                <div className="mt-1 text-5xl font-extrabold tracking-tight text-lime">
                  {milesTexto(vm.brechaTopBaja)}
                </div>
                <p className="mt-1 text-sm text-white/70">
                  la diferencia entre la mejor y la peor, con tu misma carrera
                </p>

                {/* Tira de rango: fondo → promedio → las mejores */}
                <svg
                  viewBox="0 0 520 108"
                  className="mt-4 w-full"
                  role="img"
                  aria-label={`Fondo ${milesTexto(vm.baja)}, promedio ${milesTexto(vm.mediana)}, las mejores ${milesTexto(vm.top)}`}
                >
                  <line x1="30" y1="66" x2="490" y2="66" className="stroke-white/15" strokeWidth="2" />
                  <line
                    x1={sx(vm.baja)}
                    y1="66"
                    x2={sx(vm.top)}
                    y2="66"
                    className="stroke-lime/40"
                    strokeWidth="4"
                  />
                  <circle cx={sx(vm.baja)} cy="66" r="7" className="fill-white/40" />
                  <circle cx={sx(vm.mediana)} cy="66" r="7" className="fill-white" />
                  <circle cx={sx(vm.top)} cy="66" r="9" className="fill-lime" />
                  <circle cx={sx(vm.top)} cy="66" r="12.5" fill="none" className="stroke-lime/40" strokeWidth="1.5" />
                  {/* Fondo: etiqueta arriba */}
                  <text x={sxLabel(vm.baja)} y="34" textAnchor="middle" className="fill-white/50 text-[12px] font-bold">
                    Fondo
                  </text>
                  <text x={sxLabel(vm.baja)} y="49" textAnchor="middle" className="fill-white/50 text-[11px]">
                    rondaría {milesTexto(vm.baja)}
                  </text>
                  {/* Promedio: etiqueta abajo (no se encima con Fondo en móvil) */}
                  <text x={sxLabel(vm.mediana)} y="88" textAnchor="middle" className="fill-white text-[12px] font-bold">
                    Promedio
                  </text>
                  <text x={sxLabel(vm.mediana)} y="102" textAnchor="middle" className="fill-white/50 text-[11px]">
                    rondaría {milesTexto(vm.mediana)}
                  </text>
                  {/* Las mejores: etiqueta arriba, en lime */}
                  <text x={sxLabel(vm.top)} y="30" textAnchor="middle" className="fill-lime text-[12px] font-extrabold">
                    Las mejores
                  </text>
                  <text x={sxLabel(vm.top)} y="46" textAnchor="middle" className="fill-lime text-[12px] font-bold">
                    rondaría {milesTexto(vm.top)}
                  </text>
                </svg>

                <p className="mt-3 border-t border-white/15 pt-3 text-[12px] text-white/50">
                  Simulado con <b className="text-white/80">tu historia laboral real</b> y precios históricos de
                  CONSAR. Los montos <i>rondan</i>: son simulación, no tu saldo.
                </p>
              </>
            )}
          </section>

          {/* Tu AFORE declarada (si la sabemos por la encuesta).
              Las de la canasta top se presentan como GRUPO, sin lugar 1-2-3:
              dentro del grupo la diferencia histórica es menor que el margen
              del modelo y no predice quién será mejor hacia adelante. */}
          {pos ? (
            <section className="mb-4 rounded-2xl border border-line bg-white p-5">
              <div className="text-[11px] font-bold uppercase tracking-wide text-muted">Tu AFORE: {pos.nombre}</div>
              {pos.enTop ? (
                <>
                  <p className="mt-2 text-sm text-ink">
                    {pos.nombre} está en la <b>canasta top de tu generación</b>: con tu historia, tu ahorro ahí
                    rondaría <b>{milesTexto(pos.saldoSimulado)}</b>.
                  </p>
                  <p className="mt-2 rounded-xl bg-lime/20 px-3 py-2 text-sm font-semibold text-ink">
                    ✓ Vas bien — el siguiente paso no es moverte, es confirmar tu saldo real y sumarle ahorro
                    voluntario.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-sm text-ink">
                    En la simulación con tu historia, {pos.nombre} queda en el lugar{' '}
                    <b>
                      {pos.posicion} de {pos.total}
                    </b>
                    {' '}y tu ahorro rondaría <b>{milesTexto(pos.saldoSimulado)}</b>.
                  </p>
                  <p className="mt-2 rounded-xl bg-cream px-3 py-2 text-sm text-ink">
                    Frente a la canasta top, la diferencia simulada es de{' '}
                    <b className="text-red-600">~{milesTexto(pos.deltaVsTop)}</b> — y esa brecha entre grupos sí ha
                    sido persistente en el tiempo.
                  </p>
                </>
              )}
              {irnAfore && (
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  Referencia oficial: IRN CONSAR de {pos.nombre} para tu generación:{' '}
                  <b className="text-ink">{Number(irnAfore.irn).toFixed(2)}%</b>
                  {irnAfore.periodo ? ` (corte ${irnAfore.periodo})` : ''}. El IRN cambia cada mes.
                </p>
              )}
            </section>
          ) : (
            !encuestaContestada && (
              <section className="mb-4 rounded-2xl bg-lime p-5">
                <div className="text-[11px] font-bold uppercase tracking-wide text-ink/70">Falta un dato clave</div>
                <div className="mt-1 text-lg font-extrabold text-ink">¿En qué AFORE estás tú?</div>
                <p className="mt-1 text-sm text-ink/80">
                  Dinos tu AFORE y evalúala: te mostramos aquí mismo dónde queda en tu simulación y ganas{' '}
                  {PUNTOS_ENCUESTA} puntos.
                </p>
                <Link
                  href="/encuesta?volver=comparativo"
                  className="mt-3 block rounded-xl bg-ink px-4 py-3 text-center text-sm font-bold text-white"
                >
                  Decir mi AFORE y evaluarla (+{PUNTOS_ENCUESTA} pts)
                </Link>
              </section>
            )
          )}

          {/* Si contestó pero con "No sé" */}
          {encuestaContestada && !pos && (
            <section className="mb-4 rounded-2xl border border-line bg-white p-5 text-sm">
              <p className="text-ink">
                ¿No sabes en qué AFORE estás? Es lo más común — y lo más caro de ignorar. Te ayudamos a localizarla
                gratis con tu CURP.
              </p>
              <a
                href={unlockHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block rounded-xl bg-ink px-4 py-3 text-center text-sm font-bold text-white"
              >
                Localizar mi AFORE por WhatsApp
              </a>
            </section>
          )}

          {/* Saldo real: captura + feedback de posición (baja/mediana/top) */}
          <SaldoRealCard
            top={vm.top}
            mediana={vm.mediana}
            baja={vm.baja}
            saldoInicial={saldoDeclarado}
            retirosDesempleo={retirosDesempleo}
            unlockHref={unlockHref}
          />

          {/* Traspaso: la conversión. Solo si NO está ya en la canasta top. */}
          {(!pos || !pos.enTop) && (
            <section className="mb-4 rounded-2xl bg-lime p-5">
              <div className="text-[11px] font-bold uppercase tracking-wide text-ink/70">El siguiente paso</div>
              <div className="mt-1 text-lg font-extrabold text-ink">¿Y si estuvieras en una de las mejores?</div>
              <p className="mt-1 text-sm text-ink/80">
                {vm.topAfores.includes('SURA') ? (
                  <>
                    <b>SURA está en la canasta top de tu generación</b> y es aliada de El Trol: te acompaña un
                    agente certificado, el trámite es gratis y nosotros hacemos el papeleo contigo.
                  </>
                ) : (
                  <>
                    Te ayudamos a cambiarte a una de las mejores de tu generación: te acompaña un agente
                    certificado, el trámite es gratis y nosotros hacemos el papeleo contigo.
                  </>
                )}
              </p>
              <a
                href={traspasoHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 block rounded-xl bg-ink px-4 py-3 text-center text-sm font-bold text-white"
              >
                Quiero cambiarme a SURA · WhatsApp
              </a>
              <p className="mt-2 text-center text-[11px] leading-relaxed text-ink/60">
                Tú decides: si prefieres otra AFORE de la canasta top, también te ayudamos a evaluarla.
              </p>
            </section>
          )}

          {/* Desglose de la referencia superior */}
          <section className="mb-4 rounded-2xl border border-line bg-white p-5">
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted">
              Así se compone la simulación (canasta superior)
            </div>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted">RCV Ley 97 (aportaciones desde jul-97)</span>
                <b>{pesos(vm.desglose.rcv97)}</b>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">SAR-92 (tu ahorro de 1992–1997)</span>
                <b>{pesos(vm.desglose.sar92)}</b>
              </div>
              <div className="flex items-center justify-between border-t border-line pt-2">
                <span className="font-semibold text-ink">Total simulado (top-3)</span>
                <b>{pesos(vm.top)}</b>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              Mismo desglose que tu estado de cuenta, para que puedas cotejarlo tal cual.
            </p>
          </section>

          {/* Panel ñoño 🤓 */}
          <details className="mb-4 rounded-2xl border border-line bg-white">
            <summary className="cursor-pointer select-none px-5 py-4 text-sm font-bold text-ink">
              Para ñoños 🤓 — cómo hicimos los números
            </summary>
            <div className="border-t border-line px-5 py-4 text-sm">
              <div className="mb-3 grid grid-cols-2 gap-2 text-[12px]">
                <Dato k="Meses cotizados simulados" v={String(vm.mesesCotizados)} />
                <Dato k="Aportado nominal" v={pesos(vm.aportadoNominal)} />
                <Dato k="Semilla SAR-92 (1997)" v={pesos(vm.sar92Semilla)} />
                <Dato k="Precios al corte" v={vm.preciosCorte} />
                {vm.fuenteHistoria && <Dato k="Fuente de tu historia" v={vm.fuenteHistoria.replace(/_/g, ' ')} />}
                {vm.cobertura != null && <Dato k="Cobertura vs semanas IMSS" v={`${Math.round(vm.cobertura * 100)}%`} />}
              </div>

              <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">
                Tu simulación por grupos de AFOREs
              </div>
              {(() => {
                // Por GRUPOS, no ranking 1-10: dentro de cada canasta la
                // diferencia histórica (2-4%) es menor que el margen del propio
                // modelo (~±10%) — no es señal para elegir entre ellas. La
                // brecha que sí persiste es ENTRE grupos.
                const topSet = new Set(vm.topAfores);
                const bajaSet = new Set(vm.bajaAfores);
                const grupos = [
                  { l: 'Canasta top', filas: vm.saldos.filter((s) => topSet.has(s.nombre)), destacado: true },
                  { l: 'Grupo medio', filas: vm.saldos.filter((s) => !topSet.has(s.nombre) && !bajaSet.has(s.nombre)), destacado: false },
                  { l: 'Canasta baja', filas: vm.saldos.filter((s) => bajaSet.has(s.nombre)), destacado: false },
                ].filter((g) => g.filas.length > 0);
                return (
                  <div className="flex flex-col gap-1.5">
                    {grupos.map((g) => {
                      const montos = g.filas.map((f) => f.saldo);
                      const lo = Math.min(...montos);
                      const hi = Math.max(...montos);
                      return (
                        <div
                          key={g.l}
                          className={`rounded-lg px-3 py-2 ${g.destacado ? 'bg-lime/20' : 'bg-cream'}`}
                        >
                          <div className="flex items-baseline justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wide text-ink/70">{g.l}</span>
                            <span className="text-[12px] font-bold text-ink">
                              {lo === hi ? pesos(lo) : `${pesos(lo)} – ${pesos(hi)}`}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[12px] text-ink">{g.filas.map((f) => f.nombre).join(' · ')}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                Dentro de cada grupo, las diferencias históricas son menores que el margen del propio modelo y no
                predicen cuál será mejor hacia adelante. La brecha que sí ha sido persistente es <b>entre</b> grupos.
              </p>

              <div className="mt-3 mb-1 text-[11px] font-bold uppercase tracking-wide text-muted">Supuestos</div>
              <ul className="flex list-disc flex-col gap-1 pl-4 text-[12px] leading-relaxed text-muted">
                {vm.supuestos.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          </details>
        </>
      ) : (
        /* ---- No publicable: sin cifras, camino a actualizar la historia ---- */
        <>
          <section className="mb-4 rounded-2xl bg-ink p-5 text-white">
            <div className="text-[11px] font-bold uppercase tracking-wide text-lime">Tu comparativo personalizado</div>
            <p className="mt-2 text-sm text-white/80">
              ¿Sabías que 9 de 10 AFOREs cobran casi lo mismo pero <b className="text-white">no rinden lo mismo</b>?
              Para decirte con seriedad cuánto cambia eso en TU caso, nos falta completar tu historia laboral — la que
              tenemos no cuadra del todo con tus semanas cotizadas, y preferimos no inventarte un número.
            </p>
            <a
              href={unlockHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 block rounded-xl bg-lime px-4 py-3 text-center text-sm font-bold text-ink"
            >
              Actualizar mis datos · gratis por WhatsApp
            </a>
          </section>
          {!encuestaContestada && (
            <section className="mb-4 rounded-2xl bg-lime p-5">
              <div className="text-lg font-extrabold text-ink">Mientras tanto: ¿en qué AFORE estás?</div>
              <p className="mt-1 text-sm text-ink/80">
                Evalúala y gana {PUNTOS_ENCUESTA} puntos. Tu opinión alimenta el comparador de la comunidad.
              </p>
              <Link
                href="/encuesta?volver=comparativo"
                className="mt-3 block rounded-xl bg-ink px-4 py-3 text-center text-sm font-bold text-white"
              >
                Evaluar mi AFORE (+{PUNTOS_ENCUESTA} pts)
              </Link>
            </section>
          )}
        </>
      )}

      {/* Comparador general de la comunidad */}
      <Link
        href="/comparador"
        className="block rounded-xl border border-line bg-white px-4 py-3 text-center text-sm font-bold text-ink"
      >
        Ver el comparador de AFOREs completo →
      </Link>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-muted">
        Simulación con tu historia laboral y precios históricos de bolsa de CONSAR (netos de comisión), manteniendo los
        recursos en cada AFORE toda la trayectoria. No incluye retiros parciales ni aportaciones voluntarias. Rendimientos
        pasados no garantizan resultados futuros; esto no es una recomendación de inversión. El trámite ante el IMSS es
        gratis y nunca pedimos anticipos.
      </p>
    </main>
  );
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-cream px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted">{k}</div>
      <div className="font-bold text-ink">{v}</div>
    </div>
  );
}
