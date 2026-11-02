// ---------------------------------------------------------------------------
// Lo que ve el aliado que refiere (126).
//
// Todo sale de vistas que corren con los permisos del dueño y traen su propio
// filtro por `current_aliado_id()`. Aquí NO se consulta ninguna tabla directa:
// si algún día alguien agrega un `db.from('personas')` en esta página, se cae
// la única frontera que hay.
//
// Lo que se enseña es avance y resultado. Nunca CURP, NSS, expediente ni archivos:
// esa gente es cliente de Trol, no de él.
//
// 281 · Excepción Infonavit: el broker (aliados.programa_infonavit) ve saldo, monto y la
// cotización inicial de las personas que ÉL pidió precalificar (v_infonavit_aliado).
// 291 · Excepción pensión (claude/116): de sus referidos atribuidos ve lo que dice el IMSS
// (edad, ley, semanas, derechos), la pensión estimada y las oportunidades por nombre, sin
// montos (v_resultado_aliado). Y con sus créditos compra cálculos o asesoría completa.
// ---------------------------------------------------------------------------
import QRCode from 'qrcode';
import { requireAliado, t3, t3admin, fmtMXN, fmtFecha, type Any } from '@/lib/trol3/server';
import { InfonavitAliado, type FilaInfonavitAliado } from '@/components/trol3/InfonavitAliado';
import { ResultadoAliado, type FilaResultadoAliado, type ProductoAliado } from '@/components/trol3/ResultadoAliado';
import { cargarCotizacionInicial } from '@/lib/infonavit/cotizacion-inicial-server';
import { LinkAliado } from '@/components/trol3/LinkAliado';
import { AltaPorAliado } from '@/components/trol3/AltaPorAliado';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tus referidos · Trol' };

/** 291 · Lo que el aliado puede comprar con créditos. 1 crédito = $20 (decisión de Raúl, 2-nov). */
const PRODUCTOS_ALIADO: ProductoAliado['codigo'][] = ['diagnostico_avanzado', 'diagnostico_avanzado_sesion'];

export default async function EspacioAliado() {
  const a = await requireAliado();
  const db = t3();
  const sitio = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.trol.mx';
  const link = a.codigo ? `${sitio}/i/${a.codigo}` : null;

  const [{ data: resultado }, { data: comisiones }, { data: prods }] = await Promise.all([
    db
      .from('v_resultado_aliado')
      .select('referido_id,persona_id,nombre,apellidos,referido_en,estado,edad,ley,semanas,status_empleo,conserva_derechos,fin_conservacion,afore_actual,pension_base,pension_maxima,saldo_rcv97,saldo_infonavit,infonavit_monto_credito,credito_infonavit_vigente,inconsistencia_imss,oportunidades,compras,diagnostico_estado,diagnostico_doc_id,proxima_sesion')
      .order('referido_en', { ascending: false }),
    db.from('v_comisiones_aliado').select('id,cliente,monto,estado,creado_en,pagada_en').order('creado_en', { ascending: false }),
    // El catálogo es público para el aliado: nombre y precio en créditos, nada más.
    t3admin().from('productos').select('codigo,nombre,precio_creditos').in('codigo', PRODUCTOS_ALIADO).eq('activo', true),
  ]);

  const refs = (resultado ?? []) as FilaResultadoAliado[];
  const coms = (comisiones ?? []) as Any[];
  const porPagar = coms.filter((c) => c.estado === 'devengada').reduce((s, c) => s + Number(c.monto), 0);
  const pagado = coms.filter((c) => c.estado === 'pagada').reduce((s, c) => s + Number(c.monto), 0);
  const productos: ProductoAliado[] = PRODUCTOS_ALIADO.flatMap((codigo) => {
    const p = ((prods ?? []) as Any[]).find((x) => x.codigo === codigo);
    return p && p.precio_creditos ? [{ codigo, nombre: p.nombre as string, creditos: Number(p.precio_creditos), mxn: Number(p.precio_creditos) * 20 }] : [];
  });

  const qr = link ? await QRCode.toDataURL(link, { margin: 1, width: 320 }) : null;

  // 281 · Broker Infonavit: sus precalificaciones (la vista ya filtra por current_aliado_id()).
  // La cotización se arma con la llave de servicio SÓLO para filas que la vista le devolvió.
  let infonavit: FilaInfonavitAliado[] = [];
  if (a.programa_infonavit) {
    const { data: inf } = await db.from('v_infonavit_aliado')
      .select('persona_id,nombre,apellidos,resultado,saldo,monto_credito,pide_infonavit_en,precalificado_en,etapa,etapa_en,docs')
      .order('pide_infonavit_en', { ascending: false }).limit(50);
    const admin = t3admin();
    infonavit = await Promise.all(((inf ?? []) as Any[]).map(async (r) => {
      const fila: FilaInfonavitAliado = { ...r, nombre: [r.nombre, r.apellidos].filter(Boolean).join(' ') || null };
      if (r.resultado === 'con_monto') {
        const c = await cargarCotizacionInicial(r.persona_id, { db: admin, voz: 'aliado' });
        if (c.ok) fila.cotizacion = { texto: c.texto, opciones: c.cot.opciones.map((o) => ({ plazo: o.plazo, nombre: o.nombre, ubicacion: o.ubicacion, pone_al_mes: o.pone_al_mes, recibe_al_vender: o.recibe_al_vender, ficha_url: o.ficha_url })) };
        else fila.sin_cotizacion = c.motivo;
      }
      return fila;
    }));
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">Tus referidos</h1>
        <p className="text-xs text-muted">
          Son clientes de Trol: nosotros los contactamos y los atendemos. Aquí ves cómo van.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted">Personas referidas</div>
          <div className="text-2xl font-extrabold">{refs.length}</div>
        </div>
        <div className="rounded-2xl border-2 border-ink bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted">Tus créditos</div>
          <div className="text-2xl font-extrabold">{a.tiene_wallet ? (a.creditos ?? 0) : '—'}</div>
          <div className="text-[11px] text-muted">{a.tiene_wallet ? 'Escríbenos para recargar' : 'Escríbenos para activarlos'}</div>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted">Por pagarte</div>
          <div className="text-2xl font-extrabold">{fmtMXN(porPagar)}</div>
        </div>
        <div className="rounded-2xl border border-line bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted">Ya pagado</div>
          <div className="text-2xl font-extrabold">{fmtMXN(pagado)}</div>
        </div>
      </div>

      {link ? (
        <LinkAliado link={link} qr={qr} />
      ) : (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-900">
          Todavía no tienes tu liga para compartir. Escríbenos y te la generamos.
        </section>
      )}

      <AltaPorAliado aliado={a.nombre} />

      <ResultadoAliado filas={refs} productos={productos} creditos={a.creditos ?? null} tieneWallet={!!a.tiene_wallet} aliado={a.nombre} />

      {a.programa_infonavit ? <InfonavitAliado filas={infonavit} comision={Number(a.comision_infonavit ?? 25000)} /> : null}

      {coms.length ? (
        <section className="rounded-2xl border border-line bg-white p-5">
          <h2 className="mb-1 text-sm font-bold">Tus comisiones</h2>
          <p className="mb-3 text-xs text-muted">
            Infonavit: {fmtMXN(Number(a.comision_infonavit ?? 25000))} por inmueble al firmar escrituras. Lo demás, sobre lo que Trol cobre al cliente por esa operación, con lo que tenemos pactado. Las asesorías que compras con créditos no generan comisión.
          </p>
          <ul className="space-y-1 text-sm">
            {coms.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2">
                <span className="flex-1">
                  <b>{c.cliente || 'Cliente'}</b>
                  <span className="text-muted"> · {fmtFecha(c.creado_en)}</span>
                </span>
                <span className="font-semibold">{fmtMXN(Number(c.monto))}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.estado === 'pagada' ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}
                >
                  {c.estado === 'pagada' ? `pagada ${fmtFecha(c.pagada_en)}` : 'por pagar'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
