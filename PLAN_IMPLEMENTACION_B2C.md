# Plan de implementación — Experiencia B2C de El Trol

**Autor:** Raúl · **Fecha:** 21 jun 2026
**Fuente de estrategia:** `El_Trol_B2C_Plan_Maestro_Handoff.md` (autoritativo). Este documento **no re-deriva la estrategia**: la operacionaliza en un plan de build concreto, secuenciado y técnico.

> **Progreso (21 jun):**
> - ✅ **F0** repos conectados (`trol-portal`, `Diagnostico básico trol`).
> - ✅ **F1** motor canónico (`trol-portal/src/lib/imss`, Ley 73/97 + Mod 40, port fiel del Excel) **extraído a `@trol/pension-core`** (`b2c experiencia/pension-core/`) con **30/30 tests vitest verdes** y typecheck limpio.
> - ✅ **F2 (inicio)** app **`trol-b2c`** scaffolded (`b2c experiencia/trol-b2c/`): Next.js 14 con brandbook El Trol, consume `@trol/pension-core` como dependencia. Pantalla 1 del Inc 0 (**Diagnóstico + Mejor jugada** + stepper "Tu avance") funcionando con la semilla real (caso MOJA). **`next build` compila, typechquea y prerenderiza** las 5 rutas; el cálculo fluye desde el motor compartido (verificado end-to-end).
> - ✅ **Mejor jugada reconciliada** con `calculadora-client.tsx`: usa el mismo motor (`computeProyectoMod40` para Ley 73 con Mod 40) y presenta el **marco realista** — pensión de→a, **multiplicador (×N)** y **efectivo neto del cliente** tras crédito DXN + retroactivo (no el bruto a pagar al IMSS). Caso MOJA: $7,800 → $88,300 (×11.3), efectivo del cliente ~$407k (financiado), con nota de que el nivel de UMAs se ajusta en la calculadora. `next build` verde (5/5 rutas, tipos válidos).
> - ✅ **Inc 0 completo (UI)**: 3 pantallas cableadas — **Diagnóstico** → **Mejor jugada** (desbloqueo dual: pagar $100 / puntos, con cómo ganar puntos) → **Checkout** (SPEI-first / tarjeta, CFDI opcional, cashback 10%, y estado post-pago: éxito + abrir producto + cashback). Catálogo de productos (§6) y economía de puntos (§6). `next build` verde (7/7 rutas). Pago **simulado** (sin pasarela real todavía).
> - ✅ **Llave 1 (auth + semilla real)**: `@supabase/ssr` cableado (server/client/middleware), **login teléfono+OTP** (`/login`), y lectura de `clientes.calculo_pensional` por **últimos 10 dígitos del teléfono** (`lib/cliente.ts`), con fallback a semilla demo y manejo de semilla hueca/v1 ("calculadora aún no lista"). Las 3 pantallas ya consumen la **sesión real**. `.env.local` con URL + anon key. `next build` verde (8 rutas + middleware). Esquema confirmado vía Supabase MCP: `clientes` tiene `telefono`, `curp`, `calculo_pensional`; **aún no** `auth_user_id` (es del §15).
> - ✅ **Vínculo `auth_user_id` (en producción)**: aplicada migración aditiva a `clientes` (`auth_user_id uuid` + índice), RPC `vincular_cliente_actual()` (SECURITY DEFINER, liga una fila por teléfono al iniciar sesión) y **policy RLS `clientes_select_self`** (cada cliente lee solo su fila por `auth_user_id`). La app lee por `auth_user_id` (exacto) con fallback por teléfono y llama al RPC tras el OTP. `next build` verde.
> - ✅ **Llave 1 verificada en vivo (22 jun)**: OTP por **Twilio Verify** (200), sesión, **RPC de vínculo** corriendo. Bug encontrado y corregido: el trigger `handle_new_user_link_partner` rompía signups por teléfono (insertaba `partner` con `name` nulo) → se le añadió `if NEW.email is null then return NEW`.
> - ✅ **Calculadora de espera sin-CURP** (`CalculadoraEspera.tsx` + `lib/estimacion.ts`): si el cliente está autenticado pero su ficha aún no tiene semilla (sin SISEC), captura datos a mano (nacimiento, 1ª/última cotización, semanas, salario) y estima Ley 73 con el mismo motor, **sin depender del historial ni PDF**. Incluye **conservación de derechos (Art. 150/151)**: vigente/suspendido + semanas para reactivar, y aviso de semanas mínimas (500). Sin selector de sexo (no afecta Ley 73). Estilo/copy pulidos para el segmento.
> - 🔜 Pendiente F2: pasarela de pago real + webhook→fulfillment; resto del modelo de datos §15 (`ordenes_b2c`, `puntos_movimientos`, `referidos`); dedupe de `clientes` por CURP. [ABIERTO] §18: default de UMAs (decisión de producto).

