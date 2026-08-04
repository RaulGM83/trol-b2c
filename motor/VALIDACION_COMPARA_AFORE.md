# Compara Afore — Bloque de validación y calibración de KPIs

**El Trol Financiero** · 18 de julio de 2026
Integra los tres insumos pendientes del handoff (§8): encuestas B2C, análisis de fuga por AFORE y métricas ñoños. Fuentes: Supabase (producción), carpeta local `b2c experiencia`, Drive "Surveys Market research" (ENIF 2024, Radiografía AMAFORE jun-2025, Informe CONSAR 2024, SIREPP 2024, PensionTech).

---

## 0. Corrección al handoff (hallazgo de esta sesión)

El handoff §7 dice que "de 19,885 SISECs procesados, ~600 traen identificada la AFORE actual del cliente (~3%)". **Verificado en Supabase: los 599 registros con "afore" en `json_sisec` son eventos de historia laboral donde el *patrón* fue una AFORE** (p.ej. `"employer": "AFORE SURA"`, `"employer": "AFORE TEPEYAC, S.A. DE C.V."` con salario base del empleado). Es gente que *trabajó en* una AFORE, no clientes con AFORE identificada.

**Consecuencia: la cobertura real de "AFORE actual del cliente" en la base es ~0%, no 3%.** La única fuente estructurada hoy es la encuesta B2C (31 respuestas). Esto *refuerza* la mecánica del producto: el unlock con estado de cuenta no es un nice-to-have, es literalmente la única vía a escala para saber la AFORE del cliente. El KPI (b) del MVP se vuelve aún más central.

---

## 1. Encuestas B2C (Supabase `encuesta_afore`, 31 respuestas, 27-jun → 14-jul-2026)

### 1.1 Qué dicen

| AFORE | n | Atención (1-5) | Asesoría (1-5) | Recom. (0-10) | NPS* |
|---|---|---|---|---|---|
| SURA | 8 | 4.63 | 4.50 | 8.88 | +50 |
| Profuturo | 7 | 4.43 | 4.43 | 8.71 | +57 |
| Principal | 4 | 3.75 | **3.00** | 8.50 | +50 |
| Citibanamex | 3 | 4.33 | 4.00 | 8.00 | +33 |
| Azteca | 2 | 5.00 | 5.00 | 8.50 | +50 |
| Banorte | 2 | 3.50 | 3.50 | 8.00 | 0 |
| Invercap | 2 | 4.00 | 3.00 | 7.00 | −50 |
| Inbursa | 2 | 2.50 | 2.50 | 4.00 | −50 |
| Coppel | 1 | 1.00 | 1.00 | 0.00 | −100 |

*NPS con n tan chico es direccional, no estadístico.

### 1.2 Lo que valida para Compara Afore

1. **WhatsApp es el canal, sin discusión:** 29 de 31 pidieron contacto por WhatsApp (1 llamada, 1 sin dato). Valida el diseño del MVP al 94%.
2. **La gente sí comparte datos a cambio de valor:** la encuesta (con puntos como incentivo) capturó AFORE + calificaciones + situación laboral + capacidad de ahorro. Es el precedente directo del unlock con estado de cuenta.
3. **Pilar Servicio del score propio ya tiene señal:** el patrón cualitativo es consistente con la fuga CONSAR (§2): Coppel e Inbursa mal evaluadas; SURA/Profuturo bien. Los comentarios dan textura: "Bajo rendimiento y altas comisiones" (Inbursa), "solamente me informan por papel" (SURA), "me acabo de cambiar y me fue muy bien en el trámite" (Principal).
4. **Principal: el hueco es asesoría (3.0/5, la más baja del top).** Justo el beneficio que el handoff §3 propone empaquetar ("plan de retiro Trol incluido"). El dato de encuesta le pone sustento: sus propios clientes califican bien el trámite y mal la asesoría continua ("después de más o menos un año, atención nada").
5. **Intención y urgencia:** 55% (17/31) declaró interés en productos de ahorro; en el CSV de leads cálidos, 18 de 22 son Ley 73 de 46-59 años y varios con horizonte "ya" o "1-2 años" — el segmento donde el diagnóstico + traspaso tiene más urgencia y más saldo.
6. **Contexto ENIF que valida el gancho contrafactual:** solo 33% de los adultos calcula bien un interés simple y 14% uno compuesto (ENIF 2024, pp. 75-78). El cliente *no puede* estimar por sí mismo cuánto debería tener; hacerle la cuenta es exactamente el valor del contrafactual por cuartiles.

