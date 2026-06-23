# Comparador de AFOREs "tipo producto de inversión" — análisis de datos CONSAR y diseño

Investigación de qué publica la CONSAR (rendimiento granular, precios diarios, riesgo, servicio), qué métricas alpha/riesgo son factibles, y una recomendación por fases para El Trol. Junio 2026.

> **Hallazgo que manda sobre todo lo demás (regulatorio):** para *publicidad comparativa* de rendimientos entre AFOREs, la regulación del SAR permite **únicamente el Indicador de Rendimiento Neto (IRN)** de CONSAR — "la única fuente competente de información para emitir publicidad comparativa sobre comisiones y rendimientos es la CONSAR." Es decir: el **ranking AFORE-vs-AFORE debe apoyarse en el IRN oficial**, no en un alpha/rendimiento que calculemos nosotros. El análisis alpha/riesgo es válido y muy potente, pero como **capa educativa por SIEFORE** (entender riesgo, volatilidad, glide path), no como un indicador comparativo propio que sustituya al IRN. Esto define la arquitectura del producto.

---

## 1. Inventario de fuentes oficiales (qué hay y qué tan automatizable es)

### A. Datos abiertos — `datos.gob.mx/organization/consar` → **lo más automatizable**
11 datasets, todos **CSV**, licencia CC-BY 4.0, con **URL de descarga directa estable** (patrón `https://repodatos.atdt.gob.mx/api_update/consar/<dataset>/NN_archivo.csv`, GET sin auth). Actualización ~anual con histórico largo. Los relevantes:

| Dataset | Contenido | CSV directo |
|---|---|---|
| Precios de bolsa de las SIEFORE (1997-2025) | **Valor de la acción** por fondo, serie histórica | `…/precios_bolsa_siefore/01_precios_bolsa_siefores.csv` |
| Precios de gestión de las SIEFORE | Precio de gestión (sin comisiones) | mismo patrón |
| Rendimientos de las AFORE (2019-2025) | Rendimientos % 12/24/36/60m e histórico por SIEFORE | `…/rendimientos_afore/10_rendimientos_precio_bolsa.csv` |
| Activos netos de las SIEFORE | Recursos administrados | mismo patrón |
| Comisiones de las SIEFORE | Comisión por AFORE | mismo patrón |
| Medidas de sensibilidad de las SIEFORE | Indicadores de riesgo | mismo patrón |
| Traspasos AFORE-AFORE | Núm. de traspasos | mismo patrón |
| Cuentas administradas / monto registrado / flujo / % PEA | Mercado | mismo patrón |

*Caveat de verificación:* el binario CSV no se descargó en este entorno (sin salida de red); la URL es un endpoint directo y estable, pero conviene un `curl` real antes de cablearlo. No hay API REST tipo JSON documentada; el método fiable es bajar el CSV.

### B. SISET / "Series" — `consar.gob.mx/gobmx/aplicativo/siset/` → automatizable con fricción
Aplicativo estadístico **mensual** (último corte may-2026, publicado 15-jun-2026). Cada serie exporta **Excel/CSV/XML/IQY/HTML**, pero vía postback ASP.NET (ViewState), no GET limpio. También hay un directorio de Excel fijos: `…/siset/tdf/` (p. ej. `Indice_Rendimiento_Neto.xlsx`, `Rendimientos.xlsx`, `Inversiones_series.xlsx`, `Medidas_Sensibilidad.xlsx`, `Indice_Diversificacion.xlsx`).

Series clave: IRN generacional (`md=12`, `Series.aspx?cd=212`) y sus componentes 3/5/10 años (`cd=213/214/215`); rendimientos por SIEFORE generacional precio de bolsa/gestión (`md=6`, `cd=248-257`); inversiones/cartera (`md=18`); medidas de sensibilidad/riesgo (`md=30`); activos netos (`md=22`); traspasos (`cd=9`, `md=16`).

### C. Factsheets "Radiografía financiera de las AFORE" — `…/factsheets/` → **manual (PDF)**
Un PDF por AFORE, **mensual**, con rendimiento (vs. sistema, consistencia), composición de cartera, diversificación, duración y riesgo (incluye VaR/CVaR según glosario). Bueno para humanos, no para automatizar.