## Secuencia de build priorizada (22 jun)

Capstone que ordena todo lo decidido. Regla: primero hacer **transaccional** el Inc 0, luego **encender la base dormida** (quick wins §12), luego cerrar la **costura de frío**, y al final crecimiento/ambicioso.

### ✅ Ya hecho (Inc 0 base)
`@trol/pension-core` (motor, 30/30 tests) · `trol-b2c` (Next 14, marca) · Inc 0 UI: Diagnóstico → Mejor jugada (desbloqueo dual) → Checkout (pago simulado) · **Llave 1**: OTP + Twilio Verify + vínculo `auth_user_id` + RLS · calculadora de espera sin-CURP con conservación de derechos + rescate (descarga IMSS / envío por WhatsApp) · consentimiento legal en login.

### Sprint 1 — Hacer transaccional el Inc 0 (Llave 2, monetización propia)
1. ✅ **Modelo de datos §15 (aplicado a prod 22 jun)** — `ordenes_b2c`, `puntos_movimientos` (ledger), `referidos` creadas con RLS (cada cliente ve solo lo suyo; escrituras por service role/n8n) + columnas `clientes.etapa_actual` y `products.precio_mxn` (precios poblados: CALCULADORA $100, AVANZADO $500, +SESIÓN $800, CHECKUP $0; conviven con `price_credits` del B2B). Advisor de seguridad sin issues nuevos.
2. ✅ **Pasarela Mercado Pago — SPEI VALIDADO EN PRODUCCIÓN (23 jun)** — **SPEI nativo** (§13): `app/api/pago/spei` (`payment_method_id:'clabe'` → CLABE en nuestra pantalla); tarjeta vía Checkout Pro. **Prueba real exitosa en `app.trol.mx`**: transferencia SPEI $100 → webhook MP → orden cumplida + cashback + etapa + calculadora desbloqueada, todo automático (~3 min de acreditación). Notas: SPEI requiere credenciales de **producción** (no sandbox) y monto ≥ mínimo MP (>$1); `notification_url` solo se envía si el sitio es https; webhook configurado en MP (modo productivo). Fix aplicado: lock `FOR UPDATE` en `procesar_pago_orden` (webhooks duplicados de MP duplicaban cashback). TODO: validar firma `x-signature`.
4b. ✅ **Fulfillment (22 jun)** — RPC `procesar_pago_orden(orden, ref)` (service-role only, idempotente): marca orden cumplida, **acredita cashback 10%** (solo pago, no puntos; caduca 6m) y **avanza `etapa_actual`**. El webhook lo llama al `approved` y además dispara n8n (`N8N_FULFILLMENT_URL`) para el **refresh con Jordan** (si semilla +1 mes) + generación de documento. Verificado: orden cumplida, etapa 4, cashback +10 pts.
3. ✅ **Desbloqueo por puntos real (22 jun)** — RPCs `saldo_puntos()` y `desbloquear_con_puntos()` (atómico, SECURITY DEFINER) en prod; app lee saldo real y la pantalla de Checkout (vía puntos) lo consume. **Backend verificado** (RPC → ok, saldo 150→50, orden creada). El click en UI requiere un `dev` recién reiniciado para hidratar.
   - *Datos de prueba en el contacto "Trol" (`54ef607d…`), removibles:* semilla v2 demo (caso MOJA) + 150 pts de cortesía + 1 orden de la prueba.

