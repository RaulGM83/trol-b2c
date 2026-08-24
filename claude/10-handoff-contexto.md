# Trol 3.0 — Contexto para continuar en un chat nuevo

Punto de entrada único. Actualizado **24-ago-2026** (noche, 2ª pasada). Los detalles de cada tema viven en los docs `claude/11` … `claude/20`; aquí está el mapa.

---

## 1\. Qué es Trol 3.0

Herramienta de asesoría pensional (IMSS) para cliente y asesor. Objetivo: consolidar lo aprendido en los primeros 2 años y prepararse para escalar. Empresa: El Trol Financiero.

Instrucciones de trabajo del proyecto (respetarlas):

- Tomar tiempo para pensar alternativas; no explicar en exceso en el chat.  
- Preguntar/cuestionar lo necesario antes de decidir.  
- No crear archivos/producto hasta definirlo juntos; proponer los pasos primero.

---

## 2\. Arquitectura (dónde vive cada cosa)

- **Base de datos:** Supabase Postgres, proyecto `orgagfdxygtjiwqvgckw`. Esquema principal **`trol3`** expuesto en la Data API. RLS con `trol3.es_miembro()`, `current_miembro_id()`, `current_persona_id()`. Roles (`trol3.rol_miembro`): `recepcionista`, `cabecera`, `especialista`, `admin`, `coach`.  
- **Edge Function `api-trol`** (header `x-trol-key`, `verify_jwt=false`), **versión 8**. Rutas: `/alta`, `/expediente`, `/declarar`, `/declarar-varios`, `/interaccion`, `/handoff`, `/consulta`, `/consulta/resultado`, `/eventos/pendientes`, `/eventos/ack`. Fuente en el repo: `trol3_backend/edge/api-trol/index.ts`.  
- **App web `trol-b2c`** (Next.js 14 App Router, Tailwind; tokens `ink/lime/muted/line/cream`). Repo **`RaulGM83/trol-b2c`**, deploy en Vercel rama `main`. Carpeta local: `~/Claude/Projects/b2c experiencia` (raíz git); la app está en `trol-b2c/`.  
  - Asesor: `/trabajo` (personas, lista de trabajo, actividad, aliados), expediente `/trabajo/p/[id]`.  
  - Cliente: `/mi`. Expediente público por slug: `/e/<nombre>-<últimos4tel>`.  
  - Invitaciones: `/i/<codigo>` → redirige a WhatsApp con `ref:<codigo>` en el mensaje.  
- **Storage:** bucket privado `expediente` (bóveda de documentos). URLs firmadas de 2 min por `/trabajo/doc/[id]` y `/mi/doc/[id]`.  
- **Legacy `public`:** `clientes`, `procesos`, `partner_transactions`, `partners` — dual-write mientras se migra a `trol3`.  
- **n8n cloud** `eltrolfinanciero.app.n8n.cloud`: `Datosbelvo` (alta \+ link Belvo), `HistoriaBelvo` (callback Belvo), `jordan_webhook` (callback Jordan), `Calculos` (motor \+ documentos \+ HubSpot), `trol3-eventos`, `trol3-cda`, `sisec_pdf_waterfall`, `ISSSTE nubarium` \+ `ISSSTE Nubarium PDF`.  
- **Bot Tako (Lukas)** en `portal.takohub.com/trol-financiero`: herramientas HTTP contra `api-trol`.  
- **HubSpot:** en decomisión. La consulta ISSSTE ya no escribe ahí (ver `claude/16`).

---

## 3\. Estado a hoy (lo hecho, con dónde está el detalle)

### Sesión 17-ago (`claude/11-ajustes-17ago.md`)

Lista de personas con teléfono→Tako, edad/ley/semanas/creado; alta con CURP opcional; accesos del equipo (Lore, Vero, Moni, Andrea) y login por magic link con `token_hash`; regla CDA; bóveda de documentos \+ CURP al subir constancia; SISEC PDF por N8N; mesa Viraal ligada a datos del cliente; slug de expediente; `mejoravit_activo` y `credito_infonavit_activo` en lista de trabajo; rol `coach` (Moni, Andrea, Raúl) y reparto Andrea → Moni → Raúl.

### Sesión 19-ago — Calculadora Infonavit (`claude/13`, `claude/14`)

Fases 0–3 completas: precedencia del saldo por campo (`catalogo_campos.prioridad_capa`), motor `pension-core/src/infonavit-asesoria.ts` con 22 tests, pestaña de asesoría en el expediente, inventario de inmuebles, cotitular, PDF de una página con marca del brandbook. Corrección del inventario (Vistalagua no cubre notariales) en la 064\.

### Sesión 20-ago — Escenarios e ISSSTE (`claude/15`, `claude/16`)

Plazo de venta editable con el óptimo marcado como sugerido, nombre de escenario, archivado reversible, resumen PNG 1080×1350 para WhatsApp (satori \+ resvg). Consulta ISSSTE bajo demanda (Nubarium, $1) por botón del asesor, misión en `/mi` o declaración del bot; 12 campos nuevos; PDF a la bóveda; sin HubSpot ni Drive. También: bug de RLS en `eventos` (triggers a security definer), orden por columnas en `/trabajo`, consulta pensional automática al alta con Jordan.

### Análisis de embudos (`claude/12`)

