# 89 — Estimado de saldo AFORE (RCV + SAR 92): qué falla y cómo mejorarlo (28 sep 2026)

Pedido de Raul: revisar los 10 cálculos que se hicieron con Resolut ("BUSQUEDA DE INFORMACION Respuestas.xlsx"), entender por qué no cuadran y proponer mejoras al estimado. Después de esto se mejorará el estimado para usarlo como **mínimo o rango** (decisión pendiente).

**Estado (27-sep, noche): implementado.** Ver "Implementado 27-sep" al final. Falta pegar el motor v5.6 en el nodo de n8n y el recálculo masivo. Para el experimento se corrió el motor v55 real (el que produjo los números de la hoja), con opciones para prender o apagar cada corrección.

## Los datos

- **Resolut (9 con saldo real, del estado de cuenta):** la hoja compara `RCV Y 92 TROL` contra `RCV Y 92 REAL`. En la hoja, `SAR 92-97 REAL` = subcuenta de **Retiro** (SAR 92 + Retiro 97) y `SALDO CV REAL` = Cesantía y Vejez + cuota social. Por eso lo correcto es comparar **totales**; así lo hace la columna DIF. Olivia no trae saldo real. Omar y María de la Luz traen sólo el total.
- **Otros 16 pares** en trol3 (`datos.saldo_rcv97/saldo_sar92` en capa declarado o validado, contra su SISEC en la semilla): 5 los validó una asesora y 11 los dio el cliente, varios redondeados. Arturo (100 mil contra un estimado de 1.04 millones) se excluye por dudoso, y Jorge Antonio porque su "declarado" es copia del calculado.
- **Resultado:** el motor v55 reproduce los números de la hoja al peso. El error no está en la ejecución, está en los supuestos.

## Cómo estamos hoy (v55, con castigo plano de 10 %)

| | Real ÷ estimado (mediana) | Dispersión (sd log) | Casos dentro de ±20 % |
|---|---|---|---|
| Resolut (9) | 0.80 | 0.35 | 44 % |
| Otros (16) | 0.89 | 0.18 | 81 % |
| Todos (25) | 0.85 | 0.26 | 68 % |

Sobreestimamos de forma sistemática. Sin el castigo de 10 %, la mediana sería 0.77. El castigo tapa el sesgo promedio, pero no la dispersión.

## Lo que encontramos (en orden de peso)

