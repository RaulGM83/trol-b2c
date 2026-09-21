# Trol 3.0 — Contexto para continuar en un chat nuevo

Punto de entrada único. Actualizado **21-sep-2026 (noche)**. Los detalles de cada tema viven en los docs `claude/11` … `claude/82`; aquí está el mapa.

---

## 1\. Qué es Trol 3.0

Herramienta de asesoría pensional (IMSS) para cliente y asesor. Objetivo: consolidar lo aprendido en los primeros 2 años y prepararse para escalar. Empresa: El Trol Financiero.

Instrucciones de trabajo del proyecto (respetarlas):

- Tomar tiempo para pensar alternativas; no explicar en exceso en el chat.
- Preguntar/cuestionar lo necesario antes de decidir.
- No crear archivos/producto hasta definirlo juntos; proponer los pasos primero.
- Raul pide siempre el comando de terminal listo para pegar (build + `git add/commit/push`).

---

## 2\. Arquitectura (dónde vive cada cosa)

- **Base de datos:** Supabase Postgres, proyecto `orgagfdxygtjiwqvgckw`. Esquema principal **`trol3`** expuesto en la Data API. RLS con `trol3.es_miembro()`, `tiene_rol('admin')`, `current_miembro_id()`, `current_persona_id()`, `current_aliado_id()`. Roles (`trol3.rol_miembro`): `recepcionista`, `cabecera`, `especialista`, `admin`, `coach`. Raul: miembro `0dfd18d7-2b1e-4627-905e-6f75d347cbcf`, auth_user `884d83e9-688a-42ff-a037-460458627bdd`, persona `0faa2a0b-3177-4d6d-bf3d-affe63e59787`. Miembros: Raúl, Andrea Estrada, Mónica García, Lorena Rocha, Verónica Cervantes.
  - **Credenciales de clientes** (089): `trol3.credenciales` cifrada en Vault.
  - **Contactos** (130, `claude/57`): `trol3.contactos`, `guardar_contacto(...)`.
  - **Checklist por oportunidad** (090): `checklist_catalogo` (`quien`: `cliente`/`equipo`) + `oportunidad_checklist`, RPC `marcar_checklist`.
  - **Atribución** (076–077, 092): `codigos_invitacion`, `clics_invitacion`, `v_embudo_codigo`. Detalle `claude/27`.
  - **Nómina IMSS** (093–096): `registrar_nomina_imss`. Detalle `claude/29`.
  - **Oportunidades** (097–098, 133/133b, 136/137, 148, 158, **167**): `evaluar_persona` detecta y cierra `no_aplica`; llama a `evaluar_gestoria` antes de ese cierre (parche en vivo; conservar). **Principio (Raul): una oportunidad es un servicio que ejecuta Trol o un aliado; lo que es parte de la asesoría va en "Orden de situación".** `catalogo_oportunidades.plantilla` = plantilla con la que se reabre el chat; `nombre_cliente` = cómo se le nombra al cliente; `frase_cliente` **DEPRECADA (170): manda la ficha**. **167: `oportunidades.propuesta jsonb {texto, pension_con_plan, costo, enviada_por, enviada_en}`** + `enviar_propuesta(op, texto, pension, costo)`.
  - **Parada del cliente** (157/158/160/167, `claude/70`): **`parada_de(uuid)`** / **`mi_parada()`** / **`parada_cliente(persona)`** (la que lee `/trabajo`). Cinco paradas: 1 Tu información · 2 Tu diagnóstico · 3 Tu plan · 4 En trámite · 5 Tu pensión. Devuelve `parada`, `sub`, `toca` (`cliente`/`trol`), `frase`, `titulo`, `texto`, `pie`, `cta`, `boton`, `mensaje_wa`, `oportunidad` (con `pension_con_plan`, `costo`, `propuesta_en`), `experto`, `hallazgos[]`, `en_orden`, `tramite[]`, `aviso`. En parada 3 **gana el texto de la propuesta del asesor**.
    - "Esperando" sólo cuenta `imss_historial` de las últimas 24 h. `situacion_entendida` no es hallazgo. "La más importante": primero lo que pone en orden (nivel 1 + `reactivacion_mod10`), luego por valor. Oportunidad `detectada`: nombre sin pesos.
  - **Mi cartera** (**164–166, 174**, `claude/74`): `_cartera_fila(uuid)`, `cartera_de(miembro, vista)`, `mi_cartera(vista)`, `cartera_por_activar(nombre, limit)`. Bandejas **Me toca a mí** (motivos: `escribio` · `cita` · **`tarea`** (174: pendiente vencido; manda el responsable de la tarea) · `tramite` · `contactar` · `propuesta` · `abrio_cuenta`) / **Le toca al cliente** / **Por activar** (grupos, 20 más calientes, lote ≤ 20). 165: tope 60 candidatos + CTE materializada (timeout). 166: "propuesta sin respuesta" exige experto asignado.
  - **Plantillas con candado** (**167**): `trol3.config.plantilla_horas_minimo='24'` (**una plantilla por persona al día**), `puede_plantilla(persona)` → `{ok, motivo: no_contactar|sin_telefono|muy_pronto, ultima, horas}`.
  - **Asesoría en cinco pasos** (**168, 169**, `claude/76`–`79`): tabla `trol3.asesorias` (una abierta por persona; `paso`, `pasos_vistos`, `escenario_recomendado`, `mostrar_costos`, `notas`, `diagnostico_id`, **`preparacion`**, **`copiloto`**). `asesoria_abrir`, `asesoria_marcar` (al cerrar → etapa `asesorado` + `evaluar_persona_seguro`), `asesoria_ligar_diagnostico`, **`asesoria_vista(persona)`** = todo lo que pintan el asesor y "Presentar": cliente, números, experto, parada, hallazgos, oportunidades (con `frase`, `ficha`, `propuesta`), historial, escenarios, sesión, `diagnostico {estado, estrategia, acuerdos, ligado, pagado}`, `pendientes[]`, `fichas[]`.
  - **Fichas de conocimiento** (**170–173**, `claude/73`, `80`, `81`): `trol3.fichas` (T1–T4 tema, O1–O11 oportunidad; `oportunidades text[]`; secciones en markdown ligero; **`solo_asesor` nunca sale al cliente**), `fichas_historial` (texto anterior de cada edición). **Edita sólo admin.** `fichas_para_redactor(persona)` = frase + "cómo explicarlo" de sus oportunidades abiertas. **`fichas_propuestas`** = bandeja de objeciones (origen `reunion`/`asesor`; `ficha_codigo null` = falta escribir la ficha); `fichas_proponer(...)`, `fichas_propuesta_decidir(...)` (admin; aprobar = se agrega a "Qué te van a preguntar").
  - **Segmentos de gestoría** (`v_segmentos_gestoria`, `v_segmento_mod10_viraal`). **Campañas** (099–108b): `v_segmentos_campana`, `c1`–`c5`, `r1a`…`r_menor59`. **Pausadas desde ~11-sep; el equipo trabaja gestoría y reactivación Mod 10.**
  - **Datos a utilizar** (109–109c), **Asesoría Infonavit** (110–112), **Escenarios** (113–121), **Tareas** (114), **Diagnósticos** (115, 119–121, 139), **Redactor** (117–120; desde 170 recibe las fichas del caso como guía de enfoque).
  - **Aliados referidores** (122–128b): ver §2bis.
  - **Consultas** (101, 153–156): Belvo **caché** ($2.50), Jordan **en vivo** ($13). `pedir_consulta(...)`. Tipos vivos: `imss_historial`, `cda`, `issste`, `infonavit`, `calculo_base`, `imss_ventanilla`, `acta`. 155/156: `actualizar_imss_mia()` cobra 50 puntos. La constancia subida termina como `consulta_completada` de `calculo_base`/`sisec`.
  - **Cobros por chat** (163, `claude/71`): `registrar_cobro(persona, producto, medio, referencia)`; si es extracción **pide la consulta de verdad**. Candado 10 min.
  - **Documentos para el cliente** (159): actas ocultas al cliente; `mi_solicitar_documento()` ya no dispara `pedir_consulta`.
  - **Jordan on demand** (132): `lib/jordan/`, `JORDAN_API_KEY`. Ventanilla $52, Actas $19.50.
  - **Citas** (134): `link_citas_para(p_persona)`; workflow `S6BxXRbTgundrEwe`.
  - **Reuniones / Granola** (135, **172**, `claude/62`): `trol3.reuniones` (**0 filas: el webhook nunca se registró** — ver §4). `extraerPropuestas` propone datos/tareas/notas y, desde 172, **objeciones para las fichas** (misma llamada).
  - **Eventos** (140/141, 146, 150, 152): lista blanca al webhook; los viejos en `trol3.eventos_archivo` — **toda medición histórica lee las dos tablas.**
  - **Conversación con Tako** (142), **No interrumpir** (147), **Link corto** (149: el uso del mi_link NO emite evento; queda en `public.b2c_magic_tokens`).
  - **Avisar al cliente** (150/151/153/154) y **lazo de vuelta** (160, **apagado**: `trol3.config.avisar_numeros_actualizados='off'`). Principio: **Tako avisa resultados, no le hace eco a las acciones.**
  - **Embudo de `/mi`** (162): `trol3.v_embudo_mi` (cerrada a `authenticated`; la página la lee con el cliente de servicio).
  - **Bajas**: `public.registrar_baja`. **Cola de envíos**: `trol3.cola_envios`. **Insertar filas = enviar.**
