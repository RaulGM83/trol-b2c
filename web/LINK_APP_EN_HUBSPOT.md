# Link de la app en HubSpot (para envío manual cliente-a-cliente)

Objetivo: que cada contacto tenga su **link personal de la app** (`https://app.trol.mx/e/<cliente_id>?c=...`)
visible en HubSpot, para copiar/pegar en conversaciones abiertas de WhatsApp.

## 1) Crear la propiedad (una vez)
HubSpot → Settings → Properties → **Contact properties** → Create property:
- **Label:** `Link experiencia app`
- **Internal name:** `link_experiencia_app`
- **Field type:** Single-line text (o "Link/URL")
- Group: el que uses para props de Trol.

> No reuses `link_diagnostico_basico`: ése guarda el PDF del diagnóstico; el link de la app es otra cosa.

## 2) Backfill masivo (todos los contactos)

### a. Exportar el CSV desde Supabase (panel → SQL → Download CSV)
```sql
select
  c.id_hubspot                              as "Record ID",
  'https://app.trol.mx/e/' || c.id || '?c=manual' as link_experiencia_app
from clientes c
where c.id_hubspot is not null;            -- ~13.6k contactos
```
- `?c=manual` deja la atribución limpia para los envíos manuales (se registra en `links_campania`
  como `campania = manual`). Cámbialo si prefieres otro tag.
- Si solo quieres la base con diagnóstico listo (7,968), usa la vista que ya trae el link:
  ```sql
  select c.id_hubspot as "Record ID", v.url_herramienta as link_experiencia_app
  from vista_links_reactivacion v join clientes c on c.id = v.cliente_id
  where c.id_hubspot is not null;
  ```

### b. Importar a HubSpot
HubSpot → Contacts → Import → **"Update existing"** → sube el CSV:
- Mapea la columna **Record ID** → *HubSpot Record ID* (llave de match).
- Mapea **link_experiencia_app** → la propiedad creada (si no la creaste antes, en el mapeo puedes
  elegir "Create new property").
- Finaliza. HubSpot rellena la propiedad en todos los contactos del CSV.

## 3) Que se llene solo a futuro (nuevos clientes)
El payload de n8n ya trae `url_herramienta` (`https://app.trol.mx/e/<cliente_id>?c=nuevo`).
En el nodo de HubSpot que crea/actualiza el contacto (Cálculos / Envio_info), agrega el mapeo:
- Propiedad `link_experiencia_app` ← `={{ $json.body.url_herramienta }}`

Así cada cliente nuevo (web, referido u orgánico) queda con su link en HubSpot sin backfill manual.

## 4) Uso por el equipo
En el registro del contacto, la propiedad `Link experiencia app` muestra el link listo para copiar
y pegar en la conversación de WhatsApp abierta. Como cada link lleva el `cliente_id`, al entrar
prellena el teléfono y pide OTP → su diagnóstico en vivo.

> Nota de atribución: este link manual NO acredita referido (eso es el canal `/r/<codigo>`). Es solo
> para reactivar/entrar a la app. Si quieres que el envío manual también atribuya a un asesor/aliado,
> dímelo y agregamos un parámetro (`?ref=` o `?agente=`) al link de cada quien.