1. **El salario del SISEC es plano dentro de cada empleo.** El parser trae el mismo salario en el alta y en la baja: es el último SBC del periodo. En empleos largos, el motor aplica el salario final a todos los años. Ejemplo: Anel trabajó en Banamex de 1991 a 2014 a $1,141 (tope de 25 SM) durante los 23 años. Ninguno de los 26 casos tiene eventos de modificación salarial. **Corrección:** en tramos planos, deflactar hacia atrás con UMA (SM antes de 1997) más 1.5 % real anual de carrera, con piso de 1 SM. Es la corrección que más pesa en historias largas.
2. **Comisión sobre flujo antes de 2008.** Las AFOREs cobraban un % del SBC de cada aportación, además de la comisión sobre saldo. Nuestras tasas salen de precios de bolsa, que sólo descuentan la comisión sobre saldo. La comisión sobre flujo promediaba 1.35–1.45 % del SBC en 1998 y 0.90 % en 2007, y desapareció en 2008. Sobre una aportación de 6.5 %, eso es 15–23 % de cada aportación. **Corrección:** 1.4 % hasta 2001, 1.2 % en 2002–04, 1.0 % en 2005–07, 0.9 % en ene–feb de 2008 y 0 después. Alejandra, que empezó en 2010, no la necesita, y es justo el caso que ya cuadraba.
3. **Tope de Cesantía y Vejez de 1997 a 2006.** El límite del SBC para CV era de 15 SM en 1997 y subía un SM por año hasta llegar a 25; Retiro siempre topó en 25. El motor topa todo en 25 UMA desde 1997. Afecta a quienes ganaban alto antes de 2007 (Anel, Ignacio, Verónica, María de la Luz).
4. **Retiros por desempleo (F2).** Hoy se reconstruye un solo retiro por hueco, aunque el hueco dure 20 años. La ley permite un retiro cada 5 años. Javier (23 años sin cotizar, 180 semanas descontadas) quedaba con sólo 68 semanas explicadas. **Corrección:** permitir un retiro cada 5 años dentro del hueco. Además hay un error: el residuo se coloca con una fracción de hasta 100 %; se tope en 11.5 %.
5. **Cuota social nueva.** La tabla de la reforma 2020 aplica **desde 2023**; en 2021–2022 siguió la anterior. El motor usa la nueva desde 2021, lo que sobreestima a quienes ganan poco. El efecto es chico. Hay que verificar además la banda "≤ 7.09 UMA a $1.7" que el motor da desde 2023: la ley habla de hasta 4 UMA.
6. **SAR 92 en la cuenta concentradora contra SIEFORE.** El motor supone que el SAR 92 ya se unificó a la AFORE y rinde como SIEFORE. Carlos Alberto cuadra exacto con la concentradora (INPC + 2 %): real 155,000 contra 154,376. Javier y Anel también mejoran con ella. En otros casos el SAR real es mucho mayor que el estimado (Gil, Laura Patricia, Manuel), lo que apunta a historia antes de 1997 que no aparece en el SISEC. **Propuesta:** mostrar el SAR 92 como rango entre las dos hipótesis.
7. **Rendimientos de la AFORE actual: no ayudan.** Aplicar a toda la historia el rendimiento de la AFORE actual empeora el ajuste; SURA y Profuturo quedan más sobreestimados. Hay que quedarse con la mediana generacional. La diferencia entre AFOREs de 2008 a 2026 es de alrededor de ±12 %, pero la gente no estuvo siempre en la misma.

## Con las correcciones 1–5, sin castigo plano

| | Mediana | sd log | ±20 % |
|---|---|---|---|
| Resolut (9) | 0.89 | 0.27 | 56 % |
| Otros (16) | 0.96 | 0.11 | 88–100 % |
| Todos (25) | 0.92–0.96 | 0.17–0.19 | 76–84 % |

El rango de mediana y dispersión corresponde a correr con y sin SAR 92 en concentradora. Percentiles de real ÷ estimado: P10 ≈ 0.80, P50 ≈ 0.94, P90 ≈ 1.18–1.23. Todavía queda cerca de 5 % de sobreestimación en la mediana, atribuible a días no pagados, desfase de los depósitos bimestrales y otras fugas pequeñas.

Efecto en la base: los estimados de Ley 73 bajan en mediana 11 % frente a hoy (hasta 37 % en historias largas y planas). Los de Ley 97 bajan 3 %.

### Caso por caso (real ÷ estimado: hoy → corregido)

| Caso | Hoy | Corregido | Lectura |
|---|---|---|---|
| Anel (Ley 73) | 0.51 | 0.81–0.87 | 23 años planos al tope + comisión sobre flujo + tope CV. Infonavit real $7.9 mil contra $1.41 millones estimados: usó su crédito. |
| Ignacio (Ley 73) | 0.83 | 0.89 | Salario alto de 2000 a 2004 (tope CV) + comisión sobre flujo. Infonavit real 0: usó su crédito. |
| Silvia (Ley 97) | 0.80 | 0.75 | 175 semanas descontadas y más de 30 empleos. Probablemente sacó más de lo que reconstruimos. |
| Verónica (Ley 73) | 0.76 | 0.86 | Salarios altos antes de 2008. Infonavit real $63 mil contra $501 mil: casi seguro usó su crédito. |
| Alejandra (Ley 97) | 1.00 | 1.28 | 15 años planos a $455. Deflactar la deja corta: su historia real parece casi plana, o tiene aportaciones que no vemos. Es el único caso donde deflactar empeora. |
| Javier (Ley 73) | 0.36 | 0.51–0.60 | 23 años sin cotizar y 180 semanas descontadas; SAR en concentradora. Aun corregido queda sobreestimado. |
| Omar (Ley 73) | 0.95 | 0.90 | Bien. |
| Patricia (Ley 97) | 1.23 | 1.36 | Sin los retiros que reconstruimos cuadra en 0.98. Sus 42 semanas descontadas no parecen haberle costado dinero como las modelamos. |
| María de la Luz (Ley 73) | 0.78 | 0.89 | Salarios crecientes de 1996 a 2008 + comisión sobre flujo. |

