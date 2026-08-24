# Spec — Líneas de captura Mod 40 con precisión diaria (24-ago-2026)

Para Claude Code desde `~/Claude/Projects/b2c experiencia`. Continúa la sesión de fechaTramite
(selector ya vivo en Mesa Viraal, Mod40Panel y calc.html) y la de snapshots (`trol3.escenarios`).

## 1. El problema

El motor redondea el retro a **meses completos**: mover la fecha de trámite una semana no cambia
las líneas de captura. El IMSS calcula **día a día** los días cotizados y con precisión diaria
las actualizaciones y recargos. Raúl aportó una calculadora Excel (`Calculadora_lineas_IMSS.xlsx`)
**validada contra líneas de captura reales del IMSS**: es la implementación de referencia.
Se replicó en Python y reproduce el Excel **al centavo**.

Magnitud del error actual (caso base del Excel): +1 semana = **+$2,265**; al cruzar de mes,
**+$20,242**. El motor hoy muestra el mismo número toda la quincena.

## 2. Algoritmo de referencia (verificado al centavo contra el Excel)

Entradas: `ultimaCotizacion` (fecha exacta con día), `fechaTramite` (fecha exacta), `umas`
(UMAs del proyecto), serie INPC mensual, tabla de factores por año, tabla UMA por año.

```
c10 = primer día del mes de ultimaCotizacion
c11 = primer día del mes de fechaTramite
n   = meses entre c10 y c11, inclusive           // MAX(0, Δaños*12 + Δmeses + 1)
sdi = UMA(año de ultimaCotizacion) × umas         // ancla ÚNICA para todo el tramo
inpcFin = INPC(c11)

para i = 1..n, con g = c11 retrocediendo mes a mes, d = días reales del mes g (28/29/30/31):
  salarioMes = sdi × d
  prorrateo:
    i == 1 (mes del trámite):        DAY(fechaTramite) / d          // solo días transcurridos
    i == n (mes de la última cot.):  (d(mesUC) − DAY(ultimaCot)) / d(mesUC)  // solo días después de la baja
    resto:                            1
  retro_i  = factor(año de g) × salarioMes × prorrateo
  act_i    = (inpcFin / INPC(g) − 1) × retro_i
  rec_i    = (retro_i + act_i) × 1.47% × (días entre g y c11) / 30.4375

Retro = Σ retro_i · Actualizaciones = Σ act_i · Recargos = Σ rec_i · Total = suma de los tres
```

Tabla de factores (cuota Mod 40 por año, reforma 2020): 2020–2022 10.08% · 2023 11.17% ·
2024 12.26% · 2025 13.35% · 2026 14.44% · 2027 15.53% · 2028 16.62% · 2029 17.71% · 2030+ 18.8%.
Lookup por año con "menor o igual" (VLOOKUP TRUE).

Decisiones confirmadas por Raúl:
- El primer mes (el del trámite) **sí se cobra parcial** por días transcurridos: así llegan las
  líneas reales del IMSS.
- La UMA se ancla al **año de la última cotización** para todo el tramo — el Excel validado hace
  lo mismo que el motor actual, así que **el pendiente "UMA por año del tramo" se cierra: el
  anclaje actual es el correcto**. No tocar goldens por ese motivo.
- Recargos 1.47% mensual (CFF), constante en el motor.

## 3. INPC — ya está en Supabase (no crear)

`trol3.inpc_mensual` (migración `inpc_mensual_lineas_imss`, aplicada): `mes` (date, día 1, PK),
`indice`, `proyectado` (INEGI observado hasta 2026-03; después proyección ~0.327%/mes), `fuente`,
`updated_at`. RLS: select para authenticated. Se actualiza mensualmente por upsert.

En la app:
- Server lee la serie de `trol3.inpc_mensual` y la pasa al motor como parámetro.
- **Fallback embebido** en pension-core con la misma semilla (generarlo desde la tabla o del
  Excel), para que el motor funcione sin red y en calc.html.
- Si algún mes usado en el cálculo tiene `proyectado = true`, agregar aviso: "actualizaciones
  estimadas con INPC proyectado; la línea real puede variar" (aviso, no bloqueo — patrón de
  `ventanaMod40`).

## 4. Dónde aplica

- pension-core: la función de retro que alimenta `computeProyectoMod40` (y el fork `lib/imss` —
  ver §7). Firma: recibe fechas exactas (con día), serie INPC opcional, y devuelve además el
  desglose mes a mes (para poder mostrar el detalle si se quiere después).
- Mesa Viraal, Mod40Panel, calc.html: ya recalculan en vivo con fechaTramite; deben empezar a
  moverse por día automáticamente al integrar el motor nuevo. calc.html necesita el fallback
  embebido (no tiene sesión Supabase).
- Snapshot: los `inputs` de `trol3.escenarios` deben incluir la serie INPC usada (o al menos
  los meses del tramo) — el snapshot es auto-contenido y el INPC cambia cada mes. Subir
  `ENGINE_VERSION` (y `motor_id` si aplica): este cambio mueve números.

## 5. Goldens nuevos (extraídos del Excel validado, exactos al centavo)

Todos con UMA(2021)=89.62 para los de última cot. 2021 y UMA(2023)=103.74 para 2023.

