# 106 — Mod 40 bajo el acuerdo del Consejo Técnico (DOF 21-oct-2026)

**Estado:** v2 (22-oct 09:00) con D1–D3 cerradas y el modelo de hueco (§3b). Lista para motor. Migraciones desde **250**. Motor `pension-core` → `2026.10.22.1`. n8n Calculadora → **v5.8**.

---

## 1. Qué dice el acuerdo (ACDO.AS2.HCT.101026/302.P.DG)

- **Vigencia:** día hábil siguiente a la publicación → **jueves 22-oct-2026**. Config `mod40_regimen_corte = 2026-10-22`.
- **Temporal:** Finanzas analiza en ≤ 6 meses; Jurídica propone norma en ≤ 6 meses más. Puede volver a cambiar hacia **oct-2027**. Por eso el régimen es un **parámetro ligado a la fecha de trámite**, no una reescritura del motor.
- **Cuarto (lo que cambia):**
  - Ya inscritos a la entrada en vigor: conservan condiciones «hasta la conclusión del periodo que tengan contratado».
  - Nuevas inscripciones: **sólo a partir de la fecha de solicitud** (no hay retroactivo). Salario = último SBC al causar baja, «o hasta el importe de éste, **más una UMA**»; nunca menor a **1 salario mínimo**.
  - Quien esté o se incorpore a **Mod 10 (art. 13-I, independiente)** no puede contratar Mod 40.
  - Nada deroga el art. 218 (5 años) ni el 220 (12 meses).
- **Quinto:** inscripción sólo por medios digitales + canal para casos especiales.
- **Séptimo:** las semanas y salarios ya pagados en Mod 40 conservan efectos.

## 2. Decisiones de Raúl (22-oct)

| # | Tema | Decisión |
|---|---|---|
| 1 | Último SBC | **Sin actualizar por inflación.** Mínimo 1 SM. Tope = SBC + 1 UMA del año de trámite |
| 2 | «Periodo contratado» | Siguen en régimen anterior **mientras paguen**; lo pierden al dejar de pagar 12 meses (art. 220). **D1:** un ex-Mod 40 (baja < 12 m) **tampoco** paga omitidas hacia atrás: reingresa hacia adelante a su salario de Mod 40 |
| 3 | Mod 10 | **Sólo se recomienda.** Trol/Viraal ejecutan Mod 10 únicamente para **recuperar derechos** (reglas ya implementadas, `reactivacion_mod10`) |
| 4 | Mod 10 → Mod 40 | Una Mod 10 de independiente **no puede estar inmediatamente antes** de una Mod 40. No la bloquea para siempre (un reingreso al régimen obligatorio en medio la rehabilita) |
| 5 | Crédito | **No hay** crédito para cuotas mes a mes para subir pensión. Sólo para reactivar derechos |
| 6 | Reingreso con patrón a salario alto → baja → Mod 40 | **Fuera** del modelo |
| 7 | Viraal | **Ya no recibe Mod 40.** Sólo Mod 10 de reactivación. Sección Mod 40 de la Mesa Viraal se deshabilita |
| 8 | Infonavit | Mod 40 y Mod 10 **no cuentan** como relación laboral para el crédito. Sólo el segmento **empleado** entra en «inmueble para pagar cuotas» |
| 9 | Ya inscritos (A/B) | Siguen con su salario actual de Mod 40. **Nota pendiente:** no está claro si pueden subirlo (+1 UMA); se modela sin subida hasta que el IMSS implemente la reinscripción/reactivación |
| 10 | Oportunidades | `mod40_retro` **se apaga** (`activo=false`). **D2:** siempre se presentan **tres caminos**: pensionarse ya · seguir en Mod 40 (topada) · seguir en Mod 10 (hasta 25 UMA), cada uno cuando aplique; umbral de recomendación: si el costo de 12 meses no se recupera en ≤ 36 meses de aumento, tramitar ya |
| 12 | Rebote | **D3:** Vero y Andrea atienden en Tako |
| 11 | Alcance | Completo, priorizando **empleados con Infonavit ≥ 250k** (inmueble → dinero para pagar Mod 40/Mod 10 desde el inicio) y reactivando la base con el mensaje «ya está implementado» |

