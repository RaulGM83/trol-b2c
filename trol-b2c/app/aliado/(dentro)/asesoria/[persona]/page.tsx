// 302c · La calculadora del aliado (claude/119-120). Raúl, 10-nov: "muestra salarios, patrones, todo lo que vemos
// para que pueda hacer una buena asesoría incluso sin nuestro apoyo". Ley 73 y 97; sin Infonavit ni PPR.
//
// Gate: `expediente_aliado_completo` sólo responde si la persona es referido atribuido del aliado Y tiene orden pagada
// de cálculos / asesoría completa (aliado_puede_calcular). Sin eso, aquí no se pinta nada.
// La calculadora es la MISMA del equipo (CalculadoraClient); cierra escenarios con la sesión del aliado
// (cerrar_escenario acepta aliado desde 302b) y de ahí sale su diagnóstico "Elaborado por" (302d).
import Link from 'next/link';
import { parseSemillaV2 } from '@trol/pension-core/semilla';
import { requireAliado, t3, t3admin, fmtFecha, type Any } from '@/lib/trol3/server';
import { leerSerieINPC } from '@/lib/trol3/inpc';
import { CalculadoraClient, type SaldosCorregidos } from '@/components/portal/calculadora-client';
import { HistorialLaboral } from '@/components/trol3/HistorialLaboral';
import { DiagnosticoAliado } from '@/components/trol3/DiagnosticoAliado';
import { leyLabel } from '@/components/trol3/ResultadoAliado';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Calculadora · Aliados Trol' };

const mxn0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const money = (n: unknown) => (n == null || n === '' ? '—' : mxn0.format(Number(n)));
const EMPLEO: Record<string, string> = { empleado: 'Sí, cotiza hoy', desempleado: 'No cotiza hoy', pensionado: 'Ya está pensionado' };

function Dato({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{k}</div>
      <div className="text-sm font-semibold">{v ?? '—'}</div>
    </div>
  );
}

