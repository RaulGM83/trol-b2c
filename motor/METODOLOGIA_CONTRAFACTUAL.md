# Metodología del contrafactual por cuartiles — v1.1 (decisiones cerradas)

**Compara Afore · El Trol Financiero** · 18 de julio de 2026
v1.1 incorpora las decisiones de Raúl sobre la propuesta v1. Anclada a lo que ya existe: semilla v2 (`@trol/pension-core`), historia laboral SISEC/Belvo (`employment_events`), pipeline CONSAR→Supabase (`PIPELINE_CONSAR.md`).

---

## 0. Decisiones cerradas (18-jul-2026)

1. **Máxima exactitud, sin atajo:** encadenamiento completo de series desde 1997 (§5). El objetivo es separar con claridad a las AFOREs top.
2. **SAR-92 incluido** (§4b): sin él, nuestro estimado no cuadra con lo que el cliente ve en su estado de cuenta — y el producto vive de que el número se sienta *suyo*.
3. **Retiros parciales: no se modelan** (se señalan si `semanas_descontadas > 0`).
4. **Aportaciones voluntarias: no se consideran** en el contrafactual.
5. **AFOREs con serie incompleta (ajustada 19-jul):** las vivas sin historia completa se **completan con el índice industria** (retorno mediano diario de las vivas, empalmado por nivel a su primer precio propio) en los meses previos a su nacimiento. Las 10 series quedan de longitud completa → mediana estable y saldos comparables. El prefijo solo rellena la simulación; **el ranking de canastas se decide con datos propios**. Evidencia: las 4 incompletas (Azteca mar-03, Invercap feb-05, Coppel abr-06, PensionISSSTE ene-07) son promedio-bajo en su ventana vivida — pos. 6/7, 6/8, 6/9 y 5/10 respectivamente — así que el relleno neutral no las favorece (detalle en `ANALISIS_PRECIOS_ESTABILIDAD.md` §5, incluida la historia de Invercap: fuerte 2006-2012, desplome 2013-2019).
6. **Gancho = "dejaste de ganar $X"**: brecha contra el **cuartil superior (p75)**, no contra la mediana ni contra "la mejor" (p75 mantiene la defensa "una de las mejores" y evita el ranking).
7. **El reporte incluye el cuartil bajo**: "si estuvieras en el cuartil bajo tendrías $Z" — le da valor al ~50% que ya está bien ("no te muevas" también es asesoría).
8. **Flag de publicación (redefinido 19-jul, v1.5):** el estimado `rcv97` previo viene de una metodología más simple y **NO es benchmark** — la campaña compara únicamente números calculados por este motor (canasta superior / mediana / canasta baja); el saldo real entra hasta el unlock con estado de cuenta. El flag ahora es de **cobertura de historia**: meses simulados ÷ meses según semanas cotizadas del SISEC (dato duro); publicable si 0.7–1.3. El estimado previo se conserva solo como `referencia_previa` informativa. **Futuro:** esta metodología alimentará mejoras a la calculadora de pensiones Trol / Ley 97 (mejor estimado de pensión "sin saber la AFORE", o multi-escenario top/media/baja) y podrá actualizar las semillas.
9. **La brecha no redefine wave 1** (sigue siendo saldo ≥$500k); la brecha **ordena dentro de la wave** (se contacta primero a quien más dejó de ganar).
10. **Canasta fija por ranking actual (decisión 18-jul, segunda ronda):** el "cuartil superior" no es un percentil ex-post de saldos simulados sino una **canasta fija = las top por IRN vigente de la generación del cliente**, sostenida buy-and-hold durante toda la simulación. El argumento del producto: *"esto tendrías si te hubieras mantenido en alguna de las que hoy son las mejores, aunque en el camino te pudiera ir mejor o peor"*. Nunca se simula al cliente "cambiándose cada mes a la mejor" (§9).

## 1. Qué calcula

Para cada cliente, el saldo **RCV-97 + SAR-92** que tendría hoy si sus recursos hubieran estado en la AFORE del cuartil bajo (p25), la mediana (p50) y el cuartil superior (p75) de su generación. El mensaje de campaña:

> "Con tu historia laboral, en una de las mejores AFOREs tu saldo rondaría **$P75**. **Dejaste de ganar ~$BRECHA**. ¿Quieres ver tu comparativo?"

