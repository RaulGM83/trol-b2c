# Deploy de la app B2C (`app.trol.mx`)

La app `trol-b2c` depende del paquete hermano `@trol/pension-core` (`file:../pension-core`), así que **el repo debe incluir ambas carpetas** y en Vercel el *Root Directory* se pone en `trol-b2c`.

```
b2c experiencia/        ← raíz del repo
├─ pension-core/        (motor compartido)
└─ trol-b2c/            (app Next.js)  ← Vercel Root Directory
```

El `.gitignore` de la raíz ya excluye `node_modules`, `.next` y **todos los `.env*.local`** (los secretos NO se suben).

---

## 1. Subir el código a GitHub (en tu Mac)

Desde la carpeta `b2c experiencia`:

```
cd "/Users/raulgallegomuller/Documents/Claude/Projects/b2c experiencia"
git add -A
git commit -m "B2C inicial: motor + app Inc 0 + pagos"
```

Crea un repo vacío en github.com (ej. `trol-b2c`), y luego:

```
git remote add origin https://github.com/<tu-usuario>/trol-b2c.git
git branch -M main
git push -u origin main
```

(Verifica antes que `git status` no liste ningún `.env.local`.)

## 2. Importar en Vercel

1. vercel.com → **Add New → Project** → importa el repo.
2. **Root Directory:** selecciona **`trol-b2c`**. (Framework: Next.js, se detecta solo.)
3. Aún no despliegues: primero las variables de entorno (paso 3).

## 3. Variables de entorno (en Vercel → Settings → Environment Variables)

Pon estas para **Production** (los valores los tomas de tu `.env.local` actual, **pero MP en producción**):

```
NEXT_PUBLIC_SUPABASE_URL=https://orgagfdxygtjiwqvgckw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role sb_secret_...>
MP_ACCESS_TOKEN=<Access Token de PRODUCCIÓN APP_USR-...>
NEXT_PUBLIC_MP_PUBLIC_KEY=<Public Key de producción>
NEXT_PUBLIC_SITE_URL=https://app.trol.mx
NEXT_PUBLIC_WHATSAPP_TROL=525588974500
N8N_FULFILLMENT_URL=<webhook n8n para refresh Jordan + doc>   (opcional)
```

Importante: `NEXT_PUBLIC_SITE_URL` debe ser **`https://app.trol.mx`** — así el `notification_url` del webhook sí se envía a MP (en localhost se omitía).

Despliega.

## 4. Dominio `app.trol.mx`

1. Vercel → Project → **Settings → Domains** → agrega `app.trol.mx`.
2. Vercel te dará un registro **CNAME**. Agrégalo donde administres el DNS de `trol.mx` (apunta `app` al destino que indique Vercel). Espera la propagación.

## 5. Mercado Pago en producción

1. En tu app de MP, usa las **credenciales de producción** (ya van en `MP_ACCESS_TOKEN`).
2. Configura el **webhook**: `https://app.trol.mx/api/pago/webhook` (en la app de MP → Webhooks/Notificaciones). Copia el **secreto de firma** para validar `x-signature` (pendiente de implementar).
3. SPEI nativo funciona con credenciales de producción (no en sandbox).

## 6. Prueba de pago real (SPEI end-to-end)

1. (Opcional) baja temporalmente el precio para una prueba barata:
   `update products set precio_mxn = 1 where code = 'CALCULADORA_ADDON';`
2. Entra a `https://app.trol.mx/login`, inicia sesión con un teléfono que exista en `clientes` con semilla v2.
3. Mejor jugada → **Pagar** (SPEI) → te da la CLABE → transfiere.
4. Al acreditarse, MP llama al webhook → `procesar_pago_orden`: orden **cumplida**, **cashback 10%**, etapa avanza, y se dispara n8n (refresh Jordan + doc).
5. Verifica que `/calculadora` abra ya desbloqueada.
6. Regresa el precio a 100 al terminar.

## 7. Costura WhatsApp → web

Tako manda el link con el teléfono prellenado:
`https://app.trol.mx/login?tel=5512345678` → el cliente solo recibe el SMS y mete el código (sin re-teclear su número). Ya está soportado por la app.

---

### Pendientes post-deploy
- Validar la **firma `x-signature`** del webhook de MP (seguridad).
- **Workflow n8n** del refresh con Jordan + generación de documento (el endpoint ya lo dispara vía `N8N_FULFILLMENT_URL`).
- Configurar el **proveedor SMS (Twilio Verify)** también en el entorno de producción de Supabase (ya está en el proyecto, es el mismo).
