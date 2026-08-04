# Envío a clientes web (referidos + orgánicos) — config Tako + n8n

## Por qué hoy no les llega nada (aunque diga "Diagnostico enviado")

En el workflow `Envio_info`, los web leads entran con `interes_reciente = "Asesoría basica Booster"`
→ rama **HTTP Request8**, que postea el reporte a:

```
https://api.insuranceboosters.com/.../conversations/{{ id_booster }}/system-events
```

**El problema:** un web lead **no tiene `id_booster`** (en el pinData de Andrea: `id_booster: null`).
Esa llamada cae en `conversations/null/...` → **no entrega**. Y como el nodo tiene
`onError: continueRegularOutput` y luego corre **Update a row3** (estado = "Diagnostico enviado")
**sin condición**, el proceso se marca como enviado aunque el WhatsApp nunca salió.

→ Por eso Vero y Andrea no recibieron WhatsApp: el system-event de Booster solo funciona para
clientes que **ya tienen conversación abierta en Booster** (los que entraron por el bot de WA).

## La regla de WhatsApp que define la solución

A un número **sin conversación abierta** (todos los web leads) solo puedes **iniciarle con una
PLANTILLA aprobada**. El mensaje libre / system-event solo funciona dentro de la ventana de 24 h
de una conversación ya abierta. **Conclusión: los web leads necesitan PLANTILLA, no el system-event de Booster.**

---

## Cómo enrutar en n8n (mínimo cambio, sin tocar el upstream)

Dentro de la rama **"Asesoría basica Booster"**, bifurca por `id_booster`:

1. Agrega un nodo **IF** justo después del Switch (output 2):
   - Condición: `{{ $json.body.id_booster }}` **is empty** (o `id_supabase` presente y `id_booster` vacío).
2. **TRUE (web lead, sin Booster):** → manda al subflujo de plantilla (ver abajo).
3. **FALSE (vino del bot Booster):** → tu `HTTP Request8` actual (system-event), como hoy.

> Alternativa más limpia a futuro: que el upstream (Cálculos) etiquete a los web leads como
> `interes_reciente = "Asesoria web"` y los mande al output 4, ya reservado para eso. Pero el split
> por `id_booster` no requiere cambiar nada aguas arriba y atrapa a todos.

### Usa el subflujo `Call 'WA_Send_Template'`, no `HTTP Request: POST Tako`
- `Call 'WA_Send_Template'` ya **loguea en `envios_wa`** (audit + gates anti-spam). Úsalo.
- `HTTP Request: POST Tako` está incompleto (su body `{{ $json.body_json }}` no se arma en ningún
  nodo). Déjalo de lado.

### Config del nodo "Edit Fields" (Set) que alimenta el subflujo
| Campo | Valor |
|---|---|
| `mode` | `template` |
| `phoneNumberId` | `933742489812669` (ya está) |
| `template_name` | **la plantilla elegida** (ver sección Tako) |
| `event_name` | `diagnostico_listo_web` (o lo que tu subflujo espere) |
| `trigger_source` | `web_diagnostico` |
| `id_hubspot` | `={{ $('Webhook Nubarium').item.json.body.id_hubspot }}` (ya está) |
| `conversationId` | `""` (vacío: es plantilla, abre conversación) |
| `bypass_gates` | `true` para los primeros tests; luego `false` |
| **destino (teléfono)** | Verifica que el subflujo reciba el celular. Si no lo saca de HubSpot por `id_hubspot`, pásalo: `=521{{ $('Webhook Nubarium').item.json.body.mobile }}` |
| **variables de plantilla** | en `extra_payload`: nombre y link (ver mapeo abajo) |

### Variables de plantilla (extra_payload)
- `nombre` ← `={{ $('Webhook Nubarium').item.json.body.Contacto.nombre }}`
  - ⚠️ En el pinData de Andrea `Contacto.nombre` viene **null**. Pon un fallback:
    `={{ $json.body.Contacto.nombre || 'Hola' }}` para no mandar "Hola null".
- `url_herramienta` ← `={{ $('Webhook Nubarium').item.json.body.url_herramienta }}`
  (ya viene armado: `https://app.trol.mx/e/<cliente_id>?c=nuevo`).

---

## Tako / WhatsApp: ¿plantilla nueva o reusar?

### Recomendación (día de lanzamiento): **reusa una aprobada HOY + registra la nueva en paralelo.**
Una plantilla nueva tarda en aprobarse por Meta (horas, a veces más). Para no bloquear:

**Reusar ya — `reactivacion_calculadora3`** (ya aprobada):
- `{{1}}` = nombre
- `{{2}}` = `url_herramienta`
- Copy actual ("estrenamos calculadora interactiva… entra aquí: {link}") funciona bien para un
  lead fresco. Es lo más rápido para que Vero/Andrea y los próximos sí reciban el link.

### Plantilla nueva (mejor copy) — regístrala en Tako/WhatsApp Manager
- **Nombre:** `trol_diagnostico_listo`
- **Categoría:** UTILITY (es transaccional: "tu diagnóstico solicitado está listo" → aprueba más rápido y no exige opt-in marketing)
- **Idioma:** es_MX
- **Body:**
  > Hola {{1}} 👋 Ya tenemos lista tu información: tu diagnóstico de pensión de El Trol está disponible. Entra a verlo en vivo y mueve tus escenarios (edad, semanas, Modalidad 40, ahorro). Solo te pediremos un código por SMS para entrar.
- **Botón (Call to action → Visit website, dinámico):**
  - Texto: `Ver mi diagnóstico`
  - URL base (fija): `https://app.trol.mx/e/`
  - Sufijo dinámico `{{1}}` (ejemplo): `b433be7e-f984-4a2f-b57e-70f865be64fb?c=nuevo`
  - En n8n, el sufijo = `={{ $json.body.id_supabase }}?c=nuevo`
- **Variables:** body `{{1}}` = nombre · botón `{{1}}` = `<cliente_id>?c=nuevo`

> Usar **botón URL dinámico** (base fija + sufijo) es lo que más le gusta a Meta y aprueba más
> rápido que meter una URL completa como variable de texto.

### El PDF y el texto largo del diagnóstico
La plantilla solo lleva nombre + link a la app. El `url_asesoria` (PDF en Drive) y el texto largo
(`asesoria_basica`) **no caben** en plantilla. Opciones:
1. **Hoy:** con el link a la app basta — el diagnóstico vivo está dentro.
2. **Mejor:** adjunta el PDF como **header tipo Documento** en la plantilla nueva (1 variable de
   documento = `url_asesoria`). Así el PDF va en el mismo mensaje.
3. Cuando el cliente responda (abre ventana 24 h), puedes mandar el texto largo libre.

---

## Checklist
- [ ] n8n: IF por `id_booster` vacío dentro de la rama "Asesoría basica Booster".
- [ ] n8n: rama TRUE → `Call 'WA_Send_Template'` vía "Edit Fields" configurado (tabla arriba).
- [ ] n8n: fallback de `nombre` para no mandar "null".
- [ ] Tako: elegir `reactivacion_calculadora3` (hoy) y/o registrar `trol_diagnostico_listo`.
- [ ] No marcar "Diagnostico enviado" hasta que el envío de plantilla responda OK (mover Update a
      row3 a la salida exitosa del subflujo, no antes).
- [ ] Prueba: reenviar a Vero (id_supabase 80774c85…) y Andrea (b433be7e…) y verificar fila en `envios_wa`.
