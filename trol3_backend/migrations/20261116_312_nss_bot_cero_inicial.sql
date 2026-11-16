-- 312: el bot manda el NSS por /declarar-varios, que convierte a número lo que parece número
-- y le quita el cero inicial. Un NSS de 10 dígitos se completa con cero a la izquierda.
-- Aplicada en producción el 16-nov-2026.
create or replace function trol3.tg_bot_datos_infonavit()
returns trigger language plpgsql security definer
set search_path to 'trol3', 'public'
as $function$
declare v text;
begin
  if new.campo = 'nss' then
    v := regexp_replace(coalesce(new.valor #>> '{}', ''), '\D', '', 'g');
    if v ~ '^\d{10}$' then v := '0' || v; end if;
    if v ~ '^\d{11}$' and not exists (select 1 from trol3.personas where nss = v and id <> new.persona_id and merged_into is null) then
      update trol3.personas set nss = v where id = new.persona_id and nss is null;
    end if;
  elsif new.campo = 'pide_precalificacion' then
    update trol3.personas set cabecera_id = trol3._asesora_infonavit_turno() where id = new.persona_id and cabecera_id is null;
    perform trol3.bot_precalificar(new.persona_id, 'bot');
  end if;
  return new;
exception when others then return new;
end $function$;
