-- 150: cumplir el "en unos minutos te aviso por aquí".
--
-- Es la promesa que Lukas le hace a todo el que entrega su CURP, y hasta hoy no
-- la cumplía nadie: el evento consulta_completada se emitía, se empujaba a un
-- webhook y del otro lado no había nadie escuchando.
--
-- Va directo en la base y no en un workflow a propósito. Un workflow añade una
-- pieza que puede estar despublicada sin que se note —que es exactamente lo que
-- pasó con los nudges y con "Envío de información"— y encima tarda lo que tarde
-- su reloj. Aquí sale en el mismo instante en que el dato entra, y si algo falla
-- queda escrito en sus interacciones, no en los logs de otra herramienta.
--
-- El envío en sí no se reimplementa: se llama a /avisar, que ya decide si entra
-- dentro de su conversación (system-event, sin saludarlo de cero) o si hay que
-- reabrir con plantilla. net.http_post encola dentro de la transacción, así que
-- si el resultado de la consulta se revierte, el aviso no sale.
create or replace function trol3.tg_avisar_consulta_lista()
returns trigger
language plpgsql
security definer
set search_path to 'trol3','public','extensions'
as $$
declare
  base text; llave text; interruptor text;
  espera boolean; e record;
begin
  if new.tipo <> 'consulta_completada' then return new; end if;

  -- Sólo a quien la estaba esperando: la pidió él, o alguien marcó notificarle.
  espera := coalesce(new.payload->>'solicitante_tipo', '') in ('cliente','bot')
         or coalesce((new.payload->>'notificar_cliente')::boolean, false);
  if not espera then return new; end if;

  select valor into interruptor from trol3.config where clave = 'avisar_consulta_lista';
  if coalesce(interruptor, 'on') = 'off' then return new; end if;

  -- Dos consultas que terminan juntas (historial + AFORE, p.ej.) son UN aviso,
  -- no dos: al cliente le da igual cuántas llamadas hicimos por dentro.
  if exists (
    select 1 from trol3.interacciones i
    where i.persona_id = new.persona_id
      and i.metadata->>'evento' = 'consulta_lista'
      and i.created_at > now() - interval '2 hours'
  ) then return new; end if;

  select valor into llave from trol3.config where clave = 'api_key';
  if coalesce(llave,'') = '' then return new; end if;
  select coalesce((select valor from trol3.config where clave = 'api_trol_url'),
                  'https://orgagfdxygtjiwqvgckw.supabase.co/functions/v1/api-trol')
    into base;

  -- Lo que el bot puede nombrar sin inventar nada: su ley y sus semanas.
  select ley, semanas into e from trol3.v_expediente where persona_id = new.persona_id;

  perform net.http_post(
    url := base || '/avisar',
    headers := jsonb_build_object('content-type','application/json','x-trol-key', llave),
    body := jsonb_build_object(
      'persona_id', new.persona_id,
      'evento', 'consulta_lista',
      'plantilla', 'trol_reabrir',
      'payload', jsonb_strip_nulls(jsonb_build_object('ley', e.ley, 'semanas', e.semanas))
    )
  );
  return new;
exception when others then
  -- Un aviso que falla no puede tumbar el guardado del resultado de la consulta,
  -- que es lo que de verdad importa conservar.
  return new;
end $$;

drop trigger if exists avisar_consulta_lista on trol3.eventos;
create trigger avisar_consulta_lista
  after insert on trol3.eventos
  for each row when (new.tipo = 'consulta_completada')
  execute function trol3.tg_avisar_consulta_lista();

-- Interruptor de pánico: update trol3.config set valor='off' where clave='avisar_consulta_lista';
insert into trol3.config (clave, valor)
values ('avisar_consulta_lista', 'on')
on conflict (clave) do nothing;
