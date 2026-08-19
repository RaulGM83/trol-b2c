import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getPersonaMia, t3, fmtMXN, fmtNum, fmtFecha, CHECK_LABEL, type Any } from '@/lib/trol3/server';
import { MiAcciones, CompletarDatos, MisionCta, CanjearBoton, HablarBoton, AhorrarPuntos, SolicitarDoc, DesbloquearDoc, SubirDoc } from '@/components/trol3/MiAcciones';
import { CalculadoraPro } from '@/components/CalculadoraPro';
import { Explicaciones } from '@/components/trol3/Explicaciones';
import { getSemillaV2Cliente } from '@/lib/cliente';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mi expediente · Trol' };

const TABS: [string, string][] = [['hoy', 'Hoy'], ['misiones', 'Misiones'], ['expediente', 'Mi expediente'], ['documentos', 'Documentos'], ['puntos', 'Puntos'], ['asesorias', 'Asesorías']];
const NIVEL: Record<number, [string, string]> = { 1: ['Poner en orden', 'Lo básico para que nada te reste pensión.'], 2: ['Aprovechar hoy', 'Lo que puedes ganar ahora mismo.'], 3: ['Crecer y proteger', 'Para llegar más lejos.'] };
const ESTADO_MISION: Record<string, [string, string]> = { hecho: ['Hecho', 'bg-green-100 text-green-800'], pendiente: ['Pendiente', 'bg-cream text-ink'], en_proceso: ['En proceso', 'bg-amber-100 text-amber-800'], atencion: ['Requiere atención', 'bg-red-100 text-red-700'], bloqueado: ['Después', 'bg-gray-100 text-muted'], recomendada: ['Tu experto la recomienda', 'bg-lime text-ink'] };
const BEN_LABEL: Record<string, string> = { calculadora: 'Calculadora completa', diagnostico_avanzado: 'Diagnóstico avanzado', sesion_experto: 'Sesión con experto', docs_premium: 'Documentos premium', seguimiento: 'Seguimiento de trámite' };
const LEGACY_CODE: Record<string, string> = { calculadora: 'CALCULADORA_ADDON', diagnostico_avanzado: 'DIAGNOSTICO_AVANZADO', diagnostico_avanzado_sesion: 'DIAGNOSTICO_AVANZADO_SESION' };