---

## 2. Rendimiento granular (lo que pediste para tablas más puntuales)

- **IRN (métrica oficial de comparación entre AFOREs):** rendimiento neto de comisiones, ponderado **50% a 10 años, 30% a 5 años, 20% a 3 años** (metodología vigente desde jul-2022, DOF 02-jun-2022; eliminó las Unidades de Pensión). Publicación **mensual**. Desglosado por **SIEFORE Generacional**: SB Inicial, 95-99, 90-94, 85-89, 80-84, 75-79, 70-74, 65-69, 60-64 y SB de Pensiones — cada una con las 10 AFOREs. Esto permite la tabla "mejor AFORE **según tu año de nacimiento**", que es lo correcto (no un número único por AFORE como el que sembramos en el v1).
- **Rendimientos nominales por precio de bolsa / de gestión:** ventanas 12/24/36/60m e histórico (`md=6`), también por generación.
- **Precio de la acción (valor de bolsa):** es un dato **diario** por naturaleza (precio de valuación en BMV); la serie histórica 1997-2025 está en datos.gob.mx (CSV). Es la materia prima para todas las métricas de riesgo calculadas.

---

## 3. Métricas de riesgo e inversión: lo que CONSAR da directo vs. lo calculable

### Lo que CONSAR **publica directo** por SIEFORE (mensual, SISET)
- **VaR (Valor en Riesgo)** regulatorio y **CVaR** (Conditional VaR) — `md=30`. Cifras may-2026: SB Pensiones 0.541, escalando a SB 90-94 0.994, Sistema 0.881.
- **Error de Seguimiento (Tracking Error)** vs. la cartera de referencia (límite regulatorio 5%).
- **Duración / Plazo Promedio Ponderado (PPP)**, coeficiente de liquidez, provisión por derivados.
- **Composición de cartera** por clase de activo (`md=18`): deuda gubernamental, deuda privada, renta variable nacional/internacional, estructurados, FIBRAS, mercancías, internacional.
- **Índice de Diversificación** e **IDRR** (diversificación de riesgo relativo).
- **Plusvalías/minusvalías** (Informe Trimestral al Congreso, secc. 3.2).

### Lo que **hay que calcular** desde la serie del precio de la acción (no lo da CONSAR)
Con la serie de precios $P_t$ (datos.gob.mx / `md=6`):
- Retornos $r_t = \ln(P_t/P_{t-1})$.
- **Volatilidad anualizada** $= \sigma(r_t)\cdot\sqrt{k}$ (k=252 diario, 12 mensual).
- **Sharpe** $= (\bar r_{anual} - r_f)/\sigma_{anual}$; **Sortino** con downside deviation.
- **Máximo drawdown** sobre la curva de precio.
- **Alpha/beta** por regresión $r_i - r_f = \alpha + \beta(r_{bench}-r_f)+\varepsilon$.
- **VaR histórico propio** (percentil 5/1), distinto del VaR regulatorio.

**Tasa libre de riesgo ($r_f$):** **CETES 28d** (Banxico SIE) es el estándar; Bono M / UDIBONO para horizonte largo.

**Benchmark:** la **"Trayectoria de Inversión" (glide path)** de cada SIEFORE generacional es el benchmark oficial (asignación objetivo por edad bajo el Régimen de Inversión); el cumplimiento se mide con el Tracking Error máx. 5%. Para alpha habría que replicar sus pesos (renta fija + IPC/S&P BMV nacional + MSCI World/ACWI internacional, ponderados por la cartera de la SIEFORE).

---

## 4. Señales de mercado y servicio

> **Decisión:** **NO usamos Monitor AFORE** (es semestral, en PDF y mezcla auto-reporte de las propias AFOREs). En su lugar, la señal estrella de "voto con los pies" es la **Fuga**, complementada con la **encuesta propia** y, opcional, el Buró de CONDUSEF.

### 4.1 Fuga — "voto con los pies" (BRUTA, no neta)
Idea: **¿qué proporción de la gente se está yendo de esta AFORE?** Solo **salidas** sobre la base (no neto), porque el neto esconde a las AFOREs que pierden mucho pero también captan mucho a base de gasto comercial. Normalizada por su tamaño para ser justa entre grandes y chicas.