Diagnóstico de los funnels en HubSpot y propuesta de ciclo unificado. **No ejecutado.**

### Sesión 21-ago — Consultas que morían en silencio (migraciones 066–075)

El disparador: Vero reportó 5 clientes sin reporte. El diagnóstico real fue que **la consulta IMSS nunca regresaba a trol3**: 25 colgadas en `en_proceso` contra 37 completadas en 7 días, con 0 datos escritos y sin error. `Datosbelvo` sí detectaba el fallo y lo escribía en `public.procesos` (`Error-Intentar mas tarde`), pero nada volvía a trol3.

**B0 — cerrar el lazo (n8n, aplicado por Raúl).** `trol3_consulta_id` viaja en `procesos.datos_entrada`; se propaga al `context` de `Calculos` y se cierra la consulta por `api-trol /consulta/resultado`:

- `Calculos` → nodo `Cerrar consulta trol3` tras `Build Diagnostico Bag` (usa `calculo_pensional.perfil`, que ya viene tipado). **No manda saldos**: son estimados y entrarían como capa validada, rompiendo la precedencia de la 056\.  
- `Datosbelvo` rama FALSE de `If1` → `estado: error` con el mensaje real de Belvo.  
- `HistoriaBelvo` `Update a row3` → `sin_resultado`.  
- `jordan_webhook` `If1`: rama TRUE → `sin_resultado` (falla del instituto); rama FALSE (`Error- NSS`) → `error` \+ inconsistencia real.  
- Se agregó `Buscar Proceso Actual` a `jordan_webhook` para tener el id en las ramas de error.
- **`cliente-refrescar-sisec` — el cuarto workflow, que faltaba documentar.** Es el webhook que `tg_consulta_despachar` invoca para la rama **Jordan**. Ya tiene los nodos de cierre a `/consulta/resultado` en **las dos salidas** de su `If1`, y un candado de `notificar_cliente` antes del POST a Tako. Hasta hoy ignoraba la preferencia del asesor y mandaba plantilla de WhatsApp **siempre**, incluso en reprocesos marcados para no notificar.

**079 — teléfono en el payload de Jordan.** El payload a ese webhook ahora lleva `telefono` y `mobil` (10 dígitos, desde `contactos`). Antes no llevaba ninguno de los dos y el nodo de Tako armaba `521undefined`, que Meta rechazaba.

**066 — watchdog.** Bloqueo de `pedir_consulta` de 6 h → 10 min (`config.consulta_espera_min`), devolviendo `consulta_id` y `reintentar_en_seg`. `cerrar_consultas_colgadas()` por pg\_cron cada 5 min cierra como `sin_resultado` lo que lleve más de la ventana y emite `consulta_sin_respuesta`. `reprocesar_consulta(persona, tipo, proveedor, motivo)` para el botón del asesor. Producto `analisis_inconsistencia` ($800) ahora otorga beneficios reales. Primera corrida: 40 consultas cerradas, incluidos los 5 de Vero.

**067 — puente legacy destapado.** `tg_public_procesos` ya no falla en silencio: emite `puente_procesos_sin_persona` y `puente_procesos_fallo` con el `sqlerrm`. Su cierre a ciegas se acotó a consultas con `resultado is null`. Pasa a ser red de seguridad, no fuente de verdad. No re-lanza el error a propósito: un `raise` abortaría la transacción y borraría el propio registro.

**068–071 — identidad.** La prueba real con Faustino devolvió *"Los datos de entrada no coinciden con los datos de la entidad externa RENAPO"*. Eso **no** es inconsistencia del IMSS: puede ser dedazo en la CURP **o** liga NSS–CURP rota. La confirmación del cliente separa las dos y de paso califica la venta.

- `declarar` ya permite **corregir** una CURP existente (antes solo escribía si era `null`, así que ninguna corrección funcionaba). Dispara `tg_curp_consultas` → CDA \+ IMSS se relanzan solos. Candados: no le quita la CURP a otro expediente (`curp_duplicada`), deja `curp_corregida`.  
- Campo `estatus_identidad` (`ok | por_confirmar | confirmada_con_problema`).  
- `aplicar_regla_identidad(consulta)` clasifica desde `consultas.error` y escribe texto legible en `inconsistencia_imss`; el crudo se queda en `consultas.error`/`resultado`.  
- Con `por_confirmar` **no** se genera la oportunidad de $800: solo alerta gratis de revisar CURP. Con `confirmada_con_problema` sí, y con argumento real.  
- `confirmar_curp()` para cuando el cliente dice "así viene en mi documento". Límite en `config.identidad_intentos_max = 2`: si corrige y vuelve a fallar, escala solo.  
- Una CURP que ya trajo información oficial **no la puede cambiar el cliente** (`curp_confirmada`); solo el asesor.

**072–073 — B4, personas duplicadas.** `alta_por_telefono` hacía check-then-act; ahora usa `pg_advisory_xact_lock` por número. `tg_consulta_despachar` intenta `enlazar_legacy` antes de rendirse con "sin espejo en HubSpot" (se acaban los pares consulta-cancelada \+ redespacho). Vista `v_personas_duplicadas` y RPC `fusionar_personas(conservar, absorber, motivo)` que recorre dinámicamente todas las tablas con `persona_id`.