**Infonavit:** en quienes no usaron su crédito, el estimado cae dentro de ±20 % (Javier 0.92, Silvia 0.86, Alejandra 1.01, Omar 1.15, Patricia 1.20). El error grande siempre es por crédito usado. La pregunta 3 del paso 0 (¿has usado tu Infonavit?) ya lo resuelve: si dice "vigente" o "hace mucho", el estimado debe mostrarse como "no disponible / por confirmar".

## Propuesta

1. **Motor v5.6 y contrafactual v1.9** (hay que cambiar los dos, igual que con el castigo): correcciones 1 a 5, quitar el castigo plano y, si acaso, dejar un factor de calibración de 0.95 que se revise con cada lote nuevo de datos reales.
2. **Estimado como rango:** "entre **0.80 × E** y **1.15 × E**", con **E** como valor central. Si hace falta un solo número conservador, usar el piso (0.80 × E) como **mínimo**. Ensanchar el rango cuando haya banderas: semanas descontadas > 100, tramo plano > 10 años, más de 10 años sin cotizar, SAR 92 presente.
3. **SAR 92 como rango** (concentradora ↔ SIEFORE), mostrado aparte.
4. **Infonavit condicionado a la pregunta 3 del paso 0.**
5. **Calibración continua:** cada saldo real que llegue (paso 0 pregunta 2, estado de cuenta, Resolut) se guarda con la foto del SISEC en una vista `v_calibracion_saldos`, y el ajuste se re-mide cada mes. Pedir a Resolut el desglose completo (Retiro 97, CV, cuota social, SAR 92, **aportaciones voluntarias**) y la fecha de corte del estado de cuenta.

## Pendientes y preguntas para Raul

- ¿Rango o mínimo? La recomendación es rango, con el piso como mínimo.
- ¿Quitar el castigo de 10 % en los dos motores al mismo tiempo?
- ¿Por defecto SAR 92 en concentradora, o rango?
- Alejandra y Patricia: ¿Resolut puede confirmar si tienen aportaciones voluntarias o retiros?
- Verificar contra el DOF los montos de la cuota social 2023+ y la banda ≤ 7.09 UMA.

Arnés de pruebas (no está en el repo porque trae datos personales): sesión del 28-sep, `v55x.js` con opciones `deflactar`, `idxSerie`, `flujo`, `topeCV`, `retirosMultiples`, `topeResiduo`, `cs2023`, `rendAfore`, `castigo`.