- **Fuga en cuentas** = traspasos **cedidos** (nº de cuentas que se van, 12m) ÷ total de cuentas administradas.
- **Fuga en saldos** = pesos **que salen** por traspaso (12m) ÷ activos netos (AUM). *(El más revelador: a veces se va poca gente pero con saldos altos.)*
- Mostrar como % y flecha ▲/▼ (mayor = peor).

### 4.2 Crecimiento / agresividad comercial (característica, no calificación)
Lo opuesto y complementario a la fuga: **¿qué tan agresiva es la AFORE buscando crecer?** No es "bueno" ni "malo" en sí; es un rasgo que el usuario debe leer con criterio (a veces crecen por buen producto, a veces por pura fuerza de venta).

- **Captación** = traspasos **recibidos** (cuentas y activos, 12m), en absoluto y ÷ su base.
- **Gasto comercial** = gasto en afiliación/traspasos y promoción. *(Históricamente ~40% del gasto total de las AFOREs; CONSAR lo vigila.)* Mucha captación + mucho gasto comercial = AFORE **agresiva/comercial**; crecimiento con poco gasto = crecimiento "orgánico" (mejor señal).

Datos (CSV en datos.gob.mx, salvo el gasto comercial):
- Traspasos AFORE-AFORE (cedidos y recibidos) → `…/consar/traspasos_afore_afore/…csv`.
- Cuentas administradas por AFORE → `…/consar/cuentas_administradas_afore/…csv`.
- Activos netos / recursos por AFORE → `…/consar/activos_netos_siefore/…csv`.
- **Gasto comercial:** no hay CSV limpio garantizado; suele venir en los **estados de resultados** de las AFOREs / informes de CONSAR. *A verificar*; si no es automatizable, se carga manual o se omite la subseñal de gasto y se usa solo captación.

*Caveat de datos:* confirmar si el dataset de traspasos trae montos (pesos) o solo nº de cuentas; si solo cuentas, la fuga/captación en saldos se aproxima con saldo promedio por cuenta o se reporta solo en cuentas.

### 4.2 Complementos
| Señal | Qué es | Fuente | Frecuencia / formato |
|---|---|---|---|
| **Encuesta propia (Trol)** | Atención, asesoría, % que recomienda — fresca y de tus usuarios | App El Trol | Continua |
| **Buró CONDUSEF** (opcional) | Índice de reclamaciones por 100k cuentas + **IDATU** (trato) + % resuelto a favor | `buro.gob.mx` | Anual/semestral, web+PDF |
| **AUM y cuentas** | Tamaño/escala (contexto, no calidad) | CONSAR SISET / datos.gob.mx | Mensual |

La **encuesta propia** es la que aporta señal cualitativa fresca que ningún indicador oficial captura bien; el Buró queda como complemento opcional (su índice por 100k cuentas se sesga por cuentas inactivas).

---

## 5. Regulatorio (define qué podemos publicar)

- **Comparación de rendimientos = solo IRN.** No publicar un indicador de rendimiento propio que rankee AFOREs; reproducir el IRN oficial citando a CONSAR + fecha de corte.
- **Traspasos:** gestionarlos/tramitarlos o actuar "en nombre y por cuenta de una AFORE" requiere ser **Agente Promotor registrado y certificado** ante CONSAR. Ofrecer dádivas por cambiar de AFORE = **traspaso indebido** (sancionable).
- **Lo que sí puede hacer un tercero sin registro:** informar, educar y comparar con datos oficiales; mostrar pros/contras; **derivar** al usuario a los canales oficiales (AforeMóvil / AforeWeb / e-SAR) para que él haga el traspaso gratis.
- **Competencia/referencia oficial:** ya existe **AforeWeb** y **AforeMóvil** (comparan AFOREs y simulan pensión, gratis). Nuestro diferencial debe ser UX + contexto (cruce con la pensión calculada y la señal de la comunidad), no el dato crudo.
- **Disclaimers obligados:** (1) no somos CONSAR ni una AFORE; (2) cifras IRN/comisiones de CONSAR + fecha + enlace; (3) "rendimientos pasados no garantizan resultados futuros"; (4) información educativa, no asesoría de inversión; (5) no tramitamos traspasos (se hacen gratis por canales oficiales); (6) sin contraprestación por cambiar de AFORE.