---

## 2. Fuga por AFORE × segmentación de campaña

### 2.1 Fuga bruta ("voto con los pies", metodología del análisis jun-2026)

Con `afore_mercado` (corte mayo-2026, cifras CONSAR): fuga = cuentas cedidas ÷ cuentas administradas. Complemento: neto y "calidad de traspasos" CONSAR 2025 (Radiografía AMAFORE: % de traspasos recibidos que van hacia mayor/menor IRN).

| AFORE | Fuga bruta | Neto (cuentas) | Traspasos recibidos "negativos"* |
|---|---|---|---|
| Profuturo | **0.5%** | +82,145 | 0% |
| PensionISSSTE | 0.8% | −5,820 | 44% |
| SURA | **0.9%** | +71,011 | 17% |
| Azteca | 1.0%¹ | −34,035 | **68%** |
| Inbursa | 1.2% | −5,794 | 4% |
| Banorte | 1.2% | +29,137 | 25% |
| Citibanamex | 1.6% | +14,563 | 40% |
| Principal | 2.0% | +1,826 | 45% |
| Coppel | **2.1%** | **−142,401** | **66%** |
| Invercap | **3.0%** | −10,632 | 46% |

*% de los traspasos que cada AFORE recibe donde el trabajador se cambió a menor rendimiento neto (CONSAR/AMAFORE 2025). ¹Azteca sobre cuentas administradas (17.7M, incluye asignadas); sobre sus 8.4M registradas la fuga sube a 2.1%.

### 2.2 Lecturas para la campaña

- **La recomendación se sostiene con datos de sistema:** SURA y Profuturo son las dos AFOREs con mejor combinación fuga baja + neto positivo + IRN alto. Radiografía 1S-2025: SURA +66.4k netas, Profuturo +44.9k, Coppel −135.6k (consistente con nuestra tabla de mayo-2026).
- **Matiz de honestidad para el copy:** en IRN (mayo-2026, tabla `afore_irn`), **Profuturo lidera todas las generaciones de ahorro** (8.00–9.50%) y SURA es segunda consistente (~0.5 p.p. abajo). "Cámbiate a una de las mejores" es defendible para SURA; "la mejor en rendimiento" no lo es. Cuidar la frase exacta — El Trol vive de la confianza y la CUF exige IRN como única base comparativa.
- **El mercado de traspasos hoy destruye valor — ese es el pitch social del producto:** de los traspasos que reciben Azteca y Coppel (las que más registran por fuerza comercial: 27.9% de registros del SAR cada una, ~70-74% vía Prestadora), 66-68% son hacia *peor* rendimiento. CONSAR además reasignó 1.56M de cuentas en 2024 hacia las 6 AFOREs de mejor rendimiento — el regulador ya hace de oficio lo que Compara Afore propone hacer con consentimiento. Argumento fuerte para SURA/Principal *y* para el regulador si algún día pregunta.
- **Cruce con nuestra base:** sin AFORE identificada en la base (§0), la composición se estima con la encuesta (SURA+Profuturo ≈ la mitad de respuestas; cola de Coppel/Inbursa/Invercap/Azteca ≈ 25%). Si esa proporción aguanta en wave 1, **~1 de cada 4 contactados estaría en AFOREs de fuga alta / IRN bajo** → son los "diagnóstico rojo" con caso de traspaso claro. El otro ~50% (ya en SURA/Profuturo) no se descarta: son candidatos a aportación voluntaria y al beneficio Principal/plan Trol, no a traspaso.

---

## 3. Contexto de mercado (Drive) — lo que suma a la validación

