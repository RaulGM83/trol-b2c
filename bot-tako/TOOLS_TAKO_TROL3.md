# Tools trol3 en Tako — configuración exacta (portal.takohub.com → AI Tools → Crear Tools)

Comunes a las 5:
- Tipo de herramienta: **HTTP** · Autenticación: **Sin autenticación**
- Headers: `x-trol-key` = `trol3_MjCeIHfkASbiofcVUvIdX464wQsdwBaDXjP_uWpFYeU` · `Content-Type` = `application/json`
- Base: `https://orgagfdxygtjiwqvgckw.supabase.co/functions/v1/api-trol`
- **`phone` NO es variable de sistema: es un parámetro que el modelo llena.** En las 5 tools crea el parámetro `phone` · Texto · **obligatorio** · descripción: "Es el número de teléfono del cliente desde el cual se tiene la conversación (WhatsApp o teléfono). Enviarlo sin caracteres especiales (puros números) y sin espacios." (idéntico al de postCustomerData). Los demás parámetros que no llene el modelo llegan como `{{param}}` y la API los ignora.

---
## 1. Trol Expediente
- Nombre: `Trol Expediente` · API Name: `trolExpediente`
- Instrucciones: `Lee el expediente Trol del cliente por su teléfono. Ejecútala SIEMPRE al inicio de la conversación junto con getCustomerData. Devuelve existe, nombre, ley, semanas, cabecera (experto), declarados, oportunidades, puntos, ultima_consulta, ultima_salida_trol (último mensaje que Trol le envió y por qué) y novedades_48h.`
- Parámetros: `phone` (Texto, obligatorio, descripción estándar)
- Método: **GET** · Endpoint: `https://orgagfdxygtjiwqvgckw.supabase.co/functions/v1/api-trol/expediente?telefono={{phone}}`
- Almacenar salida como variable de sesión: sí, nombre `trolExpediente` (opcional)

## 2. Trol Alta
- Nombre: `Trol Alta` · API Name: `trolAlta`
- Instrucciones: `Da de alta al cliente en Trol cuando trolExpediente devolvió existe=false. Llamar una sola vez, en el primer mensaje. Devuelve persona_id (úsalo para el link https://app.trol.mx/e/{persona_id}?c=bot).`
- Parámetros:
  - `phone` · Texto · obligatorio (descripción estándar)
  - `nombre` · Texto · opcional · "Nombre(s) del cliente si ya lo dijo; si no, déjalo vacío"
  - `apellidos` · Texto · opcional · "Apellidos si los dijo"
  - `campania` · Texto · opcional · "Campaña o anuncio por el que llegó, si se sabe"
- Método: **POST** · Endpoint: `https://orgagfdxygtjiwqvgckw.supabase.co/functions/v1/api-trol/alta`
- Body (JSON):
```json
{
  "telefono": "{{phone}}",
  "canal": "meta",
  "actor": "bot",
  "nombre": "{{nombre}}",
  "apellidos": "{{apellidos}}",
  "campania": "{{campania}}"
}
```

## 3. Trol Declarar
- Nombre: `Trol Declarar` · API Name: `trolDeclarar`
- Instrucciones: `Guarda en el expediente Trol lo que el cliente cuenta. Llámala cada vez que diga algo útil (uno o varios campos; se puede repetir). Manda solo los campos que el cliente haya dicho; deja vacíos los demás. Nunca inventes valores.`
- Parámetros: `phone` (Texto, obligatorio) + los siguientes, todos opcionales:
  - `dolor_principal` · Texto · "Qué le preocupa o qué quiere lograr con su pensión, en sus palabras (1-2 líneas)"
  - `expectativa` · Texto · "Qué espera de Trol / cuánto le gustaría recibir"
  - `curp` · Texto · "CURP validada (18 caracteres, mayúsculas)"
  - `edad_retiro_deseada` · Número · "Edad a la que quiere retirarse (60-65)"
  - `semanas_cotizadas` · Número · "Semanas que el cliente cree tener"
  - `status_empleo` · Texto · "Si cotiza actualmente. Valores permitidos: empleado, desempleado, pensionado" (no usar tipo Lista: Tako no deja guardar)
  - `afore_actual` · Texto · "AFORE en la que está. Valores permitidos: Azteca, Banorte, Citibanamex, Coppel, Inbursa, Invercap, PensionISSSTE, Principal, Profuturo, SURA" (no usar tipo Lista)
  - `cotiza_issste` · Booleano · "Si cotiza o cotizó al ISSSTE"
  - `credito_infonavit` · Booleano · "Si ha tenido crédito Infonavit en algún momento"
  - `edad` · Número · "Edad declarada del cliente"
  - `saldo_infonavit` · Número · "Saldo aproximado en su subcuenta de vivienda, si lo sabe"
  - `dependientes` · Número · "Número de dependientes económicos"