export default async function CalculadoraAliado({ params }: { params: { persona: string } }) {
  const a = await requireAliado();
  const db = t3();
  const { data: j, error } = await db.rpc('expediente_aliado_completo', { p_persona: params.persona });
  if (error || !j) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
        No tienes la calculadora de esta persona. Se desbloquea al pedir sus cálculos o la asesoría completa desde su tarjeta.{' '}
        <Link href="/aliado" className="underline">Volver a tus clientes</Link>
      </div>
    );
  }
  const x = j as Any;
  const e = x.expediente as Record<string, Any>;
  const datos = new Map<string, Any>(((x.datos ?? []) as Any[]).map((d) => [d.campo, d]));
  const val = (c: string) => datos.get(c)?.valor;
  const semilla = parseSemillaV2(x.semilla);
  const nombre = [e.nombre, e.apellidos].filter(Boolean).join(' ') || semilla?.perfil.nombre || 'Cliente';
  const historial = (x.historial ?? []) as Any[];

  const num = (c: string): number | undefined => { const v = val(c); const n = v == null ? NaN : Number(v); return Number.isFinite(n) ? n : undefined; };
  const saldosCorregidos = {
    rcv97: num('saldo_rcv97'), infonavit: num('saldo_infonavit'), disponible_afore: num('disponible_afore'),
    ahorro_voluntario: num('ahorro_voluntario'), ahorro_voluntario_mensual: num('ahorro_voluntario_mensual'),
    plan_corporativo: num('plan_corporativo'), plan_corporativo_mensual: num('plan_corporativo_mensual'),
    otros_planes: num('otros_planes'), otros_planes_mensual: num('otros_planes_mensual'),
    ...Object.fromEntries(Object.entries((x.saldos_corregidos ?? {}) as Record<string, unknown>).filter(([, v]) => v != null)),
  } as SaldosCorregidos;
  const limiteMod40 = (() => { const v = val('limite_inscripcion_mod40'); return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null; })();

  // Lo que no depende de la persona se lee con la llave de servicio (INPC y supuestos del rescate).
  const admin = t3admin();
  const [serieINPC, { data: supRow }] = await Promise.all([leerSerieINPC(admin), admin.from('infonavit_supuestos').select('rescate_sin_costo_desde,rescate_costo_pct').eq('id', 'default').maybeSingle()]);
  const rescate = supRow ? { sinCostoDesde: Number((supRow as Any).rescate_sin_costo_desde), costoPct: Number((supRow as Any).rescate_costo_pct) } : null;
  const rawFechaSisec = (x.semilla as { meta?: { fecha_sisec?: string } } | null)?.meta?.fecha_sisec;
  const fechaSisecTxt = rawFechaSisec && /^\d{4}-\d{2}-\d{2}/.test(rawFechaSisec) ? fmtFecha(rawFechaSisec) : e.ley_en ? fmtFecha(e.ley_en) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link href="/aliado" className="text-xs text-muted underline">← Tus clientes</Link>
          <h1 className="text-xl font-extrabold">{nombre}</h1>
          <p className="text-xs text-muted">Calculadora de pensión · la asesoría la haces tú con la información oficial del IMSS. Lo que generes sale firmado como elaborado por ti{a.empresa ? ` (${a.empresa})` : ''}, no por Trol.</p>
        </div>
      </div>

      <section className="rounded-2xl border border-line bg-white p-5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Lo que dice el IMSS{x.semilla_en ? ` · ${fmtFecha(x.semilla_en)}` : ''}</div>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
          <Dato k="Edad" v={e.edad != null ? `${e.edad} años` : null} />
          <Dato k="Ley" v={leyLabel(e.ley ?? null)} />
          <Dato k="Semanas" v={e.semanas != null ? Number(e.semanas).toLocaleString('es-MX') : null} />
          <Dato k="Cotiza hoy" v={e.status_empleo ? EMPLEO[e.status_empleo] ?? e.status_empleo : null} />
          <Dato k="Derechos" v={e.conserva_derechos == null ? null : e.conserva_derechos ? `Vigentes${e.fin_conservacion ? ` hasta ${fmtFecha(e.fin_conservacion)}` : ''}` : 'Hay que reactivarlos'} />
          <Dato k="AFORE" v={e.afore_actual} />
          <Dato k="Salario diario registrado" v={val('salario_diario') != null ? money(val('salario_diario')) : null} />
          <Dato k="Saldo RCV 97" v={e.saldo_rcv97 != null ? money(e.saldo_rcv97) : null} />
          <Dato k="Saldo Infonavit" v={e.saldo_infonavit != null ? money(e.saldo_infonavit) : null} />
          <Dato k="Última cotización" v={val('ultima_cotizacion') ? fmtFecha(String(val('ultima_cotizacion'))) : null} />
          <Dato k="Mod 40" v={e.mod40_retro_aplica == null ? null : e.mod40_retro_aplica ? 'Aplica' : 'No aplica'} />
          <Dato k="Pensión estimada hoy" v={e.pension_base != null && Number(e.pension_base) > 0 ? `${money(e.pension_base)} / mes` : null} />
        </div>
        {e.inconsistencia_imss ? <p className="mt-2 text-xs text-amber-900">Inconsistencia en el IMSS: {e.inconsistencia_imss}</p> : null}
      </section>

      <HistorialLaboral historial={historial} />

      <section className="rounded-2xl border border-line bg-white p-2 sm:p-5">
        {semilla ? (
          <>
            <CalculadoraClient
              consultaId={params.persona}
              clienteNombre={nombre}
              semilla={semilla}
              branding={{ colorPrimario: '#26282b', colorAcento: '#d1f069', logoUrl: null }}
              backHref="/aliado"
              backLabel="← Tus clientes"
              fechaSisec={fechaSisecTxt}
              calculoGeneradoAt={x.semilla_en ? fmtFecha(x.semilla_en) : null}
              mod40Aplica={!!(x.mod40_legacy || e.mod40_retro_aplica || semilla.perfil.aplica_mod40)}
              calculoPensional={x.semilla}
              historialLaboral={historial}
              limiteInscripcionMod40={limiteMod40}
              serieINPC={serieINPC}
              saldosCorregidos={saldosCorregidos}
              guardarScope={null}
              rescate={rescate}
              cerrarEscenario={{ personaId: params.persona }}
            />
            <p className="mt-2 px-3 text-xs text-muted">Los ajustes (semanas ±, saldos) viven en tus escenarios; el expediente oficial no cambia. Cierra los escenarios que quieras llevar al diagnóstico.</p>
          </>
        ) : (
          <div className="p-5 text-sm text-muted">Todavía no hay cálculo del IMSS para esta persona (falta su historial). En cuanto llegue, aquí aparece la calculadora.</div>
        )}
      </section>

      <DiagnosticoAliado persona={params.persona} nombreAliado={a.nombre} empresa={a.empresa ?? null} creditos={a.creditos ?? null} />
    </div>
  );
}
