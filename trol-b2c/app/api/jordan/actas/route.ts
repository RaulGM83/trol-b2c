import { atenderWebhook } from '../_comun';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Aviso de Jordan al terminar un acta (DONE / ERROR / CANCELLED). */
export async function POST(req: Request) {
  return atenderWebhook(req, 'acta');
}
