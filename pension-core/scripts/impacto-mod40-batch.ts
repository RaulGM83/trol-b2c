// ============================================================================
// Informe Trol #2 — lote de dos mundos (claude/107 paso 4).
//
// Lee las 8,815 personas Ley 73 sembradas en archivo.impacto_mod40_2026
// (migración 259), corre `evaluarDosMundos` con pension-core y guarda el
// resultado por persona en la misma tabla. Reanudable: sólo toma las que no
// tienen `calculado_en` (usa --todas para recalcular).
//
// Uso (desde pension-core/, con las llaves del .env.local de trol-b2c):
//   set -a; source ../trol-b2c/.env.local; set +a
//   SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL npx tsx scripts/impacto-mod40-batch.ts --limit 20
//   SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL npx tsx scripts/impacto-mod40-batch.ts
//
// Opciones: --limit N · --dry-run (no guarda) · --todas · --sin-sugerir (más rápido) · --paso 3
// Sin dependencias: fetch contra PostgREST. Node 18+.
// ============================================================================

import { evaluarDosMundos, type FilaEntrada, type ResultadoPersona } from './impacto/dos-mundos';
import { ENGINE_VERSION } from '../src/version';

const URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (source ../trol-b2c/.env.local)');
  process.exit(1);
}
const args = process.argv.slice(2);
const val = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const LIMIT = val('--limit') ? Number(val('--limit')) : Infinity;
const DRY = args.includes('--dry-run');
const TODAS = args.includes('--todas');
const SUGERIR = !args.includes('--sin-sugerir');
const PASO = val('--paso') ? Number(val('--paso')) : 3;
const PAGINA = 200;
const LOTE_GUARDAR = 50;

// Llaves nuevas (sb_secret_…) van sólo en `apikey`; las JWT viejas también en Authorization.
const H: Record<string, string> = KEY.startsWith('sb_')
  ? { apikey: KEY, 'Content-Type': 'application/json' }
  : { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

async function rpc<T>(fn: string, body: unknown): Promise<T> {
  for (let intento = 1; ; intento++) {
    const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
    if (res.ok) return (await res.json()) as T;
    const txt = (await res.text()).slice(0, 300);
    if (intento >= 3) throw new Error(`${fn} → ${res.status}: ${txt}`);
    console.warn(`  ${fn} ${res.status}, reintento ${intento}…`);
    await new Promise((r) => setTimeout(r, 1500 * intento));
  }
}

async function main() {
  console.log(`pension-core ${ENGINE_VERSION} · ${DRY ? 'DRY-RUN · ' : ''}${TODAS ? 'todas' : 'pendientes'} · sugerir=${SUGERIR} paso=${PASO}`);
  const t0 = Date.now();
  let after: string | null = null;
  let hechas = 0, errores = 0;
  const porCamino = new Map<string, number>();
  let buffer: ResultadoPersona[] = [];
  const flush = async () => {
    if (!buffer.length) return;
    if (!DRY) await rpc<number>('impacto_mod40_guardar', { p_filas: buffer });
    buffer = [];
  };

  while (hechas < LIMIT) {
    const filas: FilaEntrada[] = await rpc('impacto_mod40_entradas', { p_after: after, p_limit: PAGINA, p_solo_pendientes: !TODAS });
    if (!filas.length) break;
    for (const f of filas) {
      if (hechas >= LIMIT) break;
      let r: ResultadoPersona;
      try {
        r = evaluarDosMundos(f, { sugerir: SUGERIR, pasoMeses: PASO });
      } catch (e) {
        r = { persona_id: f.persona_id, motor_version: ENGINE_VERSION, error: `excepcion: ${(e as Error).message}`.slice(0, 300),
          semanas: null, ultimo_sbc: null, sbc_tope_mod40: null, mod40_permitida: null, edad_retiro_min: null,
          viejo_pension: null, viejo_costo_imss: null, viejo_costo_total: null, nuevo_mejor_camino: null,
          nuevo_pension: null, nuevo_costo: null, base_pension: null, detalle: null };
      }
      if (r.error) errores++;
      else porCamino.set(r.nuevo_mejor_camino ?? '-', (porCamino.get(r.nuevo_mejor_camino ?? '-') ?? 0) + 1);
      buffer.push(r);
      hechas++;
      if (buffer.length >= LOTE_GUARDAR) await flush();
      if (LIMIT <= 20) {
        console.log(`  ${f.segmento} ${r.error ?? ''} viejo ${r.viejo_pension} (${r.viejo_costo_imss}) → nuevo ${r.nuevo_mejor_camino} ${r.nuevo_pension} (${r.nuevo_costo}) · base ${r.base_pension}`);
      }
    }
    after = filas[filas.length - 1].persona_id;
    const seg = (Date.now() - t0) / 1000;
    console.log(`${hechas} personas · ${errores} con error · ${seg.toFixed(0)} s (${(seg / hechas * 1000).toFixed(0)} ms/persona)`);
  }
  await flush();
  console.log('Listo.', Object.fromEntries(porCamino), `errores: ${errores}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
