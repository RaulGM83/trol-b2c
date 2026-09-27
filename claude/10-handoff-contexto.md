# Trol 3.0 — Contexto para continuar en un chat nuevo

Punto de entrada único. Actualizado **27-sep-2026 (paso cero y tres pestañas)**. Los detalles de cada tema viven en los docs `claude/11` … `claude/86`; aquí está el mapa.

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
  - **Mi cartera** (**164–166, 174**, `claude/74`): `_cartera_fila(uuid)`, `cartera_de(miembro, vista)`, `mi_cartera(vista)`, `cartera_por_activar(nombre, limit)`. Bandejas **Me toca a mí** (motivos: `escribio` · `cita` · **`tarea`** (174: pendiente vencido; manda el responsable de la tarea) · `tramite` · `contactar` · `propuesta` · `abrio_cuenta`) / **Le toca al cliente** / **Por activar** (grupos, 20 más calientes, lote ≤ 20). 165: tope 60 candidatos + CTE materializada (timeout). 166: "propuesta sin respuesta" exige experto asignado. **Desde 187 `/trabajo/cartera` ya no usa `mi_cartera` ni `cartera_por_activar`** (siguen vivas para otras pantallas).
  - **Carriles** (**187/187b**, `claude/84` = metodología completa y decisiones 1–17): Mi cartera por temperatura. **`carril_de(persona)`** decide **favoritos · calientes · tibios · frios · descartado** con `origen`; listas `mi_calientes(vista)`, `mi_tibios(alcance mios|pozo, tema|'todas'|null, limit)` (abre en el tema más numeroso; tramo 1 = sin tocar en 30 d por potencial, tramo 2 = tocados hace poco al final), `mi_favoritos(vista)`, `mi_frios(vista)` (con detonadores cumple_60 / cumple_65 / ventana_6m). Gestos: `carril_marcar(persona, frio|descartado|favorito, motivo, nota, hasta)`, `carril_despertar(persona, para, nota, directo)` (`directo` sólo con trámite en proceso), `asignar_cabecera(uuid[], miembro)` (admin/coach), `fijar_reto(meta)`. Tabla `carril_marcas` (una activa por persona; **un gesto del cliente posterior la vence**) y `retos`. Config `toques_tope=25` (son **toques abiertos**: tocados hoy sin reacción; los que reaccionan no cuentan), `carril_gesto_dias=7`, `carril_tocado_reciente_dias=30`. **Job `trol3-carril-noche` (05:55 UTC = 23:55 CDMX)**: tocados hoy sin reacción → Fríos `no_contesto` con contador de toques; la cadencia (3 · 7 · 14 días, 4 toques) vive en Fríos y vuelve sola a Tibios. Señales: gesto del cliente = `tako_visto_en` / `app_visto_en` / entrante / **`resultado in (contesto, atendido_chat)`** / eventos de cliente; toque nuestro = saliente `wa`/`llamada` de asesor o sistema (las plantillas son `sistema` sin actor: se atribuyen por `cabecera_id`). Potencial = `valor_estimado` × urgencia (×2 ≤ 6 m, ×1.5 ≤ 12 m; `urgencia_fecha` o cumple 60/65); ⚠️ el valor de Infonavit es el monto del crédito, por eso Tibios se trabaja por tema.
  - **Plantillas con candado** (**167**): `trol3.config.plantilla_horas_minimo='24'` (**una plantilla por persona al día**), `puede_plantilla(persona)` → `{ok, motivo: no_contactar|sin_telefono|muy_pronto, ultima, horas}`.
  - **Asesoría en cinco pasos** (**168, 169**, `claude/76`–`79`): tabla `trol3.asesorias` (una abierta por persona; `paso`, `pasos_vistos`, `escenario_recomendado`, `mostrar_costos`, `notas`, `diagnostico_id`, **`preparacion`**, **`copiloto`**). `asesoria_abrir`, `asesoria_marcar` (al cerrar → etapa `asesorado` + `evaluar_persona_seguro`), `asesoria_ligar_diagnostico`, **`asesoria_vista(persona)`** = todo lo que pintan el asesor y "Presentar": cliente, números, experto, parada, hallazgos, oportunidades (con `frase`, `ficha`, `propuesta`), historial, escenarios, sesión, `diagnostico {estado, estrategia, acuerdos, ligado, pagado}`, `pendientes[]`, `fichas[]`.
  - **Fichas de conocimiento** (**170–173**, `claude/73`, `80`, `81`): `trol3.fichas` (T1–T4 tema, O1–O11 oportunidad; `oportunidades text[]`; secciones en markdown ligero; **`solo_asesor` nunca sale al cliente**), `fichas_historial` (texto anterior de cada edición). **Edita sólo admin.** `fichas_para_redactor(persona)` = frase + "cómo explicarlo" de sus oportunidades abiertas. **`fichas_propuestas`** = bandeja de objeciones (origen `reunion`/`asesor`; `ficha_codigo null` = falta escribir la ficha); `fichas_proponer(...)`, `fichas_propuesta_decidir(...)` (admin; aprobar = se agrega a "Qué te van a preguntar").
  - **Trol en evento** (**179–181**, `claude/83`): código de invitación tipo `evento` (`finnosummit`, `app.trol.mx/i/finnosummit` → WhatsApp de Lukas con `ref:finnosummit`), canal `evento` (política de proveedor **Jordan** para siempre), **`alta_en_evento(codigo, telefono, nombre, curp, consentimiento)`** = alta atribuida + experto + CURP + consulta + diagnóstico avanzado de cortesía + evento `consentimiento` con el texto leído (sin consentimiento no hay alta), `evento_registrados(codigo)`. **180: `otorgar_beneficio` estaba roto con sesión de miembro** (cast de `actor_tipo`); "habilitar de cortesía" nunca había funcionado.
  - **Proveedor de consultas por canal** (`canales.politica_proveedor`, la lee `pedir_consulta`; asesor siempre Jordan). **182: TODOS los canales en `jordan_first` desde el 23-sep**; lo anterior está en `trol3.config.politica_proveedor_antes_finnosummit`. **⚠️ SIGUE ASÍ: aplicar `20260925_185_regresar_politica_proveedor_PENDIENTE.sql` (Raul no ha contestado si ya).**
  - **Costo de consultas** (183/184): sólo cuesta lo que llega `completada`; `error`, `cancelada` y `sin_resultado` quedan en $0 (trigger + histórico corregido). Análisis ago–sep (23-sep): **Belvo 300 consultas, $353, mediana del SISEC 236 días de viejo en sep (sólo 18 % fresco)** — Belvo devuelve el reporte congelado del link, sirve sólo para gente nueva; 285 de 300 las pidió el sistema (refresh de campañas: dinero que no compró información nueva); 68 "sin resultado" nunca se reintentaron por Jordan. **Jordan 153 consultas, $1,222, 85 completadas todas del día, 44 % no termina bien.**
  - **CURP: trol3 manda sobre legacy** (**186**, 25-sep, caso Saara Aide Viraal): `tg_curp_a_public` espeja SIEMPRE que cambie `personas.curp` (antes sólo si legacy estaba vacía o mal formada → una CURP corregida en trol3 nunca llegaba a `public.clientes` y Jordan buscaba la vieja). `tg_consulta_despachar` refresca legacy antes de armar el payload. Guarda: `clientes_curp_key` es única; si otro cliente legacy ya tiene esa CURP no se pisa (Jose Luis Sandoval tiene dos filas legacy con la misma CURP — pendiente de limpiar a mano).
  - **Actualizar el SISEC** = `jordan` **normal** ($13): trigger → n8n **Refrescar SISEC** (`zbmWkJUG5LTSt2nI`, webhook `cliente-refrescar-sisec`) → `api.jordan-digital.com/consulta` modo `normal` con el `curp` del payload; crea `public.procesos` (`WAITING_JORDAN` → resultado por `jordan_webhook` → `api-trol/consulta/resultado`). **Ventanilla** ($52) sólo manual desde el expediente, usada una vez, con error.
  - **Segmentos de gestoría** (`v_segmentos_gestoria`, `v_segmento_mod10_viraal`). **Campañas** (099–108b): `v_segmentos_campana`, `c1`–`c5`, `r1a`…`r_menor59`. **Pausadas desde ~11-sep; el equipo trabaja gestoría y reactivación Mod 10.**
  - **Datos a utilizar** (109–109c), **Asesoría Infonavit** (110–112), **Escenarios** (113–121), **Tareas** (114), **Diagnósticos** (115, 119–121, 139), **Redactor** (117–120; desde 170 recibe las fichas del caso como guía de enfoque).
  - **Aliados referidores** (122–128b): ver §2bis.
  - **Consultas** (101, 153–156): Belvo **caché** ($2.50), Jordan **en vivo** ($13). `pedir_consulta(persona, tipo, actor, actor_id, pagador, notificar, motivo, forzar, proveedor)`. Tipos vivos: `imss_historial`, `cda`, `issste`, `infonavit`, `calculo_base`, `imss_ventanilla`, `acta`. 155/156: `actualizar_imss_mia()` cobra 50 puntos. La constancia subida termina como `consulta_completada` de `calculo_base`/`sisec`.
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
- **App web `trol-b2c`** (Next.js 14, Tailwind). Repo **`RaulGM83/trol-b2c`**, Vercel Pro. Carpeta local `~/Claude/Projects/b2c experiencia`. **Último commit: `509058a`** (188, trol_retomar + hoja de dos opciones, 26-sep; build ok). **Pendiente de build + commit: 189 (paso cero y tres pestañas, `claude/86`)** — el comando está en el chat del 27-sep y al final de `claude/86`.
  - **`/mi` = "tu cuenta Trol"** (`claude/70`): pestañas **Mi pensión · Mis datos · Beneficios · "Mi chat"**. **189: Mis datos abre con "Lo que nos falta para asesorarte"** (`MisCinco.tsx`: los mismos cinco del paso 0, `declarar_mio` + `base_no_sabe`). `LoQueSigue` muestra la propuesta del asesor (texto, pensión con plan, costo). Lukas no dice montos: la cuenta es el único lugar donde viven los números.
  - **`/trabajo`** (rehecho el 21-sep, `claude/72`–`82`):
    - **Menú:** **Mi cartera · Conocimiento · Aliados · Negocio ▾ · Gestión ▾** + buscador. El logo lleva a Mi cartera.
    - **Mi cartera** (`/trabajo/cartera`, **rehecha el 26-sep con carriles**, `claude/84`): pestañas **Favoritos · Calientes · Tibios · Fríos · Mis pendientes** (`?tab=`; abre en Calientes) + Míos / Todo el equipo. **Calientes**: medidor "Tocados hoy t de 25 · r reaccionaron"; grupos *Reaccionaron* · *Tocados hoy* · *De Favoritos, hoy*. **Tibios**: reto del día (`fijar_reto`), alcance Mis tibios / Sin dueño (= el viejo "Por activar"), chips por tema, dos tramos, lote ≤ `libres` (`activarLote`), "Tomar y mandar…" desde el pozo. **Favoritos**: En proceso (entran solos; huérfanos asignables en equipo) · Favoritos con fecha. **Fríos**: detonadores del día + enfriados con motivo y "vuelve el …". Componentes: `CarteraTabs`, `CarrilFila`, `CarrilAcciones` (Contestó · Enfriar con motivo · Favorito con fecha · Descartar · No aplica… por oportunidad · admin: Asignar a… / Despertar para…), `TibiosLista`; acciones `carrilMarcar`, `carrilDespertar`, `asignarCabecera`, `fijarReto`, `noAplicaOportunidad`. Los viejos `CarteraAcciones` / `PorActivarLista` quedan sin uso desde esta página.
    - **Negocio ▾ → Evento** (`/trabajo/evento`, 179): registro en mano desde el teléfono (nombre · WhatsApp · CURP · casilla de consentimiento obligatoria) → QR de su cuenta (mi_link con logo: lo escanea y entra en su teléfono sin contraseña) · QR al chat con Lukas · lista con estado de consulta (se refresca sola), "Pedir en vivo" si el IMSS no devolvió nada.
    - **Negocio ▾**: Operación (= `/trabajo/hoy`: citas del equipo, reuniones sin expediente, requiere acción, pulso B2C) · Oportunidades (= `/trabajo/lista`) · Embudo · **Embudo de /mi** (`/trabajo/embudo-mi`, nuevo) · Actividad · Todos los clientes (= `/trabajo`, que también es la página de resultados del buscador). **No se borró ninguna ruta.**
    - **Expediente `/trabajo/p/[id]`** (**189**, `claude/85`–`86`): barra **Relación** (default: parada del cliente, **"Listo para asesorar n de 5" + Preparar**, registro rápido, Activar, Enviar propuesta) · **Asesoría** (con **paso 0**) · *Trámite* (Oportunidades · Documentos y beneficios) · **Más ▾** (Datos completos = el viejo Resumen, Calculadoras, Infonavit, Diagnóstico, Bitácora). Viraal fuera de la barra (sigue en `?tab=viraal`; es back para Viraal, no asesoría). `calcPanel`/`infPanel`/`mesaPanel`/`diagPanel`: una pieza, dos puertas.
    - **Asesoría** (`components/trol3/AsesoriaSesion.tsx`, `lib/trol3/asesoria.ts`): **0 Lo que ya sabemos** (`PasoCero.tsx`, 189: highlights ley/semanas/edad/derechos/pensión base + **los cinco**: AFORE · saldo RCV · uso de Infonavit · con cuánto y a qué edad · otros ahorros; "no sabe" vale; nace ahí si `_base_listos < 5`) · 1 Su situación (números, dolor, **historia laboral con alta y baja al día**, huecos sin cotizar) · 2 Lo que encontramos (frase de la ficha + botón "Ficha O5") · 3 Escenarios (caminos cerrados; **calculadora e Infonavit se abren dentro del paso**, ancho completo) · 4 Recomendación (armar/ligar diagnóstico, "el porqué" = `estrategia_oportunidades`, Enviar propuesta con números sugeridos) · 5 Acuerdos (= `DiagnosticoPanel`; **"Entregado" exige beneficio `diagnostico_avanzado`**). Navegación libre. Cerrar → `asesorado`.
    - **Modo "Compartir pantalla"** (`lib/trol3/compartir.tsx`): en la videollamada se comparte la pantalla de trabajo. Esconde guion, notas, copiloto, fichas, valores internos y **el PnL del aliado en Infonavit** (regla de Raul: todo lo demás es transparente con el cliente); pasos 4–5 en sólo lectura. **189: también esconde el menú de `/trabajo`, el buscador y el encabezado del expediente** (`data-compartiendo` en `<html>` + `.chrome-trabajo` en `globals.css`).
    - **Presentar** (`/presentar/[id]?paso=n`): láminas limpias fuera del layout; nunca honorarios, valor, nombre interno ni notas; costos sólo si `mostrar_costos`. **189: paso 0 en grande (lo llena el asesor, también en la tablet) y `?modo=evento`** corta en el paso 2 y ofrece "Agendemos tu asesoría →".
    - **Conocimiento** (`/trabajo/fichas`): biblioteca con buscador, editor por secciones (admin), bandeja **Por aprobar**, "+ Me preguntaron algo que no está aquí".
    - **Copiloto** (`lib/trol3/copiloto.ts`, `Copiloto.tsx`): "Prepárame la asesoría" + 10 preguntas preparadas por paso. **Sin chat libre.** Sólo fichas + expediente, cita `[O5]` (botón), nunca calcula cifras, "No está en las fichas." Se guarda en la sesión (se paga una vez). `MODELO_REDACTOR`, `OPENAI_API_KEY`.
    - Pestaña Documentos: **"Registrar un cobro"** (`CobroPanel`, evento `pago_recibido`).
  - **`/checkout`**: `buscarProducto()` vs `getProducto()`; `?p=` desconocido → "Esto se paga por tu chat de Trol".
  - **PDF del diagnóstico** (139, `claude/48`–`50`).
