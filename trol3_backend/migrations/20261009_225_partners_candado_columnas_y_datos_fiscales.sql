-- 225 · Portal de aliados (trol-portal): candado de columnas en public.partners + datos fiscales (9-oct-2026)
--
-- Hueco: la política partners_update_own_auth deja que un aliado actualice SU fila, y el rol
-- authenticated tenía UPDATE sobre TODAS las columnas. Con la anon key y su sesión, cualquiera que
-- se registre en /signup podía poner is_admin = true (→ is_admin_user() → ve todas las consultas
-- de todos los aliados), cargarse balance_credits, cambiar rate_per_query, api_key_hash, etc.
-- Revisado al cerrarlo: el único admin es 'trol' y los saldos cuadran con wallet_transactions.
--
-- Arreglo: el portal sólo escribe business_name, rfc, contact_name, phone (onboarding),
-- contact_email (configuración), branding y los datos fiscales nuevos. portal_status sólo puede
-- pasar de pending_onboarding a active desde la sesión del aliado (trigger). Todo lo demás
-- (créditos, admin, tarifas, llave) va por funciones security definer o service role, que no
-- dependen de estos grants.

-- 1) Datos fiscales para factura (CFDI 4.0)
alter table public.partners
  add column if not exists cp_fiscal text,
  add column if not exists regimen_fiscal text,
  add column if not exists uso_cfdi text,
  add column if not exists email_facturacion text;

alter table public.partners drop constraint if exists partners_cp_fiscal_chk;
alter table public.partners add constraint partners_cp_fiscal_chk
  check (cp_fiscal is null or cp_fiscal ~ '^\d{5}$');
alter table public.partners drop constraint if exists partners_regimen_fiscal_chk;
alter table public.partners add constraint partners_regimen_fiscal_chk
  check (regimen_fiscal is null or regimen_fiscal ~ '^\d{3}$');
alter table public.partners drop constraint if exists partners_uso_cfdi_chk;
alter table public.partners add constraint partners_uso_cfdi_chk
  check (uso_cfdi is null or uso_cfdi ~ '^[A-Z]{1,2}\d{2}$');

comment on column public.partners.cp_fiscal is 'Código postal del domicilio fiscal (CFDI 4.0)';
comment on column public.partners.regimen_fiscal is 'Clave SAT del régimen fiscal, p. ej. 601';
comment on column public.partners.uso_cfdi is 'Clave SAT de uso del CFDI, p. ej. G03';
comment on column public.partners.email_facturacion is 'Correo donde el aliado recibe sus facturas';

-- 2) Candado de columnas
revoke insert, update, delete, truncate on public.partners from anon, authenticated;
grant update (business_name, rfc, contact_name, phone, contact_email, branding, portal_status,
              cp_fiscal, regimen_fiscal, uso_cfdi, email_facturacion, updated_at)
  on public.partners to authenticated;

-- 3) portal_status: desde la sesión del aliado sólo pending_onboarding → active
create or replace function public.partners_guard_portal_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated'
     and new.portal_status is distinct from old.portal_status
     and not (old.portal_status = 'pending_onboarding' and new.portal_status = 'active') then
    raise exception 'portal_status no se puede cambiar desde el portal' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists partners_guard_portal_status on public.partners;
create trigger partners_guard_portal_status
  before update of portal_status on public.partners
  for each row execute function public.partners_guard_portal_status();
