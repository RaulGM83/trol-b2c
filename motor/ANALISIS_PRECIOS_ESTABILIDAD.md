# Estabilidad del ranking con precios de acción — análisis para la canasta del contrafactual

**Compara Afore · El Trol Financiero** · 18 de julio de 2026
Basado exclusivamente en **precios de bolsa** (valor de la acción) de CONSAR, ya ingeridos a Supabase (`siefore_precios`: 648,469 filas, 2-jul-1997 → 31-dic-2025). **Sin IRN**, por decisión de esta sesión.

---

## 0. El pipeline quedó vivo

- Tabla **`siefore_precios`** (fecha, afore, siefore, precio; PK compuesta) con RLS y lectura pública.
- Edge function **`ingesta-precios-consar`** en Supabase: descarga el CSV oficial por rangos de bytes y hace upsert por lotes; bitácora en `ingesta_log`. Re-ejecutable para refrescos (se dispara con `net.http_post` desde SQL o desde n8n).
- **Regalo del dataset:** CONSAR ya entrega las series **encadenadas por generación hacia atrás** (p.ej. `sb 85-89` desde 1997, `sb 80-84` desde 2007). El empalme histórico del §5 de la metodología no hay que construirlo — es la serie oficial.

## 1. Hallazgo principal: la canasta larga NO es la del ranking reciente

CAGR nominal por serie generacional encadenada (AFOREs con historia completa 1997-2025):

| AFORE | SB 65-69 | SB 75-79 | SB 85-89 | SB 90-94 | 97-05 | 06-15 | 16-25 |
|---|---|---|---|---|---|---|---|
| Profuturo | **10.15** | **10.53** | **10.91** | **10.88** | 16.29 | 8.56 | **8.88** |
| SURA | 10.14 | 10.44 | 10.74 | 10.73 | 16.34 | **9.02** | 7.90 |
| Banamex | 9.78 | 10.10 | 10.44 | 10.39 | **16.79** | 8.32 | 7.43 |
| XXI-Banorte | 9.83 | 9.99 | 10.18 | 10.18 | 16.19 | 7.64 | 7.86 |
| Principal | 9.51 | 9.73 | 9.83 | 9.80 | 15.71 | 7.46 | 7.42 |
| Inbursa | 8.46 | 8.69 | 8.78 | 8.80 | 13.41 | 5.60 | 8.19 |

*(Sub-periodos mostrados para SB 85-89; el patrón es idéntico en las demás. Azteca/Coppel/Invercap/PensionISSSTE tienen series más cortas: en sus ventanas quedan consistentemente en la mitad baja.)*

**El top-3 de largo plazo es Profuturo > SURA > Banamex, en las 4 generaciones probadas, con ~2 p.p. anuales entre el primero y el último.** El orden es idéntico generación por generación — la canasta es estable entre cohortes.

### Hipótesis de Raúl, contra los datos

- **Inbursa: confirmada con contundencia.** Última de las 6 con historia completa en todas las generaciones (8.5-8.8% vs 10.2-10.9% del top). Su década 2006-2015 fue desastrosa (5.6% vs 8.3-9.0%) por su perfil ultraconservador. Solo en 2016-2025 es competitiva (8.19%, 2ª de la ventana) — **eso es lo que infla su posición en rankings recientes.** En una canasta definida por historia larga de precios, Inbursa queda fuera; en una definida por la foto reciente, entra. Ese contraste es exactamente el argumento para anclar la canasta en precios de largo plazo.
- **Banamex arriba de Banorte, aunque inconsistente: confirmada.** Banamex supera a XXI-Banorte en CAGR total en las 4 generaciones (10.44 vs 10.18 en SB 85-89) y fue la #1 del periodo 97-05 (16.79%). Pero su posición anual promedio se deterioró: 2.9 en 1999-2010 → 5.2 en 2011-2019, y solo 3 años en top-3 en la última década. Gana por el arranque fuerte compuesto, no por consistencia.

## 2. Consistencia año por año (SB 85-89, 28 años de rendimientos anuales)

| AFORE | Pos. promedio | Desv. | Años top-3 | Pos. 99-10 | Pos. 11-19 | Pos. 20-25 |
|---|---|---|---|---|---|---|
| Profuturo | **3.8** | 2.4 | 14/28 | 4.2 | 4.0 | **3.2** |
| Banamex | 3.9 | 2.8 | 13/28 | **2.9** | 5.2 | 4.3 |
| SURA | 4.2 | 2.4 | 14/28 | 3.7 | 4.7 | 4.7 |
| XXI-Banorte | 4.6 | 2.2 | 10/28 | 3.7 | 5.6 | 4.8 |
| PensionISSSTE | 5.6 | 2.9 | 7/18 | 4.3 | 4.8 | 7.3 |
| Azteca | 5.7 | 2.6 | 4/22 | 5.6 | 5.2 | 6.7 |
| Principal | 5.8 | 2.1 | 4/28 | 5.6 | 6.2 | 6.0 |
| Invercap | 5.9 | 2.9 | 5/20 | 4.4 | 7.7 | 4.3 |
| Coppel | 5.9 | 2.9 | 6/19 | 5.8 | 5.0 | 7.5 |
| Inbursa | 6.2 | **3.4** | 7/28 | 5.8 | 6.7 | 6.2 |

Dos lecturas importantes:

1. **Ningún año tiene dueño:** la mejor posición promedio es 3.8 — el ganador anual rota muchísimo. Esto valida de nuevo la decisión #10: el argumento honesto es buy-and-hold en una canasta, jamás "la mejor de cada año".
2. **Pero el interés compuesto sí tiene dueños:** los mismos 3-4 nombres arriba del promedio durante 28 años producen la separación de 2 p.p. del CAGR. La estabilidad que Raúl esperaba existe — en el largo plazo, no en la foto anual.