- **Auth (Supabase)**: SMTP Resend, PKCE. **Motor `pension-core`**: `FACTOR_RETIRO = 0.81` sólo RCV. **Storage:** bucket privado `expediente`. **Legacy `public`**: dual-write sigue.
- **Motor — costo de Mod 40 retroactiva** (revisado 25-sep con Maria `ROGL520813MDFDTZ09`): `motor/calculadora_pension_pro_v55.js` `calculateRetroCostBreakdown` y `pension-core/src/mod40-lineas.ts` `lineasCapturaMod40` (espejo del Excel de Raul). **SDI = 25 × UMA del año de la baja** (criterio confirmado por Raul: el tope es la UMA de la fecha de baja), fijo para todo el tramo; cuota por año (10.08 % ≤2022 · 11.17 2023 · 12.26 2024 · 13.35 2025 · 14.44 2026 … 18.80 2030); prorrateo diario en ambos extremos; **actualización** = INPC(mes del trámite)/INPC(mes) − 1, nunca < 1; **recargos** 1.47 % mensual × días/30.4375 sobre (cuota + actualización); **tope 60 meses** (art. 219) conservando los más recientes; INPC oficial hasta 2026-03, proyectado después (aviso). Maria: semilla v18 $609,966/43 meses vs motor actual $596,960/44 meses a la misma fecha; $621,624/45 meses a hoy. Versión del motor en `trol3.config.motor_version_actual`.
- **n8n cloud**: Calculos (`6Ry0jm62ahFNmibR`), citas GCal (`S6BxXRbTgundrEwe`), nudges + cola (`WGweHnnPEeWMZsUg`), avisos a asesoras (`aygBu2V6cpnL3NEF`), **Refrescar SISEC** (`zbmWkJUG5LTSt2nI`, Jordan normal), Identidad Belvo v2, Waterfall PDF, ISSSTE, Portal Consulta Processor, B2B Gateway.
- **Material Finnosummit**: `b2c experiencia/claude/finnosummit/` — tarjeta 90×50 mm (`tarjeta-finnosummit.pdf` vectorial + PNG/JPG a 2400 dpi), QR con logo, logos PNG 4000 px. Frente: promoción + QR + línea legal; reverso: contacto de Raúl (CEO, 55 3566 5896).
- **Bot Tako**: Lukas **prompt v20.5 pegado el 26-sep** (v20.4 + `trol_retomar`); **`tako/prompt-lukas-v20.6.md` escrito y SIN PEGAR** (§2.B-bis: las cinco del paso 0, con `trolExpediente.base.faltan`). Herramientas: las seis mandan `conversacion_id` (26-sep); **Trol Declarar acepta `saldo_rcv97`, `credito_infonavit_uso`, `expectativa_pension_mxn`, `ahorro_voluntario`, `plan_corporativo`, `otros_planes`** (27-sep). Plantilla **`trol_retomar`** (Utilidad) en revisión de Meta desde el 26-sep. Regla dura: nunca montos.

