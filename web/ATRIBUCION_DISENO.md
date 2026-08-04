# Atribución de clientes — diseño (independiente de cookie)

**Objetivo:** saber **siempre** quién trajo a cada cliente, sin depender de la cookie `trol_ref`.

## Reglas de negocio (confirmadas)

| Canal | Quién | Recompensa | Regla |
|---|---|---|---|
| **Peer** | cliente → cliente | puntos (+100 / +50) | **First-touch permanente.** El primero que lo registró se queda con el crédito; reenvíos posteriores no lo cambian. |
| **Aliado** | aliado (partner) → cliente | comisión / revenue share | **Last-touch, ventana rolling de 3 meses.** El aliado más reciente gana; cada toque reinicia los 3 meses de vigencia. |

Los **dos canales coexisten**: un cliente puede tener a la vez un referidor-peer (para puntos) y un aliado vigente (para comisión). No compiten.

## Por qué hoy se pierde la atribución

El crédito peer solo se escribe en `referidos` cuando el referido (a) inicia sesión y (b) abre `/diagnostico` con la cookie `trol_ref` presente (RPC `registrar_referido`). Si la cookie se borra, el WhatsApp abre el link en otro navegador, o el cliente nunca entra a la app → **se pierde quién lo trajo**, aunque el diagnóstico sí se generó.

## Principio del fix

Capturar al referidor en el **primer evento server-side que conoce la identidad** del lead (CURP + teléfono), que es el **envío del formulario** (`/api/lead`). Ahí ya viajan juntos CURP, teléfono y `referrer` — sin cookie de por medio. La cookie queda solo como respaldo.

---

## Modelo de datos

### 1) Tabla nueva `atribuciones` (log crudo, append-only)
Registra **cada toque** de atribución, aunque el cliente aún no exista como fila.

```sql
create table public.atribuciones (
  id                  uuid primary key default gen_random_uuid(),
  cliente_id          uuid references public.clientes(id) on delete cascade, -- null hasta resolver
  curp                text,          -- llave de binding cuando aún no hay cliente_id
  telefono            text,          -- llave de binding alterna (últimos 10)
  canal               text not null check (canal in ('cliente','aliado')),
  referrer_cliente_id uuid references public.clientes(id),  -- si canal='cliente'
  partner_id          uuid references public.partners(id),  -- si canal='aliado'
  codigo              text,          -- código crudo recibido (uuid cliente o código aliado)
  fuente              text,          -- 'r_link' | 'e_link' | 'lead_form' | 'wa_bot' | 'partner_tx'
  touch_at            timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  constraint chk_ref check (
    (canal='cliente' and referrer_cliente_id is not null and partner_id is null) or
    (canal='aliado'  and partner_id is not null and referrer_cliente_id is null)
  )
);
create index on public.atribuciones (cliente_id);
create index on public.atribuciones (curp);
create index on public.atribuciones (telefono);
```

> Nota: `referidos` (peer resuelto + hitos de puntos) y `partner_transactions` (toques de aliado) **se quedan como están**. `atribuciones` es la captura universal cookie-independiente que alimenta el canal peer y deja traza de todo.

### 2) Binding diferido (cuando el cliente aún no existe al capturar)
`/api/lead` corre **antes** de que n8n cree la fila en `clientes`. Por eso `atribuciones` se escribe con `curp`/`telefono` y `cliente_id` null; un trigger lo resuelve al crear/actualizar el cliente.

```sql
create or replace function public.resolver_atribucion_cliente()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  -- enlaza toques pendientes por curp o por últimos 10 dígitos del teléfono
  update public.atribuciones a
     set cliente_id = new.id
   where a.cliente_id is null
     and ( (new.curp is not null and a.curp = new.curp)
        or (a.telefono is not null and right(regexp_replace(new.telefono,'\D','','g'),10)
                                     = right(regexp_replace(a.telefono,'\D','','g'),10)) );

  -- canal peer: first-touch permanente → crea el vínculo en referidos si no existe
  insert into public.referidos (referrer_cliente_id, referido_cliente_id, codigo, estado)
  select a.referrer_cliente_id, new.id, a.codigo, 'registrado'
    from public.atribuciones a
   where a.cliente_id = new.id
     and a.canal = 'cliente'
     and a.referrer_cliente_id <> new.id            -- sin auto-referido
   order by a.touch_at asc                            -- el primero gana
   limit 1
  on conflict (referido_cliente_id) do nothing;       -- requiere unique(referido_cliente_id)
  return new;
end $$;

-- requiere: alter table referidos add constraint uq_referido unique (referido_cliente_id);
create trigger trg_resolver_atribucion
  after insert or update of curp, telefono on public.clientes
  for each row execute function public.resolver_atribucion_cliente();
```

