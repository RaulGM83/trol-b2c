s = open('v561.js', encoding='utf-8').read()
def rep(a, b, n=1):
    global s
    assert s.count(a) == n, (s.count(a), a[:90])
    s = s.replace(a, b)

# ---------------------------------------------------------------- cabecera
rep("""// ==========================================================================
// CALCULADORA DE PENSIÓN PRO - VERSIÓN COMPLETA v5.6.1
""", """// ==========================================================================
// CALCULADORA DE PENSIÓN PRO - VERSIÓN COMPLETA v5.7
// NUEVO v5.7 — PENSIÓN LEY 73 "HOY" A LA FECHA DEL DERECHO (28-sep-2026)
//   Calibrado contra nómina IMSS real (Credifintech): Sergio Durán ±0.03 %,
//   Alfredo García ±0.1 %, Beatriz Serrano 2.4 %; Arnulfo/Fernando/César
//   ±6 % con salarios reales (claude/90).
//   1) FECHA DEL DERECHO (D): para quien no cotiza, D = la más tardía entre su
//      última cotización y el día que cumple 60. El monto se calcula a esa
//      fecha: factor de edad con la edad a D (regla del .5), salarios
//      nominales de las 250 semanas (no se actualizan) y la mínima garantizada
//      del año de D. Si D ya pasó, el monto se actualiza con cada incremento de
//      febrero (inflación anual dic/dic del año anterior, art. 57 LSS) hasta
//      hoy; la mínima también. Antes: edad de hoy, sin actualización.
//      Campos nuevos por escenario: fecha_derecho, edad_derecho,
//      pension_fecha_derecho, factor_actualizacion, meses_desde_derecho,
//      retroactivo_estimado (máximo las últimas 12 mensualidades).
//   2) CURVA SALARIAL EN LAS 250 SEMANAS: si el SISEC no trae ninguna
//      "MODIFICACION DE SALARIO", el promedio de 250 semanas usa los tramos
//      deflactados (UMA/SM + 1.5 % real, piso 1 SM), igual que los saldos desde
//      v5.6. Con 900 trayectorias reales el salario plano infla el promedio
//      ~4 % (mediana; p90 +25 %); deflactado queda en 0.97-1.00. Bandera
//      sin_trayectoria_salarial en cada escenario y en user_data.
//   2b) Si no hay modificaciones pero el historial trae salario inicial por
//      empleo (Nubarium initial_salary, ~7,800 clientes), el tramo va del
//      inicial al final (interpolación lineal) y la curva sólo aplica a los
//      tramos sin ese dato. Motor contra 145 trayectorias reales (promedio 250
//      semanas estimado ÷ real): plano 1.06 (±10 % 58 %, >20 % 15 %), curva UMA
//      1.00 (71 %, 8 %), inicial→final lineal 0.98 (73 %, 5 %); pensión base
//      dentro de ±10 %: 76 % → 87 % → 90 %. Campo trayectoria_salarial:
//      movimientos | inicial_final | curva.
//   3) INPC dic-2024 corregido (137.949; decía 137.339). Tabla nueva
//      INFLACION_ANUAL_DIC para los incrementos de febrero.
//   server_version 2.7.0-derecho-v57.
// ==========================================================================
// (v5.6.1 abajo)
// ==========================================================================
// CALCULADORA DE PENSIÓN PRO - VERSIÓN COMPLETA v5.6.1
""")

# ---------------------------------------------------------------- INPC dic 2024
rep('"2024-12": 137.339,', '"2024-12": 137.949,')

# ---------------------------------------------------------------- tabla de inflación + helper
rep("""function getINPC(year, month) {""", """// v5.7: inflación anual diciembre/diciembre (INEGI). El incremento de las
// pensiones en febrero del año Y es la inflación del año Y-1 (art. 57 LSS).
// 2025 = 3.69 % (confirmado con la nómina IMSS de sep-2026).
const INFLACION_ANUAL_DIC = {
    1995: 51.97, 1996: 27.70, 1997: 15.72, 1998: 18.61, 1999: 12.32,
    2000: 8.96, 2001: 4.40, 2002: 5.70, 2003: 3.98, 2004: 5.19,
    2005: 3.33, 2006: 4.05, 2007: 3.76, 2008: 6.53, 2009: 3.57,
    2010: 4.40, 2011: 3.82, 2012: 3.57, 2013: 3.97, 2014: 4.08,
    2015: 2.13, 2016: 3.36, 2017: 6.77, 2018: 4.83, 2019: 2.83,
    2020: 3.15, 2021: 7.36, 2022: 7.82, 2023: 4.66, 2024: 4.21,
    2025: 3.69
};
const V57 = Object.assign({
    derechoLey73: true,   // monto a la fecha del derecho + incrementos de febrero
    curvaPension: true,   // promedio de 250 semanas con tramos deflactados si no hay modificaciones
    salarioInicial: true, // sin modificaciones: tramo del salario inicial al final (Nubarium initial_salary)
    interpInicial: 'lineal' // 'geometrica' | 'lineal' | 'mixta' para esos tramos (lineal: mediana 0.98, ±10 % 73 %)
}, (typeof globalThis !== 'undefined' && globalThis.__V57) || {});
// Incrementos de febrero entre la fecha del derecho (exclusiva) y hoy (inclusiva).
function factorIncrementosFebrero(desde, hasta) {
    let f = 1;
    for (let y = desde.getFullYear(); y <= hasta.getFullYear(); y++) {
        const feb = new Date(y, 1, 1);
        if (feb <= desde || feb > hasta) continue;
        const inf = INFLACION_ANUAL_DIC[y - 1];
        if (inf !== undefined) f *= (1 + inf / 100);
    }
    return f;
}
function getINPC(year, month) {""")

