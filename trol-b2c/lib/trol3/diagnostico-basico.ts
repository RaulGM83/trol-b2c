// ============================================================================
// Diagnóstico básico por chat (claude/91, migración 204).
//
// Sustituye al Google Doc DIA_BAS que armaba n8n. Es una imagen 1080x1350 que el
// asesor manda por WhatsApp con la liga a /mi. Sale de lo ya calculado —v_expediente,
// la semilla y las oportunidades abiertas—: no consulta a nadie ni llama a OpenAI.
//
// Reglas de Raul (30-sep): sin foto del asesor, sin montos en las oportunidades (sólo
// que la hay), sólo B2C. Nunca "oficial".
// ============================================================================
import { t3, type Any } from '@/lib/trol3/server';
import { TZ } from '@/lib/fecha';

export type HeroDB =
  | { tipo: 'monto'; etiqueta: string; monto: string; sufijo: string; sub: string | null }
  | { tipo: 'rango'; etiqueta: string; monto: string; sub: string | null }
  | { tipo: 'texto'; etiqueta: string; titulo: string; sub: string | null };

export interface DiagnosticoBasico {
  nombre: string;
  fecha: string;
  chips: string[];
  hero: HeroDB;
  alerta: string | null;
  ops: { titulo: string; linea: string | null }[];
  opsTotal: number;
  asesor: string | null;
  corte: string | null;
  link: string | null;
  mensaje: string;
}

/** Estados que cuentan como "encontramos": lo cerrado no. */
const ABIERTAS = ['detectada', 'interesada', 'presentada', 'en_proceso', 'posible'];
const RANGO_ESTADO: Record<string, number> = { detectada: 0, interesada: 0, presentada: 0, en_proceso: 0, posible: 1 };

const num = (v: unknown) => {
  const n = Number(v);
  return v == null || v === '' || Number.isNaN(n) ? null : n;
};
const mx = (n: number) => '$' + Math.round(n).toLocaleString('es-MX');
const miles = (n: number) => '$' + Math.round(n / 1000).toLocaleString('es-MX') + ' mil';
const primerNombre = (s: string | null | undefined) => (s ?? '').trim().split(/\s+/)[0] || null;