La comparación es contra **el sistema** (percentiles de las 10 AFOREs), nunca "AFORE X te habría dado $Y". El IRN oficial se muestra aparte, citado a CONSAR con fecha de corte.

## 2. Insumos

| Insumo | Fuente | Estado |
|---|---|---|
| Periodos de cotización y SBC diario (incl. pre-1997 para SAR-92) | `employment_events` (SISEC/Belvo): `event_date`, `event_end_date`, `base_salary` | ✅ en base |
| Salario para huecos | `ratio_historico_salario_uma` (semilla v2) | ✅ pension-core |
| Precios de bolsa por SIEFORE (diario, 1997-2025) | CONSAR `precios_bolsa_siefore/01_precios_bolsa_siefores.csv` | ⬜ ingesta → tabla `siefore_precios` |
| Tasas RCV por año y banda UMA + tasa SAR-92 | Tabla estática en `tablas.ts` (LSS + reforma 2020; SAR-92: 2% retiro) | ⬜ agregar |
| CETES/tasa bancaria 1992-1997 (SAR-92 pre-AFORE) | Serie Banxico (estática, 66 meses) | ⬜ agregar a `tablas.ts` |
| UMA/SMG histórico | `tablas.ts` | ✅ |
| Saldo real | `rcv97` (+ `sar92` de semilla) estimado; estado de cuenta tras unlock | ✅ / mecánica del producto |

Precios de **bolsa** (netos de comisión), no de gestión → el contrafactual descuenta comisiones sin modelarlas.

## 3. Fórmula

**Paso 1 — Aportaciones mensuales RCV** ($m$ desde jul-1997 o primera cotización):

$$A_m = SBC_m \times d_m \times \tau(a\tilde{n}o_m,\ SBC_m/UMA_m) + CS_m$$

con $d_m$ = días cotizados del mes, $\tau$ = tasa RCV (§4a), $CS_m$ = cuota social si aplica.

**Paso 2 — Semilla SAR-92** (§4b): monto $B_{92}$ al 30-jun-1997.

**Paso 3 — Valuación por AFORE (método de unidades).** Para cada AFORE $a$ con serie encadenada $P_a(m)$ (§5):

$$S_a = \underbrace{\frac{B_{92}}{P_a(jul97)} \times P_a(hoy)}_{\text{SAR-92}} + \underbrace{\sum_{m} \frac{A_m}{P_a(m)} \times P_a(hoy)}_{\text{RCV-97}}$$

Cada aportación "compra acciones" al precio del mes y todo se valúa al precio de hoy — captura el timing real del cliente.