### Sprint 2 — Encender la base dormida (quick wins §12: L3 + L4)
4. **Ruteo Llave 3 multi-producto** sobre señales ya calculadas/score — Mod 40 + gestoría IMSS/Infonavit + PPR + traspaso AFORE + crédito de pensión → "mejor jugada" por perfil. Monetiza 10k+ clientes con asesores **antes** de la superficie B2C completa.
5. **Llave 4 — comisiones** — activar estructura existente (`delegations`, `comisiones_cartera`); AFORE/PPR = handoff a asesor certificado.

### Sprint 3 — Cerrar la costura de frío (Llave 1 completa)
6. ✅ **Deploy + dominio LIVE (22 jun)** — **`https://app.trol.mx` en producción** (HTTPS, login + consentimiento renderizando). Repo `RaulGM83/trol-b2c` en GitHub → Vercel (Root Dir `trol-b2c`, 7 env vars). CNAME `app` en GoDaddy → Vercel ("Valid Configuration"). Fix aplicados: faltaba `NEXT_PUBLIC_SUPABASE_URL` (causaba 500) + `middleware` blindado para Edge. **Pendiente para SPEI real:** MP credenciales de producción en Vercel + webhook `https://app.trol.mx/api/pago/webhook` en MP.
7. 🟢 **Costura WhatsApp → web (prefill de teléfono):** `app.trol.mx/login?tel=…` precarga el celular; el cliente solo mete el OTP (nativo Supabase, sin acuñar sesión). El enlace mágico full sin-OTP queda como opción futura.
8. **Registro de consentimiento** (timestamp) + consentimiento en la captura de CURP del flujo WhatsApp (Tako).
9. **Calculadora pública** (tibios/SEO) en `app.trol.mx`, junto al blog.

### Sprint 4 — Crecimiento y producto (ambicioso / futuro)
10. Puntos/referidos completo (Inc 2) — viralidad.
11. Herramientas insignia §10: **calculadora de costo de retiro** (A8, alto ROI) y **comparador de AFOREs** (A6).
12. **ISSSTE** (motor + diagnóstico, sistema distinto).
13. Suscripción "horizonte" (Ley 97).

### Transversal (cualquier momento)
Limpieza/cifrado de **backups con PII** · **dedupe `clientes` por CURP** · asterisco/respaldo del claim "8x" · reconciliar default de UMAs (§18) · migrar n8n al paquete y **re-apuntar el portal a `@trol/pension-core`** (fuente única).

---

## Gaps detectados vs sitio actual trol.mx (22 jun)

Revisión de `trol.mx` (HubSpot marketing + `landing.trol.mx` blog/legal) vs lo construido:

- **ISSSTE [al roadmap]:** el sitio ofrece IMSS, **ISSSTE** e Infonavit, pero el motor/diagnóstico B2C es **solo IMSS (Ley 73/97)**. ISSSTE entra como **fase futura** con su propia lógica (sistema distinto). Mientras, se atiende vía asesor/gestor.
- **Costura sitio → app + dominio [a la secuencia]:** la app B2C vive en subdominio propio — **propuesto `app.trol.mx`** (`trol.mx` = marketing/HubSpot, `landing.trol.mx` = blog/legal). El "Regístrate" de trol.mx y el **enlace mágico de WhatsApp** llevan a `app.trol.mx`; tibios/SEO → calculadora pública en el mismo subdominio. (Confirmar subdominio.)
- **Herramientas insignia §10 [pendientes]:** comparador de AFOREs y calculadora de costo de retiro — ganchos gratis para tibios/SEO junto al blog. Nivel ambicioso, aún sin construir.
- **Taxonomía de productos ampliada:** el sitio ofrece **seguros, AFORE (traspaso) y créditos de pensión** además de Mod 40/PPR/Infonavit. El ruteo multi-producto y `productos.ts` deben contemplarlos. El "crédito de pensión" ya lo calcula el motor (crédito DXN = pensión×9).
- **Claim público "8x mejora promedio":** debe llevar asterisco/respaldo para no chocar con el posicionamiento anti-fraude ("sin montos garantizados").