> **Hallazgo importante:** de 73 teléfonos con más de una persona, **solo 19 son duplicados reales**. 51 tienen **CURPs distintas**: son familiares compartiendo teléfono. Fusionarlos sería un error. Regla acordada: **un teléfono, una CURP**. El dueño del número es una sola persona; los familiares se dan de alta y se ligan por `relaciones_persona` sin quedarse el teléfono como propio. Falta implementar el `principal` único por número y repartir los 51 a mano.

**074–075 — preparación de UI.** `mi_identidad()` (curp, estatus, mensaje, editable, puede\_confirmar, último intento), vista `v_ultima_consulta_imss` para el asesor, y misión **"Confirma tu CURP"** en `mi_misiones` con sus dos variantes. Se corrigió el copy de "info oficial", que decía "puede haber una inconsistencia en tu cuenta" incluso cuando solo había un dedazo.

### Sesión 24-ago — Fecha de trámite libre en Mod 40 (`claude/20-fecha-tramite-mod40-spec.md`)

El spec vive en `claude/20`. El lado Supabase se hizo en la sesión de chat (campo `ultima_modalidad`, `derivar_ultima_modalidad` + trigger, límite de 12 meses en `limite_inscripcion_mod40`, `evaluar_persona` con ventana, backfill de 181 personas). Aquí quedó el lado del repo:

- **`pension-core/src/mod40-ventana.ts`** (nuevo, copiado tal cual a `trol-b2c/lib/imss/`): `ventanaMod40(historial, fechaTramite, opts)` clasifica la última cotización y devuelve `{ ultimaBaja, ultimaModalidad, plazo '5a'|'12m', fechaLimite, estado vigente|por_vencer|vencida, sinBaja, ultimoSbc, diasRestantes, retroAplica, avisos }`. La detección es **espejo literal** del `CASE` de `trol3.derivar_ultima_modalidad` (nombre de patrón O RP terminado en `9999940`): si se toca una, se toca la otra.
- **`fechaTramite` en `computeProyectoMod40`.** Ancla única: edad, fecha de retiro, ventana retroactiva, meses de pago, año de UMA y el escenario base interno. **Omitirla deja el cálculo idéntico al de siempre** — los 118 goldens pasan bit a bit (hay un test que lo compara campo por campo). El resultado gana `fechaTramite`, `ventana` y `avisos`.
- **UI**: selector de fecha \+ caja de avisos compartidos en `components/trol3/FechaTramite.tsx`, usados por la **Mesa Viraal** (que ahora recalcula **en vivo** en el cliente: la página pasa `semilla`/`historialLaboral`/`limiteInscripcionMod40` en vez del `datos` precalculado) y por la **pestaña Calculadoras** (`Mod40Panel`). `public/viraal/calc.html` tiene su propio campo de fecha que viaja en `inputs`.
- **Congelado**: la fecha entra a los `inputs` de la autorización Viraal junto con `ventana_mod40` y `avisos`, y el PDF (`viraal-pdf.tsx`) los imprime.
- **29 tests nuevos** en `pension-core/src/__tests__/mod40-ventana.test.ts`. Probado además contra dos expedientes reales de producción.

**Lo que NO quedó** (ver "Pendientes"): la persistencia de la fecha como override de escenario en la base, y el flag del n8n de aliados.

### Sesión 24-ago (tarde) — Escenarios autorizados como snapshot inmutable

Cierra el pendiente que dejó la mañana. La fecha de trámite libre creó un problema nuevo: un proyecto autorizado el martes con fecha de octubre ya no se puede reconstruir el jueves — el motor cambia, la semilla se refresca y la ventana del art. 220 se corre sola con el calendario. **Lo que se autorizó tiene que quedar escrito, no derivable.**

- **Migración `20260824180000_escenarios_snapshot_autorizacion.sql`** (escrita, **NO aplicada** — la aplica Raúl). Reconstruye `trol3.escenarios`, que existía con otro diseño (escenario editable del cliente), vacía y sin uso. Trae un bloque que **aborta si la tabla tiene filas**.
- **Columnas**: `id`, `tipo`, `persona_id` \| `consulta_aliado_id` (exactamente uno), `inputs`, `resultado`, `ventana`, `creado_por`, `creado_en`. Sin `updated_at` a propósito.
- **Inmutable con tres candados**: RLS sin política de escritura, `revoke` de privilegios de tabla, y un **trigger** `before update/delete/truncate` — el trigger es el que importa, porque `service_role` (que la app usa vía `t3admin()`) se salta RLS.
- **`trol3.autorizar_escenario(...)`** es la única puerta de entrada (security definer). Valida miembro, sujeto único, existencia y que `inputs` traiga `motor_version`.
- **`ENGINE_VERSION`** en `pension-core/src/version.ts`, re-exportada por `trol-b2c/lib/imss/version.ts` junto con `MOTOR_ID`. Se guardan las **dos** porque `lib/imss` es un fork de `pension-core` y es el que calcula los Mod 40 de la app: guardar solo la versión mentiría sobre qué código produjo los montos.
- **`lib/viraal/snapshot.ts`** es puro: arma el snapshot con UNA corrida del motor, y de esa misma corrida sale el prefill de la mesa. El objeto que se imprime en el PDF es el mismo que viaja a la RPC.
- **trol-b2c estrena runner de pruebas** (vitest + `vitest.config.ts` con el alias `@`): antes solo `pension-core` tenía tests. 17 nuevos, incluido el round-trip.
- El PDF de Viraal imprime el id del escenario y la versión del motor.

