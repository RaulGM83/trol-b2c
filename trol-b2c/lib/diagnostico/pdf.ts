// ============================================================================
// Armar el PDF del diagnóstico.
//
// Vive aparte de la ruta porque lo usan dos caminos que tienen que producir
// EXACTAMENTE el mismo archivo: la liga para verlo, y el guardado automático
// al marcarlo entregado. Si cada uno armara el suyo, el día que se toque uno
// el otro empieza a mentir en silencio.
//
// Nada se recalcula: sólo se acomoda lo que ya está guardado en trol3.
// ============================================================================

import { renderToStream } from '@react-pdf/renderer';
import { diagnosticoDoc } from '@/components/trol3/diagnostico-pdf';
import { capitulosDe } from '@/lib/diagnostico/educacion';
import { t3, type Any } from '@/lib/trol3/server';

export type PdfDiagnostico = { buf: Buffer; cliente: string; slug: string };

const slugDe = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export async function construirPdfDiagnostico(diagnosticoId: string, dbParam?: Any): Promise<PdfDiagnostico | null> {
  // 302d · El aliado lo arma con la llave de servicio después de verificar que el diagnóstico es suyo.
  const db = dbParam ?? t3();

  const { data: d } = await db
    .from('diagnosticos')
    .select('id,persona_id,estado,contenido,creado_en,entregado_en,creado_por,autor_tipo,autor_aliado_id,elaborado_por')
    .eq('id', diagnosticoId)
    .maybeSingle();
  if (!d) return null;
  // 302d · Autoría: quién lo elaboró y si Trol lo revisó. Va en portada y pie para que nadie nos atribuya un reporte ajeno.
  let autoria: { elaborado_por: string; empresa: string | null; revisado: boolean } | null = null;
  if ((d as Any).autor_tipo === 'aliado' || (d as Any).autor_tipo === 'aliado_revisado') {
    const { data: al } = (d as Any).autor_aliado_id ? await db.from('aliados').select('nombre,empresa').eq('id', (d as Any).autor_aliado_id).maybeSingle() : { data: null };
    autoria = { elaborado_por: (d as Any).elaborado_por ?? (al as Any)?.nombre ?? 'el aliado', empresa: (al as Any)?.empresa ?? null, revisado: (d as Any).autor_tipo === 'aliado_revisado' };
  }

  const [{ data: p }, { data: m }, { data: tareas }, { data: datos }] = await Promise.all([
    db.from('personas').select('nombre,apellidos,curp').eq('id', (d as Any).persona_id).maybeSingle(),
    (d as Any).creado_por
      ? db.from('miembros').select('nombre,firma,email').eq('id', (d as Any).creado_por).maybeSingle()
      : Promise.resolve({ data: null }),
    // Sólo los pendientes de ESTE diagnóstico: el documento cierra con lo que
    // queda por hacer, no con el historial de lo ya hecho.
    db
      .from('v_tareas')
      .select('titulo,responsable_nombre,vence_el,estado,origen,origen_id')
      .eq('persona_id', (d as Any).persona_id)
      .eq('origen', 'diagnostico')
      .eq('origen_id', diagnosticoId)
      .eq('estado', 'pendiente')
      .order('vence_el', { ascending: true, nullsFirst: false }),
    db.from('v_mejor_dato').select('campo,valor').eq('persona_id', (d as Any).persona_id),
  ]);

  const contenido = ((d as Any).contenido ?? {}) as Any;
  const hechos = contenido.hechos ?? {};
  const regimen = ((datos ?? []) as Any[]).find((x) => x.campo === 'regimen_issste')?.valor ?? null;
  const cliente = [(p as Any)?.nombre, (p as Any)?.apellidos].filter(Boolean).join(' ').trim() || 'Cliente';

  const stream = (await renderToStream(
    diagnosticoDoc({
      cliente,
      curp: (p as Any)?.curp ?? null,
      asesor: (m as Any)?.firma ?? (m as Any)?.nombre ?? null,
      autoria,
      estado: (d as Any).estado,
      // La fecha del documento es el día en que se entregó, no la de hoy: es
      // cuando estas cifras fueron ciertas.
      fecha: (d as Any).entregado_en ?? (d as Any).creado_en,
      hechos,
      narrativa: (contenido.narrativa ?? {}) as Record<string, string>,
      acuerdos: contenido.acuerdos ?? null,
      tareas: ((tareas ?? []) as Any[]).map((t) => ({
        titulo: t.titulo,
        responsable: t.responsable_nombre ?? null,
        vence_el: t.vence_el ?? null,
      })),
      seccionesOff: Array.isArray(contenido.secciones_off) ? (contenido.secciones_off as string[]) : null,
      capitulos: capitulosDe({
        ley: hechos?.cliente?.ley ?? null,
        regimenIssste: regimen as string | null,
      }),
    }),
  )) as AsyncIterable<Uint8Array>;

  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));

  return { buf: Buffer.concat(chunks), cliente, slug: slugDe(cliente) || diagnosticoId };
}
