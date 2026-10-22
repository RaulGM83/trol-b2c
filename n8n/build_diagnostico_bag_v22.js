// ============================================================================
// "Build Diagnostico Bag" v2.2 — semilla calculo_pensional con secciones ricas
// v2.2 (22-oct-2026, claude/106): régimen de Mod 40 (motor v5.8) en el bag
// (mod40_regimen, mod40_sbc_tope, mod40_permitida, pension_mod10_futuro,
// costo_mensual_mod40/10) y escenarios.caminos_mod40. pension_mod40_futuro
// cae al camino Mod 40 a 12 meses cuando ya no hay "Futuro Retroactivo".
// (el bag `diagnostico` queda IDÉNTICO al v1.2-item-merge)
// Spec: SEMILLA_CALCULO_PENSIONAL_V2.md
//
// v2.1 — se agrega meta.nombre_sisec: el nombre OFICIAL tal como lo devuelve
// el IMSS, sin los fallbacks de resolveName(). Sirve para comparar contra el
// nombre que capturó el asesor y detectar discrepancias de identidad.
// Se lee con try/catch a propósito: el payload del webhook cambia de forma
// según por dónde entró el caso (Belvo, Jordan, PDF, aliado), y un nivel
// faltante tumbaría el nodo entero y con él toda la semilla.
// ============================================================================

const j  = $json;
const ud = j.user_data || {};
const ss = j.selected_scenarios || [];
const baseSc = ss.find(s => s.escenario === 'Escenario Base')   || {};
const maxSc  = ss.find(s => s.escenario === 'Escenario Máximo') || {};
const m40hoy = j.escenario_mod40_retroactivo || {};
const m40fut = j.escenario_mod40_retroactivo_futuro || {};
const ctx    = j.context || {};
const cd     = ud.conservacion_derechos || {};
const infoTop = j.infonavit_oportunidad_top || {};
const mod40d  = j.calculo_mod40 || {};
const dxM40   = ud.diagnostico_modalidad_40 || {};
// v2.2 (claude/106, motor v5.8): régimen de Mod 40 y los tres caminos.
const regM40  = ud.regimen_mod40 || {};
const caminos = j.caminos_mod40 || null;
const cam12 = (c) => (c && Array.isArray(c.opciones) && c.opciones.length) ? c.opciones[0] : {};
const m40c = cam12(caminos && caminos.mod40);
const m10c = cam12(caminos && caminos.mod10);
const infoMeta = j.Infonavit_meta || {};
const sim     = j.simulation_results || {};

// helpers v1
const siNo = (b) => (b === true ? 'Sí' : b === false ? 'No' : (b === 'Sí' || b === 'No' ? b : ''));
const txt  = (v) => (v === null || v === undefined ? '' : String(v));
// helpers v2 (tipado)
const num  = (v, d = 0) => { const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) ? n : d; };
const bool = (v) => v === true || v === 'Sí' || v === 'Si' || v === 'true';
const iso  = (v) => {
  if (!v || v === 'N/A') return null;
  const s = String(v).split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);   // dd/mm/yyyy
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
// Nombre oficial del IMSS. Se intenta en tres lugares, del más directo al más
// lejano, y si ninguno responde devuelve null en vez de tumbar el nodo.
// ---------------------------------------------------------------------------
const nombreSisec = (() => {
  // 1) viene en el propio item, si el flujo lo arrastró hasta aquí
  try {
    const n = ud.employment_history_json?.data?.employment_info?.nombre;
    if (n) return String(n).trim();
  } catch (e) {}
  // 2) el payload original del webhook
  try {
    const n = $('Webhook Sisec').first().json.body.payload
      .employment_history_json.data.employment_info.nombre;
    if (n) return String(n).trim();
  } catch (e) {}
  // 3) el nombre separado que arma el parser v2.1 del PDF de Jordan
  try {
    const ei = $('Webhook Sisec').first().json.body.payload
      .employment_history_json.data.employment_info;
    const compuesto = [ei.nombres, ei.apellido_paterno, ei.apellido_materno]
      .filter(Boolean).join(' ').trim();
    if (compuesto) return compuesto;
  } catch (e) {}
  return null;
})();

// historia laboral (texto, v1)
let histLista = '';
try {
  const arr = typeof j.historial_agrupado_json === 'string'
    ? JSON.parse(j.historial_agrupado_json)
    : (j.historial_agrupado_json || []);
  histLista = arr.map(e => `${e.start_date || ''} - ${e.end_date || 'VIGENTE'} | ${e.employer || ''}`).join('\n');
} catch (e) { histLista = txt(j.lista_trabajos_texto); }

