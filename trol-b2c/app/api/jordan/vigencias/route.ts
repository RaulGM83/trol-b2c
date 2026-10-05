import { atenderWebhook } from '../_comun';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** 219 · Aviso de Jordan cuando la constancia de vigencia llega a completed / failed. No firma: el cierre lo hace el GET con la llave. */
export async function POST(req: Request) {
  return atenderWebhook(req, 'vigencia_imss');
}
