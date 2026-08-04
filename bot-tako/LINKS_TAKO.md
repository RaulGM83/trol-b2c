# Links para Tako — herramienta interactiva B2C

Sistema de links para (1) incluir la herramienta en los envíos automatizados de clientes nuevos, y (2) reactivar la base con semilla avisando de la nueva calculadora. Con atribución para medir reactivación.

## Qué se construyó

- **Ruta `/e/[token]`** (token = `cliente_id`, un UUID opaco; el teléfono **no** va en la URL). Prellena el celular del cliente del lado servidor, muestra un aviso de "nueva herramienta", registra la apertura y lo manda al login por OTP → su diagnóstico vivo.
- **Ruta pública `/calcula`** — calculadora de estimación **sin CURP ni login**, para leads fríos. Acepta `?ref=<origen>` para atribución.
- **Tabla `links_campania`** — registro de aperturas (`apertura` para links con token, `calcula` para la pública).
- **Vista `vista_links_reactivacion`** — base con semilla v2 + su link listo (7,193 clientes).

## Los 3 links

| Caso | Link | Uso |
|---|---|---|
| Reactivar base (con semilla) | `https://app.trol.mx/e/<cliente_id>?c=reactivacion` | Blast a la base / envío automatizado |
| Cliente nuevo (con cálculo) | `https://app.trol.mx/e/<cliente_id>?c=nuevo` | Dentro del envío automatizado del back |
| Lead frío (sin CURP) | `https://app.trol.mx/calcula?ref=tako` | Link genérico que Tako reparte en frío |

El parámetro `?c=` / `?ref=` es libre: úsalo para distinguir campañas (ej. `c=reactivacion_jun26`).

## 1) Clientes nuevos — integración en n8n

Hoy el back manda `url_asesoria` (el PDF en Drive) dentro del workflow **"Envío de información"**. Para sumar la herramienta:

1. En **"Cálculos y herramientas"**, donde ya tienes `cliente_id`, agrega un campo nuevo:
   ```
   url_herramienta = https://app.trol.mx/e/{{ $json.cliente_id }}?c=nuevo
   ```
2. Pásalo en el body al webhook `Envio_info` (junto a `url_asesoria`).
3. En **"Envío de información"**, agrega `url_herramienta` al mensaje de WhatsApp (ver copys abajo). El PDF (`url_asesoria`) se queda igual; el link nuevo es **adicional**.

No hace falta crear tokens ni filas previas: el `cliente_id` ES el token. La apertura se registra sola cuando el cliente entra.

## 2) Reactivar la base — exportar para Tako

La vista ya arma el link por cliente. Para entregar a Tako:

```sql
-- Exportar a CSV desde el panel de Supabase (Table editor → SQL → Download CSV)
select nombre, telefono, ley, url_herramienta
from vista_links_reactivacion
order by ley;            -- 7,193 filas (6,501 Ley73 · 677 Ley97)
```

Sugerencia: arranca con un piloto (ej. 300 Ley 97, que son los de mayor palanca de ahorro) antes del blast completo:
```sql
select nombre, telefono, url_herramienta
from vista_links_reactivacion
where ley = 'Ley97'
limit 300;
```

## Copys de WhatsApp (borrador, ajústalos a tu voz)

**Reactivación (base con semilla):**
> Hola {nombre}, soy de El Trol 👋 Estrenamos una *calculadora de pensión interactiva*: mueve tu edad de retiro, semanas y ahorro y mira en vivo cómo cambia tu pensión — con tus datos del IMSS ya cargados. Entra aquí (te pedimos solo un código por SMS): {url_herramienta}

**Cliente nuevo (junto al PDF):**
> {nombre}, aquí está tu diagnóstico 📄 {url_asesoria}
> Y ahora puedes verlo *interactivo*: ajusta los escenarios y mira tu mejor jugada → {url_herramienta}

**Lead frío (sin CURP):**
> ¿Cuánto te quedaría de pensión? Calcúlalo en 1 minuto, *sin dar tu CURP*: {link}/calcula?ref=tako 👉 Si quieres tu número exacto, te ayudamos por aquí.

## Métricas (reactivación)

```sql
-- Aperturas por campaña
select campania, evento, count(*) aperturas, count(distinct cliente_id) clientes
from links_campania
group by campania, evento
order by campania;

-- Reactivados: abrieron el link Y volvieron a entrar (sesión) después
select count(distinct l.cliente_id) reactivados
from links_campania l
join clientes c on c.id = l.cliente_id
join auth.users u on u.id = c.auth_user_id
where l.evento = 'apertura'
  and u.last_sign_in_at > l.created_at;
```

