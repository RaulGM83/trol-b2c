-- 151: darle a /avisar el tiempo que necesita.
--
-- pg_net corta a los 5 s por defecto. /avisar hace dos saltos a Tako (el evento
-- de sistema y, si hace falta, la plantilla) y tarda más que eso. El aviso SÍ
-- salía —la petición se entrega igual— pero la respuesta se perdía y quedaba un
-- error_msg de timeout en net._http_response que hace pensar que falló algo.
-- Una bitácora que miente sobre lo que pasó ya nos costó un mes; 20 s y que
-- diga la verdad.
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
    ),
    timeout_milliseconds := 20000
  );
  return new;
exception when others then
  -- Un aviso que falla no puede tumbar el guardado del resultado de la consulta,
  -- que es lo que de verdad importa conservar.
  return new;
end $$;