const fmt = (d: string | Date, o: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('es-MX', { timeZone: TZ, ...o }).format(typeof d === 'string' ? new Date(d.length === 10 ? d + 'T12:00:00' : d) : d);
const fechaCorta = (d: string | Date) => fmt(d, { day: 'numeric', month: 'short', year: 'numeric' }).replace('.', '');
const fechaLarga = (d: string | Date) => fmt(d, { day: 'numeric', month: 'long', year: 'numeric' });
const mesAnio = (d: string) => fmt(d, { month: 'long', year: 'numeric' });
const mesesHasta = (d: string) => (new Date(d.length === 10 ? d + 'T12:00:00' : d).getTime() - Date.now()) / (30.4375 * 86400000);

/** Nombre como lo diría una persona: "María del Consuelo", no "MARIA DEL CONSUELO". */
function nombrePropio(s: string | null | undefined) {
  const t = (s ?? '').trim();
  if (!t) return '';
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().split(/\s+/).map((w) => (['de', 'del', 'la', 'los', 'las', 'y'].includes(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

export async function armarDiagnosticoBasico(personaId: string, miembroNombre: string | null): Promise<DiagnosticoBasico | null> {
  const db = t3();
  const [{ data: e }, { data: sem }, { data: ops }, { data: cat }, { data: link }] = await Promise.all([
    db.from('v_expediente').select('*').eq('persona_id', personaId).maybeSingle(),
    db.from('datos').select('valor').eq('persona_id', personaId).eq('campo', 'semilla').order('obtenido_en', { ascending: false }).limit(1).maybeSingle(),
    db.from('oportunidades').select('codigo,estado,valor_estimado').eq('persona_id', personaId).order('valor_estimado', { ascending: false, nullsFirst: false }),
    db.from('catalogo_oportunidades').select('codigo,nombre_cliente,frase_corta,nivel,activo'),
    db.rpc('mi_link_asesor', { p_persona: personaId }),
  ]);
  if (!e) return null;
  const s = ((sem as Any)?.valor ?? null) as Any;
  const perfil = (s?.perfil ?? {}) as Any;
  const base = ((s?.escenarios?.estrategicos ?? []) as Any[]).find((x) => x?.escenario === 'Escenario Base') ?? null;

  const ley: string | null = (e as Any).ley ?? perfil.ley ?? null;
  const es73 = ley === 'Ley73';
  const semanas = num((e as Any).semanas) ?? num(perfil.semanas?.netas);
  const edad = num((e as Any).edad);
  const cotizando = ((e as Any).status_empleo ?? perfil.status_empleo) === 'empleado';
  const pensionado = !!((e as Any).tipo_pension_nomina || num((e as Any).pension_nomina_bruta));

  const chips = [
    ley ? ley.replace('Ley', 'Ley ') : null,
    semanas != null ? `${Math.round(semanas).toLocaleString('es-MX')} semanas` : null,
    edad != null ? `${Math.floor(edad)} años` : null,
    pensionado ? 'Pensionado' : cotizando ? 'Cotizando' : null,
  ].filter(Boolean) as string[];

  // ---- El número grande ----
  const pensionBase = num((e as Any).pension_base) ?? num(base?.calculatedPension);
  const edadBase = num(base?.retirementAge);
  // La vista trae la edad entera; para saber si el escenario es a futuro hace falta la exacta.
  const fnac: string | null = (e as Any).fecha_nacimiento ?? perfil.fecha_nacimiento ?? null;
  const edadExacta = fnac ? (Date.now() - new Date(fnac + 'T12:00:00').getTime()) / (365.25 * 86400000) : edad;
  const aFuturo = edadBase != null && edadExacta != null && edadBase > edadExacta + 0.5;
  const etiquetaPension = aFuturo ? `Tu pensión estimada a los ${Math.round(edadBase!)} años` : 'Si te pensionaras hoy, te tocarían';
  const fechaDerecho: string | null = base?.fecha_derecho ?? null;
  const finCons: string | null = (e as Any).fin_conservacion ?? perfil.fechas?.fin_conservacion_derechos ?? null;
  const conserva = ((e as Any).conserva_derechos ?? perfil.conserva_derechos) !== false;
  let hero: HeroDB;

  if (pensionado) {
    hero = { tipo: 'texto', etiqueta: 'Tu situación hoy', titulo: 'Ya cobras tu pensión', sub: 'Revisamos lo que todavía puedes aprovechar con ella.' };
  } else if (es73) {
    if (pensionBase != null && pensionBase > 0) {
      const sub = fechaDerecho
        ? `Ya ganaste tu derecho desde **${mesAnio(fechaDerecho)}**. Puedes cobrar hasta **12 meses de retroactivo**.`
        : conserva && finCons && !cotizando
          ? `Conservas tus derechos de Ley 73 hasta el **${fechaLarga(finCons)}**.`
          : null;
      hero = { tipo: 'monto', etiqueta: etiquetaPension, monto: mx(pensionBase), sufijo: 'al mes', sub };
    } else {
      const faltan = semanas != null && semanas < 500 ? 500 - Math.round(semanas) : null;
      const sub = !conserva && finCons
        ? `Tus derechos de Ley 73 vencieron el **${fechaLarga(finCons)}**. Se pueden recuperar.`
        : faltan
          ? `Te faltan **${faltan.toLocaleString('es-MX')} semanas** para llegar a 500.`
          : null;
      hero = { tipo: 'texto', etiqueta: 'Si te pensionaras hoy', titulo: 'Tu pensión sería negada', sub };
    }
  } else {
    const r = s?.saldos?.afore_rango as Any;
    const piso = num(r?.piso), techo = num(r?.techo);
    const vivienda = num((e as Any).saldo_infonavit) ?? num(s?.saldos?.infonavit);
    const credito = (e as Any).credito_infonavit === true || s?.saldos?.credito_infonavit_vigente === true;
    const partes = [
      pensionBase != null && pensionBase > 0 ? `${aFuturo ? `A los ${Math.round(edadBase!)} años tu pensión estimada sería` : 'Con lo que llevas, tu pensión estimada sería'} de **${mx(pensionBase)} al mes**.` : null,
      vivienda && vivienda > 0 && !credito ? `Tu subcuenta de vivienda tiene **${mx(vivienda)}**.` : null,
    ].filter(Boolean);
    hero = piso && techo
      ? { tipo: 'rango', etiqueta: 'Tu AFORE hoy (estimado)', monto: `${miles(piso)} a ${miles(techo)}`, sub: partes.join(' ') || null }
      : pensionBase != null && pensionBase > 0
        ? { tipo: 'monto', etiqueta: etiquetaPension, monto: mx(pensionBase), sufijo: 'al mes', sub: partes.slice(1).join(' ') || null }
        : { tipo: 'texto', etiqueta: 'Tu situación hoy', titulo: 'Revisemos tu caso juntos', sub: partes.join(' ') || null };
  }

  // ---- Oportunidades: sin montos, una por nombre para el cliente ----
  const catMap = new Map(((cat ?? []) as Any[]).map((c) => [c.codigo, c]));
  const vistas = new Set<string>();
  const lista = ((ops ?? []) as Any[])
    .filter((o) => ABIERTAS.includes(o.estado))
    .map((o) => ({ o, c: catMap.get(o.codigo) as Any }))
    .filter(({ c }) => c?.activo && c?.nombre_cliente)
    .sort((a, b) => (RANGO_ESTADO[a.o.estado] ?? 2) - (RANGO_ESTADO[b.o.estado] ?? 2))
    .filter(({ c }) => (vistas.has(c.nombre_cliente) ? false : (vistas.add(c.nombre_cliente), true)))
    .map(({ c }) => ({ titulo: c.nombre_cliente as string, linea: (c.frase_corta ?? null) as string | null, codigo: c.codigo as string }));

  // ---- Una sola alerta, la más urgente ----
  const codigos = new Set(lista.map((x) => x.codigo));
  const limiteM40: string | null = (e as Any).limite_mod40 ?? null;
  let alerta: string | null = null;
  if (es73 && !pensionado && conserva && finCons && !cotizando && mesesHasta(finCons) > 0 && mesesHasta(finCons) <= 18) {
    alerta = `Tus derechos de Ley 73 vencen el ${fechaLarga(finCons)}. Hay que actuar antes.`;
  } else if (limiteM40 && (codigos.has('mod40_retro') || codigos.has('mod40_prospectiva')) && mesesHasta(limiteM40) > 0 && mesesHasta(limiteM40) <= 12) {
    alerta = `Tu fecha límite para inscribirte a Modalidad 40 es el ${fechaLarga(limiteM40)}.`;
  } else if (codigos.has('pension_hoy')) {
    alerta = 'Cada mes que pasa sin hacer tu trámite es pensión que no cobras.';
  }

  const nombre = nombrePropio((e as Any).nombre);
  const cabecera = (e as Any).cabecera_id
    ? (((await db.from('miembros').select('nombre').eq('id', (e as Any).cabecera_id).maybeSingle()).data as Any)?.nombre ?? null)
    : null;
  const asesor = primerNombre(cabecera) ?? primerNombre(miembroNombre);
  const fechaSisec: string | null = s?.meta?.fecha_sisec ?? null;
  const url = (link as string | null) ?? null;

  return {
    nombre,
    fecha: fechaCorta(new Date()),
    chips,
    hero,
    alerta,
    ops: lista.slice(0, 3).map(({ titulo, linea }) => ({ titulo, linea })),
    opsTotal: lista.length,
    asesor,
    corte: fechaSisec ? fechaLarga(fechaSisec.slice(0, 10)) : null,
    link: url,
    mensaje:
      `Hola${nombre ? ' ' + nombre : ''}, te comparto tu diagnóstico de pensión con lo que encontramos en tu historial del IMSS.` +
      (url ? ` Aquí puedes ver el detalle y agendar tu asesoría de 20 minutos: ${url}` : ' Si quieres, agendamos tu asesoría de 20 minutos para revisarlo juntos.'),
  };
}