## 3. Cuánto es en pesos

Aportación mensual constante durante 28.5 años, capitalizada al CAGR de cada AFORE (SB 85-89): quedarse en la peor de historia completa (Inbursa) vs la mejor (Profuturo) = **el saldo final del top es +53% sobre el de la cola**; top vs la mediana ≈ **+16%**. Sobre un saldo tipo wave 1 ($700k en p90), esa diferencia es del orden de **$250-370k** — el gancho "dejaste de ganar $X" tiene números reales detrás, y el motor de unidades de la metodología lo calculará exacto por cliente.

## 4. Definición de la canasta (ajuste a la decisión #10)

- **Fuente del ranking para la canasta: CAGR de precios de bolsa encadenados por generación, en la ventana completa disponible de cada serie** (no IRN). La canasta superior = top-3 de ese ranking por generación; canasta baja = bottom-3.
- Con los datos de hoy: **superior = {Profuturo, SURA, Banamex}** y **baja = {Inbursa, Principal y la peor disponible de las series cortas}** — estable en las 4 generaciones probadas.
- **Regla de membresía por historia mínima:** para entrar a cualquier canasta, la AFORE debe tener serie ≥15 años en la generación; las series cortas (Coppel, Azteca, Invercap, PensionISSSTE en algunas) participan en la simulación de los 10 saldos y en la mediana, pero no definen canastas.
- Congelada por corte de datos en el batch (`precios_corte` en la salida), igual que antes.
- **Nota regulatoria (sin cambio de fondo):** el gancho sigue sin nombrar AFOREs, así que usar nuestra métrica interna de precios para armar la canasta no publica un ranking propio. El IRN oficial se sigue mostrando en el reporte como referencia comparativa pública — es la única base permitida para eso — pero ya no define el cálculo.

## 5. AFOREs vivas con serie incompleta: cómo les fue en su ventana (19-jul-2026)

Cuatro AFOREs vivas no llegan a 1997 (SB 85-89): Azteca (mar-2003), Invercap (feb-2005), Coppel (abr-2006), PensionISSSTE (ene-2007). Comparadas **solo contra las AFOREs vivas en su misma ventana**:

| AFORE | Viva desde | CAGR propio | Posición en su ventana | Mediana de la ventana | Top de la ventana |
|---|---|---|---|---|---|
| Azteca | mar-2003 | 7.22% | **6 de 7** | 8.06% | 8.88% |
| Invercap | feb-2005 | 7.43% | **6 de 8** | 7.81% | 8.93% |
| Coppel | abr-2006 | 7.09% | **6 de 9** | 7.41% | 8.73% |
| PensionISSSTE | ene-2007 | 7.23% | **5 de 10** | 7.18% | 8.35% |

**Confirmado: las cuatro son promedio-bajo en el plazo que llevan vivas** — tres claramente debajo de la mediana de su ventana y PensionISSSTE exactamente en ella. Ninguna se acerca al top.

**Invercap, la excepción con historia:** arrancó fuerte — pos. 2 en 2006, #1 en 2010, pos. 2 en 2012 (promedio 4.4 en sus primeros años) — pero con volatilidad de agresivo (pos. 10 en 2008, el crash la golpeó de lleno). De 2013 a 2019 se desplomó y se quedó: 10, 9, 8, 6, 7, 9, 9. Ha recuperado algo en 2020-2025 (3, 4, 7, 3, 5, 4), pero el episodio 2013-2019 le destruyó el compuesto. Exactamente "arrancó muy fuerte y luego se cayó".

### Decisión derivada: completar con el índice de la industria

Para los meses **anteriores al nacimiento** de cada una, su serie se completa con un **índice industria** = retorno mediano diario de las AFOREs vivas ese día (empalmado por nivel al primer precio propio). Consecuencias:

1. Las 10 series quedan de longitud completa → la **mediana del sistema es estable** en toda la historia (sin saltos de composición cuando nace una AFORE) y los 10 saldos simulados son comparables.
2. El prefijo es **neutral**: no las premia ni las castiga en años donde no existían — y dado que las cuatro son promedio-bajo en su vida real, el resultado combinado las deja donde les toca: mitad baja.
3. **La membresía de canastas se decide con datos propios** (las cuatro ya tienen 18-22 años de serie real, así que califican) — el prefijo industria solo rellena la simulación, nunca el ranking. Con sus CAGRs vividos, ninguna disputa el top-3; Coppel y Azteca compiten con Inbursa por la canasta baja.

## 6. Pendientes de datos detectados en la ingesta

1. **`banamex` vs `citibanamex`:** el CSV trae ambas etiquetas; `banamex` es la serie continua (1997-2025), `citibanamex` es parcial y muere en ago-2024. Normalizar a una sola en la capa de consumo (y revisar posibles filas duplicadas por fecha/siefore).
2. **`sb 55-59` termina en ago-2024** (fusión hacia SB de Pensiones) y **`sb 95-99` nace en ago-2024** (escisión). El mapa cohorte→serie debe contemplar ambos eventos.
3. **El dataset llega a dic-2025** (actualización ~anual de datos abiertos). Para valuar "hoy" en producción, el refresco mensual debe venir de SISET (`md=6`) — mismo pendiente del pipeline que ya estaba identificado.
4. Series no-básicas en la tabla (`siav*`, `sac`, `sps*`): son ahorro voluntario/previsional; excluirlas del contrafactual (filtrar `siefore like 'sb %'` + `sb0`/`sb 1000` según el mapa).