## Decisiones de confianza y cumplimiento (22 jun)

- **Cifra puntual con disclaimer** (no rangos): se muestra el monto estimado marcado claramente como "estimación, no oficial". Ya implementado en la calculadora de espera y el diagnóstico. Mantener el disclaimer visible en toda pantalla con cifras.
- **Comisiones = divulgación estándar:** mostrar el costo al cliente y transparencia de producto (PPR/traspaso), **sin** detallar la comisión de Trol. Aplica cuando se construya el ruteo a terceros.
- **Pendientes de cumplimiento (acciones):**
  - **Consentimiento CURP/NSS** (LFPDPPP): ✅ implementado en el login (`login-form.tsx`) — checkbox obligatorio con enlaces a Términos y Aviso de Privacidad (`lib/legal.ts`, hoy al sitio actual; cambiables a páginas in-app) + autorización para consultar el IMSS; el botón se bloquea hasta aceptar. Pendiente: repetir/registrar el consentimiento en la captura de CURP del flujo WhatsApp y guardar timestamp de aceptación.
  - **AFORE/PPR → asesores certificados y autorizados [CONFIRMADO 22 jun]:** Trol hace **handoff a asesores certificados/autorizados** (vía `delegations`); sin beneficio monetario al cliente por cambiarse de AFORE.
  - **Backups con PII** (`clientes_backup_*`, `clientes_nombres_backup`): purgar o cifrar (riesgo LFPDPPP).
- **Señales de confianza:** WhatsApp verificado (OBA verde), "trámite IMSS gratis / sin anticipos" en cada paso (ya en la app), badges regulatorios (modelo Sofía) según credenciales disponibles.

## Decisiones de monetización (22 jun)

- **Calculadora pro $100 mantiene precio.** Es producto real y **también se vende a B2B** (portal de aliados), así que no se regala. Para B2C, la vía principal de desbloqueo es **ganarla con puntos** (referidos, encuesta, hitos — §6/§8); el pago en efectivo queda como alternativa. Así se quita la barrera del segmento de bajo ingreso sin tirar el precio ni canibalizar el B2B.
- **El $100 incluye actualizar la información [DECIDIDO 22 jun]:** las semillas hoy están desactualizadas (Belvo puede mandar datos viejos, o la semilla llegó hace mucho). La Calculadora pro **incluye refrescar los datos con el IMSS vía Jordan** (que siempre devuelve la información de hoy) **cuando la semilla tiene más de 1 mes**. Justifica el precio (modelo Zenfi: cobrar por actualizar el reporte) y evita mostrar datos viejos.
  - *Build (Sprint 1, en el fulfillment):* al desbloquear CALCULADORA_ADDON, comparar `clientes.calculo_pensional_at` vs hoy; si `> 30 días` → re-pull vía **Jordan** → regenerar semilla → abrir la calculadora con datos frescos. Mostrar "datos al DD/MM" en el diagnóstico.
- **Énfasis en "gánala":** la pantalla de Mejor jugada ya muestra desbloqueo dual (pagar / puntos) y "cómo ganar puntos"; esa es la ruta destacada para B2C.
- *[Propuesto, no decidido]* cashback 10% acreditado al **siguiente producto** (escalera hacia el Avanzado $500) en vez de devolver pesos.
- **Ruteo Llave 3 = multi-producto desde el inicio:** el motor evalúa el perfil ya scoreado y rutea a la mejor jugada entre **Modalidad 40, gestoría IMSS/Infonavit y PPR** (matriz §7). La "mejor jugada" en pantalla = la recomendación de mayor valor para ese perfil.
- **Suscripción "horizonte" (~5 USD/mes):** se reserva para Ley 97 / perfiles con ingreso; no para el frío de bajos ingresos.

