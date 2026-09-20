-- 142: guardar el id de conversación de Tako por persona.
--
-- Sin él sólo se le puede hablar al cliente abriendo un chat nuevo con plantilla, que es
-- por lo que cada mensaje automático volvía a saludarlo por su nombre como si no nos
-- conociéramos. Con el id se puede avisar a Tako DENTRO del hilo
-- (POST /whatsapp/conversations/{id}/system-events) y que él redacte con contexto.
--
-- La fuente es Tako: él conoce su conversationId y ya llama a api-trol en cada
-- conversación (trolAlta, trolExpediente, trolInteraccion…). Que lo mande ahí lo puebla
-- solo y lo mantiene fresco, sin backfills que envejecen. Hoy sólo 1,371 de 14,336
-- personas tienen algo parecido (`clientes.id_booster`), lo cual es correcto: la
-- conversación existe únicamente si el cliente escribió alguna vez.
alter table trol3.personas
  add column if not exists tako_conversacion_id text,
  add column if not exists tako_visto_en timestamptz;

comment on column trol3.personas.tako_conversacion_id is
  'Id de la conversación de WhatsApp en Tako/Insurance Boosters. Lo manda el propio bot en sus llamadas a api-trol. Nulo = nunca ha conversado, hay que abrir con plantilla.';

create index if not exists personas_tako_conversacion_idx
  on trol3.personas (tako_conversacion_id) where tako_conversacion_id is not null;

-- Guarda el id y refresca la fecha en que se le vio. Best-effort: no valida formato
-- porque el que manda es Tako, y un id mal escrito debe poder corregirse solo en la
-- siguiente llamada, no bloquear la conversación.
create or replace function trol3.registrar_conversacion_tako(p_persona uuid, p_conversacion text)
returns void
language plpgsql security definer set search_path to 'trol3', 'public'
as $function$
begin
  if p_persona is null or coalesce(trim(p_conversacion), '') = '' then return; end if;
  update trol3.personas
     set tako_conversacion_id = trim(p_conversacion),
         tako_visto_en = now(),
         updated_at = now()
   where id = p_persona
     and (tako_conversacion_id is distinct from trim(p_conversacion)
          or tako_visto_en is null
          or tako_visto_en < now() - interval '1 hour');  -- no escribir en cada turno del bot
end $function$;

revoke all on function trol3.registrar_conversacion_tako(uuid, text) from public;
grant execute on function trol3.registrar_conversacion_tako(uuid, text) to service_role, authenticated;

-- Quién tiene hilo vivo y quién no: es lo que decide entre avisar a Tako o abrir con
-- plantilla.
create or replace view trol3.v_conversaciones_tako as
select p.id as persona_id, p.nombre, p.apellidos, p.curp,
       p.tako_conversacion_id,
       p.tako_visto_en,
       (select c.normalizado from trol3.contactos c
         where c.persona_id = p.id and c.tipo = 'telefono' and not c.no_contactar
         order by c.principal desc limit 1) as telefono,
       (select max(i.created_at) from trol3.interacciones i
         where i.persona_id = p.id and i.canal = 'wa' and i.direccion = 'entrante') as ultimo_entrante,
       (select max(i.created_at) > now() - interval '24 hours' from trol3.interacciones i
         where i.persona_id = p.id and i.canal = 'wa' and i.direccion = 'entrante') as ventana_abierta
  from trol3.personas p
 where p.merged_into is null;
