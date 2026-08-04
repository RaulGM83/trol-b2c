# Fix workflow referidos — 29 jun 2026

> **APLICADO.** La rama `calculadora_web` del Switch ya existe en el workflow
> "Nuevo cliente Booster Asesoria" (confirmado el 3-ago-2026). Este documento
> queda como registro del incidente y de la causa raíz, **no** como pendiente.
>
> Sigue siendo la referencia del contrato de `/api/lead` → n8n: si se agrega
> otro punto de entrada, tiene que caer en esta rama o repetirá el mismo fallo
> (contacto sin CURP, sin `procesos`, sin SISEC y sin diagnóstico).
>
> Nota: `/alta` (alta de referidos y tráfico nuevo) usa este mismo
> `entry_channel = calculadora_web` y ahora manda también `nombre`.

## Síntoma
Enviaste 3 referidos. Solo llegaron 2 (`veros.cervantes@gmail.com` / +525591988773 y
`andrea_dflr@hotmail.com` / +526144755362). Los 2 quedaron a medias: **no salieron ni como
"enviado" ni como "diagnóstico"**. El tercero no dejó rastro.

## Estado real de los 2 que sí llenaron (verificado en Supabase + HubSpot)
- `clientes`: fila creada hoy ~16:25, **solo tel + email**. Sin nombre, sin CURP, sin `auth_user_id`.
- `procesos`: **0 filas** → nunca se creó "Asesoría básica" → sin SISEC → sin diagnóstico.
- `envios_wa`: **0 mensajes** → el bot nunca les contestó.
- `referidos`: **0 filas** → sin atribución (el vínculo +100/+50 pts solo se crea cuando el
  referido se autentica y llega a `/diagnostico`, vía RPC `registrar_referido`).
- HubSpot: contacto creado con `entry_channel = asesoria_wa`, **sin CURP**.

## Causa raíz
El flujo de app está **correcto**: `LeadForm` (en `/calcula`) valida CURP, lee la cookie
`trol_ref` (referidor) y hace `POST /api/lead`, que reenvía a n8n el payload **con CURP** y
`entry_channel: "calculadora_web"`.

El nodo **Switch** del workflow n8n **"Nuevo cliente Booster Asesoria"**
(`https://eltrolfinanciero.app.n8n.cloud/webhook/ea70bf36-46dc-4e04-96bc-3f969a427f0d`)
solo tiene ramas `asesoria_wa` e `infonavit_wa`. **Falta la rama `calculadora_web`.**
Sin match, el lead cae en la rama default (`asesoria_wa`), que:
1. crea el contacto pelón (tel+email) y estampa `entry_channel=asesoria_wa`,
2. **descarta el CURP** del payload,
3. no crea `procesos`, no corre Cálculos/SISEC,
4. no manda WhatsApp.

→ Es el pendiente §6 de `PLAN_LANZAMIENTO_LUNES.md` y del checklist del domingo que quedó sin hacer.

## Fix (en n8n — workflow "Nuevo cliente Booster Asesoria")
En el nodo **Switch** (`entry_channel`), agregar una rama nueva:

- **Condición:** `entry_channel == "calculadora_web"`
- **Sale a un "Create or update a contact" (HubSpot)** mapeando del payload:
  - `email` ← `correo`
  - `phone` / `mobilephone` ← `mobil`
  - **`curp` ← `curp`**  ← (esto es lo que hoy se pierde)
  - `entry_channel` ← `calculadora_web` (no sobrescribir con asesoria_wa)
  - `referrer` ← `referrer` (guardar como propiedad si quieres atribución en HubSpot)
  - `proceso_actual` / `interes_reciente` ← `"Calculadora B2C"` (o el que prefieras)
  - `status` ← `nuevo`
- **Luego dispara el mismo sub-flujo `Cálculos`** que usa la rama `asesoria_wa`
  (crear fila en `procesos` "Asesoría básica Booster" → SISEC → generar diagnóstico → enviar WhatsApp).

La forma más rápida y segura: **clonar la rama `asesoria_wa`** (que ya hace contacto → proceso →
diagnóstico → WhatsApp), cambiar solo (a) la condición del Switch a `calculadora_web` y (b) que
el CURP se tome del campo `curp` del payload en vez de capturarlo del chat.

Payload que llega (contrato real de `/api/lead`):
```json
{ "curp": "ABCD800101HDFXYZ09", "correo": "x@y.com", "mobil": "5512345678",
  "nombre": "", "apellido": "", "entry_channel": "calculadora_web",
  "conversationId": "web-tako", "status": "nuevo", "referrer": "<cliente_id>",
  "origen": "calcula", "ts": "…Z" }
```

## Cómo probar (después del fix)
1. Reenvía tu link de referido a un número de prueba (o reusa a `veros`/`andrea`).
2. Que entren por `/r/<tu_cliente_id>` → `/calcula` → llenen CURP+correo+cel → "Crear mi cuenta y calcular".
3. Verificar en Supabase:
   - `clientes`: fila con **CURP, nombre y `link_diagnostico`** poblados.
   - `procesos`: nueva fila "Asesoría básica Booster" → estado "Diagnostico enviado".
   - `envios_wa`: mensaje de diagnóstico enviado al número.
4. Para que se acrediten los **puntos de referido** (+100 a ti / +50 al referido): el referido
   debe **iniciar sesión** (tel+OTP) y abrir `/diagnostico` una vez → ahí `ReferralClaim` dispara
   `registrar_referido` y se crea la fila en `referidos`. (Esto es por diseño, no es bug.)

## Nota sobre los 2 actuales
No se pueden "completar" retroactivamente: el CURP que capturaron **no se guardó en ningún lado**
(se perdió en la rama default de n8n). Hay que **reenviarles** el flujo ya corregido para que
vuelvan a dejar su CURP.

## (Opcional) Blindaje en la app — evitar pérdida de CURP a futuro
Hoy `/api/lead` hace fire-and-forget a n8n; si n8n misenruta, el CURP se pierde en silencio.
Mejora defensiva: que `/api/lead` también haga un `upsert` mínimo en Supabase `clientes`
(curp+correo+telefono+referrer) antes/junto al webhook, para que el dato nunca se pierda aunque
n8n falle. Lo puedo implementar si quieres.