## Decisiones de estrategia en frío (22 jun)

- **Entrada de frío = todo por WhatsApp** (Meta → click-to-WhatsApp, §13). Dentro de WhatsApp, **dos caminos gestionados con Tako**:
  1. **Con CURP (principal):** el bot busca el CURP para entregar asesoría básica y **perfilar oportunidades**. Hoy se logra con fricción manejable → es el default.
  2. **Sin CURP (rescate):** a quien se resiste o da datos sin soltar el CURP, Tako le manda el **link a la calculadora sin-CURP** (estimación direccional). No se pierde el lead; queda la puerta abierta para pedir CURP después.
  - Ese link de rescate conviene que sea **enlace mágico** (el lead ya dio su teléfono en WhatsApp): entra identificado y, si luego suelta el CURP, la misma sesión sube al diagnóstico real. La calculadora pública abierta se reserva para tibios/SEO/retargeting.
- **Costura WhatsApp → web = enlace mágico con token** (one-time, apoyado en el teléfono ya verificado en WhatsApp): entra al cliente ya autenticado a la web con su caso a la vista, sin re-teclear OTP. El OTP queda solo para quien llega a la web en frío.
  - *Implicación de build:* generar/validar un token de un solo uso (tabla `b2c_magic_tokens` o token firmado por n8n) y una ruta que canjee el token por sesión Supabase. Pendiente para cuando se construya el flujo de WhatsApp.
- **CURP lo más tarde posible:** estimación direccional sin CURP → captura de teléfono (o ya viene de WhatsApp) → CURP solo para el cálculo oficial.
- La **calculadora sin-CURP es la misma pieza con dos entradas**: sala de espera post-login y (a futuro) gancho público para tibios.
- **Camino de rescate — error al obtener datos [DECIDIDO 22 jun]:** cuando la obtención automática falla (sin SISEC), la misma pantalla de espera muestra la calculadora manual **+ CTA "Enviar mi hoja por WhatsApp"** (Reporte de Semanas Cotizadas del IMSS). Recepción por **WhatsApp/Tako** (sin backend de subida por ahora); el asesor/pipeline arma la semilla con esa hoja. Implementado en `CalculadoraEspera.tsx` (var `NEXT_PUBLIC_WHATSAPP_TROL` — pendiente poner el número real). Subida web a Supabase Storage queda para cuando el volumen lo pida.

> **Distinción clave (corregida):** la app B2C es **autoservicio para el cliente final**, **distinta** de la herramienta de los asesores (portal B2B). Comparten **backend** (Supabase + n8n) y **motor de cálculo** (paquete compartido), pero son **deploys, dominios, auth y entornos separados** [Plan Maestro §14, §19].

---

## 0. TL;DR de implementación

1. **Repo B2C independiente** + **paquete compartido `@trol/pension-core`** (motor Ley 73/97 + Mod40 + recuperar semanas + UMA + lógica de edad + tipos Supabase + cliente de datos). Backend compartido (Supabase, n8n). [§19]
2. **Primer release = Incremento 0:** página autenticada (teléfono+OTP) que muestra **Diagnóstico + Mejor jugada** y vende **1 producto con pago integrado**, validando la cadena **auth → pago → fulfillment**. [§14, §16]
3. **Complementar la calculadora B2C con la B2B = portar el motor oficial al paquete compartido y consumirlo desde la app B2C** con las correcciones de §18 (comparador de modalidades, salario en UMAs, edad min(60,actual)→65, jala perfil solo).
4. En paralelo (no bloqueante): **Llave 3 (ruteo)** y **Llave 4 (comisiones)** para monetizar la base dormida (10k+ clientes ya calculados) con asesores antes de que exista la superficie B2C. [§12]

---

## 1. Arquitectura objetivo (espejo del B2B, superficie separada)