## Privacidad y seguridad

- El teléfono **nunca** va en la URL (el token es el UUID del cliente). El prellenado se hace del lado servidor.
- El link **no** autentica solo: siempre se pide el código SMS (OTP). Si alguien reenvía el link, no puede entrar sin el código que llega al celular real.
- La tabla `links_campania` y la vista solo las lee el server (service role); no se exponen al cliente.

## CTA de captura (leads nuevos) → HubSpot vía n8n

En `/calcula`, el CTA principal es un formulario que pide **CURP, correo y celular** (con consentimiento de T&C/Aviso). Al enviarse, la app llama a `POST /api/lead`, que reenvía a tu webhook de n8n para **crear el contacto en HubSpot y arrancar Cálculos** (reusa tu integración actual; la app no toca HubSpot directo).

- La hoja de Semanas Cotizadas dejó de ser el CTA principal: ahora es el **camino secundario**, solo para quienes tuvieron error de datos o falta su historial.
- **Falta:** dar de alta el webhook en n8n y ponerlo en Vercel como `LEAD_WEBHOOK_URL`.

Reusamos el webhook que ya usa Tako: **"Nuevo cliente Booster Asesoria"**
`https://eltrolfinanciero.app.n8n.cloud/webhook/ea70bf36-46dc-4e04-96bc-3f969a427f0d` (POST).

`/api/lead` envía el payload con el **mismo contrato** que ese webhook espera:
```json
{ "curp": "ABCD800101HDFXYZ09", "correo": "x@y.com", "mobil": "5512345678",
  "nombre": "", "apellido": "", "entry_channel": "calculadora_web",
  "conversationId": "web-tako", "status": "nuevo", "referrer": "<cliente_id>", "origen": "calcula", "ts": "…Z" }
```

**Lo único que falta en n8n (abrirle su camino):** en el nodo **Switch** del workflow, agrega una rama para `entry_channel = "calculadora_web"` (junto a `asesoria_wa` / `infonavit_wa`) que mande a un "Create or update a contact" con `proceso_actual = "Calculadora B2C"` (o el proceso que quieras) y, si aplica, dispare `Calculos`. La validación de formato (CURP 18, correo, tel 10) ya se hace en la app.

Notas:
- El valor de `entry_channel` es configurable con la env `LEAD_ENTRY_CHANNEL` (default `calculadora_web`).
- `referrer` (cliente_id del que invitó) viaja por si quieres guardarlo como propiedad en HubSpot.
- No capturamos nombre/apellido (solo CURP, correo, tel, como pediste); el contacto se crea igual.

## Referidos ("trae referencias")

Cada cliente tiene su link personal: `https://app.trol.mx/r/<su cliente_id>`.

- El amigo entra por ese link → cae en `/calcula` (con cookie de atribución) → se registra.
- **Recompensa (configurable en el RPC `registrar_referido`):** cuando el referido **llega a su diagnóstico** (tiene semilla), aunque no pague:
  - quien refiere gana **+100 pts**,
  - el referido gana **+50 pts** de bienvenida.
- Se otorga al entrar el referido autenticado a `/diagnostico` (componente `ReferralClaim` → RPC idempotente). Un solo referidor por referido; sin auto-referido.
- Página del cliente para compartir + ver sus stats: **`/referidos`** (link personal, botón de WhatsApp, invitados/confirmados/puntos). Accesos desde el diagnóstico y la pantalla de mejor jugada.
- `/api/lead` también pasa `referrer` (cookie) al webhook, por si quieres atribuir el referido en HubSpot desde la creación del contacto.

Ajustar montos: editar `c_referrer_pts` / `c_referido_pts` en el RPC `registrar_referido`.

## Variables de entorno (Vercel)

| Var | Valor / para qué |
|---|---|
| `LEAD_WEBHOOK_URL` | `https://eltrolfinanciero.app.n8n.cloud/webhook/ea70bf36-46dc-4e04-96bc-3f969a427f0d` (webhook "Nuevo cliente Booster Asesoria"). |
| `LEAD_ENTRY_CHANNEL` | Opcional. Rama del Switch para la herramienta web. Default `calculadora_web`. |
| `NEXT_PUBLIC_BOOKING_URL` | Link de HubSpot Meetings para agendar la +sesión. |

## Deploy

Las rutas (`/e/[token]`, `/calcula`), el CTA de captura y los ajustes de la calculadora sin CURP entran con el próximo push del repo `trol-b2c`. La tabla y la vista ya están en producción.
