// ============================================================================
// Batch de semillas contrafactuales — Compara Afore (metodología v1.4)
//
// Recorre los clientes con historia laboral, corre el motor de pension-core y
// persiste el bloque `contrafactual` dentro de clientes.calculo_pensional.
//
// Uso:
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   npx tsx scripts/contrafactual-batch.ts [--limit 100] [--dry-run]
//
// Sin dependencias: usa fetch contra PostgREST. Requiere Node 18+.
// ============================================================================

import {
  calcularContrafactual,
  completarConIndiceIndustria,
  definirCanastas,
  type SerieAfore,
  type PrecioMes,
} from '../src/contrafactual';
import { serieGeneracional, MESES_MINIMOS_CANASTA, CURVA_SALARIAL_ANUAL } from '../src/tablas-contrafactual';
import { getHistoriaLaboral } from '../src/historia-laboral';
import { getHistoriaPrecisa } from '../src/eventos-laborales';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const args = process.argv.slice(2);
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const DRY = args.includes('--dry-run');
// v1.8: castigo plano TEMPORAL sobre todos los saldos (conservador mientras se
// junta muestra real de declarados). Se removerá poniéndolo en 0.
// Override: --castigo 0.05  (o CASTIGO_PLANO=0 env).
const CASTIGO_PLANO = args.includes('--castigo')
  ? Number(args[args.indexOf('--castigo') + 1])
  : process.env.CASTIGO_PLANO != null
    ? Number(process.env.CASTIGO_PLANO)
    : 0.1;

const H = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${URL}/rest/v1/${path}`, { headers: H, ...init });
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

// ----------------------------------------------------------------------------
// 1) Cargar precios mensuales y armar series por generación
// ----------------------------------------------------------------------------

interface FilaPrecio {
  afore: string;
  siefore: string;
  mes: string;
  precio: number;
}

async function cargarPrecios(): Promise<Map<string, Map<string, PrecioMes[]>>> {
  // serie → afore → precios ordenados
  const out = new Map<string, Map<string, PrecioMes[]>>();
  let offset = 0;
  const PAGE = 50_000;
  for (;;) {
    const filas = await rest<FilaPrecio[]>(
      `siefore_precios_mensual?select=afore,siefore,mes,precio&order=siefore,afore,mes&limit=${PAGE}&offset=${offset}`,
    );
    for (const f of filas) {
      if (!out.has(f.siefore)) out.set(f.siefore, new Map());
      const porAfore = out.get(f.siefore)!;
      if (!porAfore.has(f.afore)) porAfore.set(f.afore, []);
      porAfore.get(f.afore)!.push({ mes: f.mes, precio: Number(f.precio) });
    }
    if (filas.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

/**
 * Serie generacional para un año de nacimiento, con encadenamiento de eventos
 * de catálogo (sb 55-59 → sb 1000 en ago-24; sb0 → sb 95-99 en ago-24) y
 * completado con índice industria. Cachea por serie.
 */
const cacheSeries = new Map<string, { series: SerieAfore[]; canastas: ReturnType<typeof definirCanastas> }>();

function seriesParaGeneracion(
  precios: Map<string, Map<string, PrecioMes[]>>,
  anioNacimiento: number,
) {
  const g = serieGeneracional(anioNacimiento);
  const clave = `${g.serie}|${g.encadenaCon?.serie ?? ''}`;
  const cached = cacheSeries.get(clave);
  if (cached) return cached;

  const principal = precios.get(g.serie) ?? new Map<string, PrecioMes[]>();
  const previa = g.encadenaCon ? (precios.get(g.encadenaCon.serie) ?? new Map()) : null;

  const afores = new Set<string>([...principal.keys(), ...(previa ? previa.keys() : [])]);
  const parciales: Array<{ afore: string; precios: PrecioMes[] }> = [];

  for (const afore of afores) {
    const pPrincipal = principal.get(afore) ?? [];
    let serie: PrecioMes[] = pPrincipal;
    if (previa && g.encadenaCon) {
      const corte = g.encadenaCon.hasta;
      const tramoPrevio = (previa.get(afore) ?? []).filter((p: PrecioMes) => p.mes <= corte);
      const tramoNuevo = pPrincipal.filter((p) => p.mes > corte);
      // empalme por nivel en el mes de corte
      const nivelPrevio = tramoPrevio[tramoPrevio.length - 1]?.precio;
      const primerNuevo = tramoNuevo[0]?.precio;
      if (nivelPrevio && primerNuevo) {
        const factor = nivelPrevio / primerNuevo;
        serie = [...tramoPrevio, ...tramoNuevo.map((p) => ({ mes: p.mes, precio: p.precio * factor }))];
      } else if (tramoPrevio.length) {
        serie = tramoPrevio;
      }
    }
    if (serie.length) parciales.push({ afore, precios: serie });
  }

  const series = completarConIndiceIndustria(parciales);
  const canastas = definirCanastas(series, MESES_MINIMOS_CANASTA);
  const r = { series, canastas };
  cacheSeries.set(clave, r);
  return r;
}

// ----------------------------------------------------------------------------
// 2) Clientes
// ----------------------------------------------------------------------------

interface Cliente {
  id: string;
  fecha_nacimiento: string | null;
  rcv97: string | null;
  semanas_cotizadas: string | null;
  'última_fecha_sisec': string | null;
  calculo_pensional: Record<string, unknown> | null;
  json_belvo: unknown;
  /** Embed PostgREST: eventos del SISEC de cada proceso (solo la ruta necesaria). */
  procesos?: Array<{ created_at: string; eventos: unknown }>;
}

function pesos(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

async function main() {
  console.log('Cargando precios mensuales…');
  const precios = await cargarPrecios();
  console.log(`Series cargadas: ${[...precios.keys()].join(', ')}`);

  let procesados = 0;
  let conBrecha = 0;
  let publicables = 0;
  let sinHistoria = 0;
  let offset = 0;
  const PAGE = 200;

  while (procesados < LIMIT) {
    const clientes = await rest<Cliente[]>(
      `clientes?select=id,fecha_nacimiento,rcv97,semanas_cotizadas,última_fecha_sisec,calculo_pensional,json_belvo,` +
        `procesos(created_at,eventos:json_sisec->employment_history_json->data->employment_events)` +
        `&fecha_nacimiento=not.is.null&order=id&limit=${PAGE}&offset=${offset}`,
    );
    if (clientes.length === 0) break;
    offset += clientes.length;

    for (const c of clientes) {
      if (procesados >= LIMIT) break;
      // Fuente más precisa disponible: eventos SISEC (con salary_modification)
      // → eventos Belvo → empleos interpolados (initial→final) → empleos planos.
      const eventosSisec = (c.procesos ?? [])
        .filter((p) => Array.isArray(p.eventos) && (p.eventos as unknown[]).length > 0)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]?.eventos;
      // Empleos: preferir los de Belvo (traen initial_salary → interpolación);
      // el historial de la semilla no trae salario inicial.
      const empleosBelvo = getHistoriaLaboral({ json_belvo: c.json_belvo });
      const { historia, fuente } = getHistoriaPrecisa(
        {
          json_sisec: eventosSisec,
          json_belvo: c.json_belvo,
          empleos: empleosBelvo.length ? empleosBelvo : getHistoriaLaboral(c),
        },
        // Fallback de salario final plano: deflactar con la curva salarial
        // observada en la propia base (mediana de cambios reales por año).
        { curvaSalarial: CURVA_SALARIAL_ANUAL, hastaISO: new Date().toISOString().slice(0, 10) },
      );
      if (historia.length === 0) {
        sinHistoria++;
        continue;
      }
      const anio = Number((c.fecha_nacimiento as string).slice(0, 4));
      const { series, canastas } = seriesParaGeneracion(precios, anio);
      if (series.length === 0) continue;

      const semillaPrev = (c.calculo_pensional ?? {}) as Record<string, unknown>;
      const perfil = (semillaPrev.perfil ?? {}) as Record<string, unknown>;
      const saldos = (semillaPrev.saldos ?? {}) as Record<string, unknown>;
      const ratio = Number(perfil.ratio_historico_salario_uma) || null;
      // Metodología anterior: SOLO como referencia informativa (decisión 19-jul).
      const rcv97 = Number(saldos.rcv97) || pesos(c.rcv97);
      const sar92 = Number(saldos.sar92) || 0;
      const estimadoPrevio = rcv97 != null ? rcv97 + sar92 : null;
      // Semanas SISEC: ancla del flag de cobertura.
      const semanasPerfil = Number((perfil.semanas as Record<string, unknown> | undefined)?.cotizadas);
      const semanas = semanasPerfil || Number((c.semanas_cotizadas ?? '').replace(/,/g, '')) || null;
      // v1.8: semanas descontadas (retiros por desempleo) → F2.
      const semanasDesc =
        Number((perfil.semanas as Record<string, unknown> | undefined)?.descontadas) || 0;

      try {
        const r = calcularContrafactual({
          fecha_nacimiento: c.fecha_nacimiento as string,
          historia,
          ratio_salario_uma: ratio,
          series,
          canastas,
          estimado_previo: estimadoPrevio,
          semanas_cotizadas: semanas,
          semanas_descontadas: semanasDesc,
          retiro_modo: 'reciente',
          castigo_plano: CASTIGO_PLANO,
          fecha_corte_semanas: c['última_fecha_sisec'] ?? null,
        });
        procesados++;
        if (r.brecha_top_vs_mediana > 0) conBrecha++;
        if (r.flag_publicable) publicables++;

        if (!DRY) {
          await rest(`clientes?id=eq.${c.id}`, {
            method: 'PATCH',
            headers: { ...H, Prefer: 'return=minimal' },
            body: JSON.stringify({
              calculo_pensional: {
                ...semillaPrev,
                contrafactual: { ...r, fuente_historia: fuente },
              },
            }),
          });
        }
        if (procesados % 100 === 0) console.log(`… ${procesados} procesados`);
      } catch (e) {
        console.warn(`cliente ${c.id}: ${String(e).slice(0, 120)}`);
      }
    }
    if (clientes.length < PAGE) break;
  }

  console.log(
    `\nListo. Procesados: ${procesados} · con brecha positiva: ${conBrecha} · publicables (±40%): ${publicables} · sin historia: ${sinHistoria}${DRY ? ' · (dry-run, sin escribir)' : ''}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