- **Edge Function `api-trol`** (header `x-trol-key`), versión 22. Rutas: `/alta`, `/expediente`, `/declarar`, `/declarar-varios`, `/interaccion`, `/handoff`, `/consulta`, `/consulta/resultado`, `/mi-link`, `/cita`, `/eventos/pendientes`, `/eventos/ack`, **`/avisar`** (system-event; cae a plantilla sólo si le pasan una). ⚠️ **Se despliega SIEMPRE con `verify_jwt = false`.**
- **App web `trol-b2c`** (Next.js 14, Tailwind). Repo **`RaulGM83/trol-b2c`**, Vercel Pro. Carpeta local `~/Claude/Projects/b2c experiencia`. **Último commit conocido: `84449e0`** (4b); la fase 5 quedó escrita y con `tsc` limpio, pendiente de build + commit de Raul.
  - **`/mi` = "tu cuenta Trol"** (`claude/70`): pestañas **Mi pensión · Mis datos · Beneficios · "Mi chat"**. `LoQueSigue` muestra la propuesta del asesor (texto, pensión con plan, costo). Lukas no dice montos: la cuenta es el único lugar donde viven los números.
  - **`/trabajo`** (rehecho el 21-sep, `claude/72`–`82`):
    - **Menú:** **Mi cartera · Conocimiento · Aliados · Negocio ▾ · Gestión ▾** + buscador. El logo lleva a Mi cartera.
    - **Mi cartera** (`/trabajo/cartera`): pestañas **Clientes** (bandejas) · **Mis pendientes** (= `/trabajo/tareas`, fuera del menú). Contacto de un clic (`registrarContacto`), "Mandar plantilla" con candados, lote de 20.
    - **Negocio ▾**: Operación (= `/trabajo/hoy`: citas del equipo, reuniones sin expediente, requiere acción, pulso B2C) · Oportunidades (= `/trabajo/lista`) · Embudo · **Embudo de /mi** (`/trabajo/embudo-mi`, nuevo) · Actividad · Todos los clientes (= `/trabajo`, que también es la página de resultados del buscador). **No se borró ninguna ruta.**
    - **Expediente `/trabajo/p/[id]`**: pestañas **Relación** (default: parada del cliente, registro rápido, Activar, **Enviar propuesta**) · **Asesoría** · *Herramientas* (calculadoras, infonavit, diagnóstico) · *Trámite* (oportunidades, documentos, **viraal = mesa de financiamiento: es back para Viraal, NO asesoría**) · *Datos* (resumen, bitácora). `calcPanel`/`infPanel`/`mesaPanel`/`diagPanel`: una pieza, dos puertas.
    - **Asesoría** (`components/trol3/AsesoriaSesion.tsx`, `lib/trol3/asesoria.ts`): 1 Su situación (números, dolor, **historia laboral con alta y baja al día**, huecos sin cotizar) · 2 Lo que encontramos (frase de la ficha + botón "Ficha O5") · 3 Escenarios (caminos cerrados; **calculadora e Infonavit se abren dentro del paso**, ancho completo) · 4 Recomendación (armar/ligar diagnóstico, "el porqué" = `estrategia_oportunidades`, Enviar propuesta con números sugeridos) · 5 Acuerdos (= `DiagnosticoPanel`; **"Entregado" exige beneficio `diagnostico_avanzado`**). Navegación libre. Cerrar → `asesorado`.
    - **Modo "Compartir pantalla"** (`lib/trol3/compartir.tsx`): en la videollamada se comparte la pantalla de trabajo. Esconde guion, notas, copiloto, fichas, valores internos y **el PnL del aliado en Infonavit** (regla de Raul: todo lo demás es transparente con el cliente); pasos 4–5 en sólo lectura.
    - **Presentar** (`/presentar/[id]?paso=n`): láminas limpias fuera del layout; nunca honorarios, valor, nombre interno ni notas; costos sólo si `mostrar_costos`.
    - **Conocimiento** (`/trabajo/fichas`): biblioteca con buscador, editor por secciones (admin), bandeja **Por aprobar**, "+ Me preguntaron algo que no está aquí".
    - **Copiloto** (`lib/trol3/copiloto.ts`, `Copiloto.tsx`): "Prepárame la asesoría" + 10 preguntas preparadas por paso. **Sin chat libre.** Sólo fichas + expediente, cita `[O5]` (botón), nunca calcula cifras, "No está en las fichas." Se guarda en la sesión (se paga una vez). `MODELO_REDACTOR`, `OPENAI_API_KEY`.
    - Pestaña Documentos: **"Registrar un cobro"** (`CobroPanel`, evento `pago_recibido`).
  - **`/checkout`**: `buscarProducto()` vs `getProducto()`; `?p=` desconocido → "Esto se paga por tu chat de Trol".
  - **PDF del diagnóstico** (139, `claude/48`–`50`).
- **Auth (Supabase)**: SMTP Resend, PKCE. **Motor `pension-core`**: `FACTOR_RETIRO = 0.81` sólo RCV. **Storage:** bucket privado `expediente`. **Legacy `public`**: dual-write sigue.
- **n8n cloud**: Calculos (`6Ry0jm62ahFNmibR`), citas GCal (`S6BxXRbTgundrEwe`), nudges + cola (`WGweHnnPEeWMZsUg`), avisos a asesoras (`aygBu2V6cpnL3NEF`), Identidad Belvo v2, Waterfall PDF, ISSSTE, Portal Consulta Processor, B2B Gateway.
- **Bot Tako**: Lukas **prompt v20.3 pegado**; **`tako/prompt-lukas-v20.4.md` escrito y SIN PEGAR** (agrega a §15.6 `numeros_actualizados`, `pago_recibido` y `oportunidad_nueva` con `propuesta: true`). Regla dura: nunca montos.

### 2bis. Aliados: dos relaciones con la misma palabra (`claude/51`)

| | Aliado que **compra** | Aliado que **refiere** |
|---|---|---|
| ¿De quién es el cliente? | Del aliado. | **De Trol desde el día uno.** |
| Dónde | `/trabajo/aliados` | `/trabajo/aliados/referidores` y `/aliado` |
| Tablas | `consultas_aliados` | `trol3.aliados`, `referidos`, `comisiones` |