### 2bis. Aliados: dos relaciones con la misma palabra (`claude/51`)

| | Aliado que **compra** | Aliado que **refiere** |
|---|---|---|
| ¿De quién es el cliente? | Del aliado. | **De Trol desde el día uno.** |
| Dónde | `/trabajo/aliados` | `/trabajo/aliados/referidores` y `/aliado` |
| Tablas | `consultas_aliados` | `trol3.aliados`, `referidos`, `comisiones` |

La comisión sale del `honorario_trol` de la oportunidad ganada; el aliado no ve la base ni el % (127). Aliados vivos: Humberto Obregón (HOV, 20%) y `raul-prueba`. **Viraal** ejecuta `reactivacion_mod10`, `mod40_*`, `pension_hoy`, `credito_pension`. **Astuto** ejecuta Infonavit hoy y AFORE (con asesor certificado). **Trol** ejecuta `compra_inmueble` y `credito_infonavit_activo` cuando hay plan en la calculadora de Infonavit (177/178, automático).

---

## 3\. Estado a hoy

- Hasta 19-sep: ver `claude/11`–`claude/68`. 20-sep: `claude/69` (canales y plantillas), `claude/70`–`71` (**`/mi` rehecha**, Cobrado).
- **21-sep — `/trabajo` rehecho de punta a punta** con la lógica de `/mi` (`claude/72` diseño):
  1. **Mi cartera** (164–166, `claude/74`) · 2. **Relación + Enviar propuesta + lote + una plantilla al día** (167, `claude/75`) · 3a. **Asesoría en cinco pasos + Presentar** (168, `claude/76`) · 3c. **Recomendación, acuerdos, diagnóstico ligado y candado de entrega** (169, `claude/77`) · 3b. **Herramientas dentro del paso 3** (`claude/78`) · **Modo Compartiendo + historia laboral exacta** (`claude/79`) · 4a. **Fichas** (170–171, `claude/73`, `80`) · 4b. **Copiloto + fichas que aprenden** (172–173, `claude/81`) · 5. **Menú Negocio, Mis pendientes, tareas vencidas en la cartera** (174, `claude/82`).
