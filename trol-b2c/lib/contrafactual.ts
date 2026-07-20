// ============================================================================
// Lectura del bloque `contrafactual` (motor contrafactual-1.5) guardado por el
// batch dentro de clientes.calculo_pensional. Alimenta /comparativo.
// La campaña y esta experiencia comparan SOLO números de este motor (decisión
// 19-jul); el saldo real del cliente entra hasta el unlock de estado de cuenta.
// ============================================================================

export interface CanastaContrafactual {
  afores: string[];
  promedio: number;
  min?: number;
  max?: number;
}

export interface SaldoPorAfore {
  afore: string; // slug del motor (p.ej. 'xxi-banorte')
  saldo: number;
  rcv97: number;
  sar92: number;
}

export interface BloqueContrafactual {
  version: string;
  supuestos: string[];
  precios_corte: string;
  canasta_superior: CanastaContrafactual;
  canasta_baja: CanastaContrafactual;
  mediana_sistema: number;
  brecha_top_vs_mediana: number;
  brecha_top_vs_baja: number;
  desglose_referencia: { rcv97: number; sar92: number };
  saldos_por_afore: SaldoPorAfore[];
  sar92_semilla: number;
  aportado_nominal: number;
  meses_cotizados: number;
  cobertura_historia: number | null;
  flag_publicable: boolean;
  fuente_historia?: string;
  referencia_previa?: { estimado: number; delta_vs_mediana: number } | null;
}

/** slug del motor → nombre comercial (mismo catálogo que lib/afores.AFORES). */
export const NOMBRE_AFORE: Record<string, string> = {
  azteca: 'Azteca',
  banamex: 'Citibanamex',
  coppel: 'Coppel',
  inbursa: 'Inbursa',
  invercap: 'Invercap',
  pensionissste: 'PensionISSSTE',
  principal: 'Principal',
  profuturo: 'Profuturo',
  sura: 'SURA',
  'xxi-banorte': 'XXI Banorte',
};

/** nombre del catálogo de la encuesta → slug del motor. */
export const CATALOGO_A_SLUG: Record<string, string> = {
  Azteca: 'azteca',
  Banorte: 'xxi-banorte',
  Citibanamex: 'banamex',
  Coppel: 'coppel',
  Inbursa: 'inbursa',
  Invercap: 'invercap',
  PensionISSSTE: 'pensionissste',
  Principal: 'principal',
  Profuturo: 'profuturo',
  SURA: 'sura',
};

export function nombreAfore(slug: string): string {
  return NOMBRE_AFORE[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

/**
 * Monto en texto "suave" — consistente con el gancho de campaña: "rondaría".
 * Redondeo a miles (≥$10 mil) o a decimales de millón (≥$1 M). Nunca centavos:
 * la frescura del SISEC (hasta 2 años) no da para precisión de pesos.
 */
export function milesTexto(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 995_000) {
    // 2 decimales (granularidad $10 mil): con 1 decimal, top/mediana/baja
    // colisionaban en pantalla (~10% de los casos, auditoría 19-jul) y el
    // comparativo parecía "todo igual". Se recortan ceros finales.
    const m = (Math.round((n / 1_000_000) * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
    return m === '1' ? '$1 millón' : `$${m} millones`;
  }
  if (n >= 10_000) return `$${Math.round(n / 1_000).toLocaleString('es-MX')} mil`;
  return `$${Math.round(n).toLocaleString('es-MX')}`;
}

/** Monto exacto para tablas/panel ñoño. */
export const pesos = (n: number) => '$' + Math.round(n).toLocaleString('es-MX');

/** Extrae y valida el bloque desde clientes.calculo_pensional (jsonb crudo). */
export function parseContrafactual(calculoPensional: unknown): BloqueContrafactual | null {
  if (!calculoPensional || typeof calculoPensional !== 'object') return null;
  const b = (calculoPensional as Record<string, unknown>).contrafactual as
    | BloqueContrafactual
    | undefined;
  if (!b || typeof b !== 'object') return null;
  if (typeof b.version !== 'string' || !b.version.startsWith('contrafactual')) return null;
  if (!b.canasta_superior?.promedio || !b.mediana_sistema) return null;
  if (!Array.isArray(b.saldos_por_afore)) return null;
  return b;
}

// ----------------------------------------------------------------------------
// ViewModel para el componente
// ----------------------------------------------------------------------------

export interface ComparativoVM {
  publicable: boolean;
  /** Montos de las tres referencias simuladas. */
  top: number;
  mediana: number;
  baja: number;
  topAfores: string[]; // nombres comerciales
  brechaTopMediana: number;
  brechaTopBaja: number;
  /** Nombres comerciales de la canasta baja (para la vista por grupos). */
  bajaAfores: string[];
  desglose: { rcv97: number; sar92: number };
  /** Ranking simulado completo (nombre comercial, montos exactos), desc. */
  saldos: Array<{ slug: string; nombre: string; saldo: number; rcv97: number; sar92: number }>;
  // Panel ñoño
  supuestos: string[];
  preciosCorte: string;
  fuenteHistoria: string | null;
  cobertura: number | null;
  mesesCotizados: number;
  aportadoNominal: number;
  sar92Semilla: number;
}

export function buildComparativoVM(b: BloqueContrafactual): ComparativoVM {
  const saldos = [...b.saldos_por_afore]
    .sort((x, y) => y.saldo - x.saldo)
    .map((s) => ({ slug: s.afore, nombre: nombreAfore(s.afore), saldo: s.saldo, rcv97: s.rcv97, sar92: s.sar92 }));
  return {
    publicable: !!b.flag_publicable,
    top: b.canasta_superior.promedio,
    mediana: b.mediana_sistema,
    baja: b.canasta_baja?.promedio ?? 0,
    topAfores: (b.canasta_superior.afores ?? []).map(nombreAfore),
    brechaTopMediana: b.brecha_top_vs_mediana,
    brechaTopBaja: b.brecha_top_vs_baja,
    bajaAfores: (b.canasta_baja?.afores ?? []).map(nombreAfore),
    desglose: b.desglose_referencia,
    saldos,
    supuestos: b.supuestos ?? [],
    preciosCorte: b.precios_corte,
    fuenteHistoria: b.fuente_historia ?? null,
    cobertura: b.cobertura_historia,
    mesesCotizados: b.meses_cotizados,
    aportadoNominal: b.aportado_nominal,
    sar92Semilla: b.sar92_semilla,
  };
}

/** Posición de la AFORE declarada (encuesta) dentro del ranking simulado. */
export function posicionAforeDeclarada(vm: ComparativoVM, aforeCatalogo: string | null) {
  if (!aforeCatalogo) return null;
  const slug = CATALOGO_A_SLUG[aforeCatalogo];
  if (!slug) return null; // "No sé" u otro valor fuera de catálogo
  const idx = vm.saldos.findIndex((s) => s.slug === slug);
  if (idx < 0) return null;
  const fila = vm.saldos[idx];
  return {
    slug,
    nombre: fila.nombre,
    posicion: idx + 1,
    total: vm.saldos.length,
    saldoSimulado: fila.saldo,
    deltaVsTop: Math.max(0, vm.top - fila.saldo),
    enTop: vm.saldos.slice(0, 3).some((s) => s.slug === slug),
  };
}