# ---------------------------------------------------------------- mapa para el promedio de 250 semanas
rep("""        if (V56.deflactarSinMods && this._sisecSinModificaciones) {
            const m = this.buildDailyMapFromEvents(true);
            if (m && Object.keys(m).length > 0) this.daily_map_saldos = m;
        }""", """        if (V56.deflactarSinMods && this._sisecSinModificaciones) {
            const m = this.buildDailyMapFromEvents(true);
            if (m && Object.keys(m).length > 0) this.daily_map_saldos = m;
        }
        // v5.7: el promedio de 250 semanas también usa la curva si no hay trayectoria.
        this.daily_map_prom = (V57.curvaPension && this._sisecSinModificaciones) ? this.daily_map_saldos : this.daily_map;""")

rep("""        const sortedDates = Object.keys(this.daily_map).sort().reverse();
        let history = [];
        for (const dStr of sortedDates) {
             const d = parseDate(dStr);
             if (d < today) history.push({...this.daily_map[dStr], fecha: dStr});
        }""", """        const mapaProm = this.daily_map_prom || this.daily_map;
        const sortedDates = Object.keys(mapaProm).sort().reverse();
        let history = [];
        for (const dStr of sortedDates) {
             const d = parseDate(dStr);
             if (d < today) history.push({...mapaProm[dStr], fecha: dStr});
        }""")

# ---------------------------------------------------------------- helper de pensión a la fecha del derecho
rep("""    formatScenario(sc, name, ley) {""", """    // v5.7: pensión Ley 73 de quien ya no cotiza, calculada a la fecha del
    // derecho y actualizada con los incrementos de febrero. Devuelve null si no
    // aplica (cotiza hoy, derecho futuro, <500 semanas o sin conservación).
    calcularPensionDerechoLey73() {
        if (!V57.derechoLey73) return null;
        const u = this.user_data;
        if (u.status === "empleado") return null;
        const cons = u.conservacion_derechos || {};
        if (!cons.conserva_derechos || u.contributed_weeks < 500) return null;
        const bd = parseDate(u.birth_date);
        const today = new Date(); today.setHours(0,0,0,0);
        const ult = this.getLastContributionDate(u.employment_history); ult.setHours(0,0,0,0);
        const d60 = new Date(bd.getFullYear() + 60, bd.getMonth(), bd.getDate());
        const D = ult > d60 ? ult : d60;
        if (D > today) return null;
        const edadD = diffDays(D, bd) / 365.25;
        const [sc, sm] = this.calculateAverageContributionSalary(u.current_age, 0, false);
        const res = new Ley73PensionCalculator(edadD, sm, sc, u.contributed_weeks, D.getFullYear()).calculatePension();
        if (typeof res.calculatedPension !== 'number' || res.calculatedPension <= 0) return null;
        const f = factorIncrementosFebrero(D, today);
        const formulaD = ((res.basicAmount || 0) + (res.incrementAmount || 0) + (res.allowances || 0)) * (res.ageAdjustment || 0) / 12;
        const pmgYear = PMG_DATA[D.getFullYear()] ? D.getFullYear() : getMaxYear(PMG_DATA);
        const pmgD = PMG_DATA[pmgYear];
        const pensionD = res.calculatedPension;
        const hoy = Math.round(Math.max(pmgD * f, Math.min(formulaD * f, MAX_PENSION)));
        // Retroactivo: mensualidades desde D hasta hoy, con el incremento vigente en
        // cada mes; el IMSS paga como máximo las últimas 12 (prescripción).
        let retro = 0, meses = 0;
        const desdeRetro = new Date(today.getFullYear(), today.getMonth() - 11, 1);
        let m = new Date(D.getFullYear(), D.getMonth() + 1, 1);
        while (m <= today) {
            meses++;
            if (m >= desdeRetro) {
                const fm = factorIncrementosFebrero(D, m);
                retro += Math.max(pmgD * fm, Math.min(formulaD * fm, MAX_PENSION));
            }
            m = new Date(m.getFullYear(), m.getMonth() + 1, 1);
        }
        return {
            ...res,
            retirementAge: u.current_age,
            basicAmount: (res.basicAmount || 0) * f,
            incrementAmount: (res.incrementAmount || 0) * f,
            allowances: (res.allowances || 0) * f,
            calculatedPension: hoy,
            fecha_derecho: formatDate(D),
            edad_derecho: Number(edadD.toFixed(2)),
            pension_fecha_derecho: pensionD,
            factor_actualizacion: Number(f.toFixed(4)),
            meses_desde_derecho: meses,
            retroactivo_estimado: Math.round(retro)
        };
    }
    formatScenario(sc, name, ley) {""")