### 3) Vista resuelta `vista_atribucion_cliente` (una sola fuente de verdad)
```sql
create or replace view public.vista_atribucion_cliente as
select
  c.id                                   as cliente_id,
  -- PEER: first-touch permanente (ya resuelto en referidos)
  r.referrer_cliente_id                  as peer_referrer_id,
  r.creado_at                            as peer_desde,
  -- ALIADO: last-touch, ventana rolling 3 meses (derivado de partner_transactions)
  pt.partner_id                          as aliado_id,
  pt.created_at                          as aliado_desde,
  pt.created_at + interval '3 months'    as aliado_vigente_hasta,
  (pt.created_at + interval '3 months' > now()) as aliado_vigente
from public.clientes c
left join public.referidos r on r.referido_cliente_id = c.id
left join lateral (
  select partner_id, created_at
    from public.partner_transactions
   where cliente_id = c.id and partner_id is not null
   order by created_at desc
   limit 1
) pt on true;
```

---

## Captura cookie-independiente (cambios en la app)

Hilar el código del referidor por la **URL** en todos los puntos de entrada, y persistir en `/api/lead`.

1. **`/r/[codigo]/route.ts`** — además de la cookie, propaga el código en la URL:
   redirige a `/calcula?ref=referido&rc=<codigo>` (hoy solo manda `?ref=referido`).
2. **`/e/[token]/page.tsx`** — aceptar `?ref=<codigo>` y pasarlo al login/sesión (re-siembra atribución sin depender de cookie).
3. **`LeadForm.tsx`** — leer `rc` del query string (fallback a cookie) y mandarlo como `referrer` (ya lo manda; cambiar la fuente de cookie → URL+cookie).
4. **`/api/lead/route.ts`** — al recibir `curp + telefono + referrer`, **escribir en `atribuciones`** (`canal='cliente'`, `codigo=referrer`, `curp`, `telefono`, `fuente='lead_form'`) **antes/junto** al webhook n8n. (Opcional pero recomendado: también `upsert` mínimo en `clientes` para que el CURP nunca se pierda aunque n8n falle — resuelve además el bug que vimos hoy.)

Con esto, el "quién lo trajo" del canal peer queda grabado en el instante del formulario, server-side, **sin cookie**. La cookie + `registrar_referido` siguen existiendo como respaldo y como disparador de los **puntos** (el hito de puntos se mantiene al llegar a diagnóstico; lo que ya no depende de cookie es el **vínculo**).

---

## Edge case: nos reenvían un cliente ya registrado

- **Peer:** el trigger usa `order by touch_at asc` + `on conflict (referido_cliente_id) do nothing` → **el primer referidor se queda**; reenvíos posteriores no lo cambian. ✔ first-touch.
- **Aliado:** la vista toma el `partner_transaction` **más reciente** dentro de 3 meses → **el último aliado gana** y la vigencia se renueva con cada toque. ✔ last-touch rolling.
- **Cruce de canales:** son columnas distintas en la vista; coexisten sin pisarse. ✔

---

## Migración / rollout sugerido

1. Crear `atribuciones`, el `unique(referido_cliente_id)` en `referidos`, el trigger y la vista (SQL arriba). *No* rompe nada existente.
2. Backfill peer (opcional): poblar `atribuciones` desde las filas actuales de `referidos`.
3. Desplegar los 4 cambios de app (puntos de captura). 
4. QA: entrar por `/r/<id>` en un navegador, borrar la cookie, completar el formulario en otro tab → verificar que `atribuciones` y luego `referidos` quedan poblados igual.

> Pendiente de tu visto bueno antes de aplicar la migración en producción (hoy es día de lanzamiento).