La comisión sale del `honorario_trol` de la oportunidad ganada; el aliado no ve la base ni el % (127). Aliados vivos: Humberto Obregón (HOV, 20%) y `raul-prueba`. **Viraal** ejecuta `reactivacion_mod10`, `mod40_*`, `pension_hoy`, `credito_pension`. **Astuto** ejecuta Infonavit hoy y AFORE (con asesor certificado).

---

## 3\. Estado a hoy

- Hasta 19-sep: ver `claude/11`–`claude/68`. 20-sep: `claude/69` (canales y plantillas), `claude/70`–`71` (**`/mi` rehecha**, Cobrado).
- **21-sep — `/trabajo` rehecho de punta a punta** con la lógica de `/mi` (`claude/72` diseño):
  1. **Mi cartera** (164–166, `claude/74`) · 2. **Relación + Enviar propuesta + lote + una plantilla al día** (167, `claude/75`) · 3a. **Asesoría en cinco pasos + Presentar** (168, `claude/76`) · 3c. **Recomendación, acuerdos, diagnóstico ligado y candado de entrega** (169, `claude/77`) · 3b. **Herramientas dentro del paso 3** (`claude/78`) · **Modo Compartiendo + historia laboral exacta** (`claude/79`) · 4a. **Fichas** (170–171, `claude/73`, `80`) · 4b. **Copiloto + fichas que aprenden** (172–173, `claude/81`) · 5. **Menú Negocio, Mis pendientes, tareas vencidas en la cartera** (174, `claude/82`).
