# Nodo Tako — envío "diagnóstico web listo" (camino separado en Envio_info)

Esquema verificado contra un envío real con `response_status: 200` (tabla `envios_wa`).
Tako espera: `{ to, name, language, components[] }` con parámetros **nombrados**.

## 1) Body para pegar en el campo "Body" del nodo HTTP (Tako)

Pon el nodo en: contentType = **Raw** · rawContentType = **JSON**, y en Body pega esta expresión:

```
={{ JSON.stringify({
  to: '521' + ($('Webhook Nubarium').item.json.body.mobile || '').toString().replace(/\D/g,'').slice(-10),
  name: 'trol_diagnostico_listo',
  language: 'es',
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', parameter_name: 'nombre', text: ($('Webhook Nubarium').item.json.body.Contacto.nombre || 'Hola') }
      ]
    },
    {
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [
        { type: 'text', text: $('Webhook Nubarium').item.json.body.id_supabase + '?c=nuevo' }
      ]
    }
  ]
}) }}
```

- `to` → `521` + últimos 10 dígitos del celular (en el pinData `+526144755362` → `5216144755362`).
- `nombre` con fallback `'Hola'` porque en tu pinData `Contacto.nombre` viene **null**.
- El botón manda el **sufijo** del link de la app; la base la define la plantilla (ver §3).

### (Opcional) con banner arriba — agrega este componente al inicio de `components`:
```
{ type: 'header', parameters: [ { type: 'image', image: { link: 'https://orgagfdxygtjiwqvgckw.supabase.co/storage/v1/object/public/templates-wa-assets/trol_banner_landscape_1080x566.jpg' } } ] },
```

## 2) Nodo completo (pégalo en el canvas de n8n)

```json
{
  "parameters": {
    "method": "POST",
    "url": "https://api.insuranceboosters.com/api/v1/whatsapp/933742489812669/template",
    "authentication": "genericCredentialType",
    "genericAuthType": "httpHeaderAuth",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        { "name": "Content-Type", "value": "application/json" }
      ]
    },
    "sendBody": true,
    "contentType": "raw",
    "rawContentType": "application/json",
    "body": "={{ JSON.stringify({ to: '521' + ($('Webhook Nubarium').item.json.body.mobile || '').toString().replace(/\\D/g,'').slice(-10), name: 'trol_diagnostico_listo', language: 'es', components: [ { type: 'body', parameters: [ { type: 'text', parameter_name: 'nombre', text: ($('Webhook Nubarium').item.json.body.Contacto.nombre || 'Hola') } ] }, { type: 'button', sub_type: 'url', index: '0', parameters: [ { type: 'text', text: $('Webhook Nubarium').item.json.body.id_supabase + '?c=nuevo' } ] } ] }) }}",
    "options": {}
  },
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.4,
  "position": [-448, -880],
  "id": "a1b2c3d4-web-diag-0001",
  "name": "Tako: Diagnóstico web listo",
  "credentials": {
    "httpHeaderAuth": { "id": "ZpH9oZH41ozAipds", "name": "Tako_API_Key" }
  },
  "onError": "continueRegularOutput"
}
```

> Ojo: corregí el header. Tu nodo original tenía `Content-Type: x-ib-api-key` (error). El api-key
> ya lo inyecta la credencial `Tako_API_Key`; el header debe ser `Content-Type: application/json`.

## 3) Plantilla en Tako / WhatsApp Manager — `trol_diagnostico_listo`

Para que el JSON matchee, regístrala así:
- **Idioma:** `es` (no es_MX, para igualar el resto de tus plantillas).
- **Categoría:** UTILITY (transaccional: "tu diagnóstico está listo" → aprueba más rápido).
- **Body** con variable **nombrada** `nombre` (no posicional `{{1}}`, porque Tako manda `parameter_name`):
  > Hola {{nombre}} 👋 Ya tenemos lista tu información: tu diagnóstico de pensión de El Trol está disponible. Entra a verlo en vivo y mueve tus escenarios (edad, semanas, Modalidad 40, ahorro). Solo te pediremos un código por SMS.
- **Botón** tipo "Visitar sitio web" **dinámico**:
  - Texto: `Ver mi diagnóstico`
  - URL: `https://app.trol.mx/e/{{1}}`  ← base fija; el sufijo lo manda el nodo (`<cliente_id>?c=nuevo`)

## 4) Cómo conectarlo (camino separado)

- Apunta tu rama web (Switch output, p.ej. `interes_reciente = "Asesoria web"`, o tu split por
  `id_booster` vacío) a este nodo.
- **Después** de este nodo (en su salida exitosa) conecta el `Update a row` que marca
  `estado = "Diagnostico enviado"` — así el estado solo se marca si el envío respondió OK, no antes.
- Verifica el resultado: debe quedar fila en `envios_wa` con `response_status = 200` y aparecer el
  mensaje en el WhatsApp de prueba.

## Notas
- Este endpoint **inicia** conversación con plantilla (lo correcto para web leads sin conversación
  previa). El PDF (`url_asesoria`) y el texto largo no caben en plantilla: mándalos como mensaje
  siguiente cuando el cliente responda, o agrega el PDF como header tipo *document* en la plantilla.
- La plantilla debe estar **aprobada** por Meta antes de enviar. Mientras se aprueba, puedes apuntar
  la rama a `reactivacion_calculadora3` (ya aprobada) cambiando `name` y los `parameters`.
