import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getPersonaMia, getMiembro, t3, fmtMXN, fmtNum, fmtFecha, type Any } from '@/lib/trol3/server';
import { MiAcciones, ChatTrol, type ActualizacionImss, CompletarDatos, MisionCta, CanjearBoton, HablarBoton, AhorrarPuntos, SolicitarDoc, DesbloquearDoc, SubirDoc, CurpAcciones, type Identidad } from '@/components/trol3/MiAcciones';
import { waLink } from '@/lib/whatsapp';

import { CalculadoraPro } from '@/components/CalculadoraPro';
import { Explicaciones } from '@/components/trol3/Explicaciones';
import { getSemillaV2Cliente, getSesionCliente } from '@/lib/cliente';
import type { DiagnosticoVM } from '@/lib/diagnostico';
import { NegativaLey73 } from '@/components/NegativaLey73';
import { NegativaPension } from '@/components/NegativaPension';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mi cuenta · Trol' };

// 157: tres puertas. Las claves viejas (?tab=misiones, puntos, asesorias, documentos…) siguen
// vivas porque hay links repartidos; sólo cambia a qué puerta pertenecen.
const TABS_VALIDAS = ['hoy', 'expediente', 'documentos', 'puntos', 'asesorias', 'calculadora', 'mas'];
const NAV: [string, string, string[]][] = [['hoy', 'Mi pensión', ['hoy']], ['expediente', 'Mis datos', ['expediente', 'documentos', 'calculadora']], ['mas', 'Beneficios', ['mas', 'puntos', 'asesorias']]];
const PARADAS = ['Tu información', 'Tu diagnóstico', 'Tu plan', 'En trámite', 'Tu pensión'];
// Las tareas de datos nunca son "lo que sigue": viven en "Afina tus números", dichas por lo que desbloquean.
const AFINA: Record<string, [string, string]> = {
  issste: ['¿Trabajaste alguna vez en gobierno?', 'Si cotizaste al ISSSTE puedes tener años adicionales. Lo consultamos sin costo.'],
  infonavit: ['El saldo real de tu Infonavit', 'Con él te decimos cuánto recuperas al pensionarte.'],
  contexto: ['Cuéntanos de ti', 'Tu meta y tus dependientes cambian qué te conviene. 2 minutos.'],
  afore: ['En qué AFORE estás', 'La AFORE correcta puede darte más rendimiento sin que hagas nada más.'],
};
const BEN_LABEL: Record<string, string> = { calculadora: 'Calculadora completa', diagnostico_avanzado: 'Diagnóstico avanzado', sesion_experto: 'Sesión con experto', docs_premium: 'Documentos premium', seguimiento: 'Seguimiento de trámite' };
const LEGACY_CODE: Record<string, string> = { calculadora: 'CALCULADORA_ADDON', diagnostico_avanzado: 'DIAGNOSTICO_AVANZADO', diagnostico_avanzado_sesion: 'DIAGNOSTICO_AVANZADO_SESION' };