// rejilla (v1)
let gridRaw = j.escenarios_aplicables_json;
if (gridRaw === undefined || gridRaw === null || gridRaw === '') {
  try { gridRaw = $('Escenarios1').item.json.escenarios_aplicables_json; } catch (e) {}
}
const escenarios_aplicables_json = typeof gridRaw === 'string'
  ? gridRaw
  : (gridRaw ? JSON.stringify(gridRaw) : '');

const iss = {};

// ========== BAG v1 — SIN CAMBIOS (contrato del Diagnóstico Avanzado) ==========
const diagnostico = {
  firstname: txt(j.nombre ?? ud.name),
  lastname: txt(ud.last_name ?? ''),
  hs_full_name_or_email: txt(j.nombre ?? ud.name),
  curp: txt(j.curp ?? ud.curp),
  nss: txt(j.nss ?? ud.nss),
  email: txt(j.email ?? ud.email),
  phone: txt(ud.phone ?? ''),
  ley: txt(j.ley_detectada ?? ud.law),
  edad_al_momento_del_reporte: txt(ud.current_age),
  status_empleo: txt(ud.status),
  primer_empleador: txt(ud.first_contribution_employer),
  primera_cotizacion: txt(ud.first_contribution_date),
  ultima_cot_valida: txt(ctx.fecha_sisec),
  fecha_sisec: txt(ctx.fecha_sisec),
  consulta_imss_status: 'Consulta exitosa de semanas cotizadas',
  semanas_cotizadas: txt(j.semanas_cotizadas ?? ud.contributed_weeks),
  semanas_descontadas: txt(ud.deducted_weeks ?? j.semanas_descontadas),
  semanas_recuperadas: txt(ud.reintegrated_weeks ?? 0),
  faltan_semanas: txt(ud.faltan_semanas ?? 'No'),
  conserva_derechos_ley_73: siNo(cd.conserva_derechos),
  fecha_perdida_cons_der: txt(cd.fecha_vencimiento),
  ultimo_salario: txt(ud.last_registered_salary),
  mod40: siNo(mod40d.aplica ?? dxM40.aplica_modalidad_40),
  vencimiento_mod40: txt(mod40d.fecha_limite_inscripcion ?? dxM40.fecha_limite_inscripcion),
  mod40_retroactiva_hoy: txt(m40hoy.aplica),
  pension_mod40_retro_hoy: txt(m40hoy.calculatedPension),
  costo_retroactivo_hoy: txt(m40hoy.costo_proyecto_retroactivo ?? m40hoy.desglose_retro_total),
  pension_mod40_futuro: txt(typeof m40fut.calculatedPension === 'number' ? m40fut.calculatedPension : m40c.pension),
  // v2.2
  mod40_regimen: txt(regM40.regimen),
  mod40_sbc_tope: txt(regM40.sbc_tope_mod40),
  mod40_permitida: siNo(regM40.mod40_permitida),
  pension_mod10_futuro: txt(m10c.pension),
  costo_mensual_mod40: txt(m40c.costo_mensual),
  costo_mensual_mod10: txt(m10c.costo_mensual),
  costo_retroactivo_futuro: txt(m40fut.costo_proyecto_retroactivo ?? m40fut.desglose_retro_total),
  mod40_futuro_fecha: txt(m40fut.fecha_pension_objetivo),
  rcv_97: txt(ud.RCV97),
  sar_92: txt(ud.SAR92),
  infonavit_estimado: txt(j.Infonavit_estimado ?? ud.INFONAVIT),
  oportunidad_infonavit: txt(infoTop.nombre ?? 'SIN OPORTUNIDAD'),
  escenario_base: txt(j.pension_base ?? baseSc.calculatedPension),
  edad_escenario_base: txt(baseSc.retirementAge),
  escenario_maximo: txt(j.pension_maxima ?? maxSc.calculatedPension),
  edad_escenario_maximo: txt(maxSc.retirementAge),
  escenarios_aplicables_json,
  status_issste: txt(iss.status ?? 'No identificado'),
  regimen_issste: txt(iss.regimen ?? 'No identificado'),
  antiguedad_issste: txt(iss.antiguedad ?? 'No identificado'),
  fecha_alta_issste: iss.fecha_alta ?? null,
  fecha_baja_issste: iss.fecha_baja ?? null,
  consulta_issste_status: txt(iss.consulta ?? 'Sin cotizaciones ISSSTE'),
  estrategia_avanzada_issste: txt(iss.estrategia ?? ''),
  historia_laboral_lista: histLista,
  asesoria_basica: txt(j.asesoria ?? ''),
};

