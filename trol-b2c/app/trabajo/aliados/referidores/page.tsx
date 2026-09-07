// ---------------------------------------------------------------------------
// Aliados que REFIEREN (122). Pantalla de gestión interna.
//
// La otra pestaña de Aliados —consultas— es la relación opuesta: ahí el cliente
// es del aliado y nos compra el estudio. Aquí el cliente es de Trol desde el
// día uno y el aliado nos lo presentó. Comparten palabra, no modelo, así que
// también viven en pantallas distintas a propósito.
//
// Todo lo que se lee aquí sale de lo ya guardado; nada se recalcula.
// ---------------------------------------------------------------------------
import Link from 'next/link';
import { requireMiembro, t3, type Any } from '@/lib/trol3/server';
import {
  ReferidoresPanel,
  type AliadoFila,
  type ComisionFila,
  type PendienteHonorario,
  type ReferidoFila,
} from '@/components/trol3/ReferidoresPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Aliados referidores · Trol' };

export default async function AliadosReferidores() {
  const m = await requireMiembro();
  const db = t3();
  const sitio = process.env.NEXT_PUBLIC_SITE_URL || 'https://app.trol.mx';

  const [{ data: aliados }, { data: codigos }, { data: referidos }, { data: comisiones }, { data: pendientes }] = await Promise.all([
    db.from('aliados').select('id,nombre,empresa,email,telefono,tipo,comision_pct,activo,creado_en').order('creado_en'),
    db.from('codigos_invitacion').select('codigo,aliado_id,activo').not('aliado_id', 'is', null),
    db
      .from('v_referidos_aliado')
      .select(
        'referido_id,aliado_id,persona_id,estado,origen,referido_en,nombre,apellidos,etapa,ultima_cita,diagnostico_entregado_en,pension_estimada,productos_contratados,comision_devengada',
      )
      .order('referido_en', { ascending: false }),
    db
      .from('comisiones')
      .select('id,aliado_id,persona_id,base,pct,monto,estado,creado_en,pagada_en')
      .order('creado_en', { ascending: false }),
    // Ganadas de un referido a las que todavía les falta el honorario: es lo
    // único que separa al aliado de su comisión (123).
    db
      .from('v_ganadas_sin_honorario')
      .select('oportunidad_id,codigo,persona_id,nombre,apellidos,aliado_id,aliado_nombre,cerrada_en')
      .order('cerrada_en', { ascending: false, nullsFirst: false }),
  ]);

  const filas = (aliados ?? []) as Any[];
  const nombreAliado = new Map<string, string>(filas.map((a) => [a.id as string, a.nombre as string]));

  // El link vivo de cada aliado. Si tuviera más de uno, gana el activo.
  const codigoDe = new Map<string, string>();
  ((codigos ?? []) as Any[]).forEach((c) => {
    if (!c.aliado_id) return;
    if (c.activo || !codigoDe.has(c.aliado_id)) codigoDe.set(c.aliado_id, c.codigo);
  });

  // Nombres de las personas comisionadas: la vista de comisiones no los trae y
  // no vale la pena una vista nueva para una columna.
  const personaIds = [...new Set(((comisiones ?? []) as Any[]).map((c) => c.persona_id).filter(Boolean))];
  const { data: personas } = personaIds.length
    ? await db.from('personas').select('id,nombre,apellidos').in('id', personaIds)
    : { data: [] as Any[] };
  const nombrePersona = new Map<string, string>(
    ((personas ?? []) as Any[]).map((p) => [
      p.id as string,
      [p.nombre, p.apellidos].filter(Boolean).join(' ').trim() || 'Cliente',
    ]),
  );

  const refs: ReferidoFila[] = ((referidos ?? []) as Any[]).map((r) => ({
    referido_id: r.referido_id,
    aliado_id: r.aliado_id,
    aliado_nombre: nombreAliado.get(r.aliado_id) ?? 'Aliado',
    persona_id: r.persona_id,
    nombre: r.nombre,
    apellidos: r.apellidos,
    estado: r.estado,
    origen: r.origen,
    referido_en: r.referido_en,
    etapa: r.etapa,
    ultima_cita: r.ultima_cita,
    diagnostico_entregado_en: r.diagnostico_entregado_en,
    pension_estimada: r.pension_estimada,
    productos_contratados: r.productos_contratados,
    comision_devengada: r.comision_devengada,
  }));

  const coms: ComisionFila[] = ((comisiones ?? []) as Any[]).map((c) => ({
    id: c.id,
    aliado_id: c.aliado_id,
    aliado_nombre: nombreAliado.get(c.aliado_id) ?? 'Aliado',
    persona_id: c.persona_id,
    persona_nombre: nombrePersona.get(c.persona_id) ?? null,
    base: Number(c.base),
    pct: Number(c.pct),
    monto: Number(c.monto),
    estado: c.estado,
    creado_en: c.creado_en,
    pagada_en: c.pagada_en,
  }));

  const lista: AliadoFila[] = filas.map((a) => {
    const mios = refs.filter((r) => r.aliado_id === a.id);
    const suyas = coms.filter((c) => c.aliado_id === a.id && c.estado !== 'cancelada');
    return {
      id: a.id,
      nombre: a.nombre,
      empresa: a.empresa,
      email: a.email,
      telefono: a.telefono,
      tipo: a.tipo,
      comision_pct: a.comision_pct == null ? null : Number(a.comision_pct),
      activo: a.activo,
      codigo: codigoDe.get(a.id) ?? null,
      referidos: mios.length,
      atribuidos: mios.filter((r) => r.estado === 'atribuido').length,
      devengado: suyas.filter((c) => c.estado === 'devengada').reduce((s, c) => s + c.monto, 0),
      pagado: suyas.filter((c) => c.estado === 'pagada').reduce((s, c) => s + c.monto, 0),
    };
  });

  const faltantes: PendienteHonorario[] = ((pendientes ?? []) as Any[]).map((o) => ({
    oportunidad_id: o.oportunidad_id,
    codigo: o.codigo,
    persona_id: o.persona_id,
    nombre: o.nombre,
    apellidos: o.apellidos,
    aliado_nombre: o.aliado_nombre ?? nombreAliado.get(o.aliado_id) ?? 'Aliado',
    cerrada_en: o.cerrada_en,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-extrabold">Aliados referidores</h1>
        <Link href="/trabajo/aliados" className="text-xs text-muted underline">
          ← Consultas de aliados
        </Link>
      </div>
      <p className="-mt-2 text-xs text-muted">
        Nos presentan clientes que son de Trol desde el primer día. Ellos ven el avance de los suyos;
        nunca su expediente ni sus saldos.
      </p>

      <ReferidoresPanel
        aliados={lista}
        porRevisar={refs.filter((r) => r.estado === 'por_revisar')}
        sinHonorario={faltantes}
        referidos={refs}
        comisiones={coms}
        sitio={sitio}
        esAdmin={(m.roles ?? []).includes('admin')}
      />
    </div>
  );
}
