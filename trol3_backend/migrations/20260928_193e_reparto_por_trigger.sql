-- 193e · El reparto de experto y el beneficio del evento, para TODA alta con el código (web o chat).
--
-- alta_por_telefono pone de cabecera al miembro dueño del código (fip2026 → Raul), así que el
-- reparto de alta_web_evento ("where cabecera_id is null") nunca entraba, y quien llegaba por
-- WhatsApp con ref:fip2026 no recibía ni reparto ni la sesión de cortesía. Ahora lo hace un
-- trigger al nacer la persona, igual por cualquier puerta.
create or replace function trol3.tg_persona_evento() returns trigger
language plpgsql security definer set search_path to 'trol3', 'public' as $$
declare asesores jsonb; elegido uuid; benef text; etiq text;
begin
  if new.codigo_origen is null then return null; end if;
  select (cf.valor::jsonb) -> new.codigo_origen into asesores from trol3.config cf where cf.clave = 'evento_asesores';
  if asesores is not null and jsonb_typeof(asesores) = 'array' and jsonb_array_length(asesores) > 0 then
    select (a.v #>> '{}')::uuid into elegido
      from jsonb_array_elements(asesores) a(v)
      join trol3.miembros m on m.id = (a.v #>> '{}')::uuid and m.activo
      left join trol3.personas p on p.cabecera_id = m.id and p.codigo_origen = new.codigo_origen and p.merged_into is null and p.id <> new.id
     group by a.v order by count(p.id), random() limit 1;
    if elegido is not null then
      update trol3.personas set cabecera_id = elegido where id = new.id;
    end if;
  end if;
  select (cf.valor::jsonb) ->> new.codigo_origen into benef from trol3.config cf where cf.clave = 'evento_beneficio';
  if benef is not null and not trol3.tiene_beneficio(new.id, benef) then
    select etiqueta into etiq from trol3.codigos_invitacion where codigo = new.codigo_origen;
    perform trol3.otorgar_beneficio(new.id, benef, 'evento', coalesce(etiq, new.codigo_origen), new.codigo_origen, null);
  end if;
  return null;
exception when others then return null;  -- el alta nunca se cae por el reparto
end $$;
drop trigger if exists tg_persona_evento on trol3.personas;
create trigger tg_persona_evento after insert on trol3.personas
  for each row execute function trol3.tg_persona_evento();