- Wireframes: `/mi` https://claude.ai/artifact/Te6SXPsewasWvyGwojXmRp · `/trabajo` https://claude.ai/artifact/Y3j8gAddx6dKcPbEAAnj5p

### Lo que dicen los números

`v_embudo_mi`: semana 7-sep **63 recibieron → 47 abrieron (75%) → 6 hicieron algo (13%)**. **Abrir no es el problema; actuar sí.** Base trabajada (35 días, ~390 personas): **62% en parada 2**, 85% con algo detectado, 89% sin experto asignado — para eso es "Por activar".

### Plantillas de WhatsApp (aprobadas el 20-sep, todas Marketing)

`trol_cuenta_lista`, `trol_reabrir`, `trol_oportunidad`, `trol_op_mod40`, `trol_op_semanas`, `trol_op_infonavit`, `trol_op_gestion`, `trol_op_reactivarcuenta`. Reglas: una sola variable (`{{1}}` = link, nunca al principio ni al final) y botón de **respuesta rápida**.

### Migraciones aplicadas (vivas)

038–163 (ver versiones anteriores) · **164–166** cartera · **167** propuesta + candado de plantilla + `parada_cliente` · **168** asesorías · **169** asesoría termina en algo · **170** fichas · **171** las 15 fichas v1 · **172** copiloto + bandeja · **173** índice único completo (PostgREST no infiere índices parciales en `ON CONFLICT`) · **174** tareas vencidas en la cartera.

Todas exportadas a `trol3_backend/migrations/` y verificadas por MD5 (`md5(array_to_string(statements, E'\n'))` vs `md5sum` del archivo **sin** salto final extra). 158–160, 167, 169, 170 y 174 parchan funciones vivas con `replace()` sobre `pg_get_functiondef` y ancla contada: el archivo es el parche, no la función completa.

Faltan de exportar: los `create or replace` del 4-sep de `public.registrar_baja` y `trol3.handoff`.

---

## 4\. Pendientes (en el orden acordado)

### Lo siguiente (Raul, 21-sep): **Granola — empieza a usarlo esta semana**

1. `trol3.reuniones` tiene **0 filas**: cargar `GRANOLA_API_KEY` (workspace) en Vercel, registrar el webhook (curl en `claude/62`), cargar `GRANOLA_WEBHOOK_SECRET`, redeploy; prueba real con una reunión agendada por la liga de citas. Revisar de punta a punta: casado con cita/persona, propuestas en el expediente, "sin expediente" en Negocio → Operación, y **objeciones llegando a la bandeja de Conocimiento**.

### Para encender (todo está construido; falta un gesto de Raul)

2. **Build + commit de la fase 5** (comando en el chat del 21-sep).
3. **Pegar `tako/prompt-lukas-v20.4.md` en Tako** — antes de que el equipo use "Cobrado" o "Enviar propuesta" (si no, a Lukas le llegan como evento desconocido).
4. Después: `update trol3.config set valor='on' where clave='avisar_numeros_actualizados';`
5. **Probar con el número de Raul** lo que manda WhatsApp real y nunca se ha probado de punta a punta: "Mandar plantilla", "Enviar propuesta", "Cobrado". (`/avisar` jamás ha enviado una plantilla con éxito: todo lo registrado es `system_event`.)
6. **Probar lo que usa IA** (cuesta tokens): "Armar su diagnóstico" con fichas, "Prepárame la asesoría", una pregunta preparada. Vigilar que "¿Esperar o tramitar ya?" y "¿Qué caminos le armo?" no den montos.
7. **Correr una asesoría completa de prueba** con "Presentar" y con "Compartir pantalla"; enseñarle al equipo Mi cartera, Cobrado y "+ Me preguntaron algo…".
8. Si nadie extraña Hoy / Lista de trabajo / Clientes en el menú en un par de semanas: decidir si se borran rutas.