- Método: **POST** · Endpoint: `https://orgagfdxygtjiwqvgckw.supabase.co/functions/v1/api-trol/declarar-varios`
- Body (JSON) — formato plano (la API lo acepta):
```json
{
  "telefono": "{{phone}}",
  "actor": "bot",
  "dolor_principal": "{{dolor_principal}}",
  "expectativa": "{{expectativa}}",
  "curp": "{{curp}}",
  "edad_retiro_deseada": "{{edad_retiro_deseada}}",
  "semanas_cotizadas": "{{semanas_cotizadas}}",
  "status_empleo": "{{status_empleo}}",
  "afore_actual": "{{afore_actual}}",
  "cotiza_issste": "{{cotiza_issste}}",
  "credito_infonavit": "{{credito_infonavit}}",
  "edad": "{{edad}}",
  "saldo_infonavit": "{{saldo_infonavit}}",
  "dependientes": "{{dependientes}}"
}
```
(Los valores van entre comillas a propósito: la API convierte "62"→62 y "true"→true, y descarta los que lleguen vacíos o como `{{...}}`.)

## 4. Trol Interacción
- Nombre: `Trol Interacción` · API Name: `trolInteraccion`
- Instrucciones: `Registra en el expediente un resumen de la conversación. Llámala al cerrar la conversación o justo antes de pasar a humano. Resumen de 2-4 líneas: qué le preocupa, qué contó, qué se le dijo y qué sigue.`
- Parámetros:
  - `phone` · Texto · obligatorio
  - `contenido` · Texto · **obligatorio** · "Resumen de 2-4 líneas de la conversación"
- Método: **POST** · Endpoint: `https://orgagfdxygtjiwqvgckw.supabase.co/functions/v1/api-trol/interaccion`
- Body (JSON):
```json
{
  "telefono": "{{phone}}",
  "canal": "wa",
  "direccion": "entrante",
  "actor": "bot",
  "contenido": "{{contenido}}"
}
```

## 5. Trol Handoff
- Nombre: `Trol Handoff` · API Name: `trolHandoff`
- Instrucciones: `Avisa a los expertos de Trol y deja el evento en el expediente. Llámala SIEMPRE junto con human_handoff (antes o después), cuando el cliente pida hablar con alguien, tenga un caso particular (invalidez, viudez, pensión negada, ISSSTE, herencia) o pregunte por costos de estrategias.`
- Parámetros:
  - `phone` · Texto · obligatorio
  - `motivo` · Texto · **obligatorio** · "Por qué se pasa a humano, en una línea (ej: 'quiere programar sesión', 'caso de viudez', 'pregunta costo Mod 40')"
- Método: **POST** · Endpoint: `https://orgagfdxygtjiwqvgckw.supabase.co/functions/v1/api-trol/handoff`
- Body (JSON):
```json
{
  "telefono": "{{phone}}",
  "motivo": "{{motivo}}"
}
```

---
## Probar cada tool (botón "Probar")
El botón Probar NO sustituye `{{phone}}`: para probar pon tu teléfono literal (5535665896) en la URL/body y regrésalo a `{{phone}}` antes de guardar.
- trolExpediente con tu teléfono → `existe:true`, nombre Raul.
- trolDeclarar con `edad_retiro_deseada=60`, `dependientes=2` → `ok:true` y en app.trol.mx/trabajo → Raul → Información aparecen los dos.
- trolHandoff con motivo "prueba" → correo a asesoras (workflow eventos) y evento en Bitácora.

## Después: agentes
En **Agentes** → tu agente principal: activar las 5 tools nuevas y pegar el prompt v19 (`PROMPT_v19_TROL3.md`) al final del v18.