// ========== NUEVO v2: secciones ricas (JSON TIPADO) ==========

// Última cotización válida REAL (fecha, no fecha_sisec): máx end_date del
// historial; si hay un empleo vigente (sin end_date), es hoy.
const hist = ud.employment_history || [];
let ultimaCotValida = null;
let vigente = false;
for (const h of hist) {
  if (!h.end_date) { vigente = true; continue; }
  const e = iso(h.end_date);
  if (e && (!ultimaCotValida || e > ultimaCotValida)) ultimaCotValida = e;
}
if (vigente) ultimaCotValida = new Date().toISOString().slice(0, 10);

const semanas = {
  cotizadas: num(ud.contributed_weeks),
  descontadas: num(ud.deducted_weeks),
  recuperadas: num(ud.reintegrated_weeks),
};
semanas.netas = semanas.cotizadas - semanas.descontadas + semanas.recuperadas;

const perfil = {
  nombre: txt(j.nombre ?? ud.name),
  nombre_sisec: nombreSisec,
  curp: txt(j.curp ?? ud.curp),
  nss: txt(j.nss ?? ud.nss),
  sexo: String(j.curp ?? ud.curp ?? '').charAt(10) === 'M' ? 'M' : 'H',
  fecha_nacimiento: iso(ud.birth_date),
  ley: txt(ud.law),
  status_empleo: ud.status === 'empleado' ? 'empleado' : 'desempleado',
  salario_diario_registrado: num(ud.last_registered_salary),
  salario_promedio_250: num(ud.salario_promedio_ultimas_250_semanas),
  ratio_historico_salario_uma: num(ud.average_lifetime_uma_ratio),
  semanas,
  fechas: {
    primera_cotizacion: iso(ud.first_contribution_date),
    ultima_cotizacion_valida: ultimaCotValida,
    ultima_cotizacion_mod40: iso(ud.last_mod40_date_1yr),
    limite_inscripcion_mod40: iso(dxM40.fecha_limite_inscripcion),
    fin_conservacion_derechos: iso(cd.fecha_vencimiento),
  },
  conserva_derechos: bool(cd.conserva_derechos),
  aplica_mod40: bool(dxM40.aplica_modalidad_40 ?? mod40d.aplica),
  gap_meses: num(ud['Gap ultima cotizacion']),
};

const saldos = {
  rcv97: num(ud.RCV97),
  sar92: num(ud.SAR92),
  infonavit: num(j.Infonavit_estimado ?? ud.INFONAVIT),
  ahorro_voluntario: 0,
  infonavit_aportado_total: num(infoMeta.aportado_total),
  infonavit_rendimiento_total: num(infoMeta.rendimiento_total),
  credito_infonavit_vigente: bool(infoMeta.credito_vigente),
  // motor v5.6 (claude/89): rango del saldo AFORE (RCV 97 + SAR 92) y SAR 92
  // si nunca se unificó a la AFORE. null con motores anteriores.
  afore_rango: ud.saldo_afore_rango || null,
  sar92_concentradora: ud.SAR92_concentradora != null ? num(ud.SAR92_concentradora) : null,
  saldos_fuente: ud.saldos_fuente || null,
};

const salario_60m = (ud.synthetic_months_table || []).map((m, i) => ({
  mes: num(m.month_index, i + 1),
  salario_diario: num(m.average_daily_salary),
  salario_minimo: num(m.average_minimum_wage),
}));

const historial = hist.map(h => ({
  empleador: h.employer ?? null,
  fecha_inicio: iso(h.start_date),
  fecha_fin: iso(h.end_date),
  salario_base: num(h.base_salary),
  registro_patronal: h.registro_patronal ?? null,
  entidad_federativa: h.entidad_federativa ?? null,
}));

const calculo_pensional = {
  meta: {
    curp: diagnostico.curp,
    nss: diagnostico.nss,
    ley: diagnostico.ley,
    fecha_sisec: diagnostico.fecha_sisec,
    nombre_sisec: nombreSisec,
    generado_en: new Date().toISOString(),
    version_sistema: (j.metadata && j.metadata.server_version) || null,
    version_semilla: '2.2',
  },
  diagnostico,
  perfil,
  saldos,
  salario_60m,
  historial,
  escenarios: {
    estrategicos: ss,
    mod40_retro_hoy: m40hoy,
    mod40_retro_futuro: m40fut,
    caminos_mod40: caminos,
  },
  proyeccion_ley73: sim.Ley73 || [],
  proyeccion_ley97: sim.Ley97 || [],
};

return [{ json: { ...$json, calculo_pensional } }];