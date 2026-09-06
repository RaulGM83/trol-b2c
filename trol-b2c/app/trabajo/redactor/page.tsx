import { requireMiembro, t3, type Any } from '@/lib/trol3/server';
import { PROMPT_VERSION } from '@/lib/diagnostico/secciones';
import { RedactorPanel, type FeedbackFila, type Version } from '@/components/trol3/RedactorPanel';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Redactor · Trol' };

// ---------------------------------------------------------------------------
// El taller del redactor (117, paso B).
//
// Sólo admin. No por jerarquía: porque el bloque vigente le cambia el texto a
// TODOS los diagnósticos que se generen después, y una regla escrita para el
// caso de enfrente puede romper los diez siguientes sin que nadie lo note. El
// RLS ya lo impide en la base; esto sólo evita enseñar una puerta que no abre.
// ---------------------------------------------------------------------------

export default async function RedactorPage() {
  const miembro = await requireMiembro();
  if (!(miembro.roles ?? []).includes('admin')) {
    return (
      <div className="rounded-2xl border border-line bg-white p-5">
        <h1 className="text-xl font-extrabold">Redactor</h1>
        <p className="mt-2 text-sm text-muted">
          Afinar el prompt del diagnóstico le cambia el texto a todos los documentos que se
          generen después, así que está reservado a la dirección. Si viste algo que el redactor
          debería decir distinto, déjalo como comentario en la pestaña Diagnóstico del expediente
          y llega aquí.
        </p>
      </div>
    );
  }

  const db = t3();
  const [{ data: vers, error: e1 }, { data: fb, error: e2 }, { data: equipo }] = await Promise.all([
    db
      .from('redactor_instrucciones')
      .select('version,texto,nota,activa,creado_en,creado_por')
      .order('version', { ascending: false })
      .limit(50),
    db
      .from('v_redactor_feedback')
      .select(
        'id,diagnostico_id,seccion,comentario,instruccion,estado,promovida_version,creado_en,persona_id,persona_nombre,prompt_version,instrucciones_version',
      )
      .order('creado_en', { ascending: false })
      .limit(300),
    db.from('miembros').select('id,nombre').eq('activo', true),
  ]);

  const nombre = new Map(((equipo ?? []) as Any[]).map((m) => [m.id, m.nombre]));
  const versiones: Version[] = ((vers ?? []) as Any[]).map((v) => ({
    version: Number(v.version),
    texto: String(v.texto),
    nota: v.nota ?? null,
    activa: !!v.activa,
    creado_en: v.creado_en,
    creado_por_nombre: nombre.get(v.creado_por) ?? null,
  }));

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-xl font-extrabold">Redactor</h1>
        <p className="text-sm text-muted">
          Lo que se le dice a la IA además del prompt base, y todo lo que se ha observado de lo que
          escribe.
        </p>
      </div>

      {/* Un fallo no puede verse como una lista vacía: son cosas distintas. */}
      {e1 || e2 ? (
        <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          No se pudo leer todo: {(e1 ?? e2)?.message}
        </p>
      ) : null}

      <RedactorPanel
        versiones={versiones}
        feedback={(fb ?? []) as FeedbackFila[]}
        promptVersion={PROMPT_VERSION}
      />
    </div>
  );
}
