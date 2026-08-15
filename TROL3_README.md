# Trol 3.0 — qué se construyó este fin de semana y cómo conectarlo

## 1. Base de datos (Supabase, esquema `trol3`, mismo proyecto)
Tablas: personas, contactos, persona_partner, catalogo_campos, datos (hechos con capa declarado/calculado/validado, origen, proveedor, vigencia, pagador, visibilidad), escenarios, proveedores, consultas, documentos, checklist_items, catalogo_oportunidades, oportunidades, productos, ordenes, puntos, interacciones, citas, tokens_acceso, eventos (append-only), reglas_notificacion, miembros (equipo con roles), canales, config.
Vistas: `v_mejor_dato` (mejor dato vigente por campo: validado > calculado > declarado, más reciente), `v_expediente` (pivote por persona).
Motor: `evaluar_persona(uuid)` recalcula checklist de orden + oportunidades (se dispara solo al insertar datos); `evaluar_todos()` corre toda la base.
Migración: `migrar_desde_public()` (idempotente) ya corrió: 14,039 personas, ~270k datos, 27.7k consultas, 22k documentos, puntos, órdenes.
RLS por rol: miembro (todo), cliente (lo suyo y visible), aliado (lo que pagó + declarados). Funciones `current_miembro_id()`, `current_persona_id()`, `current_partner_id()`.

**Pendiente en dashboard:** Project Settings → Data API → Exposed schemas → agregar `trol3`.

## 2. API para Tako / N8N (Edge Function `api-trol`, sin JWT, header `x-trol-key`)
Base: `https://orgagfdxygtjiwqvgckw.supabase.co/functions/v1/api-trol`
Key: en `trol3.config` (clave `api_key`) — cámbiala cuando quieras: `update trol3.config set valor='...' where clave='api_key'`.

| Método | Ruta | Body / query | Uso |
|---|---|---|---|
| POST | /alta | {telefono, canal?, nombre?, campania?, actor?} | Nace la persona con teléfono verificado (bot). Devuelve {persona_id, nueva} |
| GET | /expediente?telefono= | | Resumen para el bot: nombre, edad, ley, semanas, dolor, declarados, checklist, oportunidades (sin valores), cabecera, puntos |
| POST | /declarar | {telefono|persona_id, campo, valor, actor?} | Guarda un declarado (dolor_principal, expectativa, semanas_cotizadas, afore_actual, curp, edad_retiro_deseada, ingreso_mensual, dependientes, cotiza_issste, empleo_actual, …). Si ya hay validado en saldos/semanas responde 400 hint `usa_escenario` |
| POST | /declarar-varios | {telefono|persona_id, datos:{campo:valor,…}} | Varios de golpe |
| POST | /interaccion | {telefono|persona_id, canal, direccion, contenido, actor?} | Guarda mensajes del bot/cliente en la bitácora |
| POST | /handoff | {telefono|persona_id, motivo?} | Cliente pide humano → evento `handoff` (aparece en /trabajo/eventos) |
| POST | /consulta | {telefono|persona_id, tipo, actor?, pagador?, notificar?, proveedor?, forzar?} | Crea consulta (imss_historial → Belvo o Jordan según canal; cda; issste; infonavit; calculo_base). Aplica anti-duplicado 90 días |
| POST | /consulta/resultado | {consulta_id, estado, datos:{campo:valor}, documentos:[{tipo,nombre,url,gating,precio_mxn}], fecha_dato?} | N8N regresa el resultado: se guardan datos validados, documentos, se recalcula todo |
| GET | /eventos/pendientes?limit= | | Cola de eventos para N8N (notificar por Tako, espejo HubSpot) |
| POST | /eventos/ack | {ids:[…]} | Marca procesados |

Campos válidos: ver `trol3.catalogo_campos` (campo, tipo, grupo, vigencia).
Tipos de evento: persona_alta, persona_reingreso, dato_nuevo, consulta_solicitada, consulta_completada/sin_resultado/error, oportunidad_detectada/presentada/en_proceso/ganada/perdida, handoff, cabecera_asignada, orden_pagada, cita_creada.

### Flujo sugerido en N8N
1. Workflow "trol3-consultas": cada minuto lee `trol3.consultas` con estado `solicitada` (Supabase node, schema trol3) → según `proveedor` llama Belvo/Jordan/CDA/Nubarium (reusar nodos de "Calculos y herramientas" / Belvo_Mass_Refresh) → POST /consulta/resultado con `datos` mapeados a campos del catálogo (ley, semanas_cotizadas, semanas_descontadas, status_empleo, salario_diario, ultima_cotizacion, conserva_derechos, saldo_rcv97, saldo_infonavit, afore_actual, cuenta_registrada, pension_base, pension_maxima, …). Si Belvo no encuentra → estado `sin_resultado` y crear nueva consulta con proveedor jordan (POST /consulta {proveedor:'jordan', forzar:true}).
2. Workflow "trol3-eventos": cada minuto GET /eventos/pendientes → por tipo: `handoff` → aviso a asesores (Tako/WhatsApp interno); `consulta_completada` con `notificar_cliente=true` o solicitante cliente → WA al cliente con magic link a /mi; `oportunidad_presentada` → WA al cliente; `persona_alta`/`oportunidad_*` → upsert contacto/deal en HubSpot (reflejo). Luego POST /eventos/ack.
3. Bot Tako: al inicio de conversación POST /alta con el teléfono; en cada turno GET /expediente para contexto; cuando el cliente cuenta algo → /declarar-varios; cuando pide humano o el bot detecta intención → /handoff; cuando ya hay CURP → /consulta {tipo:'cda'} y {tipo:'imss_historial'}.

## 3. App web (repo trol-b2c → app.trol.mx)
- `/trabajo` (asesores): login por correo (magic link) en `/trabajo/login`; lista de trabajo por oportunidad (valor → urgencia), filtros por nivel/código/estado/mías; `/trabajo/personas` buscador + alta manual (recepción); `/trabajo/p/<id>` expediente: header, checklist, oportunidades (presentar/en proceso/ganada/perdida/no aplica, especialista, nota visible), mejor dato por campo con capa V/C/D, capturar dato, pedir consulta (proveedor, notificar, forzar), bitácora, documentos, citas, calculadora pro (`/calculadora?persona=<id>`), tomar cabecera, marcar situación entendida / cliente; `/trabajo/eventos` actividad.
- `/mi` (cliente): login por teléfono OTP (mismo /login con `next=/mi`), resumen (régimen, semanas, pensión base/máxima), orden de situación, oportunidades (recomendadas por asesor vs detectadas, mismo valor que ve el asesor), hablar con asesor (handoff), actualizar IMSS (consulta pagada por cliente), agendar cita, completar expediente (declarados), documentos con gating, mensajes del asesor.
- Miembros: los 4 asesores + raul@trol.mx ya están en `trol3.miembros` (roles recepcionista+cabecera; Raúl admin). El primer login por correo vincula `auth_user_id` automáticamente.

## 4. Deploy
- Vercel: mismo proyecto; variables ya existentes (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). Agregar en Supabase Auth → URL Configuration → Redirect URLs: `https://app.trol.mx/auth/callback` (y localhost). Habilitar proveedor Email (magic link).
- Storage: bucket privado `expediente` creado (para bóveda; URLs firmadas se agregan después).

## 5. Qué falta (semana entrante)
Prompt del bot con conversación abierta y uso de la API; N8N: consultas y eventos; HubSpot reflejo; bóveda con URLs firmadas + gating de puntos; PDF de semanas (OCR); portal de aliados sobre trol3; reactivación de la base por segmentos; apagar dual-write y `public`.
