// 302c · Los hechos del Diagnóstico Avanzado (expediente + datos + historial + escenarios + vivienda), antes dentro de
// app/trabajo/actions.ts. Salieron a lib para que el aliado los pueda armar con la llave de servicio sin exponer
// acciones del equipo. La lógica es la misma; sólo cambia quién pasa el cliente de base.
import { t3, type Any } from '@/lib/trol3/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** Los campos ISSSTE del expediente, tal como el prompt espera verlos. */
const CAMPOS_ISSSTE = [
  'cotiza_issste', 'status_issste', 'tipo_derechohabiente_issste', 'regimen_issste',
  'fecha_ingreso_gobierno_issste', 'antiguedad_issste_anios', 'fecha_alta_issste',
  'fecha_baja_issste', 'ramo_issste', 'sueldo_basico_issste', 'sueldo_issste',
];

/**
 * Junta lo que el redactor necesita ver. Se aísla porque lo usan dos caminos:
 * abrir el diagnóstico y regenerar la narrativa de uno ya abierto.
 */
export async function hechosDeDiagnostico(
  personaId: string,
  escenarioIds: string[],
  asesoriaIds: string[] = [],
  /** 302c · El aliado los arma con la llave de servicio (sus RPC ya verificaron que la persona es suya y pagó). */
  dbParam?: Any,
) {
  const { construirHechos } = await import('@/lib/diagnostico/hechos');
  const db = dbParam ?? t3();
  const [{ data: e }, { data: datos }, { data: escs }] = await Promise.all([
    db.from('v_expediente').select('*').eq('persona_id', personaId).maybeSingle(),
    db.from('v_mejor_dato').select('campo,valor,capa').eq('persona_id', personaId),
    db.from('escenarios').select('id,tipo,creado_en,inputs,resultado').in('id', escenarioIds),
  ]);
  if (!e) throw new Error('La persona no existe o no tienes acceso a su expediente.');
  if (!escs?.length) throw new Error('No se encontraron los escenarios cerrados.');

  const valorDe = new Map(((datos ?? []) as Any[]).map((d) => [d.campo, d.valor]));

  // ISSSTE sólo si hay algo que decir: un bloque de nulos invita al modelo a
  // rellenarlo, y tiene prohibido inventar.
  const issste: Record<string, unknown> = {};
  for (const c of CAMPOS_ISSSTE) { const v = valorDe.get(c); if (v != null && v !== '') issste[c] = v; }

  // La historia laboral vive en el espejo legacy o, si no hay, en la semilla.
  let historial: Any[] = [];
  if (e.legacy_cliente_id) {
    const { data: cl } = await createAdminClient()
      .from('clientes').select('calculo_pensional').eq('id', e.legacy_cliente_id).maybeSingle();
    historial = ((cl?.calculo_pensional as { historial?: Any[] } | null)?.historial as Any[]) ?? [];
  }
  if (!historial.length) {
    const h = (valorDe.get('semilla') as { historial?: Any[] } | undefined)?.historial;
    if (Array.isArray(h)) historial = h;
  }

  // Se respeta el orden en que el asesor los eligió, no el que devolvió la base.
  const porId = new Map(((escs ?? []) as Any[]).map((s) => [s.id, s]));
  const escenarios = escenarioIds.map((id) => porId.get(id)).filter(Boolean) as Any[];

  // El plan de vivienda, en LISTA BLANCA. El resultado de la asesoría trae
  // `sobreprecio` y el proyecto trae `costo_aliado` y `comision_desarrollador`:
  // volcarlo entero al prompt acaba con el margen impreso en el documento del
  // cliente. Sólo pasa lo que se nombra aquí.
  let vivienda: Any[] = [];
  if (asesoriaIds.length) {
    const { derivar } = await import('@/lib/infonavit/derivar');
    const { data: ases } = await db
      .from('infonavit_asesorias')
      .select('*')
      .in('id', asesoriaIds);
    const filas = (ases ?? []) as Any[];
    const proyIds = [...new Set(filas.map((a) => a.proyecto_id).filter(Boolean))];
    const otrasPersonas = [...new Set(
      filas.map((a) => (a.persona_id === personaId ? a.cotitular_persona_id : a.persona_id)).filter(Boolean),
    )];
    const [{ data: proys }, { data: pers }] = await Promise.all([
      proyIds.length
        ? db.from('proyectos_inmobiliarios').select('id,desarrollo,zona,m2,avaluo,renta_estimada').in('id', proyIds)
        : Promise.resolve({ data: [] as Any[] }),
      otrasPersonas.length
        ? db.from('personas').select('id,nombre,apellidos').in('id', otrasPersonas)
        : Promise.resolve({ data: [] as Any[] }),
    ]);
    const proy = new Map(((proys ?? []) as Any[]).map((x) => [x.id, x]));
    const nom = new Map(((pers ?? []) as Any[]).map((x) => [x.id, [x.nombre, x.apellidos].filter(Boolean).join(' ').trim()]));
    // Se respeta el orden en que el asesor las eligió.
    const porId = new Map(filas.map((a) => [a.id, a]));
    // Los números salen de `derivar()`, el MISMO que arma el PDF de Infonavit.
    // Recalcularlos aquí sería garantizar que un día los dos documentos digan
    // cosas distintas del mismo plan.
    vivienda = asesoriaIds.map((id) => porId.get(id)).filter(Boolean).map((a: Any) => {
      const pr = proy.get(a.proyecto_id) ?? {};
      const otro = a.persona_id === personaId ? a.cotitular_persona_id : a.persona_id;
      let d: Any = {};
      try { d = derivar(a); } catch { d = {}; }
      return {
        id: a.id,
        desarrollo: pr.desarrollo ?? d.desarrollo ?? null,
        zona: pr.zona ?? d.zona ?? null,
        m2: pr.m2 ?? null,
        avaluo: pr.avaluo ?? null,
        horizonte: a.horizonte ?? null,
        cotitular_nombre: otro ? (nom.get(otro) ?? null) : null,
        lectura_salida: (a.resultado as Any)?.veredicto?.lectura_salida ?? null,
        // Los tres tiempos. `sobreprecio`, el costo del aliado y la comisión
        // del desarrollador NO están aquí y no pueden llegar al documento.
        saldo_subcuenta: d.op?.saldo_apl == null ? null : Number(d.op.saldo_apl),
        credito: d.credito ?? (a.credito == null ? null : Number(a.credito)),
        notariales_cliente: d.notCliente ?? null,
        renta_neta: d.rentaNeta ?? null,
        pmt: d.pmt ?? (a.pmt == null ? null : Number(a.pmt)),
        flujo_mensual: d.flujo ?? null,
        recibe_al_vender: d.recibeDia ?? (a.efectivo == null ? null : Number(a.efectivo)),
        ventaja_corte: d.ventajaCorte ?? (a.ventaja_corte == null ? null : Number(a.ventaja_corte)),
        corte_anios: d.corte ?? null,
        renta_es_estimada: d.rentaEstimada ?? null,
        hay_aportaciones_patron: d.aportaciones != null ? Number(d.aportaciones) > 0 : null,
      };
    });
  }

  const { data: reuniones } = await db.from('v_reuniones').select('inicio,miembro,titulo,resumen_md').eq('persona_id', personaId).order('inicio', { ascending: false }).limit(2);
  return construirHechos({
    expediente: e as Record<string, Any>,
    datos: (datos ?? []) as Any[],
    historial,
    escenarios,
    issste: Object.keys(issste).length ? issste : null,
    vivienda,
    reuniones: ((reuniones ?? []) as Any[]).map((r) => ({ inicio: r.inicio, asesor: r.miembro, titulo: r.titulo, resumen_md: r.resumen_md })),
  });
}