*Zona gris:* "orientación" personalizada que derive en recomendar un traspaso se acerca a actividad reservada del agente promotor. Conviene limitarse a información comparativa general. **Validar el texto literal de la CUF con un abogado antes de lanzar.**

---

## 5b. Nuestra evaluación: score propio multi-factor (NO es ranking de rendimientos)

El **IRN es el comparador oficial de rendimientos** y lo mostramos tal cual, citando a CONSAR. **Aparte**, El Trol publica una **evaluación propia** que **no** es un indicador de rendimientos (no choca con la regla del IRN): es una **combinación de factores**, presentada como nuestra metodología/opinión, en **tres pilares** (calificación por estrellas o 0–100, no un único "ranking de la mejor AFORE"):

### Pilar 1 — Evaluación de Inversión (cómo invierte para el largo plazo)
- **Más puntos a mayor duración/plazo.** A mayor **PPP (plazo promedio ponderado)** y exposición de largo plazo, más puntos: aunque implica más riesgo de corto plazo, es **más adecuado para ahorro de retiro** (horizonte largo). *Matiz:* ponderar por la **edad del usuario** — a quien le falta poco para el retiro, premiar menos la duración alta. (Dato: PPP y composición de cartera vienen directos de CONSAR, `md=30`/`md=18`.)
- **Consistencia de posición relativa.** En vez de premiar un solo año bueno, medimos la **posición promedio de la AFORE vs. las demás a múltiples horizontes** (1, 2, 3, … N años) usando la serie de precios: una AFORE consistentemente en el top sube; una errática baja. **Uso interno para el score** (no necesariamente se publica el detalle).
  - *Cálculo:* para cada horizonte, ordenar las 10 AFOREs por rendimiento y registrar el lugar (1–10) de cada una; el score = función de la **posición promedio** (y su estabilidad/desviación) entre horizontes.
  - *Caveat de datos:* las SIEFOREs generacionales existen desde **2019**, así que horizontes muy largos (p. ej. 30 años) por SIEFORE actual no están disponibles; se usa el historial que haya (y, si se quiere ir más atrás, las series de las SIEFOREs predecesoras). La consistencia se calcula con los horizontes disponibles, indicando hasta dónde llega la data.

### Pilar 2 — Evaluación de Servicio
Encuesta propia de El Trol (atención al cliente) + señal de **fuga** (descontento) + opcional Buró CONDUSEF (IDATU/quejas).

### Pilar 3 — Evaluación de Asesoría
Encuesta propia (herramientas de asesoría que el usuario percibe) + a futuro, calidad de orientación / figura del Asesor Previsional.

**Salida:** tres calificaciones (Inversión / Servicio / Asesoría) + una lectura en texto. Se muestran **junto al** IRN oficial y la Fuga, no en lugar de ellos. Disclaimers de metodología propia, no-asesoría y "rendimientos pasados no garantizan resultados futuros".

## 6. Arquitectura de información: vista simple vs. "modo ñoño"

Para no confundir a quien no sabe de estos temas, el comparador tiene **dos capas claramente separadas**:

- **Vista simple (default, para todos):** lo esencial y accionable — IRN de **tu** generación, comisión, **Fuga** (¿se está yendo la gente?) y la opinión de la comunidad (encuesta). Lenguaje llano, con flechas y semáforos.
- **Modo ñoño / experto (separado y colapsado):** un panel aparte (acordeón "Para ñoños 🤓" o pestaña "Análisis avanzado") con las métricas técnicas por SIEFORE: volatilidad, Sharpe/Sortino, máximo drawdown, VaR/CVaR, Tracking Error, composición de cartera y alpha vs. glide path. Se abre solo si el usuario quiere; nunca estorba a la vista simple.

## 7. Recomendación de diseño por fases para El Trol

**Fase 1 — Comparador honesto y conforme (rápido, sobre lo ya construido).**
Reemplazar el "rendimiento representativo" único por el **IRN por SIEFORE generacional** (filtrado por el año de nacimiento del usuario, que ya conocemos). Vista simple: comisión + IRN de **su** generación + **Evaluación de Servicio y Asesoría** (que ya salen de la encuesta) + disclaimers.