export default async function MiExpediente({ searchParams }: { searchParams: { tab?: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/mi');
  const pid = await getPersonaMia();
  if (!pid) return <main className="mx-auto max-w-md px-5 py-10 text-sm">No pudimos vincular tu teléfono con un expediente. Escríbenos por WhatsApp.</main>;
  const db = t3();
  await db.rpc('mi_bienvenida');
  const [{ data: x, error }, { data: mis }, { data: jugada }, { data: expl }, { data: leidas }] = await Promise.all([db.rpc('mi_expediente'), db.rpc('mi_misiones'), db.rpc('mi_mejor_jugada'), db.from('explicaciones').select('*').order('orden'), db.rpc('mis_explicaciones_leidas')]);
  if (error || !x) return <main className="mx-auto max-w-md px-5 py-10 text-sm">Error cargando tu expediente: {error?.message ?? 'sin datos'}.</main>;
  const e = x as Any;
  const tab = TABS.some(([t]) => t === searchParams.tab) || searchParams.tab === 'calculadora' ? (searchParams.tab as string) : 'hoy';
  const misiones: Any[] = (mis as Any[]) ?? [];
  const ck: Any[] = e.checklist ?? [];
  const alertas = ck.filter((c) => c.estado === 'alerta');
  const datos: Any[] = e.datos ?? [];
  const faltan: Any[] = e.campos_por_completar ?? [];
  const beneficios: string[] = e.beneficios ?? [];
  const nombre = (e.persona?.nombre ?? '').split(' ')[0];
  const brecha = e.pension_base && e.pension_maxima ? Number(e.pension_maxima) - Number(e.pension_base) : null;
  const siguiente = misiones.find((m) => m.estado === 'atencion') ?? misiones.find((m) => m.estado === 'recomendada') ?? misiones.find((m) => m.estado === 'pendiente' && m.nivel === 1) ?? misiones.find((m) => m.estado === 'pendiente');
  const hechas = misiones.filter((m) => m.estado === 'hecho').length;
  const progreso = Math.round((100 * hechas) / Math.max(1, misiones.length));
  const href = (t: string) => `/mi?tab=${t}`;
  const yaCubierto = (p: Any) => Array.isArray(p.beneficios) && p.beneficios.length > 0 && p.beneficios.every((b: string) => beneficios.includes(b));
  const leyTxt = e.ley === 'Ley97' ? 'Ley 97' : e.ley === 'Ley73' ? 'Ley 73' : '';
  const semanasTxt = e.semanas ? `${fmtNum(e.semanas)} semanas ${e.semanas_capa === 'validado' ? 'oficiales' : 'que nos dijiste'}` : null;

  return (
    <main className="mx-auto max-w-2xl px-4 pb-28 pt-5">
      <header className="mb-4 flex items-center justify-between">
        <span className="rounded-lg bg-ink px-2.5 py-1 text-xl font-extrabold tracking-tight text-white">tr<span className="text-lime">o</span>l</span>
        <Link href={href('puntos')} className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold">{e.puntos} pts</Link>
      </header>

      {tab === 'hoy' && (
        <div className="space-y-4">
          <section className="rounded-3xl bg-ink p-5 text-white">
            <div className="text-sm text-white/70">Hola{nombre ? `, ${nombre}` : ''}. Tu pensión, en claro:</div>
            {e.pension_base ? (
              <>
                <div className="mt-2 flex items-end gap-3">
                  <div><div className="text-[11px] uppercase tracking-wide text-white/60">Hoy</div><div className="text-3xl font-extrabold">{fmtMXN(e.pension_base)}<span className="text-sm font-normal text-white/60">/mes</span></div></div>
                  <div className="pb-1 text-white/50">→</div>
                  <div><div className="text-[11px] uppercase tracking-wide text-lime">Máxima posible</div><div className="text-3xl font-extrabold text-lime">{fmtMXN(e.pension_maxima)}<span className="text-sm font-normal text-white/60">/mes</span></div></div>
                </div>
                {brecha && brecha > 0 ? <p className="mt-2 text-sm text-white/80">Hay <b className="text-lime">{fmtMXN(brecha)}</b> al mes de diferencia entre lo que te tocaría hoy y lo que podrías lograr. Las misiones te llevan hacia allá.</p> : null}
                <div className="mt-2 text-[11px] text-white/50">{e.ley} · {semanasTxt}{e.ley_en ? ` · datos del IMSS al ${fmtFecha(e.ley_en)}` : ''}</div>
              </>
            ) : (
              <p className="mt-2 text-sm">{e.persona?.curp ? 'Estamos por obtener tu información oficial del IMSS. En cuanto llegue verás aquí tu pensión estimada hoy y la máxima posible.' : 'Comparte tu CURP y buscamos tu información oficial en el IMSS sin costo. Con eso verás aquí tu pensión estimada hoy y la máxima posible.'}</p>
            )}
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/15"><div className="h-1.5 bg-lime" style={{ width: `${progreso}%` }} /></div>
            <div className="mt-1 text-[11px] text-white/60">{hechas} de {misiones.length} misiones · {progreso}%</div>
          </section>

          {jugada ? (
            <section className="rounded-2xl bg-lime p-5 text-ink">
              <div className="text-[11px] font-bold uppercase tracking-wide text-ink/70">{(jugada as Any).recomendada ? `Tu mejor jugada · la recomienda ${(jugada as Any).experto ?? 'tu experto'}` : 'Tu mejor jugada (por confirmar con tu experto)'}</div>
              <h2 className="mt-1 text-xl font-extrabold">{(jugada as Any).titulo}</h2>
              <p className="mt-1 text-sm">{(jugada as Any).texto}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink/70">{(jugada as Any).valor ? <span>hasta {fmtMXN((jugada as Any).valor)} al año</span> : null}{(jugada as Any).urgencia ? <span>· antes del {fmtFecha((jugada as Any).urgencia)}</span> : null}</div>
              <div className="mt-3"><HablarBoton texto={(jugada as Any).recomendada ? 'Quiero avanzar con esto' : 'Quiero que me lo confirmen'} mensaje={`Hola, vi en mi expediente mi mejor jugada: ${(jugada as Any).titulo}. Quiero ${(jugada as Any).recomendada ? 'avanzar' : 'que me la confirmen'}. Vengo de app.trol.mx.`} oscuro /></div>
            </section>
          ) : null}

          {siguiente && (
            <section className="rounded-2xl border-2 border-lime bg-white p-5">
              <div className="text-[11px] uppercase tracking-wide text-muted">Tu siguiente paso</div>
              <h2 className="mt-1 text-lg font-extrabold">{siguiente.titulo}</h2>
              <p className="mt-1 text-sm text-muted">{siguiente.detalle ?? siguiente.por_que}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted"><span>{siguiente.esfuerzo}</span>{siguiente.puntos ? <span>· +{siguiente.puntos} pts</span> : null}{siguiente.valor ? <span>· hasta {fmtMXN(siguiente.valor)}/año</span> : null}</div>
              <div className="mt-3"><MisionCta mision={siguiente} campos={faltan} /></div>
            </section>
          )}

          <section className="rounded-2xl border border-line bg-white p-5">
            <div className="flex items-center justify-between"><h2 className="text-sm font-bold">Orden de tu situación</h2>{alertas.length ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">{alertas.length} por atender</span> : <span className="text-[11px] text-muted">{ck.filter((c) => c.estado === 'ok').length}/{ck.length} en orden</span>}</div>
            <ul className="mt-2 grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
              {ck.map((c) => (
                <li key={c.item} className="flex items-start gap-2">
                  <span className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${c.estado === 'ok' ? 'bg-green-500' : c.estado === 'alerta' ? (c.severidad === 'alta' ? 'bg-red-500' : 'bg-amber-400') : 'bg-gray-200'}`} />
                  <span>{CHECK_LABEL[c.item] ?? c.item}{c.estado === 'alerta' && c.detalle ? <span className="text-muted"> · {c.detalle}</span> : c.estado === 'sin_dato' ? <span className="text-muted"> · pendiente</span> : null}</span>
                </li>
              ))}
            </ul>
          </section>

          <MiAcciones tieneSemilla={!!e.tiene_semilla} cabecera={e.persona?.cabecera?.nombre ?? null} citas={e.citas ?? []} beneficios={beneficios} />

          <Explicaciones items={(expl ?? []).filter((x: Any) => e.ley !== 'Ley97' || !['conservacion', 'mod40'].includes(x.clave)).slice(0, 4)} leidas={(leidas as string[]) ?? []} titulo="Entiende tu pensión en 1 minuto" />

          {(e.interacciones ?? []).length ? (
            <section className="rounded-2xl border border-line bg-white p-5">
              <h2 className="text-sm font-bold">Novedades</h2>
              <ul className="mt-2 space-y-2 text-sm">{(e.interacciones ?? []).slice(0, 5).map((i: Any, k: number) => <li key={k} className="rounded-lg bg-cream/70 p-2"><div className="text-[11px] text-muted">{fmtFecha(i.fecha)}</div>{i.contenido}</li>)}</ul>
            </section>
          ) : null}
        </div>
      )}

      {tab === 'misiones' && (
        <div className="space-y-5">
          {[1, 2, 3].map((n) => {
            const ms = misiones.filter((m) => m.nivel === n);
            if (!ms.length) return null;
            return (
              <section key={n}>
                <h2 className="text-base font-extrabold">Nivel {n} · {NIVEL[n][0]}</h2>
                <p className="mb-2 text-xs text-muted">{NIVEL[n][1]}</p>
                <ul className="space-y-2">
                  {ms.map((m) => {
                    const st = ESTADO_MISION[m.estado] ?? ESTADO_MISION.pendiente;
                    return (
                      <li key={m.codigo} className={`rounded-2xl border bg-white p-4 ${m.estado === 'recomendada' ? 'border-lime' : m.estado === 'atencion' ? 'border-red-200' : 'border-line'} ${m.estado === 'bloqueado' ? 'opacity-60' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div><div className="font-bold">{m.titulo}</div><p className="mt-0.5 text-xs text-muted">{m.detalle ?? m.por_que}</p></div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${st[1]}`}>{st[0]}</span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                          <span>{m.esfuerzo}{m.puntos ? ` · +${m.puntos} pts` : ''}{m.valor ? ` · hasta ${fmtMXN(m.valor)}/año` : ''}{m.urgencia ? ` · antes del ${fmtFecha(m.urgencia)}` : ''}</span>
                          {m.estado !== 'hecho' && m.estado !== 'bloqueado' && <MisionCta mision={m} campos={faltan} compacto />}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {tab === 'expediente' && (
        <div className="space-y-4">
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="text-sm font-bold">Completa tu expediente {faltan.length ? <span className="ml-1 rounded-full bg-lime px-2 py-0.5 text-[11px]">+{5 * Math.min(faltan.length, 8)} pts</span> : null}</h2>
            <p className="mb-3 text-xs text-muted">Lo que declares se guarda como “tu versión”; cuando tenemos el dato oficial, ese manda. Cada dato suma puntos.</p>
            <CompletarDatos campos={faltan.map((c) => ({ campo: c.campo, nombre: c.nombre, tipo: c.tipo, grupo: c.grupo, opciones: c.opciones ?? null }))} />
          </section>
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="text-sm font-bold">Lo que sabemos de ti</h2>
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
                        <td className="py-1 pl-2 text-right text-[10px] text-muted">{d.capa === 'validado' ? 'oficial' : d.capa === 'calculado' ? 'Trol' : 'tú'}{d.vigente === false ? ' · antiguo' : ''}</td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
              );
            })}
          </section>
          <Explicaciones items={expl ?? []} leidas={(leidas as string[]) ?? []} titulo="Glosario: por qué importa cada dato" />
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

      {tab === 'documentos' && (
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="text-sm font-bold">Tus documentos</h2>
          <p className="mb-3 text-xs text-muted">Todo en un solo lugar: lo que ya tenemos, lo que puedes desbloquear y lo que podemos conseguir por ti.</p>
          <ul className="space-y-2 text-sm">
            {(e.catalogo_documentos ?? []).map((c: Any) => {
              const tengo = (e.documentos ?? []).filter((d: Any) => d.tipo === c.tipo);
              const ultimo = tengo[0];
              const desbloqueado = c.gating === 'gratis' || (c.beneficio && beneficios.includes(c.beneficio));
              return (
                <li key={c.tipo} className="rounded-xl border border-line p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div><div className="font-semibold">{c.nombre}</div><div className="text-xs text-muted">{c.descripcion}</div>{ultimo ? <div className="mt-0.5 text-[11px] text-muted">Última versión: {fmtFecha(ultimo.fecha)}{tengo.length > 1 ? ` · ${tengo.length} versiones` : ''}</div> : null}</div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                      {ultimo && (ultimo.url || desbloqueado) ? <a href={ultimo.url && /^https?:/.test(ultimo.url) ? ultimo.url : `/mi/doc/${ultimo.id}`} target="_blank" rel="noreferrer" className="rounded-lg bg-ink px-3 py-1.5 text-xs font-bold text-white">Abrir</a>
                       : ultimo ? <DesbloquearDoc tipo={c.tipo} precio={c.precio} maxPct={c.max_pct_puntos} saldo={e.puntos} />
                       : c.solicitable ? <SolicitarDoc tipo={c.tipo} precio={c.precio} /> : null}
                      {c.sube_cliente ? <SubirDoc tipo={c.tipo} formatos={c.formatos ?? ['pdf']} parseable={!!c.parseable} compacto tieneCurp={!!e.persona?.curp} /> : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] text-muted">Cada documento que subes suma 50 puntos. Si subes tu constancia de semanas del IMSS, actualizamos tu expediente y tus cálculos con ella.</p>
        </section>
      )}

      {tab === 'calculadora' && (
        <div className="space-y-3">
          <Link href={href('expediente')} className="text-xs text-muted underline">← Mi expediente</Link>
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

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl justify-around px-2 py-2 text-[11px]">
          {TABS.map(([t, l]) => <Link key={t} href={href(t)} className={`rounded-lg px-2 py-1 ${tab === t ? 'bg-ink font-semibold text-white' : 'text-muted'}`}>{l}</Link>)}
        </div>
      </nav>
    </main>
  );
}

async function CalculadoraEmbed() {
  const semilla = await getSemillaV2Cliente();
  if (!semilla) return <section className="rounded-2xl border border-line bg-white p-5 text-sm">Tu semilla de cálculo aún no está lista; pide a tu experto que actualice tu información.</section>;
  return <CalculadoraPro semilla={semilla} embed />;
}
