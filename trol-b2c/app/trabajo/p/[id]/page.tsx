import Link from 'next/link';
import { notFound } from 'next/navigation';
import { parseSemillaV2 } from '@/lib/imss/semilla';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireMiembro, t3, fmtMXN, fmtNum, fmtFecha, CHECK_LABEL, ESTADO_OP_LABEL, type Any } from '@/lib/trol3/server';
import { ExpedienteAcciones, OportunidadAcciones, ConsultaForm, NotaForm, CitaForm, SaldoInfonavitAccion, ReprocesarConsulta, type UltimaConsulta, type Proveedor } from '@/components/trol3/ExpedienteAcciones';
import { DatosTabla, type DatoRow } from '@/components/trol3/DatosTabla';
import { DocumentosPanel } from '@/components/trol3/DocumentosPanel';
import { CompartirLinks } from '@/components/trol3/CompartirLinks';
import { HistorialLaboral } from '@/components/trol3/HistorialLaboral';
import { MesaViraal } from '@/components/trol3/MesaViraal';
import { BeneficiosPanel } from '@/components/trol3/BeneficiosPanel';
import { CalculadoraClient, type SaldosCorregidos } from '@/components/portal/calculadora-client';
import { AsesoriaInfonavit, type Proyecto, type SupuestosGlobales, type AsesoriaGuardada } from '@/components/trol3/AsesoriaInfonavit';
import { titularDesdeExpediente } from '@/lib/infonavit/prefill';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { id: string } }) {
  try {
    const { data } = await t3().from('personas').select('nombre,apellidos').eq('id', params.id).maybeSingle();
    const n = [data?.nombre, data?.apellidos].filter(Boolean).join(' ');
    return { title: n ? `${n} · Trol` : 'Expediente · Trol' };
  } catch { return { title: 'Expediente · Trol' }; }
}

const TABS_BASE: [string, string][] = [['resumen', 'Resumen'], ['calculadoras', 'Calculadoras'], ['datos', 'Información'], ['documentos', 'Documentos y beneficios'], ['oportunidades', 'Oportunidades'], ['viraal', 'Viraal'], ['bitacora', 'Bitácora']];

