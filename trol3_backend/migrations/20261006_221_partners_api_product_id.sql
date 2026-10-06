-- 221 · B2B por API con cobro al saldo (6-oct-2026, alta de Maat.ai).
-- `partners.api_product_id`: producto que se descuenta por cada consulta que entra por el B2B Gateway.
-- NULL = la API no toca el saldo (Viraal se factura con reportes). El trigger BEFORE INSERT pone
-- product_id/price_credits/source cuando vienen vacíos; auto_charge (AFTER INSERT) hace el cobro.
-- Aplicada vía _exec+base64 (drop trigger). Gateway n8n kZVTbT7mqregVe3c: ahora busca el partner por
-- api_key_hash, rechaza aliado≠dueño de la key (401) y responde 402 sin saldo.
alter table public.partners add column if not exists api_product_id uuid references public.products(id);
comment on column public.partners.api_product_id is '221 · Producto que se cobra al saldo por cada consulta que entra por API (B2B Gateway). NULL = la API no descuenta saldo (se factura aparte, p. ej. Viraal).';

create or replace function public.pt_default_api_product()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_prod uuid; v_precio integer;
begin
  if new.product_id is not null then return new; end if;
  select p.api_product_id, pr.price_credits into v_prod, v_precio
    from public.partners p left join public.products pr on pr.id = p.api_product_id
   where p.id = new.partner_id;
  if v_prod is null then return new; end if;
  new.product_id := v_prod;
  new.price_credits := coalesce(new.price_credits, v_precio);
  new.source := coalesce(new.source, 'api');
  return new;
end $function$;
revoke execute on function public.pt_default_api_product() from public, anon, authenticated;
drop trigger if exists ab_default_api_product on public.partner_transactions;
create trigger ab_default_api_product before insert on public.partner_transactions for each row execute function public.pt_default_api_product();
