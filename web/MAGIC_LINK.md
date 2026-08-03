# Magic link B2C — entrada sin OTP (implementado 3-jul-2026)

Un clic en WhatsApp → sesión iniciada → diagnóstico. El OTP por SMS queda solo como
respaldo de login. (El step-up de checkout se eliminó el 14-jul-2026, ver Seguridad.)

## Cómo funciona

1. **Token propio** (48 hex, vence en 7 días, **multi-uso** hasta 25 canjes — los
   clientes re-abren el link varias veces los primeros días) en `b2c_magic_tokens`
   (solo se guarda el hash SHA-256). Si el navegador ya tiene sesión, re-abrir el
   link entra directo sin gastar un uso.
2. **Ruta `/m/<token>?c=<campania>`** (server): valida el token → asegura el auth
   user del cliente con email sintético `c-<cliente_id>@auth.trol.mx` (no se envía
   correo) → `generateLink(magiclink)` + `verifyOtp` server-side → cookies de
   sesión → marca usado → registra `links_campania` con `evento='magic'` → `/diagnostico`.
3. **Fallback siempre:** token inválido/usado/vencido → `/login?tel=<10dígitos>`
   (el flujo OTP de hoy).
4. ~~Step-up en checkout~~ **Eliminado el 14-jul-2026**: el checkout ya no exige
   verificar el celular. El componente `VerificarTelefono` sigue en el repo por
   si se quiere reactivar (agregaba el celular al MISMO usuario vía `phone_change`).

## Generar el CSV de un lote con magic links (ej. lote 3)

En SQL editor de Supabase (service role; el RPC está revocado para anon/authenticated):

```sql
-- 1) Elegir el lote (mismo criterio que lote 2) y registrarlo
with lote as (
  select v.cliente_id
  from vista_links_reactivacion v
  join clientes c on c.id = v.cliente_id
  where c.auth_user_id is null
    and regexp_replace(v.telefono,'\D','','g') ~ '^(52)?[0-9]{10}$'
    and not exists (select 1 from campania_enviados ce where ce.cliente_id = v.cliente_id)
  order by random() limit 300
), reg as (
  insert into campania_enviados (cliente_id, campania, canal)
  select cliente_id, 'wa_lote3_magic', 'whatsapp' from lote
)
-- 2) Generar los tokens y las URLs (guardar el CSV: el token no se puede releer)
select g.telefono, g.nombre, g.url as url_herramienta
from lote l, lateral generar_magic_tokens('wa_lote3_magic', array[l.cliente_id]) g;
```

> Nota: también se puede llamar una sola vez con el array completo:
> `select * from generar_magic_tokens('wa_lote3_magic', array(select cliente_id from ...));`

Mapeo en Tako igual que siempre: `nombre → {{1}}`, `url_herramienta → {{2}}`.

## Cómo medir magic vs OTP

```sql
-- Canjes de magic link por campaña
select campania, count(*) from links_campania where evento='magic' group by 1;

-- Comparar embudos: lote 2 (OTP) vs lote 3 (magic)
-- apertura→sesión: lote 2 = aperturas 'reactivacion2' vs logins; lote 3 = envíos vs eventos 'magic'.
```

## Seguridad (decisiones)

- Quien tenga el link **ve el diagnóstico** de esa persona (riesgo aceptado para
  matar la fricción de entrada; el link vence en 7 días y tiene tope de 25 usos).
- **14-jul-2026: se quitó el step-up de checkout** para reducir fricción (solo
  2-3 personas lo pasaron en los lotes 2-3). Riesgo aceptado: quien tenga el
  link puede además gastar los puntos del cliente y pagar en su cuenta. Ningún
  RPC valida teléfono server-side. Si se abusa, reactivar `VerificarTelefono`
  en `app/checkout/page.tsx` (git history) o bajar usos/vigencia del token.
- El token nunca se guarda en claro; la URL no aparece en previews OG (la ruta
  redirige, no renderiza).

## Pendiente / siguientes pasos

- Enviar lote 3 con magic links y comparar apertura→sesión contra lote 2 (~12% con OTP al corte del 3-jul).
- Si gana claro: migrar `vista_links_reactivacion`/n8n a generar `/m/` para clientes nuevos.
