# 89 — Estimado de saldo AFORE (RCV + SAR 92): qué falla y cómo mejorarlo (28 sep 2026)

Pedido de Raul: revisar los 10 cálculos que se hicieron con Resolut ("BUSQUEDA DE INFORMACION Respuestas.xlsx"), entender por qué no cuadran y proponer mejoras al estimado. Después de esto se mejorará el estimado para usarlo como **mínimo o rango** (decisión pendiente).

**Estado: análisis hecho; nada cambiado en el motor ni en n8n.** Actualizado el 27-sep con los salarios reales del SISEC (ver sección al final). Para el experimento se corrió el motor v55 real (el que produjo los números de la hoja), con opciones para prender o apagar cada corrección.

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