**Paso 4 — Canastas por ranking de precios (decisión #10, ajustada 18-jul tarde).** El ranking que define las canastas es el **CAGR de los precios de bolsa encadenados de la generación del cliente, en la ventana completa disponible** (tabla `siefore_precios`; el IRN ya NO define el cálculo — solo se muestra en el reporte como referencia comparativa oficial). Membresía mínima: serie ≥15 años en la generación; las AFOREs de serie corta participan en los 10 saldos y la mediana pero no definen canastas. Tres referencias, todas **buy-and-hold** con la fórmula del paso 3:

- **Canasta superior** = promedio de $S_a$ de las **top-3 por CAGR de precios de la generación** (se publica también el rango min–max). Brecha del gancho = $\bar{S}_{sup} - saldo\_real$. Con datos a dic-2025: {Profuturo, SURA, Banamex}, idéntica en las 4 generaciones probadas.
- **Mediana del sistema** = mediana de los $\{S_a\}$ de las 10 (referencia "el sistema", estable por construcción).
- **Canasta baja** = promedio de $S_a$ de las **bottom-3 por CAGR** con historia suficiente ("si estuvieras en el cuartil bajo tendrías $Z$"). Hoy incluye a Inbursa — su IRN alto es solo su última década; su historia completa es la peor de las 6 con serie larga.

La membresía queda **congelada por corte de datos** en el batch (`precios_corte` en la salida): todos los clientes de una misma generación y un mismo corte comparan contra la misma canasta, y cualquier cambio futuro es explicable. Evidencia de estabilidad y detalle en `ANALISIS_PRECIOS_ESTABILIDAD.md`.

## 4a. Tasas de aportación RCV

| Periodo | Retiro | Cesantía y vejez | Cuota social | Total aprox. |
|---|---|---|---|---|
| jul-1997 → dic-2022 | 2.0% | 4.5% (3.150 patrón + 1.125 trab. + 0.225 Estado) | $ fijo/día indexado; desde 2020 solo hasta 4 UMAs, escalonada | ~6.5% + CS |
| 2023 → 2030 | 2.0% | patronal por escalones anuales según banda UMA (3.150% → hasta 11.875%); trabajador 1.125%; Estado reorientado a salarios bajos | escalonada ≤4 UMAs | ~6.5% → ~15% |

Tabla anual × banda UMA en `tablas.ts`; escalones exactos verificados contra el transitorio LSS 2020 (DOF) al implementar.

## 4b. SAR-92: supuestos del saldo inicial (nuevo, decisión #2)

El SAR-92 son las aportaciones de **may-1992 → jun-1997**: 2% del SBC a la subcuenta de retiro en cuenta bancaria individual (la parte de vivienda 5% queda fuera, es INFONAVIT). Aplica sobre todo a Ley 73 — justo el perfil dominante de wave 1 (46-59 años, cotizando desde los 90).

**Construcción de $B_{92}$:**

1. **Aportaciones:** $2\% \times SBC_m \times d_m$ para cada mes may-92 → jun-97, con SBC de `employment_events` (los SISEC traen eventos desde los 90; huecos → imputación por ratio salario/UMA).
2. **Rendimiento pre-AFORE (92-97):** los recursos estaban en banca con rendimiento referenciado; capitalizamos con **CETES 28d** mensual (serie Banxico, estática). Es el supuesto estándar y conservador-realista para esa ventana.
3. **Desde jul-1997:** $B_{92}$ entra al método de unidades como monto inicial en cada AFORE simulada (fórmula §3). Supuesto: el SAR-92 transferido a la AFORE se invierte en la misma SIEFORE que el RCV — es lo que ocurre en la práctica para la subcuenta de retiro.
4. **Clientes sin cotización pre-jul-97:** $B_{92}=0$, sin ruido.
5. **Matiz de conciliación:** en el estado de cuenta el SAR-92 aparece como subcuenta separada; el reporte del comparativo muestra **RCV-97 y SAR-92 por separado y la suma**, para que el cliente pueda palomear contra su estado de cuenta línea por línea. (Ese "cuadra con mi papel" es el momento de confianza del producto.)

**Limitación aceptada:** algunos SAR-92 se quedaron años en bancos sin traspasarse o se retiraron parcialmente; no lo modelamos (misma política que retiros parciales: si el real < simulado, el reporte lo explica como posible causa, sin culpar al rendimiento).

## 5. Mapeo de fondos: encadenamiento completo (decisión #1, sin atajo)

Serie $P_a(m)$ por AFORE siguiendo la trayectoria del dinero de la cohorte del cliente:

1. **1997–2004:** SIEFORE única (SB1) por AFORE.
2. **2004–2019:** multifondos por edad (SB1–SB5): se asigna la SB que tocaba **por edad del cliente en cada fecha**, con los cortes de edad vigentes en cada régimen.
3. **dic-2019 → hoy:** SIEFORE generacional de su cohorte.

En cada migración se **empalma por nivel** (el saldo no salta; solo cambia la serie con la que crece): al pasar de la serie $X$ a la $Y$ en el mes $m^*$, las unidades se reconvierten $u_Y = u_X \cdot P_X(m^*)/P_Y(m^*)$.

El mapa `(año_nacimiento, fecha) → siefore` es una tabla determinista que se construye una sola vez. AFOREs vivas sin historia completa: se completan con el índice industria según la decisión #5 ajustada; desaparecidas/fusionadas: se usa la serie encadenada de CONSAR donde exista.

## 6. Supuestos v1.1 (se documentan en el reporte)

1. Huecos de salario → imputación `ratio_historico_salario_uma` × UMA del periodo.
2. Retiros parciales no modelados; se señalan si `semanas_descontadas > 0`.
3. Aportaciones voluntarias fuera del contrafactual (se comparan aparte post-unlock).
4. Vivienda (INFONAVIT) y vivienda-92 fuera; esto es retiro.
5. Periodicidad mensual (error vs bimestral despreciable).
6. SISECs hasta ~2 años de antigüedad; cifras en "rondar", redondeadas a miles.
7. SAR-92 según §4b.

## 7. Validación antes de wave 1

1. **Fixtures** de pension-core (`cafe`, `malg`, `moja`) revisados a mano — ahora incluyendo un fixture con cotización pre-97 para SAR-92.
2. **Sanity macro:** rendimiento implícito de la mediana simulada a 3/5/10 años ≈ IRN históricos (±1 p.p.).
3. **Backtest con estados de cuenta** del piloto: distribución de errores mediana-vs-real calibra el "rondar" — y ahora también la conciliación por subcuenta (RCV vs SAR-92).
4. **Flag ±40%** (decisión #8): fuera de rango → mensaje genérico sin cifra.

## 8. Implementación

- `siefore_precios` (Supabase): `fecha, afore, siefore, precio` — histórico una vez + n8n mensual.
- `tablas.ts`: tasas RCV por año×banda UMA, CETES 92-97, mapa cohorte→siefore.
- `pension-core/src/contrafactual.ts`: `calcularContrafactual(semilla, precios) → {saldos_por_afore, p25, p50, p75, brecha, desglose_rcv_sar92, flag_publicable}` — puro, testeable.
- **Batch de semillas:** job sobre todos los clientes con historia laboral; persiste el bloque `contrafactual` en `calculo_pensional`. Wave 1 se ordena por **brecha** dentro del corte ≥$500k (decisión #9).

> **Actualización 18-jul (tarde):** la verificación con la serie histórica YA se hizo — `siefore_precios` está ingerida (648k filas, 1997-2025) y el análisis vive en `ANALISIS_PRECIOS_ESTABILIDAD.md`. Resultado: el top-3 de largo plazo por precios puros es {Profuturo, SURA, Banamex}, estable entre generaciones; Inbursa (top por IRN reciente) es la peor de historia completa. Por eso la canasta se define por **CAGR de precios**, no por IRN. La sección siguiente se conserva como registro de la discusión.

## 9. Canasta fija por ranking actual: por qué y qué dicen las tablas

**Resuelto (decisión #10):** la referencia del gancho es la canasta de las top por IRN *de hoy*, sostenida buy-and-hold toda la historia. Dos trampas que esto evita:

- **La trampa del switching:** un percentil recalculado mes a mes equivaldría a asumir que el cliente se cambió siempre a la ganadora — imposible y deshonesto. Aquí cada $S_a$ es "te quedaste en $a$ desde el principio".
- **La trampa del hindsight puro:** tomar "la que resultó mejor en tu simulación" es selección ex-post. La canasta se elige por el **IRN oficial vigente**, que es además la única base regulatoria para comparar — y es accionable: es exactamente a donde el cliente puede cambiarse hoy.

**Qué dicen las tablas hoy (IRN may-2026, `afore_irn`):** el top-4 es prácticamente el mismo en las 9 generaciones de acumulación — **Profuturo #1 en todas (8.00–9.50%), SURA #2 en 7 de 9, Inbursa y Banorte alternando 3º-4º**. El fondo de la tabla también es estable: Coppel última o penúltima en todas, con Azteca y PensionISSSTE. (La única inversión es SB de Pensiones — jubilados, fondo de corto plazo — irrelevante para el contrafactual de acumulación.)

Además el IRN pondera **50% el rendimiento a 10 años**: el ranking "de hoy" ya trae una década de consistencia adentro. No es la foto de un buen mes.

**Verificación pendiente con la serie histórica:** el CSV de precios de bolsa no es accesible desde este entorno (bloqueo robots); al ingerir `siefore_precios`, el **primer análisis del pipeline** será la posición relativa anual de cada AFORE por SIEFORE desde el inicio de cada serie ("consistencia de posición", ya diseñada en `ANALISIS_COMPARADOR_AFORE.md` §5b). Si resultara que el top-3 fue inestable en algún tramo largo (p.ej. pre-2019), se documenta en esta metodología y se evalúa acotar la ventana del argumento; con lo que el IRN ya encodea, lo esperado es confirmar estabilidad.

**Matiz por generación (se mantiene):** la canasta se define por generación — la membresía puede diferir ligeramente entre cohortes (p.ej. Banorte 2º en SB 95-99 e Inicial). El contrafactual sigue sin nombrar AFOREs en el gancho; la capa de recomendación (SURA cierra / beneficio Principal) es independiente y se sostiene en IRN oficial + fuga.