Pregunta abierta (C): palanca «cuida tu último salario antes de la baja» para activos. Se deja fuera de esta spec; se retoma después.

## 3. Modelo: régimen Mod 40

```
regimen_mod40(persona, fecha_tramite) =
  'anterior'  si ultima_modalidad = 'mod40'
              y alta de esa Mod 40 < corte (22-oct-2026)
              y (sin baja  ∨  baja + 12 meses ≥ fecha_tramite)
  'nuevo'     en cualquier otro caso
```

**Régimen anterior** (sólo segmento **A**: inscrito y pagando): sin retro (no hay baja), serie futura toda Mod 40 a su salario actual (sin subida, decisión 9). El segmento **B** (ex-Mod 40, baja < 12 m) queda en régimen nuevo con una ventaja: su «último SBC» es el de la Mod 40, así que su tope es alto. **Nadie paga hacia atrás desde el 22-oct.** `mod40-lineas.ts` y `mod40-proyecto.ts` quedan sólo para «Ver» caminos cerrados antes del corte.

**Régimen nuevo** (todos los demás):
- `retroAplica = false` siempre. Sin líneas de captura retroactivas, sin 25 UMA, sin 60 meses.
- **Mod 40 hacia adelante:** SBC ∈ [SM(año), último SBC + 1 UMA(año trámite)]. Cuota = `COSTO_MOD40_FUTURO`. Requiere: ventana art. 218 vigente (≤ 5 años desde la baja) **y** `ultima_modalidad ≠ 'independiente'`.
- **Mod 10 hacia adelante:** SBC ∈ [SM, 25 UMA]. Cuota = `COSTO_MOD10`. Sin ventana. Con EyM.
- **Sin mezcla:** la serie futura es toda Mod 40 o toda Mod 10. Muere la regla actual «Mod 10 mientras falten > 60 meses y Mod 40 los últimos 60» (ley73.ts, columna AA): hoy eso es una Mod 10 seguida de Mod 40, prohibido.
- Con `status_empleo = 'empleado'`: el último SBC es el vigente; la baja hipotética es una palanca (§3b).

### 3b. Dos fechas y un hueco (Raúl, 22-oct)

Como ya no se combina Mod 10 con Mod 40 y ya no hay retro, la pregunta del activo (y del recién dado de baja) cambia: **¿cuándo dejo de cotizar y cuándo empiezo a pagar?** Ejemplo de Raúl: a una persona de 53 con muchas semanas no le conviene pagar 7.5 años de Mod 40 topada hasta los 60.5; le puede salir mejor esperar a los 55.5 y dejar hueco.

Palancas:
- `fechaBaja` — cuándo deja (o dejó) de cotizar. Activos: default `hoy`, movible hacia adelante. Desempleados: la real, fija.
- `fechaInicio` — cuándo arranca Mod 40 / Mod 10 (hoy es `fechaTramite`, el «arranque del plan» de `ley73.ts`). Default `= fechaBaja`.
- `edadRetiro` — igual que hoy.
- Hueco = `fechaInicio − fechaBaja`. Semanas 0, no cuenta en el promedio.

Restricciones (avisan, no bloquean):
- Mod 40: `fechaInicio ≤ fechaBaja + 5 años` (art. 218) y última modalidad ≠ independiente.
- Mod 10: sin ventana.
- Conservación de derechos (¼ del tiempo cotizado) se evalúa a `fechaInicio`; si vence en el hueco, el camino lo dice (y aplica `reactivacion_mod10`).
- Promedio de 250 semanas: sólo cuenta lo cotizado, así que ~4.8 años de Mod 40/10 topada llenan el promedio completo; lo que sobra sólo compra semanas (caro).

**Sugerencia de inicio** (`sugerirInicio`): barrido mensual de `fechaInicio` entre `fechaBaja` y `fechaRetiro − 12 m` **en las dos modalidades** (Mod 40 sólo si está permitida); por cada una devuelve el inicio que **minimiza meses de recuperación** (`costo / (pensión − pensión base)`) y el de **mayor pensión** (D4), y `mejor` entre las dos. La edad de retiro no se optimiza (la elige el cliente); la baja tampoco (D5).