rep("""            costo_proyecto_retroactivo: sc.costo_proyecto_retroactivo || 0
        };
    }""", """            costo_proyecto_retroactivo: sc.costo_proyecto_retroactivo || 0,
            // v5.7
            fecha_derecho: sc.fecha_derecho || null,
            edad_derecho: sc.edad_derecho || null,
            pension_fecha_derecho: sc.pension_fecha_derecho || null,
            factor_actualizacion: sc.factor_actualizacion || null,
            meses_desde_derecho: sc.meses_desde_derecho || 0,
            retroactivo_estimado: sc.retroactivo_estimado || 0,
            sin_trayectoria_salarial: !!this._sisecSinModificaciones,
            trayectoria_salarial: !this._sisecSinModificaciones ? "movimientos" : (this._tramosConInicial > 0 ? "inicial_final" : "curva")
        };
    }""")

# ---------------------------------------------------------------- escenario base (desempleado)
rep("""                 const lastContribYear = this.getLastContributionDate(this.user_data.employment_history).getFullYear();
                 const calc = new Ley73PensionCalculator(baseAge, sm, sc, weeks, lastContribYear);
                 const res = calc.calculatePension();""", """                 const lastContribYear = this.getLastContributionDate(this.user_data.employment_history).getFullYear();
                 const calc = new Ley73PensionCalculator(baseAge, sm, sc, weeks, lastContribYear);
                 // v5.7: si el derecho ya se ganó, el monto sale a la fecha del derecho y se actualiza.
                 const res = this.calcularPensionDerechoLey73() || calc.calculatePension();""")

# ---------------------------------------------------------------- tabla Ley 73: el renglón "hoy" sin cotizar es el del derecho
rep("""                const calc = new Ley73PensionCalculator(ra, sm, sc, cw, ry);
                const res = calc.calculatePension();
                const costs = this.calculateVoluntaryCosts(rd, s.v);""", """                const calc = new Ley73PensionCalculator(ra, sm, sc, cw, ry);
                // v5.7: sin semanas nuevas (renglón de hoy) manda la pensión a la fecha del derecho.
                const derecho = (weeksToAdd <= 2) ? this.calcularPensionDerechoLey73() : null;
                const res = derecho ? { ...derecho, retirementAge: ra } : calc.calculatePension();
                const costs = this.calculateVoluntaryCosts(rd, s.v);""")


# ---------------------------------------------------------------- salario inicial → final (Nubarium)
rep("""            if (m) s.salFin = parseFloat(m.base_salary);
        }
        // 3) Salario diario dentro de un segmento""", """            if (m) s.salFin = parseFloat(m.base_salary);
        }
        // v5.7: sin modificaciones, si el historial trae salario inicial (Nubarium)
        // el tramo va del salario inicial al final (interpolación geométrica).
        this._tramosConInicial = 0;
        if (V57.salarioInicial && !hayModificaciones) {
            for (const s of segmentos) {
                if (s.mods.length > 0) continue;
                const ini = formatDate(s.ini);
                const h = hist.find(j => j.start_date === ini && parseFloat(j.initial_salary || 0) > 0 &&
                    ((j.registro_patronal && j.registro_patronal === s.key) || (j.employer && j.employer === s.key)));
                if (!h) continue;
                const si = parseFloat(h.initial_salary), sf = parseFloat(h.base_salary || 0);
                if (!(sf > 0) || si === sf) continue;
                s.salIni = si; s.salFin = sf; s.desdeInicial = true;
                this._tramosConInicial++;
            }
        }
        // 3) Salario diario dentro de un segmento""")

rep("""                return s0 * Math.pow(s1 / s0, t); // interpolación geométrica""", """                if (s.desdeInicial && V57.interpInicial === 'lineal') return s0 + (s1 - s0) * t;
                if (s.desdeInicial && V57.interpInicial === 'mixta') return 0.5 * (s0 * Math.pow(s1 / s0, t) + s0 + (s1 - s0) * t);
                return s0 * Math.pow(s1 / s0, t); // interpolación geométrica""")
# ---------------------------------------------------------------- bandera en user_data y versión
rep('server_version: "2.6.1-saldos-v56",', 'server_version: "2.7.0-derecho-v57",')
open('v570.js', 'w', encoding='utf-8').write(s)
print('ok', len(s))
