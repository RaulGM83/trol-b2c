-- 141: cambiar el estado de una oportunidad deja de mandarle WhatsApp al cliente.
--
-- `oportunidad_presentada` salía a n8n y disparaba una plantilla. Marcar el estado es un
-- gesto interno del asesor —y en lote, de un update— así que avisar al cliente quedaba
-- pegado a algo que no es una decisión de avisar: el 10-sep un update de 20 filas mandó
-- 20 mensajes. Que no llegaran (la plantilla estaba rota) fue suerte, no diseño.
--
-- Avisar al cliente pasa a ser un acto explícito del asesor. Hasta que exista ese botón,
-- el seguimiento va por el chat, como se ha hecho siempre.
create or replace function trol3.tg_evento_push()
returns trigger
language plpgsql security definer set search_path to 'trol3', 'public', 'extensions'
as $function$
declare url text; begin
  -- Lo que el workflow "Trol3 — eventos (webhook_eventos)" atiende de verdad.
  if new.tipo not in (
      'handoff',                 -- aviso a las asesoras: pide hablar con un experto
      'consulta_completada',     -- sólo notifica si la pidió el cliente; el filtro fino vive en n8n
      'beneficio_otorgado'
    ) then
    return new;
  end if;

  select valor into url from trol3.config where clave = 'webhook_eventos';
  if coalesce(url,'') = '' then return new; end if;
  perform net.http_post(url := url, body := jsonb_build_object('evento_id', new.id, 'tipo', new.tipo, 'persona_id', new.persona_id, 'actor_tipo', new.actor_tipo, 'actor_id', new.actor_id, 'payload', new.payload, 'created_at', new.created_at,
      'persona', (select jsonb_build_object('nombre', p.nombre, 'apellidos', p.apellidos, 'curp', p.curp, 'hubspot_id', p.hubspot_id, 'legacy_cliente_id', p.legacy_cliente_id, 'etapa', p.etapa, 'canal', p.canal_origen, 'cabecera_id', p.cabecera_id,
                    'telefono', (select c.normalizado from trol3.contactos c where c.persona_id = p.id and c.tipo='telefono' order by c.principal desc limit 1)) from trol3.personas p where p.id = new.persona_id)),
    headers := '{"content-type":"application/json"}'::jsonb);
  return new;
exception when others then return new;
end $function$;
