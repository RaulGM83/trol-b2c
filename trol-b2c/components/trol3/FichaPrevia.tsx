'use client';
// 307 · Ficha previa (claude/122): todo lo relevante del contacto en un solo lugar, arriba de
// Relación. La ficha solo se lee; lo que cuesta dinero vive en el panel lateral «Actualizar
// información» y nada se pide solo. Los datos salen de una sola llamada: trol3.ficha_previa().
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { pedirConsulta, type OrigenPersona } from '@/app/trabajo/actions';
import { Copiable, describirOrigen } from '@/components/trol3/RelacionExtras';
import { registrarUso } from '@/components/trol3/RegistroUso';
import type { FichaConsulta, FichaPreviaData } from '@/lib/trol3/ficha';

const mxn0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const num0 = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
const esNum = (x: unknown): x is number | string => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x));
const money = (x: unknown) => (esNum(x) ? mxn0.format(Number(x)) : '—');
const dia = (iso?: unknown) => {
  if (typeof iso !== 'string' || !iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
};
const mesAnio = (iso?: unknown) => {
  if (typeof iso !== 'string' || !iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' });
};
const hora = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const hace = (dias: number | null) => (dias == null ? '' : dias <= 0 ? 'hoy' : dias === 1 ? 'hace 1 día' : `hace ${dias} días`);
const siNo = (x: unknown) => (x === true || x === 'true' ? 'Sí' : x === false || x === 'false' ? 'No' : '—');
const aniosMeses = (x: unknown) => {
  if (!esNum(x)) return '—';
  const meses = Math.round(Number(x) * 12); const a = Math.floor(meses / 12); const m = meses % 12;
  return [a ? `${a} ${a === 1 ? 'año' : 'años'}` : null, m ? `${m} ${m === 1 ? 'mes' : 'meses'}` : null].filter(Boolean).join(' ') || 'menos de un mes';
};

type Tono = 'ok' | 'warn' | 'bad' | 'neu';
const TONO: Record<Tono, string> = { ok: 'bg-green-100 text-green-900', warn: 'bg-amber-100 text-amber-900', bad: 'bg-red-100 text-red-900', neu: 'bg-cream text-ink' };
const Chip = ({ tono, children }: { tono: Tono; children: React.ReactNode }) => <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${TONO[tono]}`}>{children}</span>;
const H = ({ children }: { children: React.ReactNode }) => <span className="text-[11px] font-bold uppercase tracking-wide text-muted">{children}</span>;
const Fila = ({ k, children, fuerte }: { k: string; children: React.ReactNode; fuerte?: boolean }) => (
  <div className="flex items-baseline justify-between gap-3 text-sm"><span className="shrink-0 text-muted">{k}</span><span className={`text-right ${fuerte ? 'font-bold' : ''}`}>{children}</span></div>
);
const tarjeta = 'flex flex-col gap-2 rounded-xl border border-line bg-white p-4';
const dark = 'rounded-lg bg-ink px-3 py-2 text-xs font-bold text-white disabled:opacity-50';
const line = 'rounded-lg border border-line bg-white px-3 py-2 text-xs font-bold disabled:opacity-50';

const ESTADO_OP: Record<string, string> = { posible: 'Por validar', detectada: 'Detectada', presentada: 'Presentada', interesada: 'Interesado', en_proceso: 'En proceso' };
const TIPO_CONSULTA: Record<string, string> = { imss_historial: 'IMSS', infonavit: 'Infonavit', ingresos: 'Ingresos e ISSSTE', issste: 'ISSSTE', cda: 'CURP' };
const USO_INFONAVIT: Record<string, string> = { vigente: 'Vigente', hace_mucho: 'Hace mucho', nunca: 'Nunca' };
const EN_CURSO = ['solicitada', 'en_proceso'];
const FALLO = ['error', 'sin_resultado'];
const MOTIVO: Record<string, string> = {
  consulta_en_curso: 'ya hay una consulta en curso', falta_nss: 'hace falta su NSS (11 dígitos)', falta_curp: 'hace falta su CURP',
  falta_telefono: 'hace falta un teléfono de 10 dígitos', solo_asesor: 'solo la puede pedir un asesor',
};

type Fuente = { tipo: 'imss_historial' | 'infonavit' | 'ingresos'; prov: string; titulo: string; al: string | null; dias: number | null; forzar: boolean };

export function FichaPrevia({ f, personaId, enviar, hrefDocs, hrefCapturar, hrefOps }: {
  f: FichaPreviaData; personaId: string;
  /** Las piezas listas para mandar (diagnóstico inicial y propuesta inicial Infonavit) las arma la página. */
  enviar?: React.ReactNode;
  hrefDocs: string; hrefCapturar: string; hrefOps: string;
}) {
  const router = useRouter();
  const [panel, setPanelRaw] = useState(false);
  const setPanel = (abierto: boolean) => { if (abierto) registrarUso(`/trabajo/p/${personaId}`, 'relacion', 'panel_actualizar'); setPanelRaw(abierto); };
  const enCurso = f.consultas.filter((c) => EN_CURSO.includes(c.estado));

  // Mientras haya una consulta en curso, la ficha se vuelve a leer sola (cada 15 s, 12 veces).
  const vueltas = useRef(0);
  useEffect(() => {
    if (!enCurso.length) { vueltas.current = 0; return; }
    const t = setInterval(() => { if (vueltas.current++ < 12) router.refresh(); else clearInterval(t); }, 15000);
    return () => clearInterval(t);
  }, [enCurso.length, router]);

  const { imss, infonavit: inf, afore, identidad: id, ingresos: ing, issste } = f;
  const saldoAforeEst = afore.saldo == null && afore.rango?.central ? afore.rango.central : null;
  const brecha = esNum(afore.expectativa) && imss.pension_base != null ? Number(afore.expectativa) - Number(imss.pension_base) : null;
  const cotiza = imss.cotiza_hoy === true || imss.cotiza_hoy === false ? siNo(imss.cotiza_hoy) : imss.status_empleo === 'empleado' ? 'Sí' : imss.status_empleo ? 'No' : '—';
  const hayIssste = !!issste.estatus && issste.estatus !== 'No identificado';
  const alBuro = ing.al ?? issste.al;
  const origen = describirOrigen((id.origen ?? null) as OrigenPersona | null);

  return (
    <section className="rounded-2xl border-2 border-ink bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold">Ficha previa</h2>
          <p className="text-xs text-muted">Lo que tiene, lo que falta y de qué hablarle, antes de escribirle o llamarle.</p>
        </div>
        <button type="button" className={dark} onClick={() => setPanel(true)}>Actualizar información{enCurso.length ? ` · ${enCurso.length} en curso` : ''}</button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className={tarjeta}>
          <div className="flex items-center justify-between gap-2"><H>IMSS</H>{imss.al ? <Chip tono={imss.vigente ? 'ok' : 'warn'}>{imss.vigente ? 'Vigente' : 'Pasa de 60 días'}</Chip> : <Chip tono="bad">Sin IMSS</Chip>}</div>
          <div className="text-sm font-bold">{imss.al ? `Al ${dia(imss.al)} · ${hace(imss.dias)}` : imss.solo_declarado ? 'Solo lo que nos dijo' : 'Sin información del IMSS'}</div>
          <Fila k="Ley">{imss.ley === 'Ley73' ? 'Ley 73' : imss.ley === 'Ley97' ? 'Ley 97' : imss.ley ?? '—'}</Fila>
          <Fila k="Semanas">{imss.semanas != null ? num0.format(Number(imss.semanas)) : '—'}{imss.semanas != null && imss.semanas_capa === 'declarado' ? <span className="text-xs text-muted"> (lo dijo él)</span> : null}</Fila>
          <Fila k="Cotiza hoy">{cotiza}{esNum(imss.salario_diario) ? ` · ${money(imss.salario_diario)} diarios` : ''}</Fila>
          <Fila k="Conserva derechos">{imss.conserva_derechos == null ? '—' : imss.conserva_derechos ? (imss.fin_conservacion ? `Hasta ${mesAnio(imss.fin_conservacion)}` : 'Sí') : 'No'}</Fila>
          <Fila k={esNum(imss.edad_base) ? `Pensión base a los ${Number(imss.edad_base)}` : 'Pensión base'} fuerte>{money(imss.pension_base)}</Fila>
        </div>

        <div className={tarjeta}>
          <div className="flex items-center justify-between gap-2"><H>Infonavit</H>{inf.al ? <Chip tono={(inf.dias ?? 0) <= 60 ? 'ok' : 'warn'}>{(inf.dias ?? 0) <= 60 ? 'Vigente' : 'Pasa de 60 días'}</Chip> : <Chip tono="neu">Sin consultar</Chip>}</div>
          <div className="text-sm font-bold">{inf.al ? `Al ${dia(inf.al)} · ${hace(inf.dias)}` : 'Sin precalificación'}</div>
          <Fila k="Saldo de vivienda">{inf.saldo != null ? <>{money(inf.saldo)}{inf.saldo_capa === 'declarado' ? <span className="text-xs text-muted"> (lo dijo él)</span> : null}</> : inf.saldo_estimado != null ? <>≈ {money(inf.saldo_estimado)} <span className="text-xs text-muted">(estimado nuestro)</span></> : '—'}</Fila>
          <Fila k="Precalifica por" fuerte>{money(inf.monto_credito)}</Fila>
          <Fila k="Relación laboral">{siNo(inf.relacion_laboral)}</Fila>
          <Fila k="Crédito">{inf.credito_vigente === true ? `Vigente${inf.numero_credito ? ` · ${String(inf.numero_credito)}` : ''}` : typeof inf.credito_uso === 'string' ? `${USO_INFONAVIT[inf.credito_uso] ?? inf.credito_uso} (lo dijo él)` : inf.credito_vigente === false ? 'Sin crédito vigente' : '—'}</Fila>
          {inf.oportunidad?.solo_cotitular ? <Fila k="Para completar">Solo con cotitular{inf.oportunidad.efectivo_minimo ? ` (o poniendo ${money(inf.oportunidad.efectivo_minimo)})` : ''}</Fila> : null}
          {inf.oportunidad?.etapa ? <Fila k="Trámite">{String(inf.oportunidad.etapa).replace(/_/g, ' ')}</Fila> : null}
        </div>

        <div className={tarjeta}>
          <div className="flex items-center justify-between gap-2"><H>AFORE y ahorros</H><Chip tono={afore.listos >= afore.total ? 'ok' : 'neu'}>{afore.listos} de {afore.total} preguntas</Chip></div>
          <div className="text-sm font-bold">{afore.afore ? `AFORE: ${afore.afore}` : 'AFORE: no la sabemos'}</div>
          <Fila k="Saldo en AFORE">{afore.saldo != null ? <>{money(afore.saldo)}{afore.saldo_capa === 'declarado' ? <span className="text-xs text-muted"> (lo dijo él)</span> : null}</> : saldoAforeEst != null ? <>≈ {money(saldoAforeEst)} <span className="text-xs text-muted">(estimado nuestro)</span></> : '—'}</Fila>
          <Fila k="Quiere retirarse">{esNum(afore.edad_retiro) || esNum(afore.expectativa) ? [esNum(afore.edad_retiro) ? `a los ${Number(afore.edad_retiro)}` : null, esNum(afore.expectativa) ? `con ${money(afore.expectativa)}` : null].filter(Boolean).join(' ') : 'Sin preguntar'}</Fila>
          {brecha != null ? <Fila k="Brecha contra lo que espera">{brecha > 0 ? `${money(brecha)} al mes` : 'La cubre'}</Fila> : null}
          <ul className="mt-1 space-y-0.5 border-t border-line pt-2 text-xs">
            {afore.preguntas.map((q) => <li key={q.n} className="flex items-start gap-2"><span aria-hidden="true" className={q.estado === 'tenemos' ? 'mt-1 h-2 w-2 shrink-0 rounded-full bg-ink' : q.estado === 'no_sabe' ? 'mt-1 h-2 w-2 shrink-0 rounded-full border-2 border-ink bg-white' : 'mt-1 h-2 w-2 shrink-0 rounded-full bg-line'} /><span className={q.estado === 'falta' ? 'text-muted' : ''}>{q.titulo}{q.estado === 'no_sabe' ? ' · no sabe' : q.estado === 'falta' ? ' · falta' : ''}</span></li>)}
          </ul>
        </div>

        <div className={tarjeta}>
          <div className="flex items-center justify-between gap-2"><H>Identidad y origen</H>{id.estatus === 'ok' ? <Chip tono="ok">Sin conflicto</Chip> : id.estatus === 'por_confirmar' ? <Chip tono="warn">Por confirmar</Chip> : id.estatus === 'confirmada_con_problema' ? <Chip tono="bad">Con problema</Chip> : <Chip tono="neu">Sin validar</Chip>}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1"><Copiable label="CURP" valor={id.curp} /><Copiable label="NSS" valor={id.nss} /></div>
          <Fila k="Registrado">{dia(id.registrado_en)}</Fila>
          <Fila k="Llegó por">{origen || '—'}</Fila>
          <Fila k="Su cuenta">{id.app_visto_en ? `Entró el ${dia(id.app_visto_en)}` : 'No ha entrado'}{id.parada?.parada ? ` · parada ${id.parada.parada}` : ''}</Fila>
          <Fila k="Documentos">{id.documentos.length ? id.documentos.slice(0, 3).map((d) => d.nombre).join(', ') + (id.documentos.length > 3 ? ` y ${id.documentos.length - 3} más` : '') : 'Ninguno'}</Fila>
          <Fila k="Sesión">{id.cita ? `${hora(id.cita.inicio)}${id.cita.miembro ? ` · ${id.cita.miembro.split(' ')[0]}` : ''}` : 'Sin agendar'}</Fila>
        </div>
      </div>

      <div className={`${tarjeta} mt-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2"><H>Ingresos (SAT) e ISSSTE</H><Chip tono="neu">Solo asesor · no se enseña al cliente</Chip></div>
          {alBuro ? <Chip tono="ok">Consultado</Chip> : <Chip tono="neu">Sin consultar</Chip>}
        </div>
        {!alBuro ? (
          <p className="text-sm text-muted">Sin consultar. Una sola consulta trae la nómina del SAT y el historial del ISSSTE: pídela desde «Actualizar información».</p>
        ) : (
          <>
            <div className="text-sm font-bold">Al {dia(alBuro)}{ing.al ? ` · ${hace(ing.dias)}` : ''}</div>
            <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-bold text-muted">Nómina según el SAT</div>
                {!ing.al ? <p className="text-sm text-muted">Sin consultar.</p> : !esNum(ing.bruto) ? <p className="text-sm text-muted">Sin recibos de nómina en el SAT.</p> : (
                  <>
                    <Fila k="Ingreso bruto al mes" fuerte>{money(ing.bruto)}</Fila>
                    <Fila k="Ingreso neto al mes">{money(ing.neto)}</Fila>
                    <Fila k="Patrón">{typeof ing.patron === 'string' && ing.patron ? ing.patron : '—'}</Fila>
                    <Fila k="Último recibo">{dia(ing.ultima_nomina)}{typeof ing.periodicidad === 'string' ? ` · ${ing.periodicidad}` : ''}</Fila>
                    <Fila k="Empleo vigente">{siNo(ing.empleo_vigente)}</Fila>
                    <Fila k="Descuentos en nómina">{ing.deducciones && Object.keys(ing.deducciones).length ? Object.entries(ing.deducciones).map(([k, v]) => `${k.toLowerCase()} ${money(v)}`).join(' · ') : 'Ninguno'}</Fila>
                  </>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="text-xs font-bold text-muted">ISSSTE</div>
                {!hayIssste ? <p className="text-sm text-muted">No aparece en el ISSSTE.</p> : (
                  <>
                    <Fila k="Estado">{String(issste.estatus)}{issste.estatus !== 'Activo' && issste.baja ? ` desde ${mesAnio(issste.baja)}` : ''}</Fila>
                    <Fila k="Tiempo cotizado" fuerte>{aniosMeses(issste.antiguedad)}</Fila>
                    <Fila k="Entró a gobierno">{mesAnio(issste.ingreso_gobierno)}</Fila>
                    <Fila k="Última dependencia">{typeof issste.ramo === 'string' && issste.ramo ? issste.ramo : '—'}</Fila>
                    <Fila k="Sueldo básico">{esNum(issste.sueldo_basico) ? `${money(issste.sueldo_basico)} al mes` : '—'}</Fila>
                    {typeof issste.regimen === 'string' && issste.regimen ? <Fila k="Régimen">{issste.regimen}</Fila> : null}
                    <Fila k="Al mismo tiempo que IMSS">{siNo(issste.empalme)}</Fila>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className={`${tarjeta} bg-cream/60`}>
          <H>Lo que falta para la primera conversación</H>
          {f.faltas.length ? f.faltas.map((x, i) => (
            <div key={`${x.codigo}-${i}`} className="flex items-start gap-2 text-sm">
              <Chip tono={x.nivel === 'alto' ? 'bad' : 'warn'}>{i + 1}</Chip>
              <span>{x.texto}{x.accion ? <> <button type="button" className="underline" onClick={() => setPanel(true)}>Abrir el panel</button></> : null}</span>
            </div>
          )) : <p className="text-sm">Nada: tiene lo necesario para conversar.</p>}
          <p className="border-t border-line pt-2 text-xs text-muted">
            {enCurso.length ? `En curso: ${enCurso.map((c) => TIPO_CONSULTA[c.tipo] ?? c.tipo).join(', ')}. La ficha se actualiza sola al llegar.` : 'Sin consultas en curso.'}
          </p>
        </div>
        <div className={`${tarjeta} bg-cream/60`}>
          <div className="flex items-center justify-between gap-2"><H>De qué hablarle</H><Link href={hrefOps} className="text-xs underline">Ver oportunidades</Link></div>
          {f.oportunidades.length ? f.oportunidades.map((o) => (
            <div key={o.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold">{o.nombre}{o.solo_cotitular ? <span className="font-normal text-amber-700"> · solo con cotitular{o.efectivo_minimo ? ` (o poniendo ${money(o.efectivo_minimo)})` : ''}</span> : null}</span>
              <Chip tono={o.estado === 'en_proceso' || o.estado === 'interesada' ? 'ok' : 'neu'}>{ESTADO_OP[o.estado] ?? o.estado}</Chip>
            </div>
          )) : <p className="text-sm text-muted">Sin oportunidades abiertas.</p>}
          {f.guion.length ? (
            <div className="border-t border-line pt-2">
              <H>Guion: lo que aún no le hemos preguntado</H>
              <ul className="mt-1 space-y-0.5 text-sm">{f.guion.map((g) => <li key={g}>{g}</li>)}</ul>
              <Link href={hrefCapturar} className="mt-1 inline-block text-xs underline">Capturar sus respuestas</Link>
            </div>
          ) : null}
        </div>
      </div>

      {enviar ? (
        <div className="mt-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><H>Listo para enviarle · cuando aplica</H><span className="text-xs text-muted">El asesor copia la imagen y el mensaje y los manda desde Tako.</span></div>
          <div className="grid items-start gap-3 lg:grid-cols-2">{enviar}</div>
        </div>
      ) : null}

      {panel ? <PanelActualizar f={f} personaId={personaId} hrefDocs={hrefDocs} hrefCapturar={hrefCapturar} cerrar={() => setPanel(false)} /> : null}
    </section>
  );
}

function PanelActualizar({ f, personaId, hrefDocs, hrefCapturar, cerrar }: { f: FichaPreviaData; personaId: string; hrefDocs: string; hrefCapturar: string; cerrar: () => void }) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [forzable, setForzable] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [pend, start] = useTransition();

  const fuentes: Fuente[] = [
    { tipo: 'imss_historial', prov: 'jordan', titulo: 'IMSS · historial y semanas', al: f.imss.al, dias: f.imss.dias, forzar: true },
    { tipo: 'infonavit', prov: 'precalix', titulo: 'Infonavit · precalificación', al: f.infonavit.al, dias: f.infonavit.dias, forzar: false },
    { tipo: 'ingresos', prov: 'bdi', titulo: 'Ingresos (SAT) e ISSSTE', al: f.ingresos.al, dias: f.ingresos.dias, forzar: false },
  ];
  const ultimaDe = (tipo: string): FichaConsulta | undefined => f.consultas.find((c) => c.tipo === tipo);

  const pedir = (s: Fuente, forzar: boolean, motivo: string) => start(async () => {
    const r = (await pedirConsulta(personaId, s.tipo, false, motivo, forzar, s.prov)) as { ok: boolean; error?: string; resultado?: { ok?: boolean; motivo?: string; proveedor?: string; estado?: string; error?: string } };
    const res = r.resultado;
    let texto: string;
    if (!r.ok) texto = r.error ?? 'No se pudo pedir.';
    else if (!res?.ok) {
      if (res?.motivo === 'validado_vigente') { texto = 'Ya hay un resultado reciente. Si de verdad hace falta, pídela de todos modos.'; setForzable(s.tipo); }
      else texto = `No se pidió: ${MOTIVO[res?.motivo ?? ''] ?? res?.motivo ?? 'sin motivo'}.`;
    } else { texto = `Pedida${res.error ? ` · ${res.error}` : ''}. La ficha se actualiza sola cuando llegue.`; setForzable(null); registrarUso(`/trabajo/p/${personaId}`, s.tipo, 'consulta_pedida'); }
    setMsg((m) => ({ ...m, [s.tipo]: texto }));
    setConfirmar(null);
    router.refresh();
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Actualizar información">
      <button type="button" aria-label="Cerrar el panel" className="absolute inset-0 bg-ink/40" onClick={cerrar} />
      <div className="relative flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l-2 border-ink bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold">Actualizar información</h2>
            <p className="text-xs text-muted">Nada se pide solo; el costo se confirma antes.</p>
          </div>
          <button type="button" className={line} onClick={cerrar}>Cerrar</button>
        </div>

        <div>
          <H>Consultas con costo</H>
          {fuentes.map((s) => {
            const p = f.proveedores[s.prov];
            const ult = ultimaDe(s.tipo);
            const corriendo = !!ult && EN_CURSO.includes(ult.estado);
            const costo = p && Number(p.costo) > 0 ? `$${Number(p.costo)}` : 'sin costo registrado';
            const salud: [Tono, string] | null = !p ? null : !p.habilitado ? ['bad', 'Proveedor apagado'] : p.salud === 'rojo' ? ['bad', 'Proveedor con fallas'] : p.salud === 'amarillo' ? ['warn', 'Proveedor lento'] : ['ok', 'Proveedor al corriente'];
            return (
              <div key={s.tipo} className="border-b border-line py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold">{s.titulo}</div>
                    <div className="text-xs text-muted">Último: {s.al ? `${dia(s.al)} (${hace(s.dias)})` : 'nunca'} · {costo}</div>
                    {salud ? <div className="mt-1"><Chip tono={salud[0]}>{salud[1]}</Chip></div> : null}
                  </div>
                  {corriendo ? <Chip tono="neu">En curso desde {hora(ult?.creada)}</Chip>
                    : confirmar !== s.tipo ? <button type="button" className={line} disabled={pend} onClick={() => { setConfirmar(s.tipo); setForzable(null); }}>{s.al ? 'Actualizar' : 'Consultar'}</button> : null}
                </div>
                {confirmar === s.tipo ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-cream px-2 py-1.5 text-xs">
                    Pide una consulta real ({costo}). ¿Seguro?
                    <button type="button" className={dark} disabled={pend} onClick={() => pedir(s, s.forzar, 'desde la ficha previa')}>{pend ? 'Pidiendo…' : 'Sí, pedir'}</button>
                    <button type="button" className={line} onClick={() => setConfirmar(null)}>No</button>
                  </div>
                ) : null}
                {msg[s.tipo] ? <p className="mt-1 text-xs text-muted">{msg[s.tipo]}{forzable === s.tipo ? <> <button type="button" className="underline" disabled={pend} onClick={() => pedir(s, true, 'desde la ficha previa (forzada)')}>Pedir de todos modos</button></> : null}</p> : null}
              </div>
            );
          })}
        </div>

        <div>
          <H>Sin costo</H>
          <div className="flex items-center justify-between gap-3 border-b border-line py-3">
            <div><div className="text-sm font-bold">Subir su SISEC en PDF</div><div className="text-xs text-muted">Si el cliente ya lo tiene o el proveedor no responde.</div></div>
            <Link href={hrefDocs} className={line}>Subir</Link>
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-line py-3">
            <div><div className="text-sm font-bold">Capturar lo que nos diga</div><div className="text-xs text-muted">AFORE, saldos, uso de Infonavit, ahorros.</div></div>
            <Link href={hrefCapturar} className={line}>Capturar</Link>
          </div>
          <p className="pt-2 text-xs text-muted">Las actas se piden en Documentos.</p>
        </div>

        <div className="flex flex-col gap-2 rounded-xl bg-cream p-4">
          <H>Consultas de este cliente</H>
          {f.consultas.length ? f.consultas.map((c) => {
            const s = fuentes.find((x) => x.tipo === c.tipo);
            const esUltima = ultimaDe(c.tipo)?.id === c.id;
            return (
              <div key={c.id} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span>{hora(c.creada)} · {TIPO_CONSULTA[c.tipo] ?? c.tipo}</span>
                  <span className="flex items-center gap-2">
                    <Chip tono={c.estado === 'completada' ? 'ok' : FALLO.includes(c.estado) ? 'bad' : 'neu'}>{c.estado === 'completada' ? 'Llegó' : c.estado === 'sin_resultado' ? 'Sin resultado' : c.estado === 'error' ? 'Error' : c.estado === 'cancelada' ? 'Cancelada' : 'En curso'}</Chip>
                    {s && esUltima && FALLO.includes(c.estado) ? <button type="button" className={line} disabled={pend} onClick={() => { setConfirmar(s.tipo); setForzable(null); }}>Reintentar</button> : null}
                  </span>
                </div>
                {FALLO.includes(c.estado) && c.error ? <div className="text-xs text-muted">{c.error}</div> : null}
              </div>
            );
          }) : <p className="text-sm text-muted">Ninguna todavía.</p>}
        </div>
      </div>
    </div>
  );
}