Hallazgo del golden 8 (53 años, 1,400 semanas, SBC $1,500, retiro 60.5), motor `2026.10.22.1`:

| Inicio | Modalidad | Cotiza | Pensión | Cuotas | Recupera en |
|---|---|---|---|---|---|
| hoy (53.5) | Mod 40 a $1,617 | 84 m | $36,700 | $716k | 60 m |
| 55.5 | Mod 40 | 60 m | $34,200 | $528k | 56 m |
| 58.5 (límite 5 años) | Mod 40 | 24 m | $29,400 | $204k | 43 m |
| **59.0** | **Mod 10 a 25 UMA** | **18 m** | **$36,100** | **$374k** | **33 m** |

Pensión base sin cotizar: $24,700. Con el tope de +1 UMA la Mod 40 pierde contra una **Mod 10 corta y tardía al máximo** para quien tiene muchas semanas y salario medio: la pensión depende más del promedio de los últimos 5 años que de las semanas extra. Es el argumento comercial nuevo.

## 4. Motor `pension-core`

**`mod40-ventana.ts`**
- Nuevo export `regimenMod40(historial, fechaTramite, {corte})` → `'anterior' | 'nuevo'`, con `altaMod40` y `sbcTopeNuevo` (= último SBC + UMA del año; mín. SM).
- `ventanaMod40`: en régimen nuevo `retroAplica = false`, aviso «Desde el 22-oct-2026 la Modalidad 40 ya no se paga hacia atrás…». Nueva señal `mod40Permitida` (= ventana 218 vigente y última ≠ independiente) con aviso cuando la última fue Mod 10.
- Espejo obligatorio: `trol3.regimen_mod40(persona, fecha)` y el nodo n8n. Las tres superficies cambian en la misma sesión.

**`types.ts` — Palancas**
- `modalidadFutura: 'mod40' | 'mod10'` (default: `'mod40'` si permitida, si no `'mod10'`).
- `fechaBaja?: Date` (activos; default hoy) y `fechaInicio?: Date` (= `fechaTramite` renombrado en la entrada, se conserva el alias). Ver §3b.
- `salarioMod40` se conserva como el salario futuro; la UI lo topa según la modalidad (Mod 40: SBC+1 UMA; Mod 10: 25 UMA). El motor **avisa y recorta**, no bloquea.
- `recuperarSemanasMod40Retro` sólo surte efecto en régimen anterior.
- `ResultadoLey73.detalle` suma: `regimenMod40`, `sbcTopeMod40`, `modalidadFutura`, `mod40Permitida`.

**`ley73.ts`**
- `aplicaRetroHoy = regimen === 'anterior' && …` (lo de hoy).
- Serie futura: `modalidad = palancas.modalidadFutura` para todos los meses (sin AA). Costo según modalidad.
- **Tres caminos** (D2): `caminos` = { pensionHoy, mod40: {aplica, sbc, pension12m, pension24m, costo12m, costo24m, mesesRecuperacion}, mod10: {sbc, …igual} }, calculados al tope de cada modalidad y a la `fechaInicio` sugerida. `evaluar_persona` lee esto para `pension_hoy` y sus dos alternativas.
- **`sugerirInicio(entrada)`** (módulo `caminos-ley73.ts`, junto con `caminosLey73`): barrido de §3b; devuelve `{ mod40, mod10, mejor }`, cada modalidad con `{ recomendado, maxPension, tabla[] }` para graficar costo vs pensión por mes de inicio. Son funciones aparte de `computeLey73` (lo llaman varias veces), no campos del resultado.

**`mod40-proyecto.ts`** (hoja «Mod40 Retroactivo»): devuelve `null` si `fechaTramite ≥ corte`, con `motivo = 'regimen_nuevo'`. No se borra: lo usan los caminos cerrados en modo «Ver».

**`mod40-lineas.ts`**: sin cambios (sólo lo llama el régimen anterior).