### Sesión 24-ago (noche) — Líneas de captura Mod 40 con precisión diaria

Spec en `claude/21-lineas-captura-dia-a-dia-spec.md`. El motor cobraba **meses completos**: mover la fecha de trámite una semana no cambiaba un peso de la línea de captura. El IMSS cuenta días. La referencia es el Excel `Calculadora_lineas_IMSS.xlsx`, validado contra líneas reales del IMSS.

- **`pension-core/src/mod40-lineas.ts`** (nuevo): `lineasCapturaMod40({ultimaCotizacion, fechaTramite, umas, sdi?, sdiPorMes?, serieINPC?, mesesMax?})`. Va del mes de la baja al mes del trámite, **ambos inclusive**, prorrateando los dos extremos por días. Devuelve `{meses, sdi, retro, actualizaciones, recargos, total, detalle[], avisos, usaInpcProyectado}`. Reproduce **los 6 goldens del Excel al centavo**.
- **`pension-core/src/inpc.ts`** (nuevo): fallback embebido de `trol3.inpc_mensual` (252 meses, 2015-01 → 2035-12, INEGI observado hasta 2026-03) \+ `serieINPCDesdeFilas` / `inpcDe` / `SerieINPC`. **No sustituye a `tablas.INPC`**, que es la serie vieja del Excel de junio y sigue alimentando el resto de la Ley 73; la nueva es la única que cuadra con las líneas reales.
- **Una sola implementación para las dos pestañas.** `computeProyectoMod40` **y** el bloque retro de `computeLey73` llaman a la misma función. Antes cada uno calculaba lo suyo y coincidían por construcción; con el prorrateo habrían divergido ~7 % en pantallas contiguas. Hay un test que lo ancla (`la Ley 73 y el proyecto Mod 40 cobran EXACTAMENTE la misma línea`).
- **`lib/imss` NO forkeó esta pieza**: `lib/imss/mod40-lineas.ts` y `lib/imss/inpc.ts` son `export * from '@trol/pension-core/…'`. El fork conserva sus divergencias de negocio (ajuste de semanas, disponible AFORE, redondeos), pero la aritmética del IMSS vive en un solo lugar.
- **La serie INPC baja del servidor**: `lib/trol3/inpc.ts` → `leerSerieINPC(db)` en `/trabajo/p/[id]` y `/trabajo/aliados/[id]`, y viaja como prop a `MesaViraal` y `CalculadoraClient` (las dos recalculan en el navegador). Si falla, `undefined` y el motor usa el fallback embebido.
- **Snapshot auto-contenido**: `inputs.inpc_tramo` congela el INPC **de los meses del tramo** (no la serie entera), y `recomputarDesdeInputs` lo usa en vez de la tabla de hoy. `resultado` **no** lleva `lineas` (60+ filas por variante).
- **`ENGINE_VERSION` → `2026.08.24.3`**. Los snapshots ya autorizados quedan como están.
- **Pendiente del spec anterior cerrado**: "UMA por año del tramo" **no se toca** — el Excel validado ancla la UMA al año de la última cotización, igual que el motor. Confirmado por Raúl.

**Cuánto se movió** (delta del motor viejo contra el golden, caso base del Excel):

| caso | motor viejo | golden/nuevo | Δ |
|---|---|---|---|
| base (3-jul) | 762,866.04 (60 m) | 779,027.15 (62 m) | −2.1 % |
| +1 semana (10-jul) | 762,866.04 | 781,291.84 | −2.4 % |
| fin de mes (31-jul) | 762,866.04 | 788,085.94 | −3.2 % |
| cruza mes (1-ago) | 766,711.20 | 799,269.11 | −4.1 % |
| baja fin de mes | 635,521.87 | 615,096.53 | **+3.3 %** (cobraba de más) |

Las tres primeras filas son el bug entero: **el mismo número toda la quincena**. Del delta del caso base, ~$7,592 vienen de la serie INPC nueva y el resto del tope de 60 meses y el prorrateo.

> **La columna "golden/nuevo" es SIN tope** (es lo que hace el Excel de referencia). Con el tope restaurado —ver el cierre de la discrepancia #1, más abajo— el caso base cobra 60 meses y da **758,011.34**, no 779,027.15. Los goldens del Excel se quedan sin tope a propósito: validan la mecánica diaria, no la regla de negocio.

**Goldens v2** (versionados en el sitio, con el valor viejo escrito en el comentario): Mod40 MOJA (544,420.72 → 436,033.05), Mod40 CAFE (349,795.10 → 327,044.31), Ley 73 MOJA retro (450,844.34 → 436,033.05) y Ley 73 CAFE retro (349,795.10 → 327,044.31). **Ninguna pensión se movió.** 188 tests en pension-core (147 antes), 24 en trol-b2c (17 antes). Probado contra dos expedientes reales de producción: la línea se mueve por día y salta al cruzar de mes.