| caso | última cot | fecha trámite | UMAs | meses | retro | actualiz. | recargos | TOTAL |
|---|---|---|---|---|---|---|---|---|
| base_excel | 2021-06-23 | 2026-07-03 | 25 | 62 | 486,152.65 | 56,032.16 | 236,842.34 | 779,027.15 |
| mas_1_semana | 2021-06-23 | 2026-07-10 | 25 | 62 | 488,417.35 | 56,032.16 | 236,842.34 | 781,291.84 |
| fin_de_mes | 2021-06-23 | 2026-07-31 | 25 | 62 | 495,211.44 | 56,032.16 | 236,842.34 | 788,085.94 |
| cruza_mes | 2021-06-23 | 2026-08-01 | 25 | 63 | 495,534.97 | 57,836.51 | 245,897.63 | 799,269.11 |
| baja_fin_de_mes | 2023-01-31 | 2026-09-15 | 25 | 45 | 436,128.41 | 32,846.35 | 146,121.77 | 615,096.53 |
| umas_15 | 2021-06-23 | 2026-07-03 | 15 | 62 | 291,691.59 | 33,619.29 | 142,105.40 | 467,416.29 |

Notas de los casos: en `baja_fin_de_mes` la baja es el 31 → el prorrateo del último mes es 0
(no queda ningún día después de la baja): verificar que no truena ni cobra el mes. `cruza_mes`
verifica que actualizaciones y recargos también saltan (inpcFin y plazos cambian con c11).

Tests adicionales: propiedad de monotonía (a mayor fecha de trámite dentro del mismo mes, el
total nunca baja); serie INPC sin el mes requerido (aviso + degradación razonable, no crash);
baja el día 1 y baja el último día del mes; año bisiesto (feb 29 días); coerción de
`salario_base` string/number sigue viva.

**Los 118 goldens de proyección existentes NO deben moverse** salvo los que dependan del costo
retro — si alguno depende, versionarlos (goldens-v2) con dos o tres expedientes reales revisados
a mano, no aflojar comparaciones. Reportar cuáles se movieron y por qué.

## 6. Contraste con el motor actual

El motor **ya trae actualizaciones y recargos** (confirmado por Raúl). Antes de reemplazar,
correr el caso base con el motor actual y anotar el delta contra el golden — es el tamaño del
error que hemos venido mostrando y sirve para decidir si algún caso vivo (autorizaciones ya
impresas) merece re-verificación.

## 7. Gotchas

- `lib/imss` es un fork de pension-core y es el que calcula los Mod 40 de la app. El cambio debe
  llegar a **ambos** o, mejor, ser el pretexto para que la app importe esta pieza desde
  pension-core y el fork pierda esa responsabilidad. Reportar qué camino se tomó.
- `trol-b2c/node_modules/@trol/pension-core`: verificar el symlink antes de confiar en `tsc`.
- Los snapshots ya autorizados en `trol3.escenarios` quedan como están (motor viejo, para eso
  llevan `motor_version`). No migrarlos ni recalcularlos.
- No commitear ni pushear; dejar el commit armado (motor+tests separado de UI si el diff lo
  permite). Push lo hace Raúl.
- Al terminar, reportar discrepancias entre este spec y el repo sin resolverlas en silencio.

---

## Adenda — 24-ago-2026 (noche): el tope de 60 meses SÍ aplica

Decisión de Raúl sobre la discrepancia #1 que dejó abierta la implementación: se
restaura el comportamiento del repo. El art. 219 topa el costo a 5 años.

- `lineasCapturaMod40` gana `mesesMax` con **default `MESES_MAX_ART219` = 60**.
  `null` desactiva el tope y es lo único que usan los goldens de arriba, que
  reproducen el Excel (62 y 63 meses) para anclar la mecánica diaria.
- Al truncar se conservan los meses **más recientes**; los viejos caen. El
  prorrateo del mes de la baja sólo aplica **si ese mes sobrevive al corte**: si
  el tope cortó antes, el último mes cobrado va completo.
- Aviso: *"Solo se cubren los últimos 60 meses; N meses anteriores quedan fuera."*
  Lo emite `lineasCapturaMod40` y sube por `lineas.avisos`; `computeProyectoMod40`
  ya no lo duplica.
- El resultado gana `mesesDelPeriodo`, `mesesFueraDelTope` y `topado`.
- Mismo tope en el retro de `computeLey73` (por el default, sin pasar nada). El
  test que ancla que las dos pestañas cobren lo mismo sigue vivo y se extendió
  a un caso donde el tope muerde.
- `ENGINE_VERSION` → **2026.08.24.3**.

### Goldens con tope (nuevos)

| caso | periodo | cobra | retro | actualiz. | recargos | TOTAL |
|---|---|---|---|---|---|---|
| base_excel topado | 62 | 60 | 477,570.64 | 53,462.60 | 226,978.10 | 758,011.34 |
| cruza_mes topado | 63 | 60 | 479,951.84 | 53,131.70 | 227,808.61 | 760,892.16 |

`baja_fin_de_mes` (45 meses) y cualquier tramo ≤ 60 dan **el mismo número con y
sin tope**, con test que lo comprueba. También hay casos de 60 justos (no topa,
el mes de la baja sí se prorratea) y de 61 (cae uno, aviso en singular).

### Los 4 goldens de proyección que se movieron

**No regresan a un valor intermedio: no cambian.** Los cuatro tienen periodos de
34 y 26 meses, así que el tope no muerde ni antes ni ahora — lo que los movió fue
el cambio de ancla (mes de retiro → mes de trámite) y el prorrateo diario, no el
tope. Queda anotado en el comentario de cada uno.