**Tests / goldens** (`__tests__/mod40-regimen.test.ts`):
1. Inscrito en Mod 40 desde 2024, sin baja → `anterior`, sin retro, serie futura toda Mod 40 a su salario.
2. Ex-Mod 40 con baja hace 8 meses, SBC Mod 40 $2,594 → `nuevo`, retro 0, tope $2,711, Mod 40 permitida.
3. Baja de obligatorio hace 14 meses, SBC $600 → `nuevo`, tope $717.35, Mod 40 permitida, retro 0; comparativa hoy vs 24m.
4. Baja hace 14 meses, SBC $2,900 (cerca del tope) → `nuevo`, tope 25 UMA manda; Mod 10 sólo si quiere más (no puede).
5. Última cotización Mod 10 hace 3 meses → `nuevo`, `mod40Permitida = false`, sólo Mod 10.
6. Empleado hoy, SBC $400 → `nuevo`, baja hipotética hoy, Mod 40 a $517.35 máx.
7. Mismo perfil 3 con `fechaTramite = 2026-10-21` → `anterior` (el régimen depende de la fecha).
8. **Caso Raúl:** 53 años, 1,400 semanas, SBC $1,500, empleado. `sugerirInicio` con retiro a 60.5 debe preferir baja hoy + inicio ~55.5 sobre inicio hoy (7.5 años de Mod 40), con menor costo y la misma pensión (promedio ya lleno).
9. Mismo perfil con 600 semanas → el hueco cuesta derechos/semanas; la sugerencia se acerca a inicio = baja.
Los 300 tests actuales deben seguir en verde salvo los que asumen la mezcla Mod 10→Mod 40 (se actualizan con nota).

## 5. Base (`trol3`)

**250 — régimen y config**
- `config`: `mod40_regimen_corte = 2026-10-22`, `mod40_uma_extra = 1`.
- `trol3.regimen_mod40(p_persona uuid, p_fecha date default _hoy_mx())` → text. Deriva `alta` de la última Mod 40 desde el historial (`v_mejor_dato` / `datos` de historial laboral) con la misma regla que el TS.
- Campos nuevos en `datos` (los escribe n8n v5.8 y `evaluar_persona` los lee): `mod40_regimen`, `mod40_sbc_tope`, `mod40_permitida`, `pension_mod40_futuro` (se mantiene, ahora al tope), `pension_mod10_futuro`, `costo_mensual_mod40`, `costo_mensual_mod10`, `mod40_caminos` (jsonb, los tres caminos + inicio sugerido).
- `v_expediente`: expone los nuevos campos; `mod40_retro_aplica` y `pension_mod40_retro` quedan pero sólo con valor en régimen anterior.

**251 — catálogo y `evaluar_persona`**
- `mod40_retro`: **`activo = false`** (D1). Se elimina su bloque completo de `evaluar_persona` (incluida la rama `m40_pronto`). Queda como historia, igual que `mod40_prospectiva`.
- `pension_hoy` (D2): `valor_detalle.caminos` = { pension_hoy, mod40 {…}, mod10 {…} } con la sugerencia de inicio; `motivo` en una línea: «Hoy $X · Mod 40 12 m $Y (cuesta $C, recupera en N m) · Mod 10 12 m $Z (…)». Detección igual (≥ 60, ≥ 500, derechos). Para < 60 con derechos no hay oportunidad: es asesoría (paso 3 de la calculadora).
- `pension_hoy`: `siguiente_paso` → «presentar los tres caminos; si 12 meses de Mod 40/10 no se recuperan en ≤ 36 meses, tramitar ya; si cotiza, elegir modalidad y fecha de inicio con la calculadora».
- `reactivacion_mod10`: `siguiente_paso` suma «después de la Mod 10 no hay Mod 40: la pensión será la que dé el promedio de hoy».
- Textos del catálogo (`nombre_cliente`, `frase_corta`) revisados para las tres.

**252 — barrido de cartera**
- `mod40_retro` en `detectada` → `no_aplica`, `motivo_perdida = 'cambio_regulatorio_dof_2026-10-21'`.
- `presentada` / `interesada` / `en_proceso` (137 personas, segmento C): **no se pisan**; se les pone `nota_estado` «Revisar: acuerdo DOF 21-oct; Viraal confirma si alcanzó a inscribirse» y aparecen en una lista `v_mod40_por_revisar` para Mi cartera.
- Re-correr `evaluar_persona` para toda Ley 73 **después** del recálculo v5.8 (`mass_refresh`, `notificar = false`).
- Cerrar `mod40_prospectiva` ya apagada: nada que hacer.