**Tres cosas que había que decidir** (la #1 se resolvió la misma noche; ver "Pendientes" 4):

1. ~~El tope de 5 años del art. 219 dejó de aplicarse al costo.~~ **RESUELTO la misma noche: Raúl decidió que el tope SÍ aplica.** Ver el bloque de abajo.
2. **El hueco entre trámite y retiro ya no se cobra.** Antes la serie llegaba al mes de RETIRO, así que a un cliente de 55 se le cobraban también los meses hasta los 60. Ahora la línea llega al mes del TRÁMITE, pero las semanas de ese hueco **siguen contando para la pensión**. El motor lo avisa explícitamente; modelarlo como cotización prospectiva es el pendiente que ya estaba abierto.
3. **`tablas.INPC` está desactualizada**: difiere de `trol3.inpc_mensual` desde 2024-05 (2025-01: 138.343 vs 139.679). Sigue alimentando las actualizaciones de `computeLey73` fuera del retro. Cambiarla movería goldens de pensión y se dejó fuera de esta sesión.

#### Cierre de la discrepancia #1 — el tope de 60 meses SÍ aplica

Decisión de Raúl la misma noche. Se restaura el comportamiento del repo y se
deja explícito en vez de implícito.

- `lineasCapturaMod40` gana `mesesMax`, **default `MESES_MAX_ART219` = 60**. `null` lo desactiva y sólo lo usan los goldens que reproducen el Excel (62 y 63 meses): la mecánica diaria se valida aparte de la regla de negocio.
- **Se conservan los meses más recientes**; cae la cola vieja. El prorrateo del mes de la baja sólo aplica **si ese mes sobrevive al corte** — si el tope cortó antes, el último mes cobrado va completo (se compara contra `mesesDelPeriodo`, no contra los meses cobrados).
- Aviso: *"Solo se cubren los últimos 60 meses; N meses anteriores quedan fuera."* Lo emite `lineasCapturaMod40`; `computeProyectoMod40` ya no lo duplica.
- El resultado gana `mesesDelPeriodo`, `mesesFueraDelTope` y `topado`.
- Mismo tope en el retro de `computeLey73` (por el default). El test que ancla que las dos pestañas cobren lo mismo se extendió a un caso donde el tope muerde.
- `ENGINE_VERSION` → **2026.08.24.3**.

**Goldens con tope** (nuevos): `base_excel` 62→60 meses = 758,011.34 · `cruza_mes` 63→60 = 760,892.16. `baja_fin_de_mes` (45 meses) y cualquier tramo ≤60 dan el mismo número con y sin tope, con test. Hay casos de 60 justos (no topa; el mes de la baja sí se prorratea) y de 61 (cae uno, aviso en singular).

**Los 4 goldens de proyección que se movieron NO regresan a un valor intermedio: no cambian.** Sus periodos son de 34 y 26 meses, así que el tope no muerde ni antes ni ahora — lo que los movió fue el cambio de ancla y el prorrateo, no el tope. Anotado en el comentario de cada golden. 205 tests en pension-core, 26 en trol-b2c.

**Ojo con los expedientes reales**: de los dos que se probaron, uno va en **57 meses** de periodo (baja 20-dic-2021). Cruza los 60 en ~3 meses y ahí empezará a salir el aviso y a recortarse la línea. No es hipotético.

### Migraciones aplicadas (vivas)

> **Ojo con la numeración:** los números **056–061 están duplicados**. Se aplicaron dos juegos en paralelo desde chats distintos: el de Infonavit (19-ago) y el de ISSSTE (20-ago). Además la 065 se aplicó *antes* que las 056/057 de ISSSTE. Guiarse por `supabase_migrations.schema_migrations`, no por el número.

038–043 aliados · 044 `buscar_personas` · 045 triggers evento secdef · 046–047 CDA · 048 lista de trabajo · 049 slug · 050 rol coach · 051 coaches/citas · 052 mejoravit · 053 bóveda · 054 `mi_expediente` · 055 triggers secdef · **056–061 (juego Infonavit)** prioridad\_capa, v\_expediente saldos, saldo Infonavit del cliente, misión Infonavit, copy, proyectos e inmuebles · **056–061 (juego ISSSTE)** orden en `buscar_personas`, despacho sin CURP, ISSSTE, campos extra, documentos sin duplicar · 062 asesorías Infonavit y relaciones · 063 `miembros.firma` · 064 inventario notariales · 065 nombre/horizonte/archivado · **066** watchdog de consultas · **067** puente destapado · **068** CURP corregible · **069** identidad por confirmar · **070** CURP bloqueada \+ motor · **071** fix del clasificador · **072** carrera del alta · **073** duplicados y fusión · **074** `mi_identidad` · **075** misión confirma tu CURP · **076** códigos de invitación y atribución · **077** el alta resuelve el código \+ puntos al capturar CURP · **078** `search_path` de `registrar_clic` (pgcrypto en `extensions`) · **079** teléfono en el payload de Jordan.

### Sesión 21-ago (tarde) — el parche de UI, ya en producción

Commits **`689f59e`** (tarjeta de identidad en `/mi`, botón Reprocesar en el expediente, pantalla de duplicados) y **`acfbbf4`** (render seguro del resultado de fusión). Ambos desplegados en Vercel desde `main`.

- **Duplicados:** se ejecutaron **5 fusiones reales sin pérdida de datos** (5 expedientes absorbidos sobre 4 conservados; uno era un grupo de tres). Los grupos bajaron de 73 a 69 y quedan **~18 candidatos por revisar** contra 51 de familiares compartiendo teléfono. La pantalla no ofrece fusionar cuando las CURPs difieren: ahí el botón es **“Ligar como familiares”** (`relacionar_personas` con `tipo='familiar'`) más un selector de dueño del número que escribe `contactos.principal`.
- **Identidad:** probado **con los dos proveedores**, que devuelven mensajes distintos para el mismo problema — Belvo dice *"Los datos de entrada no coinciden con RENAPO"* y Jordan dice *"El IMSS no pudo completar la solicitud para esta CURP"*. El clasificador `aplicar_regla_identidad` caza los dos y deja `estatus_identidad = 'por_confirmar'` **sin** generar la oportunidad de $800. Nota para quien siga: todavía no hay eventos `curp_corregida` ni `curp_confirmada_con_problema` en la base, así que el lado de escritura —corregir y confirmar— no ha dejado rastro aún.
- **`curp_duplicada` no es una excepción.** `declarar` emite el evento, deja la CURP anterior y **retorna normal**. No hay error que atrapar: la UI lo detecta releyendo `mi_identidad()` y comparando contra lo que tecleó el cliente. `curp_confirmada` sí levanta excepción, y su texto viene en `error.hint`, no en `message`.
- **`mi_identidad().editable` también es `false` cuando todavía no hay CURP** (`estatus = 'sin_curp'`), no solo cuando está bloqueada. Decidir por `estatus`, nunca por `editable` a secas, o a alguien sin CURP se le dice “ya fue validada”.
- **`fusionar_personas` devuelve `movidas`** con valores mezclados: número de filas por tabla, o el string `'conflicto_conservado'` cuando el update chocó con un índice único. Mandarlo a JSX tal cual truena con *“Objects are not valid as a React child”*. Se aplana con `combinarMovidas()` en `trol-b2c/lib/trol3/duplicados.ts`.

### Sesión 21-ago (tarde) — atribución de links (migraciones 076–078)

Cerró el diagnóstico de `claude/17`: el `ref:` sí llegaba, pero nadie lo resolvía y no había denominador.

- **Registro único `trol3.codigos_invitacion`** con cuatro tipos: `asesor`, `cliente`, `prensa`, `campania`. Códigos del equipo **`lore`, `vero`, `moni`, `andrea`, `raul`**, más **`lorena-455a`** (el link original de Lore, que ya traía 3 altas) y **`elasegurador`** para el QR de la revista.
- **`normalizar_codigo`** limpia el prefijo `ref:`, baja a minúsculas, tira todo lo que no sea `[a-z0-9_-]` y descarta basura (`na`, `null`, `undefined`, `test`, `prueba`, `{{codigo}}`…). Ese era el bug de fondo: `enlazar_legacy` buscaba `^ref:.+` y Tako manda `lorena-455a` **sin** prefijo, así que el `referidor_persona_id` nunca se resolvía.
- **`resolver_codigo`** busca en el catálogo y, si no está, cae a `cliente_por_codigo_referido` para los ~14k códigos históricos de `clientes.codigo_referido`. Un código desconocido se conserva igual como `campania`, para no perder la traza.
- **El alta resuelve el código, y el código manda sobre el canal**: si el código dice `asesor`, eso gana sobre lo que venga en `canal`.
- **`clics_invitacion`** con la IP **hasheada con sal** (nunca en claro), alimentada por `registrar_clic` desde `/i/[codigo]`. Es el denominador que faltaba.
- **`v_embudo_codigo`**: clics → altas → CURP → consulta completada → asesorado, por código.
- **Puntos:** 100 al referidor **al capturar la CURP** del referido (`referido_diagnostico`), y solo si quien refirió es **cliente** — un asesor del equipo se lleva el crédito de origen, no puntos.
- **Backfill de 21 códigos históricos** rescatados de `campania_origen`. Hoy son 22 códigos distintos en `personas.codigo_origen` sobre 1 653 personas.
- **Tako ya manda el canal correcto** (`organico` / `meta` / `referido`); se acabó el `meta` fijo que hacía inservible el campo.

UI en los commits `ed4d55d`: `/i/[codigo]` registra antes de redirigir (con espera acotada, ver gotcha de serverless) y `/trabajo/atribucion` tiene el embudo ordenable, el filtro por tipo y los links del equipo con copiar y QR.

> **La vista esconde los códigos nuevos.** `v_embudo_codigo` es un `FULL JOIN` altas⋈clics: un código aparece solo si ya tuvo ≥1 alta o ≥1 clic, así que los seis links recién creados no salían. El panel los fusiona con `codigos_invitacion` para que se vean en ceros. Y los históricos vienen con `tipo`/`etiqueta`/`miembro` en **null**, no en `'campania'`.

---

## 4\. Pendientes (en el orden acordado)

1. **Atribución** — lo construido ya está en producción; falta cerrarlo:  
   - **Validar el registro de clics con tráfico real.** `clics_invitacion` está en cero: probado end-to-end pero sin un solo clic de verdad todavía. Hasta que entre tráfico, toda la columna clic→alta dice "sin datos de clic".  
   - **Contratación del referido (300 pts, `referido_contrata`)**: no está automatizada. Hoy la carga el administrador a mano. Los 100 de `referido_diagnostico` sí se otorgan solos al capturar la CURP.  
2. **Un teléfono, una CURP**: falta el `principal` **único** por número (índice), el reparto de los 51 casos de familiares y la revisión de los ~18 candidatos que quedan. La UI ya está en `/trabajo/duplicados` (fusionar, ligar como familiares y elegir dueño del número). En Tako: preguntar con quién habla cuando el número tenga más de un expediente activo.  
3. **Fecha de trámite — lo que quedó abierto** (`claude/20`):
   - **n8n Calculadora Trol (B2B)**: el flag aplica/no-aplica que se manda a aliados sigue con la regla vieja de 5 años. Misma detección \+ 12 meses.
   - **Mod 40 vigente (sin baja)**: la ventana ya lo marca (`retroAplica: false`) y lo avisa, pero el motor sigue armando su serie de meses como si fuera retroactivo. Modelarlo como prospectiva pura es trabajo aparte.
   - **UMA por año del tramo**: el spec pedía la UMA de *cada* año de la serie; el motor sigue anclando `salarioRetro` al año de la última cotización. Cambiarlo movería los goldens, así que se dejó y se anota.
   - Barrido automático de fechas óptimas (v2).
   - **Aplicar la migración de escenarios**: `20260824180000_escenarios_snapshot_autorizacion.sql` está escrita y verificada contra la base real dentro de una transacción con `rollback` (19 asserts), pero **no aplicada**. Hasta que se aplique, autorizar desde la mesa devuelve el error de la RPC inexistente.
   - **Nadie lee todavía `trol3.escenarios`**: se escribe y el PDF imprime el id, pero no hay pantalla que liste los escenarios de un expediente ni que compare un snapshot contra el motor de hoy (`recomputarDesdeInputs` ya existe para eso).
4. **Líneas de captura día a día — lo que quedó abierto** (`claude/21`):
   - ~~Confirmar el tope del art. 219~~ — **cerrado**: aplica, `mesesMax` default 60.
   - **El hueco trámite → retiro**: las semanas cuentan para la pensión pero no están cobradas. Es el mismo pendiente de "Mod 40 vigente / prospectiva pura".
   - **`tablas.INPC` vs `trol3.inpc_mensual`**: dos series distintas en el mismo repo. Migrar `computeLey73` a la nueva movería goldens de pensión.
   - **`trol3.inpc_mensual` hay que actualizarla cada mes** con lo que publique INEGI (upsert). Sin eso, todo el tramo reciente sale `proyectado: true` y el motor avisa. El fallback embebido de `pension-core/src/inpc.ts` es del corte 2026-08-24 y se regenera aparte.
   - **`authenticated` tiene grants de INSERT/UPDATE/DELETE sobre `trol3.inpc_mensual`** (sin políticas, así que RLS los bloquea). Vale la pena revocarlos y dejar sólo SELECT.
   - **El desglose mes a mes no se enseña en ninguna pantalla**: `resultado.lineas.detalle` ya lo trae (día, prorrateo, cuota, INPC, las tres piezas), sólo falta la tabla.
5. **Ciclo unificado de oportunidades / embudos** (`claude/12`).  
6. **Agenda propia sobre Google Calendar** (opción 2).  
7. **Estado de cuenta AFORE parseable**.  
8. **Trámites** — fuera de alcance; tarea de Raúl definir el modelo.  
9. `/trabajo/sin-acceso`: mejorar el mensaje cuando entra alguien con sesión de cliente.  
10. Decomisión final de HubSpot y apagar el dual-write a `public`. Son **cuatro** los workflows que cierran contra trol3 y hay que migrar juntos: `Datosbelvo`, `HistoriaBelvo`, `jordan_webhook` y `cliente-refrescar-sisec`.

---

## 5\. Qué conectar en el chat nuevo

**Para producto, base de datos y motor** (lo que se hizo el 21-ago): chat dentro del proyecto Claude "Trol 3.0" \+ conector de Supabase (`orgagfdxygtjiwqvgckw`).

**Para tocar el repo**: usar **Claude Code** desde `~/Claude/Projects/b2c experiencia`, o Cowork con la carpeta conectada. El chat del proyecto **no** tiene acceso a los archivos y no puede generar parches aplicables.

**Cómo arrancar:**

> "Continúo Trol 3.0. Lee `claude/10-handoff-contexto.md`. Quiero trabajar en: \[…\]"

---

## 6\. Notas técnicas / gotchas

- **Flujo de código:** el contenedor de Claude no puede pushear a GitHub (proxy 403). Con Claude Code se edita directo; desde el chat hay que generar `.patch` y aplicarlo con `git apply`, y **eso solo funciona si Claude puede leer los archivos**.  
- `device_bash` (puente a la Mac) no tiene red y no puede borrar archivos (`rm` falla; usar `mv`). Deja un `.git/index.lock`: `rm -f .git/index.lock && git add … && git commit`.  
- La raíz git es `b2c experiencia`; los paths salen como `trol-b2c/…` y `trol3_backend/…`.  
- **El repo puede estar atrás de lo desplegado.** Antes de redesplegar una edge function, comparar con `get_edge_function`.  
- Desde SQL **no se pueden borrar objetos de Storage** (`storage.protect_delete`); usar la Storage API.  
- Para probar webhooks externos desde el sandbox: `curl` bloqueado, pero `extensions.http(...)` sale.  
- Vercel deploya al pushear a `main`. Si muestra un commit viejo: `git fetch origin && git push`.  
- **Los binarios de `trol-b2c/node_modules/.bin` pueden apuntar al checkout viejo** `~/Documents/Claude/Projects/b2c experiencia/`. Cuando pasa, `npx next` y `npx tsc` corren desde **esa otra copia** y el build carga **dos React distintos**: revienta al prerenderizar con `TypeError: Cannot read properties of null (reading 'useContext')` en `/`, `/404`, `/500` y `/_not-found`. Se ve con `find node_modules/.bin -maxdepth 1 -type l -lname '*Documents*'`; se arregla con `rm -rf node_modules/.bin && npm install` (quedan relativos: `../next/dist/bin/next`). Primo del mismo problema en `node_modules/@trol/pension-core`, que además tiene una docena de symlinks huérfanos al lado (`.broken`, `.f`, `.zz`…) — inertes, pero confunden.  
- **Un `tsc --noEmit` limpio puede ser mentira** si faltan dependencias o el binario es el equivocado. Verificar con `node -e "require.resolve('@trol/pension-core')"` y, ante la duda, inyectar un error a propósito para confirmar que el typecheck sí muerde.  
- Política de proveedor: `belvo_first` para canales del bot; `jordan_first` para linkedin/referido\_vip, para asesores y para el alta desde la plataforma.  
- **Cableado en n8n: el cierre va en paralelo, nunca en serie.** El nodo que cierra la consulta en trol3 se cuelga *en paralelo* de la rama de estado, no detrás de un nodo de notificación. Si el de notificación truena, se lleva el cierre por delante y la consulta se queda sin motivo. Pasó **dos veces** el 21-ago.  
- **Expresiones en n8n: el `=` de `={{ … }}` es implícito en la interfaz.** Cuando el campo está en modo *Expression*, ese `=` ya lo pone n8n; pegarlo tal cual mete un `=` literal. Y cualquier carácter fuera de las llaves —**incluido un espacio al final**— convierte la expresión en plantilla de string: un booleano llega como `"false "` y el nodo IF truena con *"Wrong type"*. Verificar siempre el **valor evaluado** que n8n enseña al lado del campo, no el texto que escribiste.  
- **`notificar_cliente` es responsabilidad de cada workflow.** trol3 lo manda en el payload, pero **ningún workflow lo respeta por defecto**. Al agregar un canal de salida al cliente hay que poner el candado explícito, o los reprocesos silenciosos dejan de serlo.  
- **`digest()` de pgcrypto vive en el esquema `extensions`.** Una función con `search_path = trol3, public` truena al usarlo con `42883: function digest(...) does not exist`. Y truena **aunque la rama del `CASE` no se tome**: Postgres resuelve la referencia al *planear*, no al ejecutar, así que `case when p_ip is null then null else encode(digest(...)) end` falla incluso con `p_ip` nulo. Fue exactamente lo que dejó a `registrar_clic` sin insertar nada (arreglado en la **078**: `search_path` con `extensions` y `extensions.digest(...)` calificado).  
- **`exception when others then return` convierte el fallo en silencio absoluto.** Es lo que hizo que el bug anterior tardara en verse: la ruta redirigía bien, la RPC devolvía sin error y la tabla se quedaba vacía. Si una función es best-effort, que al menos deje `raise warning` antes de tragarse la excepción. Con este patrón viven hoy `registrar_clic`, `tg_puntos_referidor` y `tg_public_procesos`.  
- **`pedir_consulta` dispara de verdad.** `tg_consulta_despachar` hace el POST al proveedor en el mismo INSERT: llamarla "para probar" cuesta dinero y manda una consulta real.  
- **Hay DOS series INPC en el repo y no son la misma.** `tablas.INPC` (Excel de junio, arranca en 2021-12) alimenta las actualizaciones de `computeLey73`; `inpc.ts` (espejo de `trol3.inpc_mensual`, arranca en 2015-01) alimenta la línea de captura. Difieren desde 2024-05. Antes de "arreglar" una comprobar cuál usa el número que estás mirando.
- **`lineasCapturaMod40` es la ÚNICA aritmética del IMSS que no está forkeada.** `trol-b2c/lib/imss/mod40-lineas.ts` es un `export *` de pension-core a propósito. Si alguien la copia para "ajustar un detalle", las dos pestañas de la calculadora vuelven a cobrar distinto.
- Los datos de catálogo **no los atrapa ningún test**: un flag mal sembrado solo se ve simulando.
- **`historial[].salario_base` llega como STRING en unas semillas y como NUMBER en otras** (`"2828.5"` vs `1500`). Una comparación `typeof x === 'number'` deja el campo en null sin fallar: fue exactamente lo que mató el aviso del art. 65 hasta que se corrió contra un expediente real. Todo lo que lea el historial crudo tiene que coercionar.
- **El `limite_inscripcion_mod40` de la SEMILLA son 5 años; el del EXPEDIENTE son 12 meses.** trol3 lo corrige en `trol3.datos`, así que quien tenga expediente debe leerlo de `v_mejor_dato` — pasar el de la semilla como "mejor dato" pisa la regla correcta con la vieja. En las consultas de aliados no hay expediente: ahí manda el cálculo local sobre el historial y **no** se pasa límite.

