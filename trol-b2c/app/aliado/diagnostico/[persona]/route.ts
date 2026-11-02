/**
 * 291 · El PDF del diagnóstico entregado, para el aliado que refirió a la persona (claude/116).
 * La vista v_documentos_aliado decide con la sesión del aliado si existe algo que enseñar; sólo
 * entonces se firma la URL con la llave de servicio. Nada más del expediente pasa por aquí.
 */
import { requireAliado, t3 } from '@/lib/trol3/server';
import { urlFirmadaDocumento } from '@/lib/trol3/documentos';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { persona: string } }) {
  await requireAliado();
  const { data } = await t3()
    .from('v_documentos_aliado')
    .select('storage_path')
    .eq('persona_id', params.persona)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const path = (data as { storage_path: string | null } | null)?.storage_path;
  if (!path) return new Response('Todavía no hay diagnóstico entregado para esta persona.', { status: 404 });
  const url = await urlFirmadaDocumento(path, 120);
  return Response.redirect(url, 302);
}