export default async function Expediente({ params, searchParams }: { params: { id: string }; searchParams: { tab?: string } }) {
  const m = await requireMiembro();
  const db = t3();
  const [{ data: e }, { data: campos }, { data: datos }, { data: ck }, { data: ops }, { data: cat }, { data: consultas }, { data: docs }, { data: inter }, { data: contactos }, { data: citas }, { data: miembros }, { data: puntos }] = await Promise.all([
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
  ]);
  const [{ data: ultimaImss }, { data: proveedores }] = await Promise.all([
    db.from('v_ultima_consulta_imss').select('*').eq('persona_id', params.id).maybeSingle(),
    db.from('proveedores').select('codigo,nombre,costo_unitario').eq('activo', true),
  ]);
  const { data: legacyDocs } = await db.rpc('estado_docs_legacy', { p_persona: params.id });
  const [{ data: bens }, { data: catBen }, { data: catDocs }] = await Promise.all([db.from('beneficios').select('*').eq('persona_id', params.id).order('created_at', { ascending: false }), db.from('catalogo_beneficios').select('codigo,nombre').order('orden'), db.from('catalogo_documentos').select('tipo,nombre,formatos,parseable').eq('sube_asesor', true).order('orden')]);
  if (!e) notFound();
  const catMap = new Map((cat ?? []).map((c: Any) => [c.codigo, c]));
  const datosMap = new Map((datos ?? []).map((d: Any) => [d.campo, d]));
  const rows: DatoRow[] = (campos ?? []).filter((c: Any) => c.campo !== 'semilla').map((c: Any) => { const d = datosMap.get(c.campo); return { campo: c.campo, nombre: c.nombre, tipo: c.tipo, grupo: c.grupo, opciones: c.opciones ?? null, valor: d?.valor ?? null, capa: d?.capa, proveedor: d?.proveedor, origen_tipo: d?.origen_tipo, obtenido_en: d?.obtenido_en, vigente: d?.vigente }; });
  const cabecera = (miembros ?? []).find((x: Any) => x.id === e.cabecera_id);
  const saldoPuntos = (puntos ?? []).reduce((s: number, p: Any) => s + (p.tipo === 'abono' ? p.puntos : -p.puntos), 0);
  const tel = (contactos ?? []).find((c: Any) => c.tipo === 'telefono' && c.principal) ?? (contactos ?? []).find((c: Any) => c.tipo === 'telefono');
  const email = (contactos ?? []).find((c: Any) => c.tipo === 'email');
  const alertas = (ck ?? []).filter((c: Any) => c.estado === 'alerta');
  const opsAbiertas = (ops ?? []).filter((o: Any) => !['no_aplica', 'perdida', 'ganada'].includes(o.estado));
  const opsCerradas = (ops ?? []).filter((o: Any) => ['no_aplica', 'perdida', 'ganada'].includes(o.estado));
  const semilla = parseSemillaV2(datosMap.get('semilla')?.valor);
  // Límite de inscripción a Mod 40: el MEJOR dato del expediente. trol3 ya
  // corrigió ahí la ventana de 12 meses del art. 220 (la semilla trae los 5
  // años del 219), así que la calculadora tiene que leerlo de aquí y no
  // recalcularlo distinto — una sola verdad.
  const limiteMod40 = (() => {
    const v = datosMap.get('limite_inscripcion_mod40')?.valor;
    return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
  })();
  // Saldos corregidos por el asesor (portal) viven en public.clientes.saldos_corregidos
  let saldosCorregidos: SaldosCorregidos | null = null;
  let mod40AplicaLegacy: boolean | null = null;
  let historialLaboral: Any[] = [];
  let codigoReferido: string | null = null;
  if (e.legacy_cliente_id) {
    const admin = createAdminClient();
    const { data: cl } = await admin.from('clientes').select('saldos_corregidos, mod40_retro_hoy, mod40_retro_futuro, calculo_pensional, codigo_referido').eq('id', e.legacy_cliente_id).maybeSingle();
    saldosCorregidos = (cl?.saldos_corregidos as SaldosCorregidos | null) ?? null;
    mod40AplicaLegacy = cl ? cl.mod40_retro_hoy === 'true' || cl.mod40_retro_futuro === 'true' : null;
    historialLaboral = ((cl?.calculo_pensional as { historial?: Any[] } | null)?.historial as Any[]) ?? [];
    codigoReferido = (cl?.codigo_referido as string | null) ?? null;
    if (!codigoReferido) {
      const { data: cod } = await admin.schema('trol3').rpc('codigo_referido', { p_cliente: e.legacy_cliente_id });
      codigoReferido = (cod as string) ?? null;
    }
  }
  // Sin espejo legacy la historia laboral vive en la propia semilla de trol3.
  // Sin ella no se puede clasificar la última baja y la Mod 40 avisa que no
  // pudo confirmar la modalidad, en vez de inventar una ventana.
  if (historialLaboral.length === 0) {
    const h = (datosMap.get('semilla')?.valor as { historial?: Any[] } | undefined)?.historial;
    if (Array.isArray(h)) historialLaboral = h;
  }
  // ---- Asesoría Infonavit: la pestaña abre con saldo arriba del umbral y cotizando.
  // El crédito vigente NO bloquea: aparece como señal dentro de la pestaña.
  const { data: supRow } = await db.from('infonavit_supuestos').select('*').eq('id', 'default').maybeSingle();
  const supInfonavit = (supRow ?? null) as SupuestosGlobales | null;
  const umbralInfonavit = Number(supInfonavit?.saldo_min_asesoria ?? 350000);
  const aplicaInfonavit = e.status_empleo === 'empleado' && Number(e.saldo_infonavit ?? 0) > umbralInfonavit;
  let proyectosInf: Proyecto[] = [];
  let historialInf: AsesoriaGuardada[] = [];
  let baseInfonavit: ReturnType<typeof titularDesdeExpediente> | null = null;
  // El historial se muestra aunque la pestaña ya no aplique: si en su momento se le
  // presentó una propuesta, tiene que seguir siendo consultable.
  {
    const { data: ases } = await db.from('infonavit_asesorias')
      .select('id,created_at,persona_id,cotitular_persona_id,proyecto_id,miembro_id,mejor_horizonte,horizonte,ventaja_corte,efectivo,credito,nota,nombre')
      .or(`persona_id.eq.${params.id},cotitular_persona_id.eq.${params.id}`)
      .is('archivada_at', null)
      .order('created_at', { ascending: false }).limit(20);
    const filas = (ases ?? []) as Any[];
    if (filas.length) {
      const proyIds = [...new Set(filas.map((a) => a.proyecto_id).filter(Boolean))];
      const persIds = [...new Set(filas.flatMap((a) => [a.persona_id, a.cotitular_persona_id]).filter((x) => x && x !== params.id))];
      const [{ data: proyNom }, { data: persNom }] = await Promise.all([
        proyIds.length ? db.from('proyectos_inmobiliarios').select('id,desarrollo').in('id', proyIds) : Promise.resolve({ data: [] as Any[] }),
        persIds.length ? db.from('personas').select('id,nombre,apellidos').in('id', persIds) : Promise.resolve({ data: [] as Any[] }),
      ]);
      const pmap = new Map(((proyNom ?? []) as Any[]).map((x) => [x.id, x.desarrollo]));
      const nmap = new Map(((persNom ?? []) as Any[]).map((x) => [x.id, [x.nombre, x.apellidos].filter(Boolean).join(' ')]));
      historialInf = filas.map((a) => {
        const esCotitular = a.cotitular_persona_id === params.id;
        const otro = esCotitular ? a.persona_id : a.cotitular_persona_id;
        return {
          id: a.id, created_at: a.created_at, mejor_horizonte: a.mejor_horizonte,
          ventaja_corte: a.ventaja_corte, credito: a.credito,
          desarrollo: pmap.get(a.proyecto_id) ?? null,
          miembro: (miembros ?? []).find((x: Any) => x.id === a.miembro_id)?.nombre ?? null,
          cotitular_nombre: otro ? nmap.get(otro) ?? null : null,
          es_cotitular: esCotitular, nota: a.nota ?? null,
          nombre: a.nombre ?? null, horizonte: a.horizonte ?? a.mejor_horizonte ?? null,
          efectivo: a.efectivo ?? null,
        };
      });
    }
  }
  // Sin semilla también se arma: el adaptador dice qué falta y la pestaña lo pide.
  if (aplicaInfonavit && supInfonavit) {
    const { data: proys } = await db.from('proyectos_inmobiliarios').select('*').eq('disponible', true).order('clave');
    proyectosInf = (proys ?? []) as Proyecto[];
    baseInfonavit = titularDesdeExpediente({
      semilla,
      ley: e.ley ?? null,
      fechaNacimiento: e.fecha_nacimiento ?? null,
      statusEmpleo: e.status_empleo ?? null,
      salarioDiario: datosMap.get('salario_diario')?.valor == null ? null : Number(datosMap.get('salario_diario')?.valor),
      saldoInfonavit: e.saldo_infonavit == null ? null : Number(e.saldo_infonavit),
      saldoEsReportado: e.saldo_infonavit_capa === 'declarado' || e.saldo_infonavit_capa === 'validado',
      creditoVigente: e.credito_infonavit ?? null,
      mesesCotizandoDefault: Number(supInfonavit.meses_cotizando_default ?? 60),
      ingresoRealMensual: datosMap.get('ingreso_mensual')?.valor == null ? null : Number(datosMap.get('ingreso_mensual')?.valor),
      deduccionesUsadas: datosMap.get('deducciones_personales_anuales')?.valor == null ? null : Number(datosMap.get('deducciones_personales_anuales')?.valor),
    });
  }
  const verTabInfonavit = aplicaInfonavit || historialInf.length > 0;
  const TABS: [string, string][] = verTabInfonavit
    ? [...TABS_BASE.slice(0, 2), ['infonavit', 'Infonavit'] as [string, string], ...TABS_BASE.slice(2)]
    : TABS_BASE;
  const tab = TABS.some(([t]) => t === searchParams.tab) ? (searchParams.tab as string) : 'resumen';

  const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.trol.mx';
  // Link legible del expediente (nombre-últimos4tel), como el de referidos; /e/ acepta slug o uuid.
  const { data: slugExp } = await db.rpc('slug_expediente', { p_persona: e.persona_id });
  const urlExpediente = `${SITE}/e/${(slugExp as string | null) ?? e.persona_id}?c=bot`;
  // Link mágico directo a /mi (081): entra sin OTP, 7 días / 25 usos. Sólo
  // debe mandarse al WhatsApp del propio cliente (poseerlo = teléfono validado).
  const { data: miLink } = await db.rpc('mi_link_asesor', { p_persona: e.persona_id });
  const urlReferido = codigoReferido ? `${SITE}/i/${codigoReferido}` : null;
  const { data: viraalAut } = await db.from('viraal_autorizaciones').select('*').eq('persona_id', params.id).order('created_at', { ascending: false }).limit(50);
  const viraalHist = (viraalAut ?? []).map((a: Any) => ({ ...a, miembro: (miembros ?? []).find((x: Any) => x.id === a.miembro_id)?.nombre ?? null }));
  const afLiq = (saldosCorregidos?.disponible_afore ?? e.saldo_rcv97) ?? null;
  const infLiq = (saldosCorregidos?.infonavit ?? e.saldo_infonavit) ?? null;
  const saldosLiq = (afLiq != null || infLiq != null) ? (Number(afLiq ?? 0) + Number(infLiq ?? 0)) : null;
  // Mesa Viraal: proyecto Mod40 retroactivo A HOY calculado con la semilla (línea IMSS, gestorías, pensión, saldos)
  // y variante con recuperación de semanas descontadas. Fallback: valores del expediente.
  // El proyecto ya no se calcula aquí: la mesa lo recalcula en vivo con la
  // fecha de trámite que elija el asesor. `hoyIso` fija el default en el
  // servidor para que no dependa del reloj del navegador.
  const hoyIso = new Date().toISOString().slice(0, 10);
  const viraalPrefill: Record<string, number | null> = {
    imss: e.costo_retro ?? null,
    pension: (e.pension_mod40_retro ?? e.pension_maxima) ?? null,
    saldos: saldosLiq,
  };
  const rawFechaSisec = (datosMap.get('semilla')?.valor as { meta?: { fecha_sisec?: string } } | undefined)?.meta?.fecha_sisec;
  const fechaSisecTxt = rawFechaSisec && /^\d{4}-\d{2}-\d{2}/.test(rawFechaSisec) ? fmtFecha(rawFechaSisec) : e.ley_en ? fmtFecha(e.ley_en) : null;
  const semillaAt = datosMap.get('semilla')?.obtenido_en ? fmtFecha(datosMap.get('semilla')?.obtenido_en) : null;
  const ultimaConsulta = (consultas ?? [])[0];
  // El texto legible lo escribe `aplicar_regla_identidad` (071); el crudo del proveedor
  // se queda en consultas.error y sólo se enseña dentro del colapsable.
  const inconsistencia = (datosMap.get('inconsistencia_imss')?.valor ?? null) as string | null;
  const href = (t: string) => `/trabajo/p/${e.persona_id}?tab=${t}`;
  // El saldo Infonavit sin confirmar (o vencido) mueve liquidez y crédito: avisarlo donde se usa.
  const avisoSaldoEstimado = e.saldo_infonavit != null && (e.saldo_infonavit_capa === 'calculado' || e.saldo_infonavit_vigente === false);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold">{e.nombre ?? '(sin nombre)'} {e.apellidos ?? ''}</h1>
            <div className="mt-1 text-sm text-muted">
              {e.edad ? `${e.edad} años` : 'edad desconocida'} · {e.curp ?? <span className="text-red-600">sin CURP</span>} · {tel?.valor ?? 'sin teléfono'}{tel?.no_contactar ? ' · NO CONTACTAR' : ''}{email ? ` · ${email.valor}` : ''}
            </div>
            <div className="mt-1 text-xs text-muted">Etapa <b>{e.etapa}</b> · canal {e.canal_origen ?? '—'}{e.hubspot_id ? ` · HubSpot ${e.hubspot_id}` : ''} · {saldoPuntos} pts · Experto asignado: <b>{cabecera ? cabecera.nombre ?? cabecera.email : 'sin asignar'}</b></div>
          </div>
          <div className="text-right text-xs">
            <div className="flex flex-wrap justify-end gap-2">
              {tel && <a className="rounded-lg border border-line px-2.5 py-1 font-semibold hover:bg-cream" href={`https://portal.takohub.com/trol-financiero/pas/chats?line=m2MS9fYJb1EhjJQykLUz&number=521${tel.normalizado}`} target="_blank" rel="noreferrer">WhatsApp (Tako)</a>}
              {e.hubspot_id && <a className="rounded-lg border border-line px-2.5 py-1 font-semibold hover:bg-cream" href={`https://app.hubspot.com/contacts/47582826/record/0-1/${e.hubspot_id}`} target="_blank" rel="noreferrer">HubSpot</a>}
            </div>
            <ExpedienteAcciones personaId={e.persona_id} esMia={e.cabecera_id === m.id} sinCabecera={!e.cabecera_id} etapa={e.etapa} />
          </div>
        </div>
        <nav className="mt-4 flex flex-wrap gap-1 border-t border-line pt-3 text-sm">
          {TABS.map(([t, l]) => (
            <Link key={t} href={href(t)} className={`rounded-lg px-3 py-1.5 ${tab === t ? 'bg-ink font-semibold text-white' : 'hover:bg-cream'}`}>
              {l}{t === 'oportunidades' && opsAbiertas.length ? <span className="ml-1 rounded-full bg-lime px-1.5 text-[10px] text-ink">{opsAbiertas.length}</span> : null}{t === 'resumen' && alertas.length ? <span className="ml-1 rounded-full bg-amber-200 px-1.5 text-[10px] text-ink">{alertas.length}</span> : null}
            </Link>
          ))}
        </nav>
      </div>

      {tab === 'resumen' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-line bg-white p-5">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Kpi label="Régimen" v={e.ley ?? '—'} sub={e.ley_capa === 'validado' ? `SISEC al ${fmtFecha(e.ley_en)}${e.ley_vigente === false ? ' · conviene actualizar' : ''}` : e.ley_capa ?? ''} />
                <Kpi label="Semanas" v={e.semanas ? fmtNum(e.semanas) : '—'} sub={e.semanas_capa === 'validado' ? 'oficial' : e.semanas_capa === 'declarado' ? 'declaradas' : ''} />
                <Kpi label="Pensión base" v={e.pension_base ? fmtMXN(e.pension_base) : '—'} sub={e.edad_base ? `a los ${e.edad_base}` : ''} />
                <Kpi label="Pensión máxima" v={e.pension_maxima ? fmtMXN(e.pension_maxima) : '—'} sub={e.edad_maxima ? `a los ${e.edad_maxima}` : ''} green />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
                <Mini label="Cotiza" v={e.status_empleo ?? '—'} />
                <Mini label="Derechos Ley 73" v={e.ley === 'Ley97' ? 'n/a' : e.conserva_derechos == null ? '—' : e.conserva_derechos ? 'Vigentes' : 'No vigentes'} />
                <Mini label="Mod 40 retro hoy" v={e.mod40_retro_aplica == null ? '—' : e.mod40_retro_aplica ? `Sí · ${e.pension_mod40_retro ? fmtMXN(e.pension_mod40_retro) : ''}` : 'No'} />
                <Mini label="Saldo Infonavit" v={e.saldo_infonavit ? fmtMXN(e.saldo_infonavit) : '—'} sub={e.saldo_infonavit == null ? undefined : e.saldo_infonavit_vigente === false ? 'reportado, vencido' : e.saldo_infonavit_capa === 'validado' ? 'validado' : e.saldo_infonavit_capa === 'declarado' ? 'reportado' : 'estimado'} />
              </div>
              <SaldoInfonavitAccion personaId={e.persona_id} saldo={e.saldo_infonavit == null ? null : Number(e.saldo_infonavit)} estimado={e.saldo_infonavit_estimado == null ? null : Number(e.saldo_infonavit_estimado)} capa={e.saldo_infonavit_capa ?? null} origen={e.saldo_infonavit_origen ?? null} en={e.saldo_infonavit_en ?? null} vigente={e.saldo_infonavit_vigente ?? null} credito={e.credito_infonavit ?? null} />
              {e.dolor_principal && <p className="mt-4 rounded-xl bg-cream p-3 text-sm">“{e.dolor_principal}”</p>}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span><b className={e.ley_vigente === false ? 'text-amber-700' : 'text-ink'}>Datos del IMSS (SISEC) al {e.ley_en ? fmtFecha(e.ley_en) : '—'}</b>{e.ley_en ? ` · hace ${Math.floor((Date.now() - new Date(e.ley_en).getTime()) / 86400000)} días` : ''}</span>
                {ultimaConsulta && ['solicitada', 'en_proceso'].includes(ultimaConsulta.estado) ? <span className="text-amber-700">Actualización en proceso ({ultimaConsulta.proveedor}) desde {fmtFecha(ultimaConsulta.created_at)}</span> : ultimaConsulta?.estado === 'error' ? <span className="text-red-600">Última solicitud falló: {ultimaConsulta.error}</span> : null}
              </div>
            </section>

            <section className="rounded-2xl border border-line bg-white p-5">
              <h2 className="mb-3 text-sm font-bold">Orden de situación {alertas.length ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">{alertas.length} alertas</span> : null}</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {(ck ?? []).map((c: Any) => (
                  <li key={c.item} className="flex items-start gap-2 text-sm">
                    <span className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${c.estado === 'ok' ? 'bg-green-500' : c.estado === 'alerta' ? (c.severidad === 'alta' ? 'bg-red-500' : 'bg-amber-400') : c.estado === 'no_aplica' ? 'bg-gray-300' : 'bg-gray-200'}`} />
                    <span>{CHECK_LABEL[c.item] ?? c.item}{c.detalle ? <span className="text-muted"> · {c.detalle}</span> : null}{c.estado === 'sin_dato' ? <span className="text-muted"> · sin dato</span> : null}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-line bg-white p-5">
              <h2 className="mb-3 text-sm font-bold">Información clave <span className="ml-2 text-xs font-normal text-muted">(edita junto a cada dato o pide actualización por grupo · <Link href={href('datos')} className="underline">ver todo</Link>)</span></h2>
              <DatosTabla personaId={e.persona_id} rows={rows.filter((r) => ['identidad', 'imss', 'afore', 'infonavit'].includes(r.grupo) && (r.valor != null || ['curp', 'nombre', 'fecha_nacimiento', 'ley', 'semanas_cotizadas', 'status_empleo', 'ultima_cotizacion', 'afore_actual', 'saldo_rcv97', 'saldo_infonavit', 'credito_infonavit_vigente'].includes(r.campo)))} grupos={['identidad', 'imss', 'afore', 'infonavit']} fechas={{ imss: e.ley_en }} />
            </section>

            <HistorialLaboral historial={historialLaboral} />
          </div>
          <aside className="space-y-4">
            <CompartirLinks directo={(miLink as string | null) ?? null} expediente={urlExpediente} referido={urlReferido} />
            <section className="rounded-2xl border border-line bg-white p-5">
              <h2 className="mb-2 text-sm font-bold">Pedir información</h2>
              <ConsultaForm personaId={e.persona_id} />
            </section>
            <section className="rounded-2xl border border-line bg-white p-5">
              <h2 className="mb-2 text-sm font-bold">Última consulta IMSS</h2>
              <ReprocesarConsulta
                personaId={e.persona_id}
                ultima={(ultimaImss ?? null) as UltimaConsulta | null}
                inconsistencia={inconsistencia}
                proveedores={((proveedores ?? []) as Any[]).map((p) => ({ codigo: p.codigo, nombre: p.nombre, costo_unitario: p.costo_unitario == null ? null : Number(p.costo_unitario) })) as Proveedor[]}
              />
            </section>
            <section className="rounded-2xl border border-line bg-white p-5">
              <h2 className="mb-2 text-sm font-bold">Contexto</h2>
              <DatosTabla personaId={e.persona_id} rows={rows.filter((r) => r.grupo === 'contexto')} grupos={['contexto']} compacto />
            </section>
            {opsAbiertas.length ? (
              <section className="rounded-2xl border border-line bg-white p-5">
                <h2 className="mb-2 text-sm font-bold">Oportunidades <Link href={href('oportunidades')} className="ml-1 text-xs font-normal underline">ver</Link></h2>
                <ul className="space-y-1 text-xs">{opsAbiertas.slice(0, 5).map((o: Any) => <li key={o.id} className="flex justify-between gap-2"><span>{catMap.get(o.codigo)?.nombre ?? o.codigo}</span><span className="font-semibold">{o.valor_estimado ? fmtMXN(o.valor_estimado) : ESTADO_OP_LABEL[o.estado]}</span></li>)}</ul>
              </section>
            ) : null}
          </aside>
        </div>
      )}

      {tab === 'calculadoras' && (
        <section className="rounded-2xl border border-line bg-white p-2 sm:p-5">
          {semilla ? (
            <>
              <CalculadoraClient
                consultaId={e.legacy_cliente_id ?? e.persona_id}
                clienteNombre={[e.nombre, e.apellidos].filter(Boolean).join(' ') || semilla.perfil.nombre}
                semilla={semilla}
                branding={{ colorPrimario: '#26282b', colorAcento: '#d1f069', logoUrl: null }}
                backHref={href('resumen')}
                backLabel="← Volver al resumen"
                fechaSisec={fechaSisecTxt}
                calculoGeneradoAt={semillaAt}
                mod40Aplica={mod40AplicaLegacy ?? !!(e.mod40_retro_aplica || semilla.perfil.aplica_mod40)}
                calculoPensional={datosMap.get('semilla')?.valor}
                historialLaboral={historialLaboral}
                limiteInscripcionMod40={limiteMod40}
                saldosCorregidos={saldosCorregidos}
                guardarScope={e.legacy_cliente_id ? 'cliente' : null}
              />
              <p className="mt-2 px-3 text-xs text-muted">Los ajustes de la calculadora (semanas ±, saldos reales) son escenarios; el dato oficial del expediente no cambia. Los saldos guardados se reflejan como “Declarado por asesor” en <Link href={href('datos')} className="underline">Información</Link>{avisoSaldoEstimado ? <> · <span className="text-amber-700">el saldo Infonavit que ves aquí es nuestro estimado, no un dato de su cuenta</span></> : null}.</p>
            </>
          ) : (
            <div className="p-5 text-sm text-muted">Sin semilla de cálculo todavía. Pide la información del IMSS desde <Link href={href('resumen')} className="underline">Resumen → Pedir información</Link>{e.curp ? '' : ' (primero captura la CURP)'}.</div>
          )}
        </section>
      )}

      {tab === 'infonavit' && (
        baseInfonavit && supInfonavit ? (
          <AsesoriaInfonavit
            personaId={e.persona_id}
            historial={historialInf}
            faltantes={baseInfonavit.faltantes}
            desdeSemilla={baseInfonavit.desdeSemilla}
            cliente={{
              nombre: [e.nombre, e.apellidos].filter(Boolean).join(' ') || '(sin nombre)',
              ley: e.ley ?? '—',
              edad: e.edad ?? null,
              cotiza: e.status_empleo === 'empleado',
              creditoVigente: e.credito_infonavit ?? null,
            }}
            base={baseInfonavit.titular}
            origen={baseInfonavit.origen}
            saldo={{ capa: e.saldo_infonavit_capa ?? null, estimado: e.saldo_infonavit_estimado == null ? null : Number(e.saldo_infonavit_estimado), vigente: e.saldo_infonavit_vigente ?? null }}
            proyectos={proyectosInf}
            supuestos={supInfonavit}
          />
        ) : (
          <section className="rounded-2xl border border-line bg-white p-5 text-sm text-muted">
            Faltan los supuestos globales de la asesoría Infonavit. Cárgalos en <Link href="/trabajo/proyectos" className="underline">Inmuebles</Link>.
          </section>
        )
      )}

      {tab === 'datos' && (
        <section className="rounded-2xl border border-line bg-white p-5">
          <p className="mb-3 text-xs text-muted">Mejor dato por campo: <span className="rounded bg-green-50 px-1 text-green-700">Oficial</span> (instituto/proveedor) &gt; <span className="rounded bg-blue-50 px-1 text-blue-700">Trol</span> (calculado) &gt; <span className="rounded bg-amber-50 px-1 text-amber-700">Declarado</span>. Tachado = vencido. “editar” captura o corrige; el botón de cada grupo pide la actualización al proveedor.</p>
          <DatosTabla personaId={e.persona_id} rows={rows} grupos={['identidad', 'imss', 'afore', 'infonavit', 'issste', 'contexto', 'calculo']} fechas={{ imss: e.ley_en, calculo: datosMap.get('semilla')?.obtenido_en }} />
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-1 text-xs font-bold uppercase text-muted">Consultas</h3>
            <ul className="space-y-1 text-xs">
              {(consultas ?? []).map((c: Any) => (
                <li key={c.id} className="flex justify-between gap-2 border-t border-line/70 py-1">
                  <span>{c.tipo} · {c.proveedor ?? '—'} <span className="text-muted">· {c.solicitante_tipo}{c.motivo ? ` · ${c.motivo}` : ''}</span></span>
                  <span className={c.estado === 'completada' ? 'text-green-700' : c.estado === 'error' || c.estado === 'sin_resultado' ? 'text-red-600' : 'text-amber-700'}>{c.estado} · {fmtFecha(c.created_at)}{c.error ? ` · ${c.error}` : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {tab === 'documentos' && (<div className="space-y-4"><BeneficiosPanel personaId={e.persona_id} beneficios={bens ?? []} catalogo={(catBen ?? []) as { codigo: string; nombre: string }[]} /><DocumentosPanel personaId={e.persona_id} docs={docs ?? []} legacy={legacyDocs ?? null} tiposSubida={(catDocs ?? []) as { tipo: string; nombre: string; formatos: string[]; parseable: boolean }[]} tieneCurp={!!e.curp} /></div>)}

      {tab === 'oportunidades' && (
        <section className="rounded-2xl border border-line bg-white p-5">
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
      )}

      {tab === 'viraal' && (
        <div className="space-y-2">
          {avisoSaldoEstimado && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">La liquidez de la mesa incluye {e.saldo_infonavit ? fmtMXN(e.saldo_infonavit) : '—'} de Infonavit que <b>nadie ha confirmado</b>: es nuestro estimado. Confírmalo en <Link href={href('resumen')} className="underline">Resumen</Link> antes de comprometer un plan de pagos.</p>}
          <MesaViraal
            personaId={e.persona_id}
            prefill={viraalPrefill}
            historial={viraalHist}
            semilla={semilla}
            saldosLiquidos={saldosLiq}
            historialLaboral={historialLaboral}
            limiteInscripcionMod40={limiteMod40}
            hoyIso={hoyIso}
          />
        </div>
      )}

      {tab === 'bitacora' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
          <section className="rounded-2xl border border-line bg-white p-5">
            <h2 className="mb-3 text-sm font-bold">Bitácora</h2>
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
          <aside className="space-y-4">
            <section className="rounded-2xl border border-line bg-white p-5">
              <h2 className="mb-2 text-sm font-bold">Citas</h2>
              <CitaForm personaId={e.persona_id} />
              <ul className="mt-2 space-y-1 text-xs">{(citas ?? []).map((c: Any) => <li key={c.id}>{new Date(c.inicio).toLocaleString('es-MX')} · {c.estado} · {c.origen}{c.notas ? ` · ${c.notas}` : ''}</li>)}</ul>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, v, sub, green }: { label: string; v: string; sub?: string; green?: boolean }) {
  return <div><div className="text-[11px] uppercase tracking-wide text-muted">{label}</div><div className={`text-xl font-extrabold ${green ? 'text-green-700' : ''}`}>{v}</div>{sub ? <div className="text-[11px] text-muted">{sub}</div> : null}</div>;
}
function Mini({ label, v, sub }: { label: string; v: string; sub?: string }) {
  return <div><div className="text-[11px] text-muted">{label}</div><div className="font-semibold">{v}</div>{sub ? <div className="text-[10px] text-muted">{sub}</div> : null}</div>;
}