## 6. App `trol-b2c`

| Superficie | Cambio |
|---|---|
| `CalculadoraPro.tsx`, `portal/calculadora-client.tsx` | Palanca **«Cotizar hacia adelante en: Mod 40 (hasta $X diarios) / Mod 10 (hasta 25 UMA)»**; slider de salario topado según modalidad; **dos fechas** (deja de cotizar · empieza a pagar) con el hueco visible y la sugerencia de `sugerirInicio` («te conviene empezar en {mes}: misma pensión, $C menos»); toggle «Mod 40 retroactiva» desaparece; franja ámbar «Régimen nuevo desde 22-oct-2026» |
| `FechaTramite.tsx` | Copy: la fecha ya no mueve retro en régimen nuevo; mueve el año de UMA del tope y el arranque de la cotización |
| `MesaViraal.tsx`, `viraal-pdf.tsx`, `lib/viraal/*` | Sección Mod 40 **deshabilitada** (oculta con nota); sólo Mod 10 de reactivación. Fixture `semilla-mod40.ts` queda para A/B |
| `lib/pdf/escenario-pdf.tsx`, `escenarios-cerrados.tsx` | Mostrar régimen y modalidad futura; caminos cerrados antes del 22-oct se «Ven» tal cual y al «Partir de aquí» avisan en ámbar que el retro ya no existe |
| `/mi/page.tsx`, `resumen-cliente.tsx`, `Diagnostico*.tsx`, `lib/diagnostico/*` | Textos: nunca prometer retro; hecho nuevo «Mod 40 hacia adelante hasta $X»; hecho «Mod 10 cierra la Mod 40» |
| `lib/trol3/copiloto.ts`, `FichasBiblioteca.tsx`, fichas O5 | Ficha O5 reescrita (régimen nuevo); ficha nueva **O5b «Pensionarse ya o cotizar 12–24 meses»**; copiloto conoce el tope |
| `lib/whatsapp.ts`, plantillas, `aliado/material/*` | Plantillas de Mod 40 retro **retiradas**; nueva plantilla «cambios Mod 40 — ya los tenemos listos» (ver §8) |
| `app/sitio/*`, `lib/blog/posts.ts` | ⚠️ **Marketing con promesas de retro.** Se corrige en esta misma entrega: no puede quedar público un texto que ya no es cierto |
| `lib/estimacion.ts`, `estimarDireccional` | Modo declarado: ya no ofrece retro en el primer número |
| `trabajo/p/[id]`, `AsesoriaSesion.tsx` | Chip de régimen en el expediente; paso 3 muestra la comparativa «hoy vs 12/24 m» |

## 7. n8n, bot, B2B

- **Calculadora Trol v5.8** (`motor/calculadora_pension_pro_v580.js`): régimen por fecha; retro sólo en anterior; `pension_mod40_futuro` al tope; nuevos campos del §5. Pegado y publicado por Raúl. Luego `mass_refresh` sin avisos.
- **Lukas (Tako):** v20.8 con las tres frases nuevas (retro ya no existe; tope +1 UMA; Mod 10 cierra Mod 40). Sigue sin montos.
- **B2B API Gateway / Maat / Viraal:** el payload conserva los campos `mod40_*` (compatibilidad) y suma `mod40_regimen` y `mod40_sbc_tope`. Aviso por correo a los aliados con la fecha del cambio y el campo nuevo. Viraal además: deja de recibir `mod40_retro` como oportunidad.
- **Plantilla y cola de envíos:** una plantilla nueva `mod40_cambio_2026` con candado de una por persona al día (167).

## 8. Cartera: a quién, en qué orden, qué decirle

Barrido del 22-oct (Ley 73, 10.7k personas):

