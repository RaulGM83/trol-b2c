#!/usr/bin/env node
/**
 * Piloto API Consulta CDA (Millas para el Retiro) — validateCapacity por CURP.
 *
 * Toma N CURPs pendientes de Supabase (RPC curps_para_cda), genera token,
 * valida capacidad una por una con throttle y guarda cada resultado en
 * cda_validaciones. Al final imprime un resumen (true/false/errores, latencias).
 *
 * Uso:
 *   CDA_BASE_URL=https://...   # URL base que entregue Millas (sin / final)
 *   CDA_USER=...  CDA_PASSWORD=...
 *   SUPABASE_URL=https://orgagfdxygtjiwqvgckw.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *   node piloto_validate_capacity.mjs [--n 100] [--throttle 400]
 *
 * Requiere Node 18+ (fetch nativo). Sin dependencias.
 */

const args = process.argv.slice(2);
const argVal = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const N = parseInt(argVal('--n', '100'), 10);
const THROTTLE_MS = parseInt(argVal('--throttle', '400'), 10); // ~2.5 req/s

const { CDA_BASE_URL, CDA_USER, CDA_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
for (const [k, v] of Object.entries({ CDA_BASE_URL, CDA_USER, CDA_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY })) {
  if (!v) { console.error(`Falta variable de entorno: ${k}`); process.exit(1); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Supabase (PostgREST, service role) ----------
const sbHeaders = {
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

async function curpsPendientes(n) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/curps_para_cda`, {
    method: 'POST',
    headers: sbHeaders,
    body: JSON.stringify({ n }),
  });
  if (!res.ok) throw new Error(`Supabase RPC curps_para_cda: ${res.status} ${await res.text()}`);
  return res.json(); // [{ cliente_id, curp }]
}

async function guardarResultado(row) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/cda_validaciones`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!res.ok) console.error(`  ! No se guardó ${row.curp}: ${res.status} ${await res.text()}`);
}

// ---------- API CDA ----------
let token = null;
let tokenAt = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000; // renovar a los 50 min (vigencia oficial: 1 h)

async function obtenerToken() {
  const res = await fetch(`${CDA_BASE_URL}/inquire/v1/token/generateToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: CDA_USER, password: CDA_PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.status !== 200 || !body?.model?.token) {
    throw new Error(`generateToken falló: HTTP ${res.status} · status=${body?.status} · ${body?.message ?? ''}`);
  }
  token = body.model.token;
  tokenAt = Date.now();
  console.log('Token obtenido.');
}

async function validarCapacidad(curp) {
  if (!token || Date.now() - tokenAt > TOKEN_TTL_MS) await obtenerToken();
  const t0 = Date.now();
  const res = await fetch(`${CDA_BASE_URL}/inquire/v1/contribution/validateCapacity`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'authorization-pc': `Bearer-PC ${token}`,
    },
    body: JSON.stringify({ curp }),
    signal: AbortSignal.timeout(35_000), // spec: hasta 30 s
  });
  const ms = Date.now() - t0;
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) { token = null; } // forzar renovación en el siguiente intento
  return {
    http: res.status,
    status: body?.status ?? null,
    message: body?.message ?? null,
    canReceive: body?.model?.canReceiveContributions ?? null,
    ms,
  };
}

// ---------- Main ----------
const main = async () => {
  console.log(`Piloto CDA: ${N} CURPs, throttle ${THROTTLE_MS} ms`);
  const pendientes = await curpsPendientes(N);
  if (!pendientes.length) { console.log('No hay CURPs pendientes.'); return; }
  console.log(`${pendientes.length} CURPs por validar.\n`);

  const resumen = { true: 0, false: 0, error: 0 };
  const latencias = [];
  const mensajes = new Map(); // message → conteo (para aprender la semántica real)

  for (const [i, { cliente_id, curp }] of pendientes.entries()) {
    let r;
    try {
      r = await validarCapacidad(curp);
    } catch (e) {
      r = { http: 0, status: null, message: String(e.message ?? e), canReceive: null, ms: 0 };
    }
    const ok = r.status === 200 && typeof r.canReceive === 'boolean';
    if (ok) resumen[String(r.canReceive)]++; else resumen.error++;
    if (r.ms) latencias.push(r.ms);
    if (r.message) mensajes.set(r.message, (mensajes.get(r.message) ?? 0) + 1);

    await guardarResultado({
      cliente_id,
      curp,
      can_receive: ok ? r.canReceive : null,
      status: r.status ?? r.http,
      message: r.message,
      fuente: 'batch',
    });

    console.log(`${String(i + 1).padStart(4)}/${pendientes.length}  ${curp}  → ${ok ? r.canReceive : `ERROR (${r.status ?? r.http})`}  ${r.ms} ms`);
    await sleep(THROTTLE_MS);
  }

  latencias.sort((a, b) => a - b);
  const p = (q) => latencias[Math.floor(q * (latencias.length - 1))] ?? 0;
  console.log('\n===== RESUMEN =====');
  console.log(`true: ${resumen.true} · false: ${resumen.false} · error: ${resumen.error}`);
  console.log(`Latencia ms — mediana: ${p(0.5)}, p90: ${p(0.9)}, max: ${p(1)}`);
  console.log('Mensajes del API:');
  for (const [m, c] of mensajes) console.log(`  ${c}× "${m}"`);
  console.log('\nResultados guardados en cda_validaciones. Segmentos: select segmento_cda, count(*) from vista_cda_oportunidades group by 1;');
};

main().catch((e) => { console.error(e); process.exit(1); });