### De `/trabajo` (detalles que quedaron abiertos)

9. Hay al menos un diagnóstico **entregado sin beneficio registrado** (8-sep): el candado sólo aplica a entregas nuevas; si se entrega de cortesía, habilitar el beneficio antes.
10. Las tareas `origen='diagnostico'` las ve el cliente en "Presentar": redactarlas presentables.
11. Al compartir pantalla siguen a la vista el menú y el buscador de `/trabajo`; si estorba, esconder el layout en ese modo.
12. Fichas: **O9** conserva `[CONFIRMAR sección]`; **O5** conserva "25% anual sobre saldo insoluto" (Raul lo quitó de O4); fuera por ahora ISSSTE, portabilidad, viudez/invalidez, seguros, Bienestar; honorarios fuera de gestoría = "depende del caso". El texto de fichas que leyó el redactor no queda versionado.
13. Copiloto: sin límite de uso por asesor; chat libre se reconsidera cuando las fichas tengan más objeciones reales.
14. Cartera: `chat_abierto` es un proxy (`tako_visto_en` < 24 h). La sesión podría aportar el motivo "asesoría dada, falta propuesta".
15. `/trabajo` genera un mi_link **por cada carga de expediente** (~750 tokens/semana): generarlo al copiar, no al pintar.

### De `/mi` (`claude/70`)

16. **Medir** `v_embudo_mi` cuando vuelvan las campañas (¿`pct_actua` sube de 0–13%?). Ya hay pantalla: Negocio → Embudo de /mi.
17. Alinear `mi_mejor_jugada()` con `parada_de()`. 18. Subir documento desde el renglón del trámite (parada 4). 19. Pestañas Puntos y Asesorías con copy original. 20. Pensionados ven "Hoy te tocaría" (menos prioritario).

### De cobros (`claude/71`)

21. Checkout completo sólo cuando haya demanda. 22. **4 órdenes de Diagnóstico Avanzado ($500) abandonadas desde agosto**: vale una llamada.

### De antes

23. Recategorizar plantillas a Utility (empezar por `trol_reabrir`). 24. **Rotar la API key de Tako** (texto plano en workflow archivado), `JORDAN_API_KEY` y `GRANOLA_API_KEY`. 25. Vigilar el contador de avisos `consulta_lista`. 26. Probar los correos a asesoras. 27. ~860 interacciones históricas que dicen "envió" sin haber enviado. 28. Tako §8 manda al link viejo de citas. 29. Jordan en producción (ventanilla y acta de prueba; `JORDAN_WEBHOOK_SECRET`). 30. Gestoría: ganar una `recuperar_ley73` de prueba; campaña para las 248. 31. Reactivación Mod 10 (Viraal): cobro y comisión **dependen del aliado y del proyecto**; Excel desde `v_segmento_mod10_viraal`. 32. "Agendar por el cliente" desde el expediente. 33. Aliados: cerrar la prueba con Humberto. 34. Campañas (pausadas): C5; C1 vs C2; C1 resto, C3–C4, r1a/r1b/r4. 35. Seguridad n8n (`x-api-key` en Waterfall PDF Jordan y Fase 4 dual-write; `Authorization` en Identidad Belvo v2; 10 workflows sin auditar). 36. Repo: exportar funciones del 4-sep. 37. Decomisión final: dual-write a `public`, DKIM, 4 tablas sin RLS. 38. Datos: `dato_fresco`, `nombre_dudoso`, ventanas Mod 40, nómina residuales.

---

## 5\. Qué conectar en el chat nuevo

Proyecto "Trol 3.0" + conector Supabase (`orgagfdxygtjiwqvgckw`) · Cowork con la carpeta `b2c experiencia` · n8n MCP · Chrome para Tako/Vercel · Drive.

> "Continúo Trol 3.0. Lee `10-handoff-contexto.md`. Quiero trabajar en: […]"

---

## 6\. Notas técnicas / gotchas