**ENIF 2024 (CNBV/INEGI, n=13,502 → 94.2M adultos):**
- 42% de adultos tiene cuenta AFORE; 82% de los formales. **13% cree que "dejó de tener" su AFORE** (siguen activas) — hay un gancho secundario de reactivación: "tu AFORE sigue viva y tiene tu dinero".
- Consulta de la AFORE: 40% usa el estado de cuenta **en papel**, 30% AforeMóvil/AforeWeb. El estado de cuenta existe y llega a las manos del cliente → pedirlo como unlock es viable operativamente (foto por WhatsApp).
- Solo 8% hace aportaciones voluntarias; 22% no aporta porque "no sabe qué es o cómo hacerlo" → upsell natural post-diagnóstico.
- 83% tiene smartphone; 62% de cuentahabientes ya consulta saldos por app. La fricción digital no es el cuello de botella; la ignorancia del dato sí.
- Riesgo a gestionar: 10% de usuarios ha sufrido clonación/robo de identidad → la petición del estado de cuenta debe verse impecable (aviso de privacidad, marca, contexto), porque el usuario está (con razón) entrenado para desconfiar.

**Informe CONSAR 2024:**
- **18.6M de estados de cuenta no llegaron a su destinatario (29% de lo emitido)** y ~18M de cuentas están asignadas sin registrar. El sistema está estructuralmente incomunicado con el ahorrador — El Trol llega por WhatsApp donde la AFORE no llega por correo.
- En el post-test de campaña CONSAR, **37% pidió más información, en particular sobre rendimientos y AFOREs**: demanda explícita de exactamente lo que es Compara Afore.
- Flag regulatorio confirmado: 236 sanciones en 2024 ($16.2M), incluidas 1,627 por registros móviles irregulares y traspasos certificados sin NIP. El diseño "Trol genera y califica; agente promotor registrado cierra" (handoff §3) es la estructura correcta.

**SIREPP 2024:** los planes privados cubren 1.8M de trabajadores (8.2% de los formales IMSS), sesgados a salarios >20 UMAs y CDMX/NL. El mexicano de ingreso medio con saldo AFORE relevante **no tiene alternativa ocupacional** — la AFORE es su único vehículo, lo que hace el "estar en la correcta" más importante, no menos.

**PensionTech:** PensionBee (UK) valida el modelo "consolida/endereza tu pensión con UX digital"; Stay (Brasil) es el único precedente **WhatsApp-first** de pensiones del reporte — nadie lo está haciendo en México. El reporte no trae métricas duras (AUM/CAC); si se quieren para el deck de SURA, tomarlas de los informes públicos de PensionBee. **Millas para el Retiro pasa de comparable a aliado** (ver §7, F2).

---

## 4. Métricas ñoños — integración al producto y a los KPIs

Del análisis de jun-2026 (`ANALISIS_COMPARADOR_AFORE.md`), se integran así:

1. **Al reporte comparativo (unlock):** vista simple = IRN de *tu* generación (fuente CONSAR, ya en `afore_irn`), comisión, **Fuga** (§2, calculable hoy con `afore_mercado`) y evaluación de la comunidad (encuesta, Pilar Servicio/Asesoría). Panel colapsado "Para ñoños 🤓" = volatilidad, Sharpe, máximo drawdown (calculados de precios de bolsa cuando el pipeline esté), VaR/CVaR y composición de cartera (directos de CONSAR SISET).
2. **Al set de KPIs (métrica de engagement):** **% de reportes donde se abre el panel ñoño**. Sirve para decidir cuánto invertir en la capa técnica y segmenta a los clientes "analíticos" (mejores candidatos a contenido de inversión).
3. **Regla que no se negocia:** el ranking comparativo público usa IRN oficial; las métricas calculadas viven como capa educativa por SIEFORE. La fuga se presenta como dato de comportamiento del mercado (fuente CONSAR), no como calificación propia.

---

## 5. Metas de KPIs calibradas (con benchmarks propios)

Benchmarks internos (Supabase): lotes con magic link **wa_lote3 32.7% y wa_lote4 39.7% de apertura** (98/300 y 119/300); 31 encuestas completadas sobre ~1,500 contactados en jul (~2%, sin gancho personalizado ni saldo de por medio). Base de mercado: 1.66M traspasos en 2024 sobre ~60M de cuentas ≈ 2.8% anual espontáneo.

