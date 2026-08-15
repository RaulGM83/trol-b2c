import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireMiembro, t3, fmtMXN, fmtNum, fmtFecha, CAPA_LABEL, CHECK_LABEL, ESTADO_OP_LABEL, type Any } from '@/lib/trol3/server';
import { ExpedienteAcciones, OportunidadAcciones, ConsultaForm, NotaForm, DeclararForm, CitaForm } from '@/components/trol3/ExpedienteAcciones';

export const dynamic = 'force-dynamic';

const GRUPOS: [string, string][] = [['identidad', 'Identidad'], ['imss', 'IMSS'], ['afore', 'AFORE'], ['infonavit', 'Infonavit'], ['issste', 'ISSSTE'], ['contexto', 'Contexto personal'], ['calculo', 'Cálculos Trol']];

function Valor({ campo, tipo, v }: { campo: string; tipo: string; v: Any }) {
  if (v == null) return <span className="text-muted">—</span>;
  if (tipo === 'bool') return <>{v === true ? 'Sí' : v === false ? 'No' : String(v)}</>;
  if (tipo === 'number') return <>{/saldo|pension|costo|ingreso|infonavit|salario|expectativa/.test(campo) ? fmtMXN(Number(v)) : fmtNum(Number(v))}</>;
  if (tipo === 'date') return <>{fmtFecha(String(v))}</>;
  if (tipo === 'json') return <span className="text-muted">json</span>;
  return <>{String(v)}</>;
}