```
Repos
├─ trol-portal/            (EXISTE — asesores B2B/B2C internos; NO se toca su deploy)
├─ trol-b2c/               (NUEVO — app pública de cliente final)
│  ├─ app/ (Next.js, dominio y env propios)
│  │  ├─ (auth)/           phone OTP (Supabase Auth)
│  │  ├─ diagnostico/      pantalla 1
│  │  ├─ mejor-jugada/     pantalla 2 (desbloqueo dual: $ / puntos)
│  │  └─ checkout/         pantalla 3 (pago integrado)
│  └─ ...
└─ @trol/pension-core/     (NUEVO paquete compartido — consumido por ambos)
   ├─ engine/   Ley73, Ley97, Mod40 (futura/retro), recuperar-semanas, UMA, edad
   ├─ types/    tipos generados de Supabase
   └─ data/     cliente de lectura de Supabase de cara al cliente
```

**Backend (reuso, sin duplicar):** Supabase `orgagfdxygtjiwqvgckw` = lectura de cara al cliente (RLS por cliente); HubSpot = source of truth (sync vía `bloque_c_property_updates` / n8n — blindar esa cola); n8n = gateway/fulfillment; catálogo `products` reutilizado. [§14]

**Por qué repo separado y no rutas en el portal:** evita drift de la calculadora entre asesor y cliente, aísla el blast radius de la superficie pública, y permite deploy/dominio/auth/env propios (no negociable). Migrar a monorepo Turborepo *después* si crece. [§19]

---

## 2. El paquete compartido `@trol/pension-core` (la pieza que "complementa")

Es el corazón del encargo: **un solo motor para asesor y cliente**, sin reinventar.

- **Contenido:** motor de cálculo oficial de Trol (cuantía Ley 73, promedio últimas 250 semanas, factor de edad, Ley 97 saldo/URV, Mod40 futura y retroactiva, recuperar semanas descontadas, tablas UMA), + tipos de Supabase + cliente de datos. [§18, §19]
- **Origen:** portar **tal cual** desde el código del portal B2B (front) y/o el nodo n8n `PensionCalculator` v5.0 / `ley97.ts`. **No reconstruir** (riesgo de drift; está validado al centavo). [§18]
- **Correcciones de §18 que deben quedar en el motor/UI B2C:**
  - Salario **mensual + equivalente en UMAs** (tope 25 UMA), no diario.
  - Edad arranca en **la menor entre 60 y la edad actual** y proyecta por edad (cesantía 60→64, vejez 65).
  - **No** es "con/sin Mod40": es un **comparador de todas las modalidades**.
  - Incluir **recuperar semanas descontadas** (`procesos.semanas_descontadas/recuperadas`) y **Mod40 retroactiva** (`clientes.mod40_retro_*`).
  - **Jala el perfil solo** (semanas, salario, edad), no recaptura.
- **[ABIERTO] a confirmar al abrir el código real:** (1) mecánica exacta de duración de Mod40; (2) si muestra pensión en cada edad o la óptima; (3) set completo de modalidades que compara la B2B. [§18]

> Estado actual en esta sesión: el scaffold `pension-engine/engine.js` + `calculadora-b2c-demo.html` es un **stand-in** funcional con la fórmula Ley 97 validada y la penalización por edad. Se **reemplaza** por el motor portado real al conectar `trol-portal` / `Diagnostico básico trol`.

---

## 3. Incremento 0 — primer release vendible

**Meta:** validar **auth → pago → fulfillment** sobre la base ya calculada. Se monta sobre Llave 3 (ruteo). [§14]

**Costura WhatsApp → web:** WhatsApp (Tako) cierra valor etapas 0–2 y lanza el gancho de "mejor jugada" (etapa 3, "de $X a $Y") con link a la web **sembrado con contexto** (no recaptura). [§16]

**3 pantallas** [§16]:
1. **Diagnóstico** — pensión hoy, escenario máximo (con edad), semanas, régimen, conserva-derechos Ley 73 como estatus.
2. **Mejor jugada** — una sola recomendación (estilo *approval odds*) + **desbloqueo dual**: págala ($100) / gánala con puntos.
3. **Checkout** integrado con el caso a la vista, SPEI/tarjeta, CFDI opcional.

