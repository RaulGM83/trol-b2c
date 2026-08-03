# Propuesta de mejoras a la experiencia B2C — 2-jul-2026

> **Estado (2-jul PM): implementado #1–#7 y #9 de la tabla de priorización** (bug de puntos, asesoría básica, CTA único + teaser, chip de puntos, misión + bono bienvenida +20, puntos-primero, CLABE por WhatsApp, y pago mixto con la regla del mínimo SPEI $100 → resto < $100 se paga con tarjeta). Typecheck en verde; pendiente push/deploy y el workflow n8n de recuperación de órdenes pendientes (#7 backend). `etapa_actual` ahora se fija ≥ 1 al ver el diagnóstico (parte de #8).

**Base:** análisis del producto completo (código de `trol-b2c`) cruzado con los datos reales del lanzamiento (116 entraron, 0 convirtieron). Tres ejes pedidos: siguiente paso más claro, más gamificación, incluir la asesoría básica.

---

## 1. Diagnóstico de la experiencia actual

### a) El valor se regala antes del paywall
La pantalla `/diagnostico` (gratis) ya muestra **todo el insight**: pensión hoy, escenario máximo, mejor jugada con "de $X a $Y", multiplicador y efectivo del cliente. Cuando el usuario llega a `/mejor-jugada`, la pantalla le repite los mismos números y le pide $100 por… la calculadora interactiva. **El "wow" ya lo recibió gratis; el paywall protege la herramienta, no el insight.** Consistente con los datos: 116 vieron su diagnóstico y nadie pagó — pero 2 intentaron comprar el de $500 (el plan con humano). El valor percibido está en "¿y ahora qué hago?", no en mover sliders.

### b) No hay UN siguiente paso
Al final de `/diagnostico` hay **5 botones apilados con el mismo peso visual**: mejor jugada, asesor, comparador, encuesta, referidos. Es un menú, no un camino. El usuario sin guía elige "nada" (todos quedaron en etapa 0).

### c) La gamificación es decorativa e inconsistente
- El **saldo de puntos no se ve en ningún header** — solo aparece en mejor-jugada si ya llegaste ahí.
- **Bug de contenido:** `lib/puntos.ts` (`GANAR_PUNTOS`) muestra +40 referido / +80 contrata / +20 encuesta, pero el sistema real acredita **+100 referido / +50 encuesta** (y `/referidos` dice 100/50). La tabla de "cómo ganar puntos" en mejor-jugada miente en contra nuestra.
- El **stepper "Tu avance" no refleja avance real** (todos en etapa 0 en la BD; los pasos 4–6 son productos, no logros). No hay recompensa por completar nada.
- Quien contesta la encuesta gana 50 pts y se queda a 50 de desbloquear, **sin que nadie se lo diga** ("estás a 50 pts…" no existe).

### d) La asesoría básica no existe en la app
El catálogo salta de "calculadora $100" a "diagnóstico avanzado $500". La asesoría básica (la que ya entregan por WhatsApp en el flujo B2B) no tiene lugar en la experiencia: no hay un paso humano gratuito/barato que genere confianza y venda el de $500. El botón "Quiero mi plan completo con un asesor" lleva directo a productos de $500/$800 en frío.

### e) Fricción residual
- SPEI pendiente = pantalla de espera y ya; **no hay recuperación** (ni botón "mándame la CLABE por WhatsApp", ni seguimiento a órdenes abandonadas — hay una real de $500 esperando).
- `alcanzaPuntos` exige el 100%: no existe **pago mixto** (50 pts + $50).

---

## 2. Principios del rediseño

1. **Un solo siguiente paso por pantalla.** Lo demás va secundario o al menú.
2. **El avance es real y se guarda** (`etapa_actual` se actualiza al ver el diagnóstico, contestar encuesta, etc.). El stepper refleja la BD, no la ruta.
3. **Los puntos siempre visibles** (header) y siempre con distancia a la meta ("te faltan 50").
4. **Escalera de valor con humano:** diagnóstico gratis → **asesoría básica (gratis, WhatsApp)** → calculadora ($100/puntos) → avanzado ($500) → +sesión ($800).
5. **El insight premium se insinúa, no se regala** — sin romper el posicionamiento honesto.

## 3. Cambios concretos por pieza

### Header global (nuevo, ~1 componente)
Logo + **chip de puntos** ("⭐ 50 pts") + barra de avance compacta. El chip abre un mini-panel: cómo ganar más (valores correctos) y qué desbloquean.

### `/diagnostico` — de menú a camino
- Mantener: pensión hoy, régimen, conservación de derechos (eso es lo gratis honesto).
- **Mejor jugada en modo teaser:** mostrar el título y el multiplicador ("Tu caso tiene una jugada que puede multiplicar tu pensión ×11") pero el desglose de→a / efectivo / cómo lograrlo vive en el paso siguiente. Es reordenar el reveal, no ocultar información: el detalle completo sigue siendo parte de lo desbloqueable.
- **UN CTA primario:** "Ver mi mejor jugada". Debajo, UN secundario: "Hablar con un asesor (gratis)". Comparador/encuesta/referidos salen de aquí → viven en el panel de puntos y en la misión (abajo).
- Marcar `etapa_actual = 1` al renderizar (avance real).

