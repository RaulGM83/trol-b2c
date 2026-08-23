import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const soloDigitos = (s: string) => s.replace(/\D/g, '');
const CURP_RE = /^[A-Z]{4}\d{6}[A-Z]{6}[A-Z0-9]\d$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Captura de lead nuevo (sin cuenta): crea el contacto en HubSpot y arranca
// Cálculos vía un webhook de n8n (LEAD_WEBHOOK_URL). La app no toca HubSpot
// directo: reusa la integración existente del back.
//
// Este endpoint es el PRIMER evento server-side que conoce la identidad del
// lead (CURP + teléfono + referidor juntos), así que es donde se ancla la
// atribución — sin depender de la cookie, que se pierde cuando WhatsApp abre
// el link en su navegador in-app y el cliente termina el flujo en otro lado.
// Ver web/ATRIBUCION_DISENO.md y web/migracion_atribucion.sql.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const curp = String(body.curp ?? '').trim().toUpperCase();
  const correo = String(body.correo ?? '').trim();
  const telefono = soloDigitos(String(body.telefono ?? '')).slice(-10);
  const origen = String(body.origen ?? 'calcula').slice(0, 40);
  // /alta sí captura el nombre; /calcula no (queda ''), como hasta ahora.
  const nombreCompleto = String(body.nombre ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
  const [nombre = '', ...resto] = nombreCompleto ? nombreCompleto.split(' ') : [];
  const apellido = resto.join(' ');
  const campania = String(body.campania ?? 'tako').slice(0, 40);
  const referrer = body.referrer ? String(body.referrer).slice(0, 64) : undefined;

  // Correo opcional desde la decomisión de HubSpot: si viene, debe ser válido.
  if (!CURP_RE.test(curp) || (correo !== '' && !correo.includes('@')) || telefono.length !== 10) {
    return NextResponse.json({ ok: false, error: 'datos_invalidos' }, { status: 400 });
  }

  // ---- Persistencia ANTES del webhook -------------------------------------
  // Deliberadamente antes: si n8n falla, misenruta o ni siquiera está
  // configurado, el CURP y el referidor ya quedaron guardados. Es exactamente
  // lo que se perdió el 29-jun (ver n8n/FIX_REFERIDOS_WORKFLOW.md), donde dos
  // leads dejaron su CURP y no quedó rastro en ningún lado.
  await persistir({ curp, correo, telefono, nombreCompleto, campania, referrer });

  const webhook = process.env.LEAD_WEBHOOK_URL;
  if (!webhook) return NextResponse.json({ ok: false, error: 'no_config' }, { status: 503 });

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
        nombre,
        apellido,
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

/**
 * Guarda el lead y su atribución. Todo es best-effort: un fallo aquí no debe
 * tumbar el alta del cliente, que es lo que le importa al usuario.
 *
 * ORDEN IMPORTANTE: la atribución se escribe ANTES de tocar `clientes`. El
 * trigger `resolver_atribucion_cliente` enlaza los toques pendientes cuando se
 * inserta o actualiza el cliente, así que la fila tiene que existir antes. Si
 * el cliente ya existía (y por tanto no disparamos el trigger), la escritura
 * que hace n8n después lo enlaza igual.
 */
async function persistir(args: {
  curp: string;
  correo: string;
  telefono: string;
  nombreCompleto: string;
  campania: string;
  referrer?: string;
}) {
  const { curp, correo, telefono, nombreCompleto, campania, referrer } = args;
  const admin = (() => {
    try {
      return createAdminClient();
    } catch {
      return null;
    }
  })();
  if (!admin) return;

  // 1) Atribución peer. Solo con un referidor con forma de uuid: el código
  //    viene de la URL y es FK a clientes, así que basura no debe ni intentarse.
  if (referrer && UUID_RE.test(referrer)) {
    try {
      await admin.from('atribuciones').insert({
        cliente_id: null, // lo resuelve el trigger por curp/teléfono
        curp,
        telefono,
        canal: 'cliente',
        referrer_cliente_id: referrer,
        codigo: referrer,
        fuente: 'lead_form',
      });
    } catch {
      // La tabla puede no existir aún: la migración es manual y está pendiente
      // de aplicar (web/migracion_atribucion.sql).
    }
  }

  // 2) Blindaje del CURP: inserta el cliente solo si no existe. `clientes.curp`
  //    es UNIQUE, y con ignoreDuplicates nunca pisamos los datos de un cliente
  //    que ya está en la base con información más completa.
  try {
    await admin.from('clientes').upsert(
      {
        curp,
        email: correo || null,
        telefono,
        nombre: nombreCompleto || null,
      },
      { onConflict: 'curp', ignoreDuplicates: true },
    );
  } catch {
    /* noop */
  }

  // 3) Atribución de campaña (sin datos personales en la tabla).
  try {
    await admin.from('links_campania').insert({ cliente_id: null, campania, evento: 'lead' });
  } catch {
    /* noop */
  }
}