| KPI (handoff §6) | Meta wave 1 (≥$500k, n=1,741) | Racional |
|---|---|---|
| (a) Respuesta al WhatsApp | **Apertura de link ≥35%; respuesta activa ≥12%** | 33-40% ya logrado en lotes 3-4 con base fría; wave 1 va con gancho de saldo personal, que es más fuerte |
| (b) Unlock estado de cuenta | **≥8% de quienes abren (~3% del total, ~50 clientes)** | 4× la tasa de encuesta fría (2%): el contrafactual da razón personal para desbloquear; ENIF confirma que el estado de cuenta está a la mano (40% lo recibe en papel) |
| (c) Comparativo completo | **≥70% de quienes hicieron unlock** | Post-unlock la fricción es nuestra, no del cliente; si cae de 70% el problema es el reporte, no la demanda |
| (d) Traspasos iniciados (SURA) | **≥15 en wave 1 (~1% del universo; ~30% de diagnósticos rojos)** | Base espontánea del mercado 2.8% anual; aquí hay selección (saldo alto + diagnóstico + agente que cierra). ~25% de la base estimada está en AFOREs de fuga alta/IRN bajo |
| (e) *Nuevo* — panel ñoño abierto | **Medir sin meta (baseline)** | Decide inversión en Fase 3 del comparador |

Con 50 unlocks, además, la cobertura de "AFORE actual" conocida de la base pasa de ~31 (encuesta) a ~80 clientes — el activo de datos crece con cada wave.

---

## 6. Riesgos actualizados

- **(Corregido) Dato AFORE:** cobertura real ~0%, no 3% (§0). El unlock es la única fuente; medir KPI (b) por wave.
- **Frescura de datos (decisión 18-jul-2026):** se acepta trabajar con SISECs de hasta ~2 años de antigüedad — al ser saldos *estimados*, la distorsión del mensaje contrafactual no justifica el costo de re-consulta masiva. La actualización de información se ofrece dentro de la experiencia de asesoría, donde la situación sí puede cambiar más. El copy debe reflejar que son estimaciones ("tu saldo debería *rondar* $X").
- **Copy regulatorio:** comparativa de rendimientos solo con IRN oficial + fecha de corte; "una de las mejores" sí, "la mejor" no (Profuturo lidera IRN). Cierre solo por agente promotor registrado.
- **Confianza al pedir el estado de cuenta:** 10% de usuarios ha sufrido fraude (ENIF); aviso de privacidad ARCO y contexto claro en el mensaje de unlock.
- **n de encuesta:** 31 respuestas dan dirección, no significancia; las metas de §5 son hipótesis a recalibrar con los datos reales de wave 1.

---

## 7. Qué sigue (del handoff §9; pasos 1 y 7 cubiertos con este bloque)

1. **Metodología del contrafactual** (paso 2): fórmulas, cuartiles por generación, supuestos de aportación.
2. **Semilla en batch (nuevo, decisión 18-jul-2026):** una vez diseñados los cálculos, se genera la semilla de *todos* los usuarios con información en batch — el contrafactual precalculado por cliente es lo que define la segmentación fina y la priorización de las waves, no solo el corte por saldo.
3. Plantilla WhatsApp wave 1 (paso 3) y pipeline técnico (paso 4) — la ingesta de `afore_mercado`, `afore_irn` y `afore_datos` ya está viva en Supabase y alimentaría el reporte desde el día 1.

### F2 — Alianza Millas para el Retiro (decisión 18-jul-2026)

Millas para el Retiro habilita para la fase 2 de la experiencia:

- **API de identificación:** saber si un cliente ya está registrado en Millas → segmentación y personalización del mensaje (a un usuario Millas no se le vende registro, se le activa el ahorro).
- **Ahorro voluntario desde la experiencia:** generar aportaciones voluntarias a la AFORE sin salir del flujo Trol. Ataca directo el gap ENIF (solo 8% aporta; 22% no aporta porque "no sabe cómo") y le da salida accionable al ~50% de la base que ya está en una AFORE top y no necesita traspaso.
- **Puntos Trol → dinero en la AFORE:** convertir puntos en aportación voluntaria. Cierra el loop de la economía de puntos con un beneficio pensional real y diferencia la oferta frente a cualquier comparador.

Implicación para el MVP (F1): el diagnóstico debe capturar desde ya la señal de interés en ahorro (la encuesta ya lo hace: 55% dijo sí) para tener la lista caliente de F2.