### Misión "Activa tu plan" (nueva sección, la pieza de gamificación central)
Checklist visible en diagnóstico con barra de progreso a 100 pts:
- ✅ Ver mi diagnóstico (+20 pts de bienvenida — nuevo motivo, barato y dispara dopamina)
- ⬜ Evaluar mi AFORE (+50)
- ⬜ Invitar a un amigo (+100 cuando llegue a su diagnóstico)
- ⬜ Actualizar mis datos del IMSS (se desbloquea con la calculadora)

Con +20 de bienvenida y +50 de encuesta el usuario queda a **30 pts** de la calculadora → "invita a un amigo y desbloquea hoy". Cada acción acerca visiblemente a la meta. (El bono de bienvenida cuesta máx. 20×volumen en valor-desbloqueo, no pesos.)

### `/mejor-jugada`
- **Invertir el orden del desbloqueo dual:** primero "Gánala con puntos" (con la distancia exacta y el atajo sugerido según lo que le falte), después "o págala: $100". Los datos dicen que $100-primero convierte 0.
- **Corregir `GANAR_PUNTOS`** a los valores reales (+100/+50 y el resto que se defina). Bug, va ya.
- Añadir **pago mixto** (puntos + diferencia en pesos) — sube la conversión de los que tienen 50–99 pts.

### Asesoría básica (el eslabón que falta)
- Nuevo item de catálogo `ASESORIA_BASICA` — **$0**, tipo asesoría: "Platica tu caso 15 min por WhatsApp con un experto. Sin costo." CTA = deep link de WhatsApp con contexto del caso (ya existe `WA` en `lib/whatsapp.ts` y el equipo ya atiende ese canal).
- Aparece: como CTA secundario del diagnóstico, como paso 4 del stepper renombrado, y como primera tarjeta del hub `/asesoria` (hoy el hub arranca en $500 — en frío).
- **Su función es doble:** da el "¿y ahora qué?" humano que el paywall no resuelve, y es el canal natural de venta del avanzado $500 (que es lo que la gente intentó comprar sola). El asesor que atiende cierra ahí mismo con link de checkout.

### Stepper → "Tu plan" (renombrar pasos a logros)
`Tus datos ✓ → Diagnóstico ✓ → Mejor jugada → Asesoría básica (gratis) → Calculadora → Plan completo`. Cada paso muestra ✓ real desde `etapa_actual`. "Implementar" se quita hasta que exista.

### Checkout / SPEI
- En la pantalla de espera SPEI: botón **"Mándame la CLABE por WhatsApp"** (el 60+ no tiene la app del banco en el mismo teléfono… sí la tiene, pero se pierde al cambiar de app).
- **Workflow n8n:** orden `pendiente` > 1h → WhatsApp automático con CLABE + opción tarjeta. (Ya está en `PENDIENTES_POST_LANZAMIENTO.md` #1.)

### Post-desbloqueo
Tras abrir la calculadora, el siguiente paso explícito: "¿Quieres que un experto convierta esto en plan? Asesoría básica gratis" → escalera al $500.

## 4. Priorización

| # | Cambio | Esfuerzo | Por qué primero |
|---|---|---|---|
| 1 | Corregir `GANAR_PUNTOS` (valores reales) | Trivial | Bug visible que sabotea la vía de puntos |
| 2 | Asesoría básica gratis (catálogo + CTA WhatsApp) | Bajo | Captura la demanda demostrada de ayuda humana |
| 3 | Diagnóstico: 1 CTA primario + teaser de jugada | Bajo | Arregla la fuga principal del funnel |
| 4 | Chip de puntos en header + "te faltan X" | Bajo | Hace visible la moneda del juego |
| 5 | Misión "Activa tu plan" + bono bienvenida +20 | Medio | Motor de gamificación con meta alcanzable |
| 6 | Invertir orden desbloqueo (puntos primero) | Trivial | $100-primero convirtió 0/116 |
| 7 | SPEI: CLABE por WhatsApp + recuperación | Medio | Ingreso ya intencionado que se evapora |
| 8 | `etapa_actual` real + stepper de logros | Medio | Hace honesto el "Tu avance" |
| 9 | Pago mixto puntos+pesos | Medio | Después de ver datos de 1–8 |

**Métrica de éxito por cambio:** #3 → % que pasa de diagnóstico a mejor-jugada · #2 → conversaciones de asesoría iniciadas · #5 → % que completa ≥2 tareas de la misión · #6/#9 → desbloqueos totales.

## 5. Qué NO cambiar todavía

- **Precios** ($100/$500/$800): la señal de los $500 es de n=2; validar con la asesoría básica como canal de venta antes de mover precios.
- **El OTP:** convierte 40% apertura→login; no es el cuello.
- **Calculadora pro en sí:** el problema es el camino hacia ella, no la herramienta.
