-- 152: que la lista blanca coincida con lo que el workflow atiende de verdad.
--
-- El workflow de avisos al equipo espera handoff, documento_solicitado,
-- ahorro_puntos_solicitado y cita_creada. La lista blanca dejaba pasar handoff,
-- consulta_completada y beneficio_otorgado: o sea, de los cuatro que le
-- importaban sólo le llegaba uno, y encima recibía dos que no sabe atender.
--
-- Se quitan los dos que sobraban:
--   consulta_completada — desde 150 el cliente lo recibe por /avisar, y era el
--     de más volumen: un POST inútil por cada consulta que termina.
--   beneficio_otorgado  — el switch no tiene rama para él; caía al fallback.
--
-- link_abierto se queda FUERA a propósito: 128 en un mes es demasiado correo
-- para una señal que no pide acción. Si queremos medir quién entra y no
-- escribe (la pregunta que quedó abierta), eso se cuenta en la base, no
-- llenándole el buzón a cuatro personas.
create or replace function trol3.tg_evento_push()
returns trigger
language plpgsql
security definer
set search_path to 'trol3','public','extensions'
as $$
declare url text; begin
  if new.tipo not in (
      'handoff',                    -- pide hablar con un experto
      'documento_solicitado',       -- pide un documento
      'ahorro_puntos_solicitado',   -- quiere mandar puntos a su AFORE
      'cita_creada'                 -- agendó una sesión
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
end $$;
