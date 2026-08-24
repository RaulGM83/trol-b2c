import Link from 'next/link';
import { notFound } from 'next/navigation';
import { parseSemillaV2 } from '@/lib/imss/semilla';
import { requireMiembro, t3, fmtMXN, fmtNum, fmtFecha, type Any } from '@/lib/trol3/server';
import { GestionAliado } from '@/components/trol3/GestionAliado';
import { MesaViraal } from '@/components/trol3/MesaViraal';
import { CalculadoraClient, type SaldosCorregidos } from '@/components/portal/calculadora-client';

export const dynamic = 'force-dynamic';

const TABS: [string, string][] = [['resumen', 'Resumen'], ['calculadora', 'Calculadora'], ['autorizar', 'Autorizar']];

const toNum = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === 'string' ? parseFloat(v.replace(/[, ]/g, '')) : (v as number);
  return Number.isFinite(n) ? n : null;
};

export default async function ConsultaAliadoDetalle({ params, searchParams }: { params: { id: string }; searchParams: { tab?: string } }) {
  await requireMiembro();
  const tab = TABS.some(([t]) => t === searchParams.tab) ? (searchParams.tab as string) : 'resumen';
  const db = t3();

  const [{ data: c }, { data: miembros }] = await Promise.all([
    db.from('consultas_aliados').select('*').eq('id', params.id).maybeSingle(),
    db.from('miembros').select('id,nombre,email,roles').eq('activo', true).order('nombre'),
  ]);
  if (!c) notFound();
  const miembrosOpt = (miembros ?? []).map((x: Any) => ({ id: x.id, nombre: x.nombre ?? x.email }));

  const { data: viraalAut } = await db.from('viraal_autorizaciones').select('*').eq('consulta_aliado_id', params.id).order('created_at', { ascending: false }).limit(50);
  const viraalHist = (viraalAut ?? []).map((a: Any) => ({ ...a, miembro: (miembros ?? []).find((x: Any) => x.id === a.miembro_id)?.nombre ?? null }));

  const calc = (c.calculo_pensional ?? null) as Any;
  const diag = (calc?.diagnostico ?? {}) as Any;
  const saldosCalc = (calc?.saldos ?? {}) as Any;
  const semilla = parseSemillaV2(calc);
  const corr = (c.saldos_corregidos_trol ?? c.saldos_corregidos ?? null) as SaldosCorregidos | null;

  const afore = corr?.disponible_afore ?? ((toNum(saldosCalc.rcv97) ?? 0) + (toNum(saldosCalc.sar92) ?? 0) || null);
  const infonavit = corr?.infonavit ?? toNum(saldosCalc.infonavit);
  const saldosLiq = (afore != null || infonavit != null) ? (Number(afore ?? 0) + Number(infonavit ?? 0)) : null;
  // Mesa Viraal: el proyecto lo recalcula la mesa en vivo con la semilla del aliado
  // (línea IMSS = pago al IMSS, no el costo total) a la fecha de trámite que elija el
  // asesor. Fallback: escenario mod40_retro_hoy del pipeline.
  const hoyIso = new Date().toISOString().slice(0, 10);
  const historialAliado = (calc?.historial ?? null) as Any[] | null;
  // Aquí NO se pasa `limite_inscripcion_mod40`: la consulta del aliado trae el
  // límite de 5 años de la semilla, y para una baja de Mod 40 el bueno es el de
  // 12 meses (art. 220). Sin expediente de trol3 que lo corrija, manda el
  // cálculo local sobre el historial.
  const escHoy = (calc?.escenarios?.mod40_retro_hoy ?? {}) as Any;
  const prefill: Record<string, number | null> = {
    imss: toNum(escHoy.costo_imss) ?? toNum(diag.costo_retroactivo_hoy),
    gest: toNum(escHoy.costo_gestorias),
    pension: toNum(escHoy.calculatedPension) ?? toNum(diag.pension_mod40_retro_hoy),
    saldos: saldosLiq,
  };

  const nombre = [c.nombre, c.apellidos].filter(Boolean).join(' ') || '(sin nombre)';
  const href = (t: string) => `/trabajo/aliados/${params.id}?tab=${t}`;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/trabajo/aliados" className="text-xs text-muted underline">← Consultas de aliados</Link>
            <h1 className="mt-1 text-2xl font-extrabold">{nombre}</h1>
            <div className="mt-1 text-sm text-muted">
              {c.edad ? `${c.edad} años` : 'edad —'} · {c.curp ?? <span className="text-red-600">sin CURP</span>}{diag.nss ? ` · NSS ${diag.nss}` : ''}{c.estado_republica ? ` · ${c.estado_republica}` : ''}
            </div>
            <div className="mt-1 text-xs text-muted">Aliado <b>{c.aliado}</b> · canal {c.canal ?? '—'} · consulta del {fmtFecha(c.creada_en)}{c.consultas_n && c.consultas_n > 1 ? ` · ${c.consultas_n} consultas` : ''} · pipeline {c.status_origen}</div>
          </div>
          <div className="min-w-[280px]">
            <GestionAliado id={c.id} estatus={c.gestion_estatus} vobo={c.vobo} asignadoA={c.asignado_a} comentario={c.comentario} miembros={miembrosOpt} />
          </div>
        </div>
        <nav className="mt-4 flex flex-wrap gap-1 border-t border-line pt-3 text-sm">
          {TABS.map(([t, l]) => (
            <Link key={t} href={href(t)} className={`rounded-lg px-3 py-1.5 ${tab === t ? 'bg-ink font-semibold text-white' : 'hover:bg-cream'}`}>
              {l}{t === 'autorizar' && viraalHist.length ? <span className="ml-1 rounded-full bg-lime px-1.5 text-[10px] text-ink">{viraalHist.length}</span> : null}
            </Link>
          ))}
        </nav>
      </div>

      {tab === 'resumen' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <section className="rounded-2xl border border-line bg-white p-5">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Kpi label="Régimen" v={diag.ley ?? semilla?.meta.ley ?? '—'} sub={diag.fecha_sisec ? `SISEC ${fmtFecha(diag.fecha_sisec)}` : ''} />
                <Kpi label="Semanas" v={diag.semanas_cotizadas ? fmtNum(toNum(diag.semanas_cotizadas)) : '—'} />
                <Kpi label="Pensión base" v={diag.escenario_base ? fmtMXN(toNum(diag.escenario_base)) : '—'} sub={diag.edad_escenario_base ? `a los ${diag.edad_escenario_base}` : ''} />
                <Kpi label="Pensión máxima" v={diag.escenario_maximo ? fmtMXN(toNum(diag.escenario_maximo)) : '—'} sub={diag.edad_escenario_maximo ? `a los ${diag.edad_escenario_maximo}` : ''} green />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
                <Mini label="Mod 40" v={diag.mod40 ?? '—'} />
                <Mini label="Costo retro (fut.)" v={toNum(diag.costo_retroactivo_futuro) ? fmtMXN(toNum(diag.costo_retroactivo_futuro)) : '—'} />
                <Mini label="Saldo Afore" v={afore != null ? fmtMXN(afore) : '—'} />
                <Mini label="Saldo Infonavit" v={infonavit != null ? fmtMXN(infonavit) : '—'} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 text-sm">
                <Mini label="Cotiza" v={diag.status_empleo ?? '—'} />
                <Mini label="Derechos Ley 73" v={diag.conserva_derechos_ley_73 ?? '—'} />
                <Mini label="Vigencia derechos" v={diag.fecha_perdida_cons_der ? fmtFecha(diag.fecha_perdida_cons_der) : '—'} />
                <Mini label="Oportunidad Infonavit" v={diag.oportunidad_infonavit ?? '—'} />
              </div>
              {corr?.actualizado_at && <p className="mt-3 text-[11px] text-amber-700">Saldos corregidos por asesor el {fmtFecha(corr.actualizado_at)} — se usan en la calculadora y la mesa.</p>}
            </section>

            {diag.asesoria_basica && (
              <section className="rounded-2xl border border-line bg-white p-5">
                <h2 className="mb-2 text-sm font-bold">Diagnóstico del aliado</h2>
                <p className="whitespace-pre-wrap text-sm text-ink/90">{String(diag.asesoria_basica)}</p>
              </section>
            )}
          </div>
          <aside className="space-y-4">
            <section className="rounded-2xl border border-line bg-white p-5">
              <h2 className="mb-2 text-sm font-bold">Documentos</h2>
              <div className="flex flex-col gap-1 text-sm">
                {c.documento_diagnostico_url && <a href={c.documento_diagnostico_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">Diagnóstico</a>}
                {c.documento_diagnostico_avanzado_url && <a href={c.documento_diagnostico_avanzado_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">Diagnóstico avanzado</a>}
                {c.documento_sisec_url && <a href={c.documento_sisec_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">SISEC</a>}
                {c.documento_checkup_url && <a href={c.documento_checkup_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">Checkup</a>}
                {!c.documento_diagnostico_url && !c.documento_diagnostico_avanzado_url && !c.documento_sisec_url && !c.documento_checkup_url && <span className="text-muted">Sin documentos.</span>}
              </div>
            </section>
            <section className="rounded-2xl border border-line bg-white p-5">
              <h2 className="mb-2 text-sm font-bold">Acciones</h2>
              <div className="flex flex-col gap-2 text-sm">
                <Link href={href('calculadora')} className="rounded-lg border border-line px-3 py-2 text-center font-semibold hover:bg-cream">Abrir calculadora</Link>
                <Link href={href('autorizar')} className="rounded-lg bg-ink px-3 py-2 text-center font-semibold text-white hover:opacity-90">Ir a autorizar (Viraal)</Link>
              </div>
            </section>
          </aside>
        </div>
      )}

      {tab === 'calculadora' && (
        <section className="rounded-2xl border border-line bg-white p-2 sm:p-5">
          {semilla ? (
            <>
              <CalculadoraClient
                consultaId={c.id}
                clienteNombre={nombre}
                semilla={semilla}
                branding={{ colorPrimario: '#26282b', colorAcento: '#d1f069', logoUrl: null }}
                backHref={href('resumen')}
                backLabel="← Volver al resumen"
                fechaSisec={diag.fecha_sisec && /^\d{4}-\d{2}-\d{2}/.test(String(diag.fecha_sisec)) ? fmtFecha(diag.fecha_sisec) : null}
                calculoGeneradoAt={fmtFecha(c.creada_en)}
                mod40Aplica={diag.mod40 === 'Sí' || !!semilla.perfil.aplica_mod40}
                calculoPensional={calc}
                historialLaboral={historialAliado}
                saldosCorregidos={corr}
                guardarScope="consulta_aliado"
              />
              <p className="mt-2 px-3 text-xs text-muted">Los ajustes (semanas ±, saldos reales) son escenarios de esta consulta del aliado; no cambian los datos del aliado. Los saldos guardados se usan al prellenar la mesa Viraal.</p>
            </>
          ) : (
            <div className="p-5 text-sm text-muted">Esta consulta no trae un cálculo completo (semilla v2). Sólo hay resumen/documentos. Estatus del pipeline: <b>{c.status_origen}</b>.</div>
          )}
        </section>
      )}

      {tab === 'autorizar' && (
        <MesaViraal
          consultaAliadoId={c.id}
          prefill={prefill}
          historial={viraalHist}
          semilla={semilla}
          saldosLiquidos={saldosLiq}
          historialLaboral={historialAliado}
          limiteInscripcionMod40={null}
          hoyIso={hoyIso}
        />
      )}
    </div>
  );
}

function Kpi({ label, v, sub, green }: { label: string; v: string; sub?: string; green?: boolean }) {
  return <div><div className="text-[11px] uppercase tracking-wide text-muted">{label}</div><div className={`text-xl font-extrabold ${green ? 'text-green-700' : ''}`}>{v}</div>{sub ? <div className="text-[11px] text-muted">{sub}</div> : null}</div>;
}
function Mini({ label, v }: { label: string; v: string }) {
  return <div><div className="text-[11px] text-muted">{label}</div><div className="font-semibold">{v}</div></div>;
}