export default async function MiExpediente({ searchParams }: { searchParams: { tab?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/mi');
  const pid = await getPersonaMia();
  if (!pid) {
    // Sesión del equipo (asesor entra a /mi, p.ej. abriendo un magic link de
    // cliente en su navegador): su casa es /trabajo, no un expediente.
    const miembro = await getMiembro();
    if (miembro) redirect('/trabajo');
    // El cliente más perdido de todos no puede quedarse sin puerta: aquí sí o sí va el chat.
    return (
      <main className="mx-auto max-w-md space-y-3 px-5 py-10 text-sm">
        <p>No pudimos reconocer tu teléfono. Escríbenos por WhatsApp y lo resolvemos contigo.</p>
        <SalidaChat mensaje="Hola, entré a app.trol.mx y no reconoce mi teléfono. ¿Me ayudan a entrar a mi cuenta Trol?" />
      </main>
    );
  }
  const db = t3();
  await db.rpc('mi_bienvenida');
  // 147: sella que está adentro. El nudge y la cola de campañas lo respetan
  // media hora: no se interrumpe a quien ya está prestando atención.
  await db.rpc('marcar_visto_en_app');
  const [{ data: x, error }, { data: mis }, { data: jugada }, { data: expl }, { data: leidas }, { data: ident }, { data: pidActual }, { data: actualizacion }, { data: paradaData }] = await Promise.all([db.rpc('mi_expediente'), db.rpc('mi_misiones'), db.rpc('mi_mejor_jugada'), db.from('explicaciones').select('*').order('orden'), db.rpc('mis_explicaciones_leidas'), db.rpc('mi_identidad'), db.rpc('current_persona_id'), db.rpc('mi_actualizacion_imss'), db.rpc('mi_parada')]);
  const { data: linkCitas } = pidActual ? await db.rpc('link_citas_para', { p_persona: pidActual }) : { data: null };
  if (error || !x) return (
    <main className="mx-auto max-w-md space-y-3 px-5 py-10 text-sm">
      <p>No pudimos cargar tu cuenta en este momento. Vuelve a intentarlo en un minuto, o escríbenos y lo vemos contigo.</p>
      <SalidaChat mensaje="Hola, mi cuenta Trol (app.trol.mx) no carga. ¿Me ayudan?" />
      <p className="text-[11px] text-muted">Detalle técnico: {error?.message ?? 'sin datos'}.</p>
    </main>
  );
  const e = x as Any;
  const misiones: Any[] = (mis as Any[]) ?? [];
  // 'misiones' se jubiló (159): lo que tenía vive en Hoy. La clave sigue viva porque /encuesta regresa ahí.
  const tabPedida = searchParams.tab === 'misiones' ? 'hoy' : (searchParams.tab ?? '');
  const tab = TABS_VALIDAS.includes(tabPedida) ? tabPedida : 'hoy';
  const pa = (paradaData as Any | null) ?? null;
  const afina = misiones.filter((m) => AFINA[m.codigo] && m.estado === 'pendiente' && m.cta).slice(0, 3);
  // `editable` de mi_identidad() también es false cuando todavía no hay CURP; la tarjeta
  // sólo sale cuando el IMSS ya la rechazó, no en el camino normal.
  const identidad = (ident as Identidad | null) ?? null;
  const datos: Any[] = e.datos ?? [];
  const faltan: Any[] = e.campos_por_completar ?? [];
  const beneficios: string[] = e.beneficios ?? [];
  const nombre = (e.persona?.nombre ?? '').split(' ')[0];
  const brecha = e.pension_base && e.pension_maxima ? Number(e.pension_maxima) - Number(e.pension_base) : null;
  const href = (t: string) => `/mi?tab=${t}`;
  const yaCubierto = (p: Any) => Array.isArray(p.beneficios) && p.beneficios.length > 0 && p.beneficios.every((b: string) => beneficios.includes(b));
  const leyTxt = e.ley === 'Ley97' ? 'Ley 97' : e.ley === 'Ley73' ? 'Ley 73' : '';
  const semanasTxt = e.semanas ? `${fmtNum(e.semanas)} semanas ${e.semanas_capa === 'validado' ? 'oficiales' : 'que nos dijiste'}` : null;
  // Glosario por ley: para_ley null = para todas; sin ley conocida sólo lo genérico.
  const explLey = ((expl ?? []) as Any[]).filter((x) => !x.para_ley || x.para_ley === e.ley);
  // Negativa (portada del diagnóstico viejo): cuando el motor dice que el
  // escenario base NO alcanza pensión, eso es un resultado y se explica, no
  // se deja el hueco del monto. Sólo se consulta si hay semilla.
  let vmNeg: DiagnosticoVM | null = null;
  if (e.tiene_semilla) {
    try {
      const ses = await getSesionCliente();
      if (ses.real && ses.vm && ses.vm.status !== 'viable') vmNeg = ses.vm;
    } catch {}
  }

  return (
    <main className="mx-auto max-w-2xl px-4 pb-28 pt-5">
      <header className="mb-4 flex items-center justify-between">
        <span className="rounded-lg bg-ink px-2.5 py-1 text-xl font-extrabold tracking-tight text-white"><img src="/marca/logo-trol-blanco.svg" alt="Trol financiero" className="inline-block h-[1.35em] w-auto align-middle" /></span>
        {tab === 'hoy' ? <span className="text-xs text-muted">Tu cuenta Trol</span> : <Link href={href('puntos')} className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold">{e.puntos} pts</Link>}
      </header>

      {tab === 'hoy' && (
        <div className="space-y-4">
          {pa?.aviso?.texto ? (
            <div className="rounded-2xl bg-lime px-4 py-3 text-sm text-ink">
              <b>Te escribimos {cuandoFue(String(pa.aviso.fecha))} por WhatsApp:</b> {pa.aviso.texto}
            </div>
          ) : null}

          {pa ? <Ruta parada={Number(pa.parada)} frase={pa.frase ?? ''} /> : null}

          <section className="rounded-3xl bg-ink p-5 text-white">
            <div className="text-sm text-white/70">Hola{nombre ? `, ${nombre}` : ''}. Tu pensión, en claro:</div>
            {vmNeg ? (
              <>
                <p className="mt-2 text-sm">Con tus datos de hoy, el escenario base no alcanza pensión. Abajo te explicamos por qué, qué pasa con tu dinero y cómo se revierte.</p>
                <div className="mt-2 text-[11px] text-white/50">{e.ley} · {semanasTxt}{e.ley_en ? ` · datos del IMSS al ${fmtFecha(e.ley_en)}` : ''}</div>
              </>
            ) : e.pension_base ? (
              <>
                <div className="mt-2 flex items-end gap-3">
                  <div><div className="text-[11px] uppercase tracking-wide text-white/60">Hoy te tocaría</div><div className="text-3xl font-extrabold">{fmtMXN(e.pension_base)}<span className="text-sm font-normal text-white/60">/mes</span></div></div>
                  <div className="pb-1 text-white/50">→</div>
                  <div><div className="text-[11px] uppercase tracking-wide text-lime">Podrías lograr</div><div className="text-3xl font-extrabold text-lime">{fmtMXN(e.pension_maxima)}<span className="text-sm font-normal text-white/60">/mes</span></div></div>
                </div>
                {brecha && brecha > 0 ? <p className="mt-2 text-sm text-white/80">Te separan <b className="text-lime">{fmtMXN(brecha)} al mes</b> entre lo que te tocaría hoy y lo que podrías lograr.</p> : null}
                <div className="mt-2 text-[11px] text-white/50">{e.ley} · {semanasTxt}{e.ley_en ? ` · datos del IMSS al ${fmtFecha(e.ley_en)}` : ''}</div>
              </>
            ) : (
              <p className="mt-2 text-sm">Aquí vas a ver lo que hoy te tocaría de pensión y lo máximo que podrías lograr, en cuanto tengamos tu información oficial del IMSS.</p>
            )}
          </section>

          {vmNeg ? (
            vmNeg.razon73 ? (
              <div>
                <NegativaLey73 razon={vmNeg.razon73} pensionSiReactiva={vmNeg.pensionSiReactiva} regimenEfectivo={vmNeg.regimenEfectivo} pensionLey97={vmNeg.pensionHoy} edadProyecto={vmNeg.escenarioMaximo.edad} />
                {vmNeg.escenarioMaximo.monto != null && (
                  <div className="mt-2 rounded-xl bg-ink px-4 py-3 text-sm text-white/80">Reactivando y cotizando hasta los {vmNeg.escenarioMaximo.edad}: <b className="text-lime">{fmtMXN(vmNeg.escenarioMaximo.monto)}</b> al mes</div>
                )}
              </div>
            ) : (
              <div>
                <NegativaPension razon={vmNeg.razon97} salida={vmNeg.salida} reversibleCotizando={vmNeg.reversibleCotizando} edadProyecto={vmNeg.escenarioMaximo.edad} />
                {vmNeg.escenarioMaximo.monto != null && (
                  <div className="mt-2 rounded-xl bg-ink px-4 py-3 text-sm text-white/80">Si completas tus semanas cotizando hasta los {vmNeg.escenarioMaximo.edad}: <b className="text-lime">{fmtMXN(vmNeg.escenarioMaximo.monto)}</b> al mes</div>
                )}
              </div>
            )
          ) : null}


          {pa ? <LoQueSigue pa={pa} jugada={(jugada as Any | null) ?? null} identidad={identidad} faltan={faltan} tieneSemilla={!!e.tiene_semilla} /> : <ChatTrol />}

          {pa && ((pa.hallazgos ?? []).length > 0 || Number(pa.en_orden) > 0) && Number(pa.parada) > 1 ? (
            <section className="rounded-2xl border border-line bg-white p-5">
              <h2 className="text-sm font-bold">Lo que encontramos en tu caso</h2>
              {(pa.hallazgos ?? []).length > 0 ? (
                <ul className="mt-3 space-y-3">
                  {(pa.hallazgos as Any[]).map((h) => (
                    <li key={h.item} className="flex items-start gap-2.5">
                      <span className={h.severidad === 'alta' ? 'mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-red-500' : 'mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400'} />
                      <div><div className="text-sm font-semibold">{h.titulo}</div><div className="text-xs text-muted">{h.detalle}</div></div>
                    </li>
                  ))}
                </ul>
              ) : null}
              {Number(pa.en_orden) > 0 ? (
                <div className={(pa.hallazgos ?? []).length > 0 ? 'mt-3 flex items-center gap-2 border-t border-line pt-3 text-sm' : 'mt-3 flex items-center gap-2 text-sm'}>
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-600 text-[10px] font-bold text-white">✓</span>
                  {(pa.hallazgos ?? []).length > 0 ? `${pa.en_orden} ${Number(pa.en_orden) === 1 ? 'cosa más' : 'cosas más'}, en orden` : `${pa.en_orden} ${Number(pa.en_orden) === 1 ? 'cosa revisada' : 'cosas revisadas'}, todo en orden`}
                </div>
              ) : null}
            </section>
          ) : null}

          {afina.length > 0 ? (
            <section className="rounded-2xl border border-line bg-white px-5 pb-2 pt-5">
              <h2 className="text-sm font-bold">Afina tus números <span className="font-normal text-muted">· cuando tengas un rato</span></h2>
              <div className="mt-2">
                {afina.map((m) => (
                  <details key={m.codigo} className="border-t border-line py-3">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                      <span><span className="block text-sm font-semibold">{AFINA[m.codigo][0]}</span><span className="block text-xs text-muted">{AFINA[m.codigo][1]}</span></span>
                      <span className="text-lg text-muted">›</span>
                    </summary>
                    <div className="mt-3"><MisionCta mision={m as never} campos={faltan as never} identidad={identidad} /></div>
                  </details>
                ))}
              </div>
            </section>
          ) : null}

          {(e.interacciones ?? []).length ? (
            <section className="rounded-2xl border border-line bg-white p-5">
              <h2 className="text-sm font-bold">Tu historial con Trol</h2>
              <p className="mb-2 text-xs text-muted">Lo que te avisamos por WhatsApp y lo que ha hecho tu experto, en un solo lugar.</p>
              <ul className="mt-2 space-y-2 text-sm">{(e.interacciones ?? []).slice(0, 5).map((i: Any, k: number) => <li key={k} className="rounded-lg bg-cream/70 p-2"><div className="text-[11px] text-muted">{fmtFecha(i.fecha)}{i.canal === 'wa' ? ' · por WhatsApp' : ''}</div>{i.contenido}</li>)}</ul>
            </section>
          ) : null}
        </div>
      )}

      {tab === 'mas' && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-white px-5 py-2">
            {([[href('puntos'), 'Tus puntos', `${e.puntos} puntos · cómo ganarlos y en qué usarlos`], [href('asesorias'), 'Hablar con un experto', 'Asesorías, qué incluyen y cuánto cuestan'], ['/referidos', 'Invitar a alguien', 'Que alguien más tenga su pensión en claro']] as [string, string, string][]).map(([h, t, d], k) => (
              <Link key={h} href={h} className={k === 0 ? 'flex items-center justify-between gap-3 py-3' : 'flex items-center justify-between gap-3 border-t border-line py-3'}>
                <span><span className="block text-sm font-semibold">{t}</span><span className="block text-xs text-muted">{d}</span></span>
                <span className="text-lg text-muted">›</span>
              </Link>
            ))}
          </section>

          <MiAcciones actualizacion={(actualizacion as ActualizacionImss | null) ?? null} tieneSemilla={!!e.tiene_semilla} cabecera={e.persona?.cabecera?.nombre ?? null} citas={e.citas ?? []} beneficios={beneficios} linkCitas={((linkCitas as Any)?.link as string | undefined) ?? null} />

        </div>
      )}

      {tab === 'expediente' && (
        <div className="space-y-4">
          {faltan.length > 0 ? (
            <section className="rounded-2xl border border-line bg-white p-5">
              <h2 className="text-sm font-bold">Afina tus números</h2>
              <p className="mb-3 text-xs text-muted">Entre más sepamos de ti, más exactos son tus números. Lo que nos digas se guarda como tu versión; cuando tenemos el dato oficial, ese manda.</p>
              <CompletarDatos campos={faltan.map((c) => ({ campo: c.campo, nombre: c.nombre, tipo: c.tipo, grupo: c.grupo, opciones: c.opciones ?? null }))} />
            </section>
          ) : null}
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="text-sm font-bold">Tus datos</h2>
            <p className="text-xs text-muted">A la derecha, de dónde viene cada uno: oficial, calculado por Trol o lo que nos dijiste.</p>
            {[['identidad', 'Identidad'], ['imss', 'IMSS'], ['afore', 'AFORE'], ['infonavit', 'Infonavit'], ['issste', 'ISSSTE'], ['contexto', 'Sobre ti'], ['calculo', 'Cálculos de Trol']].map(([g, l]) => {
              const rows = datos.filter((d) => d.grupo === g);
              if (!rows.length) return null;
              return (
                <div key={g} className="mt-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted">{l}</div>
                  <table className="w-full text-sm"><tbody>
                    {rows.map((d) => (
                      <tr key={d.campo} className="border-t border-line/70">
                        <td className="py-1 text-muted">{d.nombre}</td>
                        <td className="py-1 text-right font-medium">{d.tipo === 'bool' ? (d.valor === true ? 'Sí' : d.valor === false ? 'No' : String(d.valor)) : d.tipo === 'number' ? (/saldo|pension|costo|ingreso|infonavit|salario|expectativa|disponible/.test(d.campo) ? fmtMXN(Number(d.valor)) : fmtNum(Number(d.valor))) : d.tipo === 'date' ? fmtFecha(String(d.valor)) : String(d.valor)}</td>
                        <td className="py-1 pl-2 text-right text-[10px] text-muted">{d.capa === 'validado' ? 'oficial' : d.capa === 'calculado' ? 'calculado' : 'nos dijiste'}{d.vigente === false ? ' · antiguo' : ''}</td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
              );
            })}
          </section>
          <Explicaciones items={explLey} leidas={(leidas as string[]) ?? []} titulo="Glosario: por qué importa cada dato" />
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="text-sm font-bold">¿Y si…?</h2>
            {beneficios.includes('calculadora') && e.tiene_semilla ? (
              <><p className="mb-2 text-xs text-muted">Tienes la calculadora habilitada: prueba edad de retiro, semanas y saldos con tus datos oficiales.</p><Link href="/mi?tab=calculadora" className="inline-block rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white">Abrir calculadora {leyTxt}</Link></>
            ) : (
              <><p className="mb-2 text-xs text-muted">La calculadora completa te deja probar escenarios (edad de retiro, Modalidad 40, semanas por recuperar). Se habilita con la asesoría avanzada, con {fmtMXN(100)} o con 100 puntos.</p><div className="flex flex-wrap gap-2"><CanjearBoton producto="calculadora" precio={100} saldo={e.puntos} /><Link href="/checkout?p=CALCULADORA_ADDON" className="rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-bold">Pagar {fmtMXN(100)}</Link></div></>
            )}
          </section>
        </div>
      )}

      {(tab === 'documentos' || tab === 'expediente') && (() => {
        // 159: tres grupos en vez de una lista de trece. Lo que ya tiene, lo que puede subir él,
        // y lo que conseguimos nosotros — con su precio y por el chat mientras no haya checkout.
        const cat: Any[] = e.catalogo_documentos ?? [];
        const de = (tipo: string): Any[] => (e.documentos ?? []).filter((d: Any) => d.tipo === tipo);
        const abierto = (c: Any) => c.gating === 'gratis' || (c.beneficio && beneficios.includes(c.beneficio));
        const tiene = cat.filter((c) => de(c.tipo).length > 0);
        const subir = cat.filter((c) => de(c.tipo).length === 0 && c.sube_cliente);
        const conseguimos = cat.filter((c) => de(c.tipo).length === 0 && !c.sube_cliente && c.solicitable);
        const pedir = (c: Any) => <HablarBoton texto={`Lo quiero · ${fmtMXN(c.precio)}`} mensaje={`Hola, vengo de mi cuenta Trol (app.trol.mx). Quiero que me consigan: ${c.nombre} (${fmtMXN(c.precio)}). ¿Cómo lo pago?`} compacto />;
        const fila = (c: Any, accion: React.ReactNode) => (
          <li key={c.tipo} className="flex items-start justify-between gap-3 border-t border-line py-3">
            <div><div className="text-sm font-semibold">{c.nombre}</div>{c.descripcion ? <div className="text-xs text-muted">{c.descripcion}</div> : null}{de(c.tipo)[0] ? <div className="mt-0.5 text-[11px] text-muted">Del {fmtFecha(de(c.tipo)[0].fecha)}{de(c.tipo).length > 1 ? ` · ${de(c.tipo).length} versiones` : ''}</div> : null}</div>
            <div className="flex shrink-0 flex-col items-end gap-1 text-right">{accion}</div>
          </li>
        );
        return (
          <section className="mt-4 rounded-2xl border border-line bg-white p-5">
            <h2 className="text-sm font-bold">Tus documentos</h2>
            {tiene.length > 0 ? (
              <>
                <div className="mt-3 text-[11px] font-bold uppercase tracking-wide text-muted">Lo que ya tienes</div>
                <ul className="mt-1">
                  {tiene.map((c) => {
                    const u = de(c.tipo)[0];
                    return fila(c, <>
                      {u.url || abierto(c) ? <a href={u.url && /^https?:/.test(u.url) ? u.url : `/mi/doc/${u.id}`} target="_blank" rel="noreferrer" className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white">Abrir</a> : <DesbloquearDoc tipo={c.tipo} precio={c.precio} maxPct={c.max_pct_puntos} saldo={e.puntos} />}
                      {c.sube_cliente ? <SubirDoc tipo={c.tipo} formatos={c.formatos ?? ['pdf']} parseable={!!c.parseable} compacto tieneCurp={!!e.persona?.curp} /> : null}
                    </>);
                  })}
                </ul>
              </>
            ) : null}
            {conseguimos.length > 0 ? (
              <>
                <div className="mt-4 text-[11px] font-bold uppercase tracking-wide text-muted">Lo que conseguimos por ti</div>
                <ul className="mt-1">{conseguimos.map((c) => fila(c, c.precio ? pedir(c) : <SolicitarDoc tipo={c.tipo} precio={null} />))}</ul>
              </>
            ) : null}
            {subir.length > 0 ? (
              <>
                <div className="mt-4 text-[11px] font-bold uppercase tracking-wide text-muted">Lo que puedes subir tú</div>
                <ul className="mt-1">
                  {subir.map((c) => fila(c, <>
                    <SubirDoc tipo={c.tipo} formatos={c.formatos ?? ['pdf']} parseable={!!c.parseable} compacto tieneCurp={!!e.persona?.curp} />
                    {c.solicitable && c.precio ? pedir(c) : null}
                  </>))}
                </ul>
              </>
            ) : null}
            <p className="mt-3 border-t border-line pt-3 text-[11px] text-muted">Si subes tu constancia de semanas del IMSS, actualizamos tus números con ella.</p>
          </section>
        );
      })()}

      {tab === 'calculadora' && (
        <div className="space-y-3">
          <Link href={href('expediente')} className="text-xs text-muted underline">← Mis datos</Link>
          {beneficios.includes('calculadora') && e.tiene_semilla ? (
            <CalculadoraEmbed />
          ) : (
            <section className="rounded-2xl border border-line bg-white p-5 text-sm">{e.tiene_semilla ? 'La calculadora se habilita con la asesoría avanzada, con $100 o con 100 puntos.' : 'Necesitamos tu información oficial del IMSS para habilitar la calculadora.'} <Link href={href('expediente')} className="underline">Volver</Link></section>
          )}
        </div>
      )}

      {tab === 'puntos' && (
        <div className="space-y-4">
          <section className="rounded-2xl bg-ink p-5 text-white"><div className="text-xs text-white/60">Tu saldo</div><div className="text-3xl font-extrabold">{e.puntos} <span className="text-base font-normal text-white/60">puntos</span></div><div className="mt-1 text-xs text-white/60">1 punto = 1 peso al usarlos en Trol · 10 puntos = 1 peso enviado a tu ahorro para el retiro. Caducan a los 6 meses.</div></section>
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="text-sm font-bold">Cómo ganar</h2>
            <ul className="mt-2 divide-y divide-line text-sm">{(e.catalogo_puntos ?? []).map((c: Any) => <li key={c.accion} className="flex justify-between py-1.5"><span>{c.nombre}</span><b>+{c.puntos}</b></li>)}</ul>
            <Link href="/referidos" className="mt-3 inline-block rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white">Invitar a alguien</Link>
          </section>
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="text-sm font-bold">Enviar a tu ahorro para el retiro</h2>
            <p className="mb-2 text-xs text-muted">10 puntos = 1 peso a tu cuenta AFORE vía Millas para el Retiro (mínimo 100 puntos). Lo procesamos en lotes; te avisamos cuando se aplique.</p>
            {e.puede_ahorrar ? <AhorrarPuntos saldo={e.puntos} /> : <p className="text-xs text-amber-700">Primero validamos con la CONSAR que tu cuenta pueda recibir ahorro (misión "Tener tu cuenta AFORE registrada").</p>}
            {(e.solicitudes_ahorro ?? []).length ? <ul className="mt-2 text-xs text-muted">{(e.solicitudes_ahorro ?? []).map((s: Any, k: number) => <li key={k}>{fmtFecha(s.fecha)} · {s.puntos} pts → {fmtMXN(s.pesos)} · {s.estado}</li>)}</ul> : null}
          </section>
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="text-sm font-bold">Usarlos en Trol</h2>
            <ul className="mt-2 divide-y divide-line text-sm">{(e.productos ?? []).map((p: Any) => <li key={p.codigo} className="flex items-center justify-between gap-2 py-1.5"><span>{p.nombre} <span className="text-xs text-muted">· {p.max_pct_puntos}% con puntos</span></span>{yaCubierto(p) ? <span className="text-xs font-semibold text-green-700">Ya lo tienes</span> : p.max_pct_puntos === 100 && p.precio > 0 ? <CanjearBoton producto={p.codigo} precio={p.precio} saldo={e.puntos} /> : <span className="text-xs text-muted">{p.precio ? fmtMXN(p.precio) : 'gratis'}</span>}</li>)}</ul>
          </section>
        </div>
      )}

      {tab === 'asesorias' && (
        <div className="space-y-4">
          {beneficios.length ? <section className="rounded-2xl border border-lime bg-lime/10 p-5 text-sm"><b>Ya tienes habilitado:</b> {beneficios.map((b) => BEN_LABEL[b] ?? b).join(', ')}.</section> : null}
          {(e.productos ?? []).filter((p: Any) => p.precio > 0).map((p: Any) => (
            <section key={p.codigo} className="rounded-2xl border border-line bg-white p-5">
              <div className="flex items-baseline justify-between"><h2 className="text-base font-extrabold">{p.nombre}</h2><span className="font-bold">{fmtMXN(p.precio)}</span></div>
              <p className="mt-1 text-xs text-muted">Incluye: {(p.beneficios ?? []).map((b: string) => (BEN_LABEL[b] ?? b).toLowerCase()).join(', ') || 'asesoría'}. Hasta {p.max_pct_puntos}% con puntos.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {yaCubierto(p) ? (
                  <>{p.codigo === 'calculadora' && e.tiene_semilla ? <Link href="/mi?tab=calculadora" className="rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white">Abrir calculadora {leyTxt}</Link> : <span className="rounded-xl bg-green-50 px-4 py-2.5 text-sm font-bold text-green-800">Ya lo tienes</span>}<HablarBoton texto="Hablar con mi experto" /></>
                ) : (
                  <>
                    <Link href={`/checkout?p=${LEGACY_CODE[p.codigo] ?? p.codigo}`} className="rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white">Pagar</Link>
                    {p.max_pct_puntos === 100 && <CanjearBoton producto={p.codigo} precio={p.precio} saldo={e.puntos} />}
                    <HablarBoton texto="Prefiero que me expliquen" />
                  </>
                )}
              </div>
            </section>
          ))}
          <p className="text-xs text-muted">¿Ya pagaste por otro medio? Tu experto puede habilitarte los beneficios desde su lado; escríbele.</p>
        </div>
      )}

      <p className="mt-8 text-center text-[11px] leading-relaxed text-muted">El trámite ante el IMSS es gratis. Trol no pide anticipos en efectivo ni garantiza montos.</p>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-1.5 px-3 py-2 text-sm">
          {NAV.map(([t, l, grupo]) => <Link key={t} href={href(t)} className={grupo.includes(tab) ? 'flex-1 rounded-xl bg-ink px-2 py-2.5 text-center font-bold text-white' : 'flex-1 rounded-xl px-2 py-2.5 text-center text-muted'}>{l}</Link>)}
          <a href={waLink((pa?.mensaje_wa as string | undefined) ?? 'Hola, vengo de mi cuenta Trol (app.trol.mx).')} target="_blank" rel="noreferrer" className="rounded-xl bg-lime px-3.5 py-2.5 font-bold text-ink">Mi chat</a>
        </div>
      </nav>
    </main>
  );
}

async function CalculadoraEmbed() {
  const semilla = await getSemillaV2Cliente();
  if (!semilla) return <section className="rounded-2xl border border-line bg-white p-5 text-sm">Todavía no tenemos tu información del IMSS lista para calcular. Escríbenos por tu chat y la actualizamos.</section>;
  return <CalculadoraPro semilla={semilla} embed />;
}

/** La puerta al chat cuando no hay cuenta que pintar: sin sesión, sin RPC, sin nada que falle. */
function SalidaChat({ mensaje }: { mensaje: string }) {
  const tel = process.env.NEXT_PUBLIC_WHATSAPP_TROL || '5215555555555';
  return <a href={`https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`} className="inline-block rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white">Escribirnos por WhatsApp</a>;
}

/** 160 · La franja dice "hoy" o "ayer" con el calendario de México, no con 24 horas exactas. */
function cuandoFue(iso: string): string {
  const dia = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  const dias = Math.round((new Date(dia(new Date())).getTime() - new Date(dia(new Date(iso))).getTime()) / 86400000);
  return dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : 'hace dos días';
}

/** 157 · "Aquí vas": las cinco paradas. Sustituye a la barra de misiones, que medía nuestra captura y no su avance. */
function Ruta({ parada, frase }: { parada: number; frase: string }) {
  const cur = Math.min(Math.max(parada, 1), 5) - 1;
  return (
    <section className="rounded-2xl border border-line bg-white px-3 py-4">
      <div className="px-1 text-[11px] font-bold uppercase tracking-wide text-muted">Aquí vas</div>
      <div className="mt-3 flex items-center px-[calc(10%-11px)]">
        {PARADAS.map((_, i) => (
          <span key={i} className={i < 4 ? 'flex flex-1 items-center' : 'flex items-center'}>
            <span className={i < cur ? 'flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white' : i === cur ? 'h-[22px] w-[22px] shrink-0 rounded-full border-[3px] border-ink bg-lime' : 'h-[22px] w-[22px] shrink-0 rounded-full border-2 border-line bg-white'}>{i < cur ? '✓' : ''}</span>
            {i < 4 ? <span className={i < cur ? 'h-[3px] flex-1 bg-ink' : 'h-[3px] flex-1 bg-line'} /> : null}
          </span>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-5 text-center text-[11px] leading-tight">
        {PARADAS.map((p, i) => <span key={p} className={i === cur ? 'font-bold text-ink' : i < cur ? 'text-ink' : 'text-muted'}>{p}</span>)}
      </div>
      {frase ? <p className="mt-3 px-1 text-sm">{frase}</p> : null}
    </section>
  );
}

/** 157 · UNA sola cosa que sigue, y con dueño. No tener nada que hacer también es un estado válido. */
function LoQueSigue({ pa, jugada, identidad, faltan, tieneSemilla }: { pa: Any; jugada: Any | null; identidad: Identidad | null; faltan: Any[]; tieneSemilla: boolean }) {
  const tocaCliente = pa.toca === 'cliente';
  const lime = pa.cta === 'avanzar';
  const op = (pa.oportunidad as Any | null) ?? null;
  // El texto con números de la recomendación tiene una sola fuente (mi_mejor_jugada), y sólo si habla de la misma oportunidad.
  const jug = jugada && op && jugada.oportunidad_id === op.id ? jugada : null;
  const texto: string = pa.texto ?? jug?.texto ?? 'Es lo que te recomendamos para tu caso. Tu experto te explica los números y cómo se hace.';
  const tramite: Any[] = pa.tramite ?? [];
  const faltaCliente = tramite.some((t) => !t.hecho && t.quien === 'cliente');
  return (
    <section className={lime ? 'rounded-2xl border-2 border-lime bg-lime p-5 text-ink' : 'rounded-2xl border-2 border-ink bg-white p-5 text-ink'}>
      <div className="flex items-center justify-between gap-2">
        <span className={lime ? 'text-[11px] font-bold uppercase tracking-wide text-ink/70' : 'text-[11px] font-bold uppercase tracking-wide text-muted'}>Lo que sigue</span>
        <span className={tocaCliente ? 'rounded-full bg-ink px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white' : 'rounded-full border border-line bg-cream px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-ink'}>{tocaCliente ? 'Te toca a ti' : 'Nos toca a nosotros'}</span>
      </div>
      <h2 className="mt-2 text-xl font-extrabold leading-tight">{pa.titulo}</h2>
      <p className="mt-1 text-sm">{texto}</p>
      {/* 167 · Los números de la propuesta de su asesor, si los puso. Mandan sobre el "hasta X al año" del motor. */}
      {lime && op && (op.pension_con_plan || op.costo) ? (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
          {op.pension_con_plan ? <div><div className="text-[11px] uppercase tracking-wide text-ink/70">Tu pensión pasaría a</div><div className="text-2xl font-extrabold">{fmtMXN(Number(op.pension_con_plan))}<span className="text-sm font-normal text-ink/70">/mes</span></div></div> : null}
          {op.costo ? <div><div className="text-[11px] uppercase tracking-wide text-ink/70">Lo que cuesta</div><div className="text-2xl font-extrabold">{fmtMXN(Number(op.costo))}</div></div> : null}
        </div>
      ) : null}
      {lime && op && !op.pension_con_plan && (op.valor || op.urgencia) ? <div className="mt-2 text-xs text-ink/70">{op.valor ? `hasta ${fmtMXN(op.valor)} al año` : ''}{op.valor && op.urgencia ? ' · ' : ''}{op.urgencia ? `antes del ${fmtFecha(op.urgencia)}` : ''}</div> : null}

      {pa.cta === 'curp' ? <div className="mt-3"><MisionCta mision={{ codigo: 'curp', cta: 'curp', estado: 'pendiente' }} campos={faltan as never} identidad={identidad} /></div> : null}
      {pa.cta === 'consulta_imss' ? <div className="mt-3"><MisionCta mision={{ codigo: 'info_oficial', cta: 'consulta_imss', estado: 'pendiente' }} campos={faltan as never} identidad={identidad} /></div> : null}
      {pa.cta === 'curp_revisar' ? (
        <>
          {identidad?.curp ? <div className="mt-3 rounded-xl bg-cream p-3"><div className="text-[11px] text-muted">La CURP que tenemos</div><div className="font-mono text-base font-bold tracking-wide">{identidad.curp}</div></div> : null}
          <div className="mt-3 space-y-2">
            {identidad ? <CurpAcciones identidad={identidad} /> : null}
            <HablarBoton texto={pa.boton ?? 'Mi CURP está bien, ayúdenme'} mensaje={pa.mensaje_wa} />
          </div>
        </>
      ) : null}
      {pa.cta === 'chat' ? <div className="mt-3"><HablarBoton texto={pa.boton ?? 'Escribir por WhatsApp'} mensaje={pa.mensaje_wa} oscuro /></div> : null}
      {pa.cta === 'avanzar' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <HablarBoton texto={pa.boton ?? 'Quiero avanzar'} mensaje={pa.mensaje_wa} oscuro />
          {tieneSemilla ? <Link href="/mejor-jugada" className="rounded-xl border border-ink/25 px-4 py-2.5 text-sm font-bold text-ink">Ver los números →</Link> : null}
        </div>
      ) : null}
      {pa.cta === 'tramite' ? (
        <>
          {tramite.length > 0 ? (
            <ul className="mt-3 divide-y divide-line border-t border-line">
              {tramite.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  <span className={t.hecho ? 'flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-600 text-[11px] font-bold text-white' : 'h-5 w-5 shrink-0 rounded-full border-2 border-line'}>{t.hecho ? '✓' : ''}</span>
                  <div className="flex-1"><div className="text-sm font-semibold">{t.item}</div><div className="text-xs text-muted">{t.hecho ? 'Listo' : t.quien === 'cliente' ? 'Te toca a ti' : 'Lo llevamos nosotros'}</div></div>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {faltaCliente ? <Link href="/mi?tab=documentos" className="rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-white">Subir un documento</Link> : null}
            <HablarBoton texto={pa.boton ?? 'Preguntar por mi trámite'} mensaje={pa.mensaje_wa} oscuro={!faltaCliente} />
          </div>
        </>
      ) : null}
      {pa.pie ? <p className={lime ? 'mt-3 text-xs text-ink/70' : 'mt-3 text-xs text-muted'}>{pa.pie}</p> : null}
    </section>
  );
}
