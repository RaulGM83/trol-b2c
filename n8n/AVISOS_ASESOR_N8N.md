# Avisos a asesores — encuesta de AFORE contestada

**Qué quedó vivo en Supabase (19-jul-2026):** cada vez que un cliente contesta (o actualiza) la
encuesta de AFORE, un trigger encola un aviso en la tabla `avisos_asesor` con TODO el contexto
que la asesora necesita para aprovechar la respuesta en caliente. n8n solo tiene que drenar la
cola y repartir. Sigue el mismo patrón que `bloque_c_property_updates`.

## Qué trae cada aviso (`payload` jsonb)

| Campo | Ejemplo | Para qué |
|---|---|---|
| `evento` | `encuesta_respondida` / `encuesta_actualizada` | primera vez vs edición |
| `nombre`, `telefono`, `cliente_id` | — | contactar y abrir la ficha |
| `afore` | `SURA` | la AFORE declarada (¡dato que no teníamos!) |
| `atencion`, `asesoria` (1–5), `recomendaria` (0–10) | — | detractor ≤6 = oportunidad de traspaso |
| `comentario`, `situacion_pensional` | texto libre | el "dolor" en palabras del cliente |
| `interes_ahorro`, `infonavit_usado` | bool | cross-sell (PPR / Millas F2) |
| `horizonte_retiro`, `situacion_laboral`, `ahorro_mensual`, `estado` | — | calificar el lead |
| `contacto_canal`, `contacto_horario` | `whatsapp` / `tarde` | **contactar como el cliente pidió** |
| `saldo_rcv97_ref` | `812000` | tamaño de la oportunidad |
| `contrafactual.*` | mediana, top, brechas, flag | los números del comparativo para abrir la charla |

`prioridad = 'alta'` cuando: interés en ahorro ✓, o dejó canal de contacto, o se retira ya/1-2 años,
o recomendaría ≤6, o saldo ≥$500k. El resto es `media`.

## Workflow importable (lo más rápido)

En esta carpeta está **`avisos_asesor_workflow.n8n.json`** — impórtalo en n8n
(menú ⋯ → *Import from file*) y solo faltan 2 cosas:

1. Pegar el **service_role key** de Supabase en los headers de los nodos "Avisos pendientes"
   y "Marcar enviado" (donde dice `REEMPLAZA_SERVICE_ROLE_KEY`).
2. Conectar la **credencial de Gmail** en el nodo "Email a asesoras" (o cambiar ese nodo por
   el HTTP de Tako si prefieren el aviso por WhatsApp interno — gasta conversación; el email es gratis).

El email llega a Mónica, Verónica y Andrea con asunto `🔴/🔔 Encuesta AFORE: {nombre} ({afore}) —
prioridad {alta|media}` y el cuerpo completo (contacto preferido, comentario, saldo, comparativo).
Si el envío falla, el aviso queda pendiente y se reintenta al siguiente ciclo (cada 5 min).

## Flujo n8n de referencia (si prefieres armarlo a mano — 3 nodos)

1. **Schedule (cada 5 min) → HTTP GET** pendientes:
   `GET https://orgagfdxygtjiwqvgckw.supabase.co/rest/v1/vista_avisos_asesor_pendientes?select=*`
   Headers: `apikey: <service_role>` · `Authorization: Bearer <service_role>`
   (la vista ya viene ordenada: alta primero, luego por antigüedad).

2. **Repartir el aviso** (elige uno o ambos):
   - *Email a las asesoras* (Mónica, Verónica, Andrea — tabla `asesores`): asunto
     `🔔 {{nombre}} evaluó su AFORE ({{afore}}) — prioridad {{prioridad}}` y el payload formateado.
   - *WhatsApp interno vía Tako* al número del equipo (mismo endpoint template de siempre) —
     útil si quieren el aviso en el teléfono. Ojo: eso gasta conversación de WhatsApp; el email es gratis.
   Mensaje sugerido:
   ```
   🔔 Encuesta AFORE contestada — prioridad {prioridad}
   {nombre} · {telefono}
   AFORE: {afore} · Recomendaría: {recomendaria}/10 · Atención {atencion}★
   Retiro: {horizonte_retiro} · Ahorro/mes: {ahorro_mensual} · ¿Interés en ahorro?: {interes_ahorro}
   Contactar por {contacto_canal} en la {contacto_horario}
   💬 "{comentario}"
   💰 Su comparativo: top {contrafactual.canasta_superior_prom} vs mediana {contrafactual.mediana_sistema}
   ```

3. **HTTP PATCH** para cerrar el aviso:
   `PATCH .../rest/v1/avisos_asesor?id=eq.{{id}}`
   Body: `{ "status": "enviado", "sent_at": "{{ $now }}" }`
   (si el envío falla: `{ "status": "error", "error_detail": "...", "push_attempts": n }` — o
   simplemente no lo marques y el siguiente ciclo lo reintenta).

## Detalles anti-ruido ya resueltos en el trigger

- El RPC de la encuesta hace un segundo UPDATE interno (puntos): **no** genera doble aviso.
- Si el cliente edita su encuesta 2 veces antes de que corra n8n, el aviso pendiente se
  **reemplaza** (nunca 2 avisos del mismo cliente en cola).
- `avisos_asesor` tiene RLS sin políticas públicas: solo el service role (n8n) la ve.

## Cambios de app ya aplicados (19-jul, tarde)

- `app/encuesta/page.tsx`: pasa `volverHref` desde `?volver=comparativo` → al terminar la encuesta
  el cliente regresa al comparativo a ver dónde quedó su AFORE. ✅
- `app/e/[token]/page.tsx`: si el link de campaña trae `?c=comparaafore_*`, el banner habla del
  comparativo y tras el OTP aterriza en **/comparativo** (no en /diagnostico). ✅
- `app/login/page.tsx` + `login-form.tsx`: soportan `?next=/comparativo` (solo rutas internas). ✅
- `lib/whatsapp.ts`: nuevo `WA.comparaAfore()` — mensaje prellenado del unlock (estado de cuenta /
  localizar AFORE / actualizar datos); `/comparativo` ya lo usa. ✅