- ⚠️ **`api-trol` se despliega SIEMPRE con `verify_jwt = false`.** Con `true` el gateway contesta `401` antes de ejecutar nada y el bot entero se cae **sin un solo error en los logs** (20-sep: 3 h 48 min). `supabase functions deploy api-trol --no-verify-jwt --project-ref orgagfdxygtjiwqvgckw`
- **Antes de citar un número, comprobar qué mide el evento.** Mirar el código que lo emite, no su nombre; para historia, leer `eventos` **y** `eventos_archivo`.
- **Un workflow "exitoso" no prueba nada.** **Una bitácora que miente cuesta meses** (registrar `enviado: 1/0` con el error).
- **Probar funciones con efectos (dinero, WhatsApp) con rollback**: `do $$ … raise exception 'ROLLBACK_OK %', resultado; end $$;`. Para simular sesión: `perform set_config('request.jwt.claims', '{"sub":"<auth_user>","role":"authenticated"}', true);`
- **Carpeta correcta**: la que termina en `raulgallegomuller--Claude--Projects--b2c experiencia`. El repo git es la carpeta raíz; la app vive en `trol-b2c/`. **La copia local de `claude/10-handoff-contexto.md` es de agosto: la buena es la del proyecto.**
- **Git desde Cowork**: sin identidad ni red; **commit y push los hace Raul**. Cada `git status`/`git log` deja `.git/index.lock` huérfano: `mv -n` a `_to_delete/`; el comando que se le pasa a Raul lleva `rm -f .git/index.lock`.
- **`node_modules` compilado para macOS**: `next build` falla en la VM. **`tsc` sí corre**: `timeout 175 node node_modules/typescript/bin/tsc --noEmit -p .` (~2 min), filtrar por archivo; `TS2307 @trol/pension-core` y `TS7006` de AsesoriaInfonavit son preexistentes.
- **Escribir al repo desde Cowork**: python en `device_bash` con reemplazos exactos que aborten si el ancla no aparece N veces. Los `.sql`: se escriben en el contenedor, se pega **idéntico** en `apply_migration`, se compara MD5 y se bajan con `device_commit_files`.
- **Los archivos que Raul edita en una vista previa del chat no se guardan en su carpeta**: pedirle el archivo adjunto (pasó con las fichas, llegó como PDF).
- **Server components**: no importar constantes con métodos desde módulos `'use client'`. Para compartir piezas de servidor con un componente cliente, pasarlas como **slots `ReactNode`** (así van `diagPanel`, `calcPanel`, `infPanel`); el contexto de React del cliente sí les llega (así se esconde el PnL).
- **PostgREST + `ON CONFLICT`**: no infiere índices únicos **parciales**; usar índice completo (173).
- **Vistas cerradas a `authenticated`** (p. ej. `v_embudo_mi`): leerlas con `createAdminClient()` **después** de `requireMiembro()`.
- **Sin red desde el contenedor ni la VM hacia n8n/Jordan/Granola**: probar api-trol con `net.http_post` desde Supabase (`timeout_milliseconds`).
- **Migraciones**: `create or replace` no cambia firma ni tipo de retorno (dropear). Una función `stable` no puede usar tablas temporales.
- **`pedir_consulta`, `pedirVentanilla`, `pedirActa`, `registrar_cobro` (con extracciones) disparan de verdad.** **Insertar en `cola_envios` envía.** **`/avisar` manda un WhatsApp real.** **Los botones del copiloto y "Armar diagnóstico" cuestan tokens.**
- **n8n**: `update_workflow` deja borrador → `publish_workflow`. **Tako (Chrome)**: campos React-controlled → setter nativo + evento `input`.
- **react-pdf**: guion entre `<Text>` adyacentes; `wrap={false}` en encabezados; verificar un PDF = renderizarlo y mirarlo.
- **Tailwind**: escribir la lista completa de clases por rama, no concatenar; las variantes arbitrarias (`[&_.text-sm]:text-base`) deben ir literales en el archivo.
- **Las conexiones MCP se caen a ratos** (502 / herramientas que desaparecen): recargar con ToolSearch y reintentar.
- Las llaves de proveedores las carga Raul en Vercel / Supabase / n8n. No se piden ni se pegan; las que aparezcan en el chat se rotan.
