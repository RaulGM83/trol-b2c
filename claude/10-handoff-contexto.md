# Trol 3.0 — Contexto para continuar en un chat nuevo

Punto de entrada único. Actualizado **21-ago-2026** (cierre de la sesión de ese día). Los detalles de cada tema viven en los docs `claude/11` … `claude/17`; aquí está el mapa.

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

### Migraciones aplicadas (vivas)

> **Ojo con la numeración:** los números **056–061 están duplicados**. Se aplicaron dos juegos en paralelo desde chats distintos: el de Infonavit (19-ago) y el de ISSSTE (20-ago). Además la 065 se aplicó *antes* que las 056/057 de ISSSTE. Guiarse por `supabase_migrations.schema_migrations`, no por el número.

038–043 aliados · 044 `buscar_personas` · 045 triggers evento secdef · 046–047 CDA · 048 lista de trabajo · 049 slug · 050 rol coach · 051 coaches/citas · 052 mejoravit · 053 bóveda · 054 `mi_expediente` · 055 triggers secdef · **056–061 (juego Infonavit)** prioridad\_capa, v\_expediente saldos, saldo Infonavit del cliente, misión Infonavit, copy, proyectos e inmuebles · **056–061 (juego ISSSTE)** orden en `buscar_personas`, despacho sin CURP, ISSSTE, campos extra, documentos sin duplicar · 062 asesorías Infonavit y relaciones · 063 `miembros.firma` · 064 inventario notariales · 065 nombre/horizonte/archivado · **066** watchdog de consultas · **067** puente destapado · **068** CURP corregible · **069** identidad por confirmar · **070** CURP bloqueada \+ motor · **071** fix del clasificador · **072** carrera del alta · **073** duplicados y fusión · **074** `mi_identidad` · **075** misión confirma tu CURP.

### Sesión 21-ago (tarde) — el parche de UI, ya en producción

Commits **`689f59e`** (tarjeta de identidad en `/mi`, botón Reprocesar en el expediente, pantalla de duplicados) y **`acfbbf4`** (render seguro del resultado de fusión). Ambos desplegados en Vercel desde `main`.

- **Duplicados:** se ejecutaron **5 fusiones reales sin pérdida de datos** (5 expedientes absorbidos sobre 4 conservados; uno era un grupo de tres). Los grupos bajaron de 73 a 69 y quedan **~18 candidatos por revisar** contra 51 de familiares compartiendo teléfono. La pantalla no ofrece fusionar cuando las CURPs difieren: ahí el botón es **“Ligar como familiares”** (`relacionar_personas` con `tipo='familiar'`) más un selector de dueño del número que escribe `contactos.principal`.
- **Identidad:** el flujo se probó con un **caso RENAPO real** (hoy hay 1 persona en `estatus_identidad = 'por_confirmar'`). Nota para quien siga: todavía no hay eventos `curp_corregida` ni `curp_confirmada_con_problema` en la base, así que el lado de escritura —corregir y confirmar— no ha dejado rastro aún.
- **`curp_duplicada` no es una excepción.** `declarar` emite el evento, deja la CURP anterior y **retorna normal**. No hay error que atrapar: la UI lo detecta releyendo `mi_identidad()` y comparando contra lo que tecleó el cliente. `curp_confirmada` sí levanta excepción, y su texto viene en `error.hint`, no en `message`.
- **`mi_identidad().editable` también es `false` cuando todavía no hay CURP** (`estatus = 'sin_curp'`), no solo cuando está bloqueada. Decidir por `estatus`, nunca por `editable` a secas, o a alguien sin CURP se le dice “ya fue validada”.
- **`fusionar_personas` devuelve `movidas`** con valores mezclados: número de filas por tabla, o el string `'conflicto_conservado'` cuando el update chocó con un índice único. Mandarlo a JSX tal cual truena con *“Objects are not valid as a React child”*. Se aplana con `combinarMovidas()` en `trol-b2c/lib/trol3/duplicados.ts`.

---

## 4\. Pendientes (en el orden acordado)

1. **Atribución de links y campañas** (`claude/17`). Diagnóstico cerrado el 21-ago:  
   - El `ref:` **sí llega**: Tako lo manda a `/alta` como `campania` y queda en `personas.campania_origen`. El link de Lore produjo 3 personas el 20-ago.  
   - Pero **`enlazar_legacy` busca `^ref:.+`** y Tako manda `lorena-455a` sin prefijo → el `referidor_persona_id` nunca se resuelve.  
   - Tako manda `canal='meta'` fijo, así que el canal no sirve para nada.  
   - No hay tabla de clics: no sabemos el denominador.  
   - Falta: normalizador de código, canal `asesor` (Lore es del equipo: crédito de origen, sin puntos) vs `referido` de cliente (puntos **al capturar CURP**), tabla `clics_invitacion`, ruta `/i/[codigo]` que registre, panel por código y canal de prensa para El Asegurador.  
2. **Un teléfono, una CURP**: falta el `principal` **único** por número (índice), el reparto de los 51 casos de familiares y la revisión de los ~18 candidatos que quedan. La UI ya está en `/trabajo/duplicados` (fusionar, ligar como familiares y elegir dueño del número). En Tako: preguntar con quién habla cuando el número tenga más de un expediente activo.  
3. **Ciclo unificado de oportunidades / embudos** (`claude/12`).  
4. **Agenda propia sobre Google Calendar** (opción 2).  
5. **Estado de cuenta AFORE parseable**.  
6. **Trámites** — fuera de alcance; tarea de Raúl definir el modelo.  
7. `/trabajo/sin-acceso`: mejorar el mensaje cuando entra alguien con sesión de cliente.  
8. Decomisión final de HubSpot y apagar el dual-write a `public`.

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
- **`pedir_consulta` dispara de verdad.** `tg_consulta_despachar` hace el POST al proveedor en el mismo INSERT: llamarla "para probar" cuesta dinero y manda una consulta real.  
- Los datos de catálogo **no los atrapa ningún test**: un flag mal sembrado solo se ve simulando.

