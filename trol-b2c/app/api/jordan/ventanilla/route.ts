import { atenderWebhook } from '../_comun';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Aviso `ventanilla.finalizada` de Jordan (lista / error / cancelada). */
export async function POST(req: Request) {
  return atenderWebhook(req, 'imss_ventanilla');
}