Fuentes: [Redalyc — Veinte años del sistema de capitalización](https://www.redalyc.org/pdf/325/32553151005.pdf) (comisión sobre flujo de 1.35 % en 1998 y 0.90 % en 2007; eliminada en 2008) · [UV — Las lucrativas comisiones de las Afores](https://www.uv.mx/iiesca/files/2013/01/lucrativas1997.pdf) (tabla de comisiones de 1997: flujo de 0.90–1.99 %) · [DOF 16-dic-2020, reforma LSS](https://sidof.segob.gob.mx/notas/docFuente/5607729) (la cuota social nueva aplica desde 2023) · [LSS art. 168](https://leyes-mx.com/ley_del_seguro_social/168.htm).

## Actualización 27-sep: los cambios de salario del SISEC sí existen, los tira el parser de Jordan

Raul preguntó si usamos las "MODIFICACION DE SALARIO" del SISEC. **No, en el canal Jordan no.**

- El PDF trae cada movimiento con fecha y salario. En los 9 casos de Resolut hay 498 modificaciones; Anel, por ejemplo, tiene 135.
- **Waterfall PDF Jordan** (`bOM63FSOmeujJupJ`, activo) sí las lee. Después arma cada empleo sin su lista de movimientos y genera un solo par alta/baja con el salario final. Esto pasa en dos nodos:
  - `Convierte  datos en json2`, del cliente (`procesos`, v2.1+bloques4);
  - `Convierte  datos en json`, del B2B (`partner_transactions`, v2.0+bloques4).
- En la base: ~1,160 SISEC de Jordan (v2.0, v2.1 y +bloques4) tienen 0 modificaciones. Los de Nubarium/Palenca (`procesos` sin versión) sí las traen: 4,364 de 19,663. El parser v4 (Waterfall PDF SISEC) también las conserva.
- **El motor v55 y pension-core ya saben usarlas** (`salary_modification` = escalones exactos). Sólo falta que el parser las entregue.
- De paso salió un error: en B2B el PDF se guarda en Drive como `".pdf"` porque la CURP va vacía. En el camino del cliente se corrigió el 03-sep.

### Resultado con los salarios reales (9 de Resolut, real ÷ estimado)

| Caso | Hoy | Plano + deflactar + correcciones | **Real + correcciones** |
|---|---|---|---|
| Anel | 0.51 | 0.81 | **0.98** |
| Verónica | 0.76 | 0.86 | **0.93** |
| Alejandra | 1.00 | 1.28 | **0.93** |
| María de la Luz | 0.78 | 0.89 | **0.93** |
| Silvia | 0.80 | 0.75 | **0.85** |
| Ignacio | 0.83 | 0.89 | **0.88** |
| Omar | 0.95 | 0.90 | **0.86** |
| Javier | 0.36 | 0.51 | **0.64** (0.72 con SAR en concentradora) |
| Patricia | 1.23 | 1.36 | **1.44** |
| **Mediana / sd log / ±20 % / ±10 %** | 0.80 / 0.35 / 3 / 2 | 0.89 / 0.27 / 5 / 1 | **0.93 / 0.20 / 7 / 4** |

"Correcciones" son la comisión sobre flujo, el tope CV, los retiros múltiples con tope de residuo, la cuota social desde 2023 y quitar el castigo. Ya no se deflacta.

- **Deflactar deja de hacer falta** con salarios reales: era un parche para el salario plano. Alejandra, el único caso donde deflactar empeoraba, ahora cuadra en 0.93; su salario real va de $207 a $771 y regresa a $455.
- Con salarios reales, **el castigo de 10 % ya no se justifica**: sin él la mediana es 0.93; con él, 0.92, con más dispersión.
- Quedan dos casos que no se explican con el SISEC:
  - **Javier:** 23 años sin cotizar y 180 semanas descontadas. Retiró más de lo que reconstruimos.
  - **Patricia:** tiene más dinero del que su SISEC explica. Aun sin modelar retiros sale en 1.30. Probablemente tiene aportaciones voluntarias o historia que no vemos.
- Robustez del motor: una modificación que llega sin empleo abierto abre un segmento que nunca cierra. Pasó en la prueba cuando la baja y el reingreso del mismo día venían en el orden equivocado. El motor debe ordenar por bloque (alta → modificaciones → baja) o ignorar una modificación huérfana.

### Pasos propuestos (por aprobar)

1. **n8n, Waterfall PDF Jordan**: en los dos nodos, armar `employment_events` desde `movements` como hace v4 (`parser_version` `v2.2+mov`). Corregir también el nombre `".pdf"` en B2B.
2. **Re-parsear lo guardado** (~1,160; muchos son la misma persona): del cliente, el PDF de "Sisec clientes" por CURP; de B2B, `documento_sisec_url`. Actualizar `json_sisec` y recalcular en lote sin avisar a nadie.
3. **Motor v5.6 y contrafactual v1.9**: comisión sobre flujo, tope CV, retiros múltiples con tope, cuota social 2023, sin castigo, sin deflactar cuando hay modificaciones, y el arreglo de la modificación huérfana. Deflactar sólo como respaldo si el SISEC viene sin modificaciones (Nubarium viejo).
4. **Rango** con base en esto: central E, piso ≈ 0.85 × E y techo ≈ 1.10 × E. Ensanchar con banderas (semanas descontadas > 100, más de 10 años sin cotizar, SAR 92). Revisar el rango cuando se sumen más casos: nueve siguen siendo pocos.

Arnés: `parse_sisec.py` (PDF → eventos con modificaciones), `dataset_real.json`, `evalR.js`, `cmp9.py`.

## Actualización 27-sep (b): semanas descontadas como factor de ajuste

- **El estimado de retiros por desempleo sigue en el motor.** Es la F2 de v55 (`getRetirosDesempleo`) y del contrafactual v1.8. Toma las semanas descontadas y las coloca como retiros en los huecos de 2 meses o más desde 1997, con el monto de ley (modalidad A o B). Los casos analizados ya lo traen aplicado.
- **Aun así, los que más retiraron siguen sobreestimados.** Son 24 casos (9 con salario real y 15 con salario plano; Arturo y Jorge Antonio quedan fuera). Real ÷ estimado, en mediana:

  | Semanas descontadas | Casos | Real ÷ estimado |
  |---|---|---|
  | 0 | 9 | 0.93 |
  | 1–119 | 6 | 0.93 |
  | 120 o más | 9 | **0.84** |

  La correlación entre las semanas descontadas y el error es de −0.35.
- **Por qué:**
  - A veces la F2 no encuentra dónde colocar todas las semanas. Por ejemplo, EICF tiene 231 descontadas y sólo quedan explicadas 87; FIPS tiene 178 y quedan 75. Esos dos casos salen en 0.75 y 0.68.
  - El residuo se coloca como un solo retiro de 11.5 % como máximo.
  - En Javier se explican las 180 semanas y aun así sale en 0.64: sus retiros reales fueron más grandes que los montos de ley modelados.
- **Factor probado:**

  ```
  E × (1 − k × descontadas / (cotizadas + descontadas))
  ```

  | k | Mediana | ±20 % | ±10 % |
  |---|---|---|---|
  | 0 | 0.89 | 17 de 24 | 9 de 24 |
  | 0.5 | 0.93 | 18 de 24 | 13 de 24 |
  | 0.8 | 0.94 | 18 de 24 | 13 de 24 |

  La dispersión casi no cambia: el factor corrige el sesgo, no el ruido. Tiene sentido físico: IMSS descuenta semanas en la misma proporción que el dinero retirado, y k ≈ 1 equivaldría a que todos los retiros fueran recientes.
- **Propuesta:**
  1. **En el motor:** en lugar de un factor plano, repartir las semanas no explicadas entre varios huecos y quitar el tope de 11.5 % al residuo cuando las semanas lo exijan. La proporción semanas = dinero la marca la ley.
  2. **Respaldo:** aplicar el factor con k = 0.5 sólo a la parte que la F2 no alcance a explicar.
  3. **En el rango:** ensanchar el piso cuando haya 120 semanas descontadas o más.
  4. **Recalibrar k** cuando lleguen más saldos reales.

## Implementado 27-sep (Raul: "arregla todo")

### Motor v5.6: `motor/calculadora_pension_pro_v56.js`

- **Qué incluye:** comisión sobre flujo, tope CV 1997-2006, cuota social nueva desde 2023, retiros cada 5 años dentro del hueco, residuo repartido topado al monto de ley, y un fix de orden para baja y reingreso del mismo día y para la modificación huérfana. Si el SISEC no trae modificaciones, deflacta los tramos planos, sólo para saldos: la pensión y el promedio de 250 semanas no se tocan. **Sin castigo**, con fugas de 0.95 sobre RCV 97. Nuevas salidas: `saldo_afore_rango` y `SAR92_concentradora`. `server_version` es `2.6.0-saldos-v56`.
- **Resultado con los 24 casos:**

  | | Mediana | sd log | ±20 % | ±10 % | Dentro del rango |
  |---|---|---|---|---|---|
  | v55 (hoy) | 0.84 | 0.27 | 15 | 7 | — |
  | v5.6 | **0.98** | **0.15** | **21** | **14** | **22 de 24** |

  Fuera del rango quedan Javier y Patricia, que el SISEC no explica.
- **Semanas descontadas como factor:** con salarios reales y retiros múltiples el sesgo por semanas descontadas desaparece. Los casos con 120 semanas o más dan una mediana de 0.98, así que ya no hace falta un factor. El retiro sintético se probó, salió neutro y quedó apagado (`V56.retiroSintetico`).
- **Regresión v55 → v56 en 35 corridas:** en Ley 73 no cambia nada (pensión, 250 semanas, Mod 40, costos, Infonavit). En Ley 97 sólo se mueven los escenarios que dependen del RCV, como se esperaba.
- **Rango:**
  - Base: piso 0.90 × RCV y techo 1.15 × RCV.
  - Con 120 semanas descontadas o más: el piso baja 0.10.
  - Sin trayectoria salarial: el piso baja 0.07 y el techo sube 0.12.
  - Con un hueco de 10 años o más: el piso baja 0.05.
  - SAR 92: entre SIEFORE y concentradora.

### pension-core v1.9 (`contrafactual.ts`, `eventos-laborales.ts`, batch)

- Las mismas correcciones: `aporteRcvDiario`, `comisionFlujo`, cuota social desde 2023, F2 múltiple con residuo repartido, `factor_fugas` 0.95, fix de mismo día y de modificación huérfana, y `eventos_deflactados` con la curva salarial.
- El batch ya no aplica castigo: default 0.
- `ENGINE_VERSION` es `2026.09.27.1`.
- 284 tests en verde (9 nuevos en `contrafactual-v19.test.ts`) y tsc limpio.

### n8n (en vivo)

- **Waterfall PDF Jordan** (publicado):
  - Los dos parsers entregan los movimientos reales (`v2.2+bloques4+mov`).
  - Validado con los 9 PDFs de Resolut: 498 modificaciones, 0 diferencias contra la referencia, y el resto del payload idéntico.
  - El PDF de B2B ahora se guarda como `CURP_SISEC_fecha.pdf`.
- **Calculos, "Build Diagnostico Bag"** (publicado): la semilla guarda `saldos.afore_rango`, `sar92_concentradora` y `saldos_fuente`. Vale null mientras corra v55.
- **Pendiente:** pegar v5.6 en el nodo "Calculadora Trol". Son 138 mil caracteres y el MCP no lo aguanta. Después se verifica contra el archivo, se publica y se sube `trol3.config.motor_version_actual` a `pension-core@2026.09.27.1`.

### Base (migración 194)

- Campo `saldo_afore_rango`.
- `sync_desde_cliente` lo baja de la semilla.
- `base_asesoria.highlights.afore_rango` lo expone.

### App

- Donde hay rango, `/mi` (hero Ley 97), el paso 0 (pregunta 2) y "Mis cinco" dicen "entre $X y $Y (estimado)". Sin rango se ven como antes.
- Helper: `rangoAforeTexto`.

### Recálculo (por decidir cómo)

- Los ~1,160 SISEC de Jordan hay que re-parsearlos desde su PDF: "Sisec clientes" por CURP y `documento_sisec_url` en B2B.
- El resto de la base se queda con saldos de v55 hasta que se recalcule.
- Calculos con `mass_refresh` evita correos y envíos a aliados, pero sigue generando 2 Google Docs y 2 llamadas a OpenAI por persona.

## Recálculo Jordan (27-sep, noche)

- **Motor v5.6 en n8n:** Raul lo pegó. Se verificó byte a byte contra `motor/calculadora_pension_pro_v56.js` y quedó publicado. Raul apagó en Calculos los Google Docs y las llamadas a OpenAI para el lote. La hoja `CALCULADORA_{curp}` (Copy file) siguió prendida.
- **Cola `public.reparse_jordan_cola` (migración 195):** 678 clientes cuyo SISEC más reciente vino del parser de Jordan sin movimientos. Se opera con los RPC `reparse_jordan_tomar`, `reparse_jordan_guardar` y `reparse_jordan_marcar`.
- **Workflow "Re-parsear SISEC Jordan (v5.6)"** (`6wGaain2Y6Lq3Pku`, sin publicar; se corre a mano con `{n}`). Por cada cliente:
  1. busca el PDF en "Sisec clientes" por CURP;
  2. lo parsea con v2.2+mov y verifica que la CURP coincida;
  3. crea un proceso nuevo, "Recalculo v5.6";
  4. llama a Calculos con `mass_refresh`.
- **Resultado:**
  - **625 recalculados con v5.6 y rango.** 10 se reintentaron porque el runner de n8n se saturó con 6 lotes en paralelo; en adelante, máximo 4.
  - 32 sin PDF en Drive.
  - 21 con PDF sin eventos: SISEC en 0 semanas o vacíos.
  - Casi todos traían modificaciones de salario.
- **Efecto medido contra el cálculo anterior guardado:**

  | | Mediana | P10 | P90 | Casos que bajan más de 20 % | Casos que suben más de 20 % |
  |---|---|---|---|---|---|
  | Pensión base Ley 73 | 0.98 | 0.82 | 1.05 | 14 de 150 | 4 |
  | Pensión Mod 40 retro hoy | 1.06 | — | — | — | — |

  - En la **pensión base Ley 73**, los que bajan son quienes ganaban mucho menos antes de su último salario: el promedio de 250 semanas ahora usa los salarios reales.
  - En **Mod 40 retro hoy** sube: el retroactivo va a 25 UMA y la base real es más baja, así que el salto es mayor.
  - El **saldo RCV** contra el guardado sale en mediana 0.97, pero con mucha dispersión. Muchos cálculos "anteriores" eran de motores de mayo a agosto, anteriores a v5.3/v5.5. Contra v55 corrido hoy, v5.6 con salarios reales baja lo esperado; por ejemplo, UALE queda en 0.60 y EUHA en 0.78.
- **Pendiente:**
  - los 53 sin PDF o sin eventos;
  - los ~359 B2B (`partner_transactions`);
  - el resto de la base (saldos v55 de Nubarium y otros);
  - volver a prender Docs y OpenAI en Calculos;
  - subir `motor_version_actual` cuando se despliegue la app.

### B2B (consultas de aliados)

- **Alcance:** 326 `partner_transactions` con parser v2.0 o v2.0+bloques4, status `completed` y producto normal o CHECKUP. Diagnóstico avanzado quedó fuera, porque cambiar `calculo_pensional` dispara su generación.
- **Cómo se corrió:** migración 196, workflow "Re-parsear SISEC Jordan B2B (v5.6)" (`iox21Oi2HyMxP9qp`). El PDF sale del id en `documento_sisec_url`; si no hay, se busca por CURP.
- **Protecciones durante el lote:**
  - Calculos corrió con `mass_refresh`. Verificado: no mandó correo al aliado ni llamó a Capital Connect o Credifintech.
  - Un trigger temporal conservó las ligas de documentos que Calculos habría dejado vacías con los Docs apagados. Se quitó al terminar (196c).
- **Resultado:**
  - **321 recalculados con v5.6**, también reflejados en `trol3.consultas_aliados`.
  - 5 PDFs sin eventos.
  - 25 consultas de abril y mayo siguen sin ligas de documentos; ya no las tenían antes.
- **Resto de la base sin v5.6** (27-sep):

  | Versión del motor | Clientes | Con experto |
  |---|---|---|
  | 2.0.0 (v5.0) | 6,667 | 56 |
  | 2.1.0 | 867 | — |
  | v55 | 386 | — |
  | v18 | 132 | — |
  | Sin semilla | 930 | — |

  En total, unos 95 con experto. A ~20 por minuto, recalcularlos todos por Calculos toma unas 8 horas.

## Recálculo del resto de la base (28-sep)

Raul apagó también la hoja CALCULADORA (Copy file, HTTP Request2, Move file2) además de Docs y OpenAI. Se recalcula con el SISEC que cada cliente ya tiene guardado; no hay re-parseo.

- **Cola `public.recalculo_v56_cola`** (migración 197 y 197b): **10,033 clientes**. Entran los que tienen el proceso más reciente con `employment_history_json`, CURP de 18 y semilla distinta de v5.6.

  | Prioridad | Quiénes | Clientes |
  |---|---|---|
  | 0 | con experto | 101 |
  | 1 | con semilla de un motor viejo | 8,867 |
  | 2 | sin semilla | 1,065 |

- **RPC:**
  - `recalculo_v56_tomar(n)` crea el proceso "Recalculo v5.6" con copia del SISEC y devuelve lo que Calculos necesita. Antes de tomar, cierra como ok los que ya quedaron en v5.6 (197b). Reintenta los 'procesando' de más de 30 minutos, hasta 3 veces.
  - `recalculo_v56_cerrar(min)` marca ok o error según la semilla.
- **Workflow "Recalcular resto (v5.6)"** (`MfKPuy6q5KaQErXo`, **publicado**, webhook `recalculo-v56`, body `{n}`):
  - toma el lote y llama a Calculos con `mass_refresh` para cada cliente, con una pausa entre uno y otro;
  - al terminar, se llama solo con el siguiente lote ("Siguiente lote");
  - se detiene cuando la cola se vacía, o al despublicarlo.
- **Prueba (3 clientes con experto):** semilla v5.6 con `afore_rango`, `trol3.datos.saldo_afore_rango` sincronizado, procesos en DIAGNOSTICO_GENERADO. Calculos tardó 4–9 s por cliente y no creó documentos.
- **Capacidad:** el cuello es el task runner de n8n, no el workflow. Calculos procesa como máximo **~10 clientes por minuto**. Por encima de eso, las tareas esperan más de 60 s y fallan con "Task request timed out".
  - Con 4 corridas en paralelo y 6 s de pausa (40 por minuto) fallaron 58 de 800.
  - Con 2 cadenas y 10 s de pausa fallaron 8 de 300.
  - Quedó en **2 cadenas con 15 s de pausa (~8 por minuto)**, es decir, unas 18–19 horas para todo. La perilla es la pausa: se cambia, se republica y aplica desde el siguiente lote.
  - Los fallidos quedan en 'procesando' y se reintentan solos.
- **Avance a las 11:00 UTC del 28-sep:** 745 ok (incluidos los 101 con experto) y 300 en curso.
- **Al terminar:**
  1. correr `select public.recalculo_v56_cerrar(0)`;
  2. revisar los errores;
  3. despublicar `MfKPuy6q5KaQErXo`;
  4. volver a prender en Calculos Docs, OpenAI y la hoja CALCULADORA.
- **Costo lateral:** cada intento crea un proceso "Recalculo v5.6", y por el puente también una consulta `calculo_base` en trol3, sin aviso al cliente.
