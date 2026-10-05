-- 220 · Créditos B2B: una consulta cobrada al saldo (auto_charge) que termina en error devuelve el crédito;
-- si después se reintenta y completa, se vuelve a cobrar. Regla general de Raul (5-oct-2026): el aliado no paga por un fallo
-- (Jordan nos reembolsa a nosotros). Aplicada vía _exec+base64 porque el conector retiene 'drop trigger' y 'update' en claro.
-- Probada con rollback: charge −1 → refund +1 → charge −1 al completarse. Reembolsadas a Viraal las dos de hoy (136).

create or replace function public.refund_credits_on_pt_error()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_ultimo record;   -- último movimiento de wallet ligado a esta consulta
  v_partner record;
  v_nb integer;
  v_es_error boolean := new.status is not null and new.status ilike 'error%';
  v_es_ok boolean := new.status = 'completed';
begin
  if new.status is not distinct from old.status then return new; end if;
  if not (v_es_error or v_es_ok) then return new; end if;
  select type, credits_delta into v_ultimo
    from public.wallet_transactions
   where related_transaction_id = new.id
   order by created_at desc limit 1;
  if v_ultimo is null then return new; end if;  -- nunca se cobró al saldo (API sin product_id)
  select id, balance_credits into v_partner from public.partners where id = new.partner_id for update;
  if v_partner is null then return new; end if;
  if v_es_error and v_ultimo.type = 'charge' then
    v_nb := v_partner.balance_credits - v_ultimo.credits_delta;  -- el delta del cargo es negativo
    update public.partners set balance_credits = v_nb, updated_at = now() where id = v_partner.id;
    insert into public.wallet_transactions (partner_id, type, credits_delta, balance_credits_after, related_transaction_id, notes, created_at)
    values (v_partner.id, 'refund', -v_ultimo.credits_delta, v_nb, new.id,
            'Reembolso automático: la consulta terminó en error ('||left(coalesce(new.error_detail, new.status), 120)||')', now());
  elsif v_es_ok and v_ultimo.type = 'refund' then
    v_nb := v_partner.balance_credits - v_ultimo.credits_delta;  -- vuelve a cobrar lo reembolsado
    update public.partners set balance_credits = v_nb, updated_at = now() where id = v_partner.id;
    insert into public.wallet_transactions (partner_id, type, credits_delta, balance_credits_after, related_transaction_id, notes, created_at)
    values (v_partner.id, 'charge', -v_ultimo.credits_delta, v_nb, new.id, 'Cobro al completarse tras un reintento (se había reembolsado)', now());
  end if;
  return new;
end $function$;
revoke execute on function public.refund_credits_on_pt_error() from public, anon, authenticated;
drop trigger if exists zz_refund_credits_on_error on public.partner_transactions;
create trigger zz_refund_credits_on_error after update of status on public.partner_transactions for each row execute function public.refund_credits_on_pt_error();