export default async function Expediente({ params }: { params: { id: string } }) {
  const m = await requireMiembro();
  const db = t3();
  const [{ data: e }, { data: campos }, { data: datos }, { data: ck }, { data: ops }, { data: cat }, { data: consultas }, { data: docs }, { data: inter }, { data: contactos }, { data: citas }, { data: miembros }, { data: puntos }, { data: escenarios }] = await Promise.all([
    db.from('v_expediente').select('*').eq('persona_id', params.id).maybeSingle(),
    db.from('catalogo_campos').select('*').order('orden'),
    db.from('v_mejor_dato').select('*').eq('persona_id', params.id),
    db.from('checklist_items').select('*').eq('persona_id', params.id),
    db.from('oportunidades').select('*').eq('persona_id', params.id).order('valor_estimado', { ascending: false, nullsFirst: false }),
    db.from('catalogo_oportunidades').select('*'),
    db.from('consultas').select('*').eq('persona_id', params.id).order('created_at', { ascending: false }).limit(15),
    db.from('documentos').select('*').eq('persona_id', params.id).order('created_at', { ascending: false }),
    db.from('interacciones').select('*').eq('persona_id', params.id).order('created_at', { ascending: false }).limit(40),
    db.from('contactos').select('*').eq('persona_id', params.id),
    db.from('citas').select('*').eq('persona_id', params.id).order('inicio', { ascending: false }).limit(5),
    db.from('miembros').select('id,nombre,email,roles').eq('activo', true),
    db.from('puntos').select('tipo,puntos,expira_at').eq('persona_id', params.id),
    db.from('escenarios').select('*').eq('persona_id', params.id).order('updated_at', { ascending: false }),
  ]);
  if (!e) notFound();
  const catMap = new Map((cat ?? []).map((c: Any) => [c.codigo, c]));
  const datosMap = new Map((datos ?? []).map((d: Any) => [d.campo, d]));
  const cabecera = (miembros ?? []).find((x: Any) => x.id === e.cabecera_id);
  const saldoPuntos = (puntos ?? []).reduce((s: number, p: Any) => s + (p.tipo === 'abono' ? p.puntos : -p.puntos), 0);
  const tel = (contactos ?? []).find((c: Any) => c.tipo === 'telefono' && c.principal) ?? (contactos ?? []).find((c: Any) => c.tipo === 'telefono');
  const email = (contactos ?? []).find((c: Any) => c.tipo === 'email');
  const alertas = (ck ?? []).filter((c: Any) => c.estado === 'alerta');
  const opsAbiertas = (ops ?? []).filter((o: Any) => !['no_aplica', 'perdida', 'ganada'].includes(o.estado));
  const opsCerradas = (ops ?? []).filter((o: Any) => ['no_aplica', 'perdida', 'ganada'].includes(o.estado));
  const semilla = datosMap.get('semilla');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs text-muted">Expediente · etapa <b>{e.etapa}</b> · canal {e.canal_origen ?? '—'}{e.hubspot_id ? ` · HS ${e.hubspot_id}` : ''}</div>
            <h1 className="text-2xl font-extrabold">{e.nombre ?? '(sin nombre)'} {e.apellidos ?? ''}</h1>
            <div className="mt-1 text-sm text-muted">
              {e.edad ? `${e.edad} años` : 'edad desconocida'} · {e.curp ?? 'sin CURP'} · {tel?.valor ?? 'sin teléfono'}{tel?.no_contactar ? ' · NO CONTACTAR' : ''}{email ? ` · ${email.valor}` : ''}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-cream px-2 py-0.5">{e.ley ?? 'Ley ?'}</span>
              <span className="rounded-full bg-cream px-2 py-0.5">{e.semanas ? `${fmtNum(e.semanas)} semanas (${CAPA_LABEL[e.semanas_capa] ?? ''})` : 'semanas ?'}</span>
              <span className="rounded-full bg-cream px-2 py-0.5">{e.status_empleo ?? 'empleo ?'}</span>
              {e.pension_base ? <span className="rounded-full bg-lime/40 px-2 py-0.5">Base {fmtMXN(e.pension_base)} · Máx {fmtMXN(e.pension_maxima)}</span> : null}
              <span className="rounded-full bg-cream px-2 py-0.5">{saldoPuntos} pts</span>
            </div>
            {e.dolor_principal && <p className="mt-2 text-sm">“{e.dolor_principal}”</p>}
          </div>
          <div className="text-right text-sm">
            <div className="text-xs text-muted">Cabecera</div>
            <div className="font-semibold">{cabecera ? cabecera.nombre ?? cabecera.email : 'Sin asignar'}</div>
            <ExpedienteAcciones personaId={e.persona_id} esMia={e.cabecera_id === m.id} sinCabecera={!e.cabecera_id} etapa={e.etapa} />
            {tel && <a className="mt-2 inline-block text-xs underline" href={`https://wa.me/52${tel.normalizado}`} target="_blank" rel="noreferrer">Abrir WhatsApp</a>}
            {semilla && <Link href={`/calculadora?persona=${e.persona_id}`} className="ml-3 inline-block text-xs underline">Calculadora pro</Link>}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* Checklist */}
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Orden de situación {alertas.length ? <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-700">{alertas.length} alertas</span> : null}</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {(ck ?? []).map((c: Any) => (
                <li key={c.item} className="flex items-start gap-2 text-sm">
                  <span className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${c.estado === 'ok' ? 'bg-green-500' : c.estado === 'alerta' ? (c.severidad === 'alta' ? 'bg-red-500' : 'bg-amber-400') : c.estado === 'no_aplica' ? 'bg-gray-300' : 'bg-gray-200'}`} />
                  <span><b>{CHECK_LABEL[c.item] ?? c.item}</b>{c.detalle ? <span className="text-muted"> · {c.detalle}</span> : null}{c.estado === 'sin_dato' ? <span className="text-muted"> · sin dato</span> : null}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Oportunidades */}
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Oportunidades</h2>
            {!opsAbiertas.length && <p className="text-sm text-muted">Sin oportunidades abiertas.</p>}
            <ul className="space-y-3">
              {opsAbiertas.map((o: Any) => (
                <li key={o.id} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div><span className="rounded-full bg-cream px-2 py-0.5 text-[11px]">N{catMap.get(o.codigo)?.nivel}</span> <b>{catMap.get(o.codigo)?.nombre ?? o.codigo}</b> <span className="text-xs text-muted">· {ESTADO_OP_LABEL[o.estado]}</span></div>
                    <div className="text-sm font-bold">{o.valor_estimado ? fmtMXN(o.valor_estimado) : ''}{o.urgencia_fecha ? <span className="ml-2 text-xs font-normal text-amber-700">límite {fmtFecha(o.urgencia_fecha)}</span> : null}</div>
                  </div>
                  <p className="mt-1 text-xs text-muted">{o.motivo}{o.datos_faltantes?.length ? ` · falta: ${o.datos_faltantes.join(', ')}` : ''}{catMap.get(o.codigo)?.proveedor_externo ? ` · vía ${catMap.get(o.codigo)?.proveedor_externo}` : ''}</p>
                  {o.valor_detalle && Object.keys(o.valor_detalle).length ? <p className="mt-1 text-[11px] text-muted">{Object.entries(o.valor_detalle).map(([k, v]) => `${k}: ${typeof v === 'number' ? fmtNum(v) : String(v)}`).join(' · ')}</p> : null}
                  <OportunidadAcciones op={{ id: o.id, estado: o.estado, especialista_id: o.especialista_id }} personaId={e.persona_id} miembros={(miembros ?? []).map((x: Any) => ({ id: x.id, nombre: x.nombre ?? x.email }))} />
                </li>
              ))}
            </ul>
            {opsCerradas.length ? <details className="mt-3 text-xs text-muted"><summary>Cerradas / no aplican ({opsCerradas.length})</summary><ul className="mt-1 list-disc pl-4">{opsCerradas.map((o: Any) => <li key={o.id}>{catMap.get(o.codigo)?.nombre ?? o.codigo} · {ESTADO_OP_LABEL[o.estado]}{o.resultado ? ` · ${o.resultado}` : ''}</li>)}</ul></details> : null}
          </section>

          {/* Datos por grupo */}
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Expediente · mejor dato por campo</h2>
            <div className="grid gap-5 md:grid-cols-2">
              {GRUPOS.map(([g, label]) => {
                const cs = (campos ?? []).filter((c: Any) => c.grupo === g && c.campo !== 'semilla');
                if (!cs.length) return null;
                return (
                  <div key={g}>
                    <h3 className="mb-1 text-xs font-bold uppercase text-muted">{label}</h3>
                    <table className="w-full text-sm">
                      <tbody>
                        {cs.map((c: Any) => {
                          const d = datosMap.get(c.campo);
                          return (
                            <tr key={c.campo} className="border-t border-line/70">
                              <td className="py-1 pr-2 text-xs text-muted">{c.nombre}</td>
                              <td className="py-1 text-right font-medium"><Valor campo={c.campo} tipo={c.tipo} v={d?.valor} /></td>
                              <td className="py-1 pl-2 text-right text-[10px] text-muted">
                                {d ? <span title={`${CAPA_LABEL[d.capa]} · ${d.proveedor ?? d.origen_tipo} · ${fmtFecha(d.obtenido_en)}`} className={`rounded px-1 ${d.capa === 'validado' ? 'bg-green-50 text-green-700' : d.capa === 'calculado' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'} ${d.vigente ? '' : 'line-through'}`}>{d.capa[0].toUpperCase()}</span> : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-muted">V = validado (instituto/proveedor), C = calculado por Trol, D = declarado. Tachado = vencido.</p>
            <DeclararForm personaId={e.persona_id} campos={(campos ?? []).filter((c: Any) => c.campo !== 'semilla').map((c: Any) => ({ campo: c.campo, nombre: c.nombre, tipo: c.tipo, grupo: c.grupo }))} />
          </section>

          {/* Bitácora */}
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Bitácora</h2>
            <NotaForm personaId={e.persona_id} />
            <ul className="mt-3 space-y-2 text-sm">
              {(inter ?? []).map((i: Any) => (
                <li key={i.id} className="rounded-lg bg-cream/70 p-2">
                  <div className="text-[11px] text-muted">{fmtFecha(i.created_at)} {new Date(i.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · {i.canal} · {i.actor_tipo}{i.visible_cliente ? ' · visible al cliente' : ''}</div>
                  <div className="whitespace-pre-wrap">{i.contenido}</div>
                </li>
              ))}
              {!inter?.length && <li className="text-muted">Sin interacciones.</li>}
            </ul>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Pedir información</h2>
            <ConsultaForm personaId={e.persona_id} />
            <ul className="mt-3 space-y-1 text-xs">
              {(consultas ?? []).map((c: Any) => (
                <li key={c.id} className="flex justify-between gap-2 border-t border-line/70 py-1">
                  <span>{c.tipo} · {c.proveedor ?? '—'} <span className="text-muted">· {c.solicitante_tipo}</span></span>
                  <span className={c.estado === 'completada' ? 'text-green-700' : c.estado === 'error' || c.estado === 'sin_resultado' ? 'text-red-600' : 'text-amber-700'}>{c.estado} · {fmtFecha(c.created_at)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Documentos</h2>
            <ul className="space-y-1 text-xs">
              {(docs ?? []).map((d: Any) => (
                <li key={d.id} className="flex justify-between gap-2 border-t border-line/70 py-1">
                  <span>{d.nombre ?? d.tipo} <span className="text-muted">· {d.gating}{d.precio_mxn ? ` ${fmtMXN(d.precio_mxn)}` : ''}</span></span>
                  {d.url_externa ? <a href={d.url_externa} target="_blank" rel="noreferrer" className="underline">abrir</a> : <span className="text-muted">{d.storage_path ? 'bóveda' : ''}</span>}
                </li>
              ))}
              {!docs?.length && <li className="text-muted">Sin documentos.</li>}
            </ul>
          </section>

          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Citas</h2>
            <CitaForm personaId={e.persona_id} />
            <ul className="mt-2 space-y-1 text-xs">{(citas ?? []).map((c: Any) => <li key={c.id}>{new Date(c.inicio).toLocaleString('es-MX')} · {c.estado} · {c.origen}{c.notas ? ` · ${c.notas}` : ''}</li>)}</ul>
          </section>

          {escenarios?.length ? (
            <section className="rounded-2xl border border-line bg-white p-5">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Escenarios</h2>
              <ul className="space-y-1 text-xs">{escenarios.map((s: Any) => <li key={s.id}>{s.nombre} · {s.dueno_tipo}{s.compartido_con_cliente ? ' · compartido' : ''} · {fmtFecha(s.updated_at)}</li>)}</ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