**Fase 2 — Pipeline de datos + Fuga + Crecimiento + Evaluación de Inversión.**
Job (n8n o cron) que baje los CSV de `repodatos.atdt.gob.mx` (precios de bolsa, rendimientos, comisiones, **traspasos, cuentas, activos**) y de SISET (IRN, PPP/duración, cartera) a Supabase. Con eso se calculan y muestran: **Fuga bruta** (4.1), **Crecimiento/agresividad** (4.2) y el **Pilar de Inversión** del score (duración/plazo + consistencia de posición relativa a varios horizontes, §5b). Actualización mensual automática.

**Fase 3 — "Modo ñoño" (educativo, por SIEFORE, separado).**
Acordeón/pestaña aparte que calcula desde la serie de precios: volatilidad, Sharpe, máximo drawdown, y muestra el VaR/CVaR, Tracking Error y composición de cartera de CONSAR. "Entiende el riesgo de tu fondo según tu edad", CETES como referencia.

**Fase 4 — Complementos.**
Opcional: gasto comercial (si se consigue dato), IDATU de CONDUSEF. (Monitor AFORE descartado.)

En todas las fases: derivar el traspaso a canales oficiales (no tramitarlo) y mantener los disclaimers.

---

## Fuentes
- Datos abiertos CONSAR: https://www.datos.gob.mx/organization/consar — Precios de bolsa: https://www.datos.gob.mx/dataset/precios_bolsa_siefore (CSV: https://repodatos.atdt.gob.mx/api_update/consar/precios_bolsa_siefore/01_precios_bolsa_siefores.csv)
- IRN (metodología + serie): https://www.consar.gob.mx/gobmx/aplicativo/siset/Series.aspx?cd=212&cdAlt=False · DOF nuevo IRN: https://www.dof.gob.mx/nota_detalle.php?codigo=5653931&fecha=02/06/2022
- Rendimientos generacionales (precio de bolsa/gestión): https://www.consar.gob.mx/gobmx/aplicativo/siset/Enlace.aspx?md=6
- Medidas de sensibilidad (VaR/CVaR/TE): https://www.consar.gob.mx/gobmx/aplicativo/siset/Enlace.aspx?md=30
- Inversiones / composición de cartera: https://www.consar.gob.mx/gobmx/aplicativo/siset/Enlace.aspx?md=18
- Descargas Excel SISET: https://www.consar.gob.mx/gobmx/aplicativo/siset/tdf/
- Factsheets / Radiografía financiera: https://www.consar.gob.mx/gobmx/aplicativo/factsheets/ · Glosario: https://www.consar.gob.mx/gobmx/aplicativo/factsheets/Docs/Factsheets_Glosario.pdf
- Monitor AFORE (resultados jun-2025): https://www.gob.mx/cms/uploads/attachment/file/1068375/Monitor_Afore_-_Junio_2025.pdf · Metodología: https://www.gob.mx/consar/documentos/metodologia-monitor-afore
- Buró de Entidades Financieras (CONDUSEF): https://www.buro.gob.mx/
- Publicidad/IRN como única fuente comparativa: https://www.gob.mx/consar/prensa/cambios-a-la-regulacion-de-publicidad-y-promocion-de-los-sar-buscan-evitar-informacion-que-genere-confusion-entre-los-ahorradores-260135
- Agentes promotores (registro/traspasos): https://www.gob.mx/consar/prensa/nueva-regulacion-para-agentes-promotores-de-afore-beneficiara-a-ahorradores-del-sistema · LSAR: https://www.diputados.gob.mx/LeyesBiblio/pdf/LSAR.pdf
- Herramienta oficial AforeWeb: https://www.gob.mx/consar/articulos/aforeweb

*Nota de método: las páginas gob.mx/consar se renderizan con JS y devolvieron cuerpo vacío al fetch directo; el contenido sustantivo proviene de snippets de búsqueda sobre esas fuentes oficiales, del DOF y de la consulta en vivo a SISET. Las URLs CSV y las cifras puntuales (puntajes Monitor, VaR, IDATU) conviene confirmarlas con un GET/PDF real antes de cablearlas.*