- **22–23 sep — Finnosummit** (`claude/83`): Trol en evento (179–181), tarjeta, todo por Jordan (182), costos (183/184).
- **25-sep**: revisión del costo de Mod 40 retro (criterio de la UMA de la baja confirmado; ver §2 Motor) · qué servicio de Jordan actualiza (normal) · **bug de CURP corregida que no llegaba a Jordan → 186**. **Saara Aide Viraal** (persona `47976459-dedd-4e21-a0da-f228319c3023`, legacy `219927de-5d58-4f34-8a47-e5d60a6ca542`): CURP correcta `CARS660412MDFDSR05`; consulta Jordan reenviada `c92187c6-fc49-438c-865e-d002e1dda73e` con la CURP buena (`WAITING_JORDAN` a las 20:27 UTC del 25-sep) — **verificar que llegó el SISEC.**
- **26-sep — Carriles** (`claude/84`): metodología de atención por temperatura acordada (17 decisiones de Raul), medida contra la base, wireframe v3 (https://claude.ai/artifact/7uH5m3cfuKNQ2eLKUNXec8), **187/187b aplicadas** y **`/trabajo/cartera` rehecha** (build ok, commit `ed8e81d`; **nadie la ha usado todavía**). Medición: Verónica 26 reaccionaron / 53 tibios, Andrea 17 / 36; pozo 8,143 en 9 temas; **55 trámites en proceso sin dueño** (Favoritos del equipo, para que Raul los asigne); 13 personas escribieron en 7 d y nadie las tiene. ⚠️ 91 de 212 clientes con experto no tienen un solo gesto registrado: el modelo depende del clic "Contestó".
- **26-sep (tarde) — el toque que sólo abre la conversación** (`claude/84` ajuste, commit `509058a`): plantilla `trol_retomar`, hoja de dos opciones en Tibios, prompt v20.5. También se cerró el hueco del `conversacion_id` (`claude/68` seguimiento): `trolAlta`/`trolHandoff`/`trolDeclarar`/`trolMiLink` no lo mandaban; ya lo mandan las seis.
- **27-sep — Paso cero y tres pestañas** (`claude/85` análisis, `claude/86` decisiones y construcción): **0 de 213** clientes con experto tenían los cinco datos base (AFORE 7 %, saldo RCV real 3 %, Infonavit real 8 %). **189/189b aplicadas**; expediente con Relación · Asesoría (paso 0) · Trámite · Más; Compartiendo esconde el layout; Presentar con paso 0 y modo evento; `/mi` con los cinco; cartera con `base n/5`. **App sin build ni commit.**
- Wireframes: `/mi` https://claude.ai/artifact/Te6SXPsewasWvyGwojXmRp · `/trabajo` https://claude.ai/artifact/Y3j8gAddx6dKcPbEAAnj5p

### Lo que dicen los números

`v_embudo_mi`: semana 7-sep **63 recibieron → 47 abrieron (75%) → 6 hicieron algo (13%)**. **Abrir no es el problema; actuar sí.** Base trabajada (35 días, ~390 personas): **62% en parada 2**, 85% con algo detectado, 89% sin experto asignado — para eso es "Por activar".

### Plantillas de WhatsApp (aprobadas el 20-sep, todas Marketing)

`trol_cuenta_lista`, `trol_reabrir`, `trol_oportunidad`, `trol_op_mod40`, `trol_op_semanas`, `trol_op_infonavit`, `trol_op_gestion`, `trol_op_reactivarcuenta`. Reglas: una sola variable (`{{1}}` = link, nunca al principio ni al final) y botón de **respuesta rápida**.

### Migraciones aplicadas (vivas)

038–163 (ver versiones anteriores) · **164–166** cartera · **167** propuesta + candado de plantilla + `parada_cliente` · **168** asesorías · **169** asesoría termina en algo · **170** fichas · **171** las 15 fichas v1 · **172** copiloto + bandeja · **173** índice único completo (PostgREST no infiere índices parciales en `ON CONFLICT`) · **174** tareas vencidas en la cartera · **175–178** compra y crédito Infonavit vía Trol (automático con plan en la calculadora; proveedor "Trol" a secas; 10 marcados) · **179** Trol en evento · **180** `otorgar_beneficio` arreglado · **181** consentimiento en el alta en evento · **182** todo por Jordan desde el 23-sep · **183/184** error/cancelada/sin_resultado sin costo · **186** CURP de trol3 manda sobre legacy · **187** carriles (tablas, señales, `carril_de`, listas, gestos, job nocturno) · **187b** primero el carril y luego la fila (Andrea 3.4 s → 0.8 s) · **189** paso cero (`catalogo_campos.base_asesoria`, `credito_infonavit_uso`, `no_sabe`, `base_asesoria()`, `_base_listos()`, `asesorias.paso` 0–5, `asesoria_vista.base`, `carril_de.base_listos`) · **189b** `resumen_bot.base` para Lukas. **185 escrita y NO aplicada** (regreso de política de proveedor).

Todas exportadas a `trol3_backend/migrations/` y verificadas por MD5 (`md5(array_to_string(statements, E'\n'))` vs `md5sum` del archivo **sin** salto final extra). 158–160, 167, 169, 170, 174 y 186 parchan funciones vivas con `replace()` sobre `pg_get_functiondef` y ancla contada: el archivo es el parche, no la función completa.

Faltan de exportar: los `create or replace` del 4-sep de `public.registrar_baja` y `trol3.handoff`.

---

## 4\. Pendientes (en el orden acordado)

### Ya

0. **Aplicar la 185** (`trol3_backend/migrations/20260925_185_regresar_politica_proveedor_PENDIENTE.sql`): regresa la política de proveedor por canal a lo de antes (Belvo) salvo `evento`. Mientras no se aplique, **cada alta nueva de cualquier canal cuesta $13 en Jordan**. Preguntado dos veces; falta el sí de Raul.
0a. **Saara Aide**: confirmar que la consulta `c92187c6…` llegó `completada` y el expediente tiene SISEC nuevo; si no, `pedir_consulta(..., forzar true, 'jordan')` otra vez. Limpiar el duplicado legacy de Jose Luis Sandoval (`SACL670114HVZNLS07` dos veces en `public.clientes`).
0b. **Resultados de Finnosummit**: `select * from trol3.evento_registrados('finnosummit')`; embudo en `v_embudo_codigo where codigo='finnosummit'`. ¿Se usó el registro en mano? ¿El QR de la cuenta funcionó en otro teléfono?
0c. **Diagnóstico del QR → WhatsApp**: el código del sitio lleva 182 clics (32 de móvil real) y 1 alta atribuida. Con los datos del evento se sabrá si la gente no manda el mensaje o si Lukas no pasa el `ref:`.
0d. Reintento automático Belvo `sin_resultado` → Jordan (una condición en el trigger de resultado), y no usar Belvo para refresh (sólo gente nueva). Mostrar "datos del IMSS al …" en cartera/asesoría cuando el SISEC tenga > 90 días.
0e. Lukas no menciona el aviso de privacidad antes de pedir la CURP: una línea en el prompt (v20.7).
0f. Ofrecido, sin respuesta: marcar los expedientes cuya semilla tenga `motor_version` < `motor_version_actual` (los números de Mod 40 retro cambiaron entre v18 y el motor actual).

### Lo siguiente (Raul, 21-sep): **Granola — empieza a usarlo esta semana**

1. `trol3.reuniones` tiene **0 filas**: cargar `GRANOLA_API_KEY` (workspace) en Vercel, registrar el webhook (curl en `claude/62`), cargar `GRANOLA_WEBHOOK_SECRET`, redeploy; prueba real con una reunión agendada por la liga de citas. Revisar de punta a punta: casado con cita/persona, propuestas en el expediente, "sin expediente" en Negocio → Operación, y **objeciones llegando a la bandeja de Conocimiento**.

### Para encender (todo está construido; falta un gesto de Raul)

2. ~~Build + commit~~ (hecho: `ed8e81d`). **Primera actividad del lunes 28-sep: mirar `/trabajo/cartera`** con tu usuario y con el interruptor "Todo el equipo": asignar los 55 trámites huérfanos desde Favoritos, probar Enfriar / Favorito / No aplica / Despertar para, y a la mañana siguiente ver qué bajó el job a Fríos (`select * from trol3.carril_marcas order by created_at desc limit 20`). Pendientes de la app en `claude/84` §Pendiente (detonadores v2, plantilla por toque, botones Favorito/Enfriar en el expediente).
3. **Pegar `tako/prompt-lukas-v20.6.md` en Tako** (v20.5 ya está; la v20.6 agrega las cinco del paso 0). **Build + commit de 189** y probar: Relación → "Listo para asesorar", Asesoría paso 0, Compartir pantalla (desaparece el menú), `/presentar/<id>?modo=evento` en la tablet, `/mi` → Mis datos.
4. Después: `update trol3.config set valor='on' where clave='avisar_numeros_actualizados';`
5. **Probar con el número de Raul** lo que manda WhatsApp real y nunca se ha probado de punta a punta: "Mandar plantilla", "Enviar propuesta", "Cobrado". (`/avisar` jamás ha enviado una plantilla con éxito: todo lo registrado es `system_event`.)
6. **Probar lo que usa IA** (cuesta tokens): "Armar su diagnóstico" con fichas, "Prepárame la asesoría", una pregunta preparada. Vigilar que "¿Esperar o tramitar ya?" y "¿Qué caminos le armo?" no den montos.
7. **Correr una asesoría completa de prueba** con "Presentar" y con "Compartir pantalla"; enseñarle al equipo Mi cartera, Cobrado y "+ Me preguntaron algo…".
8. Si nadie extraña Hoy / Lista de trabajo / Clientes en el menú en un par de semanas: decidir si se borran rutas.

### De `/trabajo` (detalles que quedaron abiertos)

9. Hay al menos un diagnóstico **entregado sin beneficio registrado** (8-sep): el candado sólo aplica a entregas nuevas; si se entrega de cortesía, habilitar el beneficio antes.
10. Las tareas `origen='diagnostico'` las ve el cliente en "Presentar": redactarlas presentables.
11. ~~Al compartir pantalla siguen a la vista el menú y el buscador~~ (hecho en 189).
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
- **Dual-write a `public`: cuando trol3 y legacy difieren, trol3 manda** — y hay que mirar de dónde lee cada trigger/webhook antes de dar por corregido un dato (186: la CURP se corrigió en trol3 y Jordan siguió leyendo la legacy). `sync_desde_cliente` (legacy → trol3) sólo rellena nulos; nunca pisa trol3.
- **Probar funciones con efectos (dinero, WhatsApp) con rollback**: `do $$ … raise exception 'ROLLBACK_OK %', resultado; end $$;`. Para simular sesión: `perform set_config('request.jwt.claims', '{"sub":"<auth_user>","role":"authenticated"}', true);`
- **Carpeta correcta**: la que termina en `raulgallegomuller--Claude--Projects--b2c experiencia`. El repo git es la carpeta raíz; la app vive en `trol-b2c/`. La copia local `claude/10-handoff-contexto.md` se actualiza con la del proyecto (26-sep).
- **Git desde Cowork**: sin identidad ni red; **commit y push los hace Raul**. Cada `git status`/`git log` deja `.git/index.lock` huérfano (y desde la VM no se puede borrar): **no correr `git status` en el repo de Raul**; el comando que se le pasa lleva `rm -f .git/index.lock`.
- **`node_modules` compilado para macOS**: `next build` falla en la VM. **`tsc` sí corre**: `timeout 175 node node_modules/typescript/bin/tsc --noEmit -p .` (~2 min), filtrar por archivo; `TS2307 @trol/pension-core` y `TS7006` de AsesoriaInfonavit son preexistentes. Los tests de `pension-core` (vitest para macOS) se corren transpilando con el `tsc` de trol-b2c a `$HOME/pc` y ejecutando con node.
- **Escribir al repo desde Cowork**: python en `device_bash` con reemplazos exactos que aborten si el ancla no aparece N veces. Los `.sql`: se escriben en el contenedor, se pega **idéntico** en `apply_migration`, se compara MD5 y se bajan con `device_commit_files`.
- **Chat de archivos**: el servidor rechaza adjuntos de ~0.5 MB o más (400); los grandes van sólo a la carpeta del usuario con `device_commit_files`. **Imprentas**: el PNG debe llevar el dpi declarado (PIL `dpi=`), si no lo evalúan a ojo.
- **Los archivos que Raul edita en una vista previa del chat no se guardan en su carpeta**: pedirle el archivo adjunto (pasó con las fichas, llegó como PDF).
- **Server components**: no importar constantes con métodos desde módulos `'use client'`. Para compartir piezas de servidor con un componente cliente, pasarlas como **slots `ReactNode`** (así van `diagPanel`, `calcPanel`, `infPanel`); el contexto de React del cliente sí les llega (así se esconde el PnL).
- **PostgREST + `ON CONFLICT`**: no infiere índices únicos **parciales**; usar índice completo (173).
- **Vistas cerradas a `authenticated`** (p. ej. `v_embudo_mi`): leerlas con `createAdminClient()` **después** de `requireMiembro()`.
- **Sin red desde el contenedor ni la VM hacia n8n/Jordan/Granola**: probar api-trol con `net.http_post` desde Supabase (`timeout_milliseconds`).
- **Migraciones**: `create or replace` no cambia firma ni tipo de retorno (dropear). Una función `stable` no puede usar tablas temporales. `public.clientes.curp` tiene unique (`clientes_curp_key`): todo espejo trol3 → legacy debe excluir colisiones.
- **`pedir_consulta`, `pedirVentanilla`, `pedirActa`, `registrar_cobro` (con extracciones) disparan de verdad.** **Insertar en `cola_envios` envía.** **`/avisar` manda un WhatsApp real.** **Los botones del copiloto y "Armar diagnóstico" cuestan tokens.**
- **n8n**: `update_workflow` deja borrador → `publish_workflow`. **Tako (Chrome)**: campos React-controlled → setter nativo + evento `input`.
- **react-pdf**: guion entre `<Text>` adyacentes; `wrap={false}` en encabezados; verificar un PDF = renderizarlo y mirarlo.
- **Tailwind**: escribir la lista completa de clases por rama, no concatenar; las variantes arbitrarias (`[&_.text-sm]:text-base`) deben ir literales en el archivo.
- **Las conexiones MCP se caen a ratos** (502 / herramientas que desaparecen): recargar con ToolSearch y reintentar.
- Las llaves de proveedores las carga Raul en Vercel / Supabase / n8n. No se piden ni se pegan; las que aparezcan en el chat se rotan.