| Orden | Seg | n | Mensaje |
|---|---|---|---|
| 1 | **C** Mod 40 en vuelo | 137 | Viraal confirma primero. No alcanzaron a inscribirse: «cambió la regla; te buscamos para ver qué procede: pensionarte ya o cotizar hacia adelante» |
| 2 | **B** Ex-Mod 40 < 12 m | 56 | «Puedes reingresar hacia adelante con tu salario de Mod 40 (tope alto); ya no se paga lo omitido. Vemos si te conviene pensionarte ya» |
| 3 | **A** Inscritos hoy | 99 | Retención: «no dejes de pagar; si pasan 12 meses pierdes tus condiciones» |
| 4 | **H** Empleados, Infonavit ≥ 250k, < 62 | 1,069 | «Mientras estés empleado tu Infonavit te da {monto}; con eso puedes pagarte tu cotización cuando salgas» (prioridad de Raúl) |
| 5 | **D** Desempleado ≥ 60 con derechos | 453 | «Ya puedes pensionarte; vemos si conviene hoy o cotizar 12–24 meses más» |
| 6 | **G** Última Mod 10, ≥ 60 | 110 | Pensión hoy; sin Mod 40 |
| 7 | **F** Derechos perdidos, ≥ 60 | 939 | Mod 10 con Viraal para recuperar derechos |
| 8 | **E** y **F** < 60 | 3,600 | Campaña general: «ya implementamos los cambios; revisa tu caso» |

Regla de ejecución: **primero motor + base + recálculo**, después mensajes. Ningún mensaje sale con números del motor viejo. Los mensajes van por `cola_envios` con la plantilla nueva y un lote por segmento (Raúl decide cadencia). Sin montos por WhatsApp (regla dura de Tako); el monto se ve en `/mi`. **Rebote: Vero y Andrea en Tako (D3).**

## 9. Lo que NO cambia

- Detección de modalidad (`derivar_ultima_modalidad`, `modalidadDeRegistro`, nodo n8n): misma regla de empleador/RP.
- Art. 218 (5 años) y 220 (12 meses): siguen.
- Ley 73 a la fecha del derecho, retroactivo de pensión tope 12 meses (v5.7, `claude/90`).
- `reactivacion_mod10` y su mesa con Viraal (14 pagos).
- Infonavit: compra/inversión de inmueble, broker, regla < 62.
- Caminos cerrados (209): inmutables; sólo cambia el aviso al partir de uno viejo.

## 10. Orden de trabajo

1. ✅ Lectura legal + decisiones (este doc).
2. ✅ Motor (22-oct 09:20): `regimenMod40`, palancas `modalidadFutura` / `fechaBaja`, serie sin mezcla, `caminosLey73`, `sugerirInicio`, `mod40-proyecto` nulo tras el corte, 25 tests nuevos; **325/325 en verde, `tsc` limpio**. `ENGINE_VERSION 2026.10.22.1`. Regla de compatibilidad: `hoy` anterior al corte reproduce el mundo viejo (los goldens de 2026-06 no se mueven). Bump `2026.10.22.1`. Tests en verde.
3. Base 250–252 + `trol3.regimen_mod40` (espejo). Probar con rollback sobre 5 personas reales (una por segmento A/B/C/D/H).
4. n8n v5.8 + `mass_refresh` nocturno sin avisos. Verificar 20 personas al azar contra el motor TS.
5. App: calculadora y expediente primero (lo que ve el asesor), después `/mi`, fichas, PDFs, sitio/blog.
6. Lukas v20.8, plantillas, aviso a aliados.
7. Cartera: lista C a Viraal (hoy mismo, sin esperar el motor), lotes 2–8 conforme salga el recálculo.
8. Handoff: `10-handoff-contexto.md` + `learnings-and-rules`.

## 11. Pendientes de confirmar

- ~~D1~~ apagada del todo. ~~D2~~ tres caminos, umbral 36 m. ~~D3~~ Vero y Andrea; cadencia por definir al tener el recálculo.
- **D4:** criterio de `sugerirInicio`: propuesta — recomendado = menor **meses de recuperación**; alternativa mostrada = mayor pensión. ¿O sólo menor costo a pensión igual?
- **D5:** para activos, ¿`fechaBaja` también se sugiere (p. ej. «deja de cotizar en {mes}») o sólo `fechaInicio`? Propuesta: sólo inicio; la baja la decide el cliente.
- **Nota IMSS:** si los inscritos pueden subir su salario (+1 UMA) al reactivar. Se modela sin subida hasta ver el trámite digital implementado.
