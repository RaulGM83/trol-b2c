import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const soloDigitos = (s: string) => s.replace(/\D/g, '');
const CURP_RE = /^[A-Z]{4}\d{6}[A-Z]{6}[A-Z0-9]\d$/;

// Captura de lead nuevo (sin cuenta): crea el contacto en HubSpot y arranca
// Cálculos vía un webhook de n8n (LEAD_WEBHOOK_URL). La app no toca HubSpot
// directo: reusa la integración existente del back.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const curp = String(body.curp ?? '').trim().toUpperCase();
  const correo = String(body.correo ?? '').trim();
  const telefono = soloDigitos(String(body.telefono ?? '')).slice(-10);
  const origen = String(body.origen ?? 'calcula').slice(0, 40);
  const campania = String(body.campania ?? 'tako').slice(0, 40);
  const referrer = body.referrer ? String(body.referrer).slice(0, 64) : undefined;

  if (!CURP_RE.test(curp) || !correo.includes('@') || telefono.length !== 10) {
    return NextResponse.json({ ok: false, error: 'datos_invalidos' }, { status: 400 });
  }

  const webhook = process.env.LEAD_WEBHOOK_URL;
  if (!webhook) return NextResponse.json({ ok: false, error: 'no_config' }, { status: 503 });

  // Atribución (best-effort, sin datos personales en la tabla).
  try {
    const admin = createAdminClient();
    await admin.from('links_campania').insert({ cliente_id: null, campania, evento: 'lead' });
  } catch {
    /* noop */
  }

  // Contrato del webhook "Nuevo cliente Booster Asesoria" (Tako/HubSpot):
  // nombre, apellido, correo, curp, mobil, entry_channel (rama del Switch),
  // conversationId (→ id_booster), status. Abrimos una rama nueva para la
  // herramienta web vía entry_channel = LEAD_ENTRY_CHANNEL.
  const entry_channel = process.env.LEAD_ENTRY_CHANNEL || 'calculadora_web';
  try {
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        curp,
        correo,
        mobil: telefono,
        nombre: '',
        apellido: '',
        entry_channel,
        conversationId: `web-${campania}`,
        status: 'nuevo',
        referrer,
        origen,
        ts: new Date().toISOString(),
      }),
    });
    if (!r.ok) return NextResponse.json({ ok: false, error: 'webhook_error' }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: 'webhook_error' }, { status: 502 });
  }
}