**Estados de borde:** sin-CURP → formulario → diagnóstico direccional; puntos → saldo + acciones; post-pago → éxito + avance + abrir producto + cashback. Stepper firma **"Tu avance"** (6 pasos). [§16]

---

## 4. Modelo de datos del Inc 0 (aditivo, en rama de dev — NO producción)

Aplicar §15 en una **branch de Supabase** (no en prod):
- Columnas: `clientes.auth_user_id`, `clientes.etapa_actual`, `products.precio_mxn`.
- Tablas nuevas: `ordenes_b2c`, `puntos_movimientos` (ledger FIFO, expira +6m), `referidos` (flags idempotencia).
- Flujos: desbloqueo por pago (webhook→pagado→workflow→doc→cumplido→cashback 10%); por puntos (consume FIFO, sin cashback); ganar puntos por hitos; barrido nocturno de caducidad. RLS por cliente; escrituras por service role (n8n). [§15]

---

## 5. Pago integrado [§13]

- **Per-ítem, SPEI-first.** Arrancar subiendo el **Mercado Pago de "link" a Checkout integrado** (Bricks/Checkout Pro) y/o **Conekta** (SPEI ~1%, webhook de conciliación). **STP** después (setup caro, conviene con volumen). CFDI con Facturapi.
- Pago **dentro de la web autenticada sembrada desde WhatsApp**, con el caso a la vista (la confianza se gana/pierde en la costura).

---

## 6. Fases y secuencia

| Fase | Entregable | Bloquea |
|---|---|---|
| **F0** Acceso al código | Conectar `trol-portal` + `Diagnostico básico trol`; congelar motor canónico v2.0.0-rendimientos-consar | Todo el motor real |
| **F1** Paquete compartido | `@trol/pension-core` con motor portado + golden tests vs Excel; correcciones §18 | Calculadora B2C |
| **F2** Scaffolding B2C | Repo `trol-b2c` (Next.js, dominio/env propios) + auth phone OTP + match contra `clientes` | Inc 0 |
| **F3** Datos Inc 0 | Migración §15 en branch Supabase | Pago/puntos |
| **F4** Inc 0 UI | 3 pantallas (§16) con brandbook (§17), consumiendo `@trol/pension-core` | Release |
| **F5** Pago + fulfillment | Mercado Pago/Conekta + webhook → workflow → doc → cashback | Monetización |
| **F6** Paralelo | Llave 3 (ruteo) + Llave 4 (comisiones) con asesores; A8 calculadora retiro; A6 comparador AFOREs | — |
| **F7** Verificación | Paridad numérica calculadora B2C vs B2B vs Excel; pruebas de pago sandbox | Go-live |

**Quick wins (no bloqueados por Llave 1):** F6 — encender ruteo + comisiones monetiza la base dormida con asesores **antes** de que exista la superficie B2C. [§12]

---

## 7. Cumplimiento (guardas) [§20]

Anti-fraude como posicionamiento ("el trámite IMSS es gratis", sin anticipos, sin montos garantizados); AFORE traspaso vía asesor previsional certificado (sin beneficio monetario al cliente); PPR con transparencia de costo; privacidad LFPDPPP (RLS, consentimiento CURP/NSS, resolver retención de backups con PII).

---

## 8. Próximos pasos inmediatos

1. **Tú:** conectar a una sesión `trol-portal` y `Diagnostico básico trol` (F0).
2. **Yo:** portar el motor a `@trol/pension-core`, reconciliar el scaffold actual, y dejar el repo `trol-b2c` esqueleto + Inc 0 pantalla 1 (Diagnóstico) consumiendo el motor.
3. Aplicar §15 en branch de Supabase y cablear el primer checkout sandbox.

> **Mientras tanto** (sin el repo conectado): el demo `calculadora-b2c-demo.html` ya refleja la UX corregida de §18 con el brandbook de El Trol, para validar look & feel y lógica de comparador.
