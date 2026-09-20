-- 153: avisar sólo de las consultas que el cliente reconocería como suyas.
--
-- El gatillo no miraba el tipo, y por dentro corren muchas más consultas de las
-- que el cliente sabe que existen: calculo_base (576 en 60 días) es un recálculo
-- nuestro, cda acompaña a la del IMSS y no es un momento aparte, y acta e
-- imss_ventanilla las pide un asesor para un trámite concreto —cuestan dinero y
-- es él quien decide cuándo contarlo—.
--
-- Queda en las dos que el cliente sí estaba esperando: su historial del IMSS y
-- su información del ISSSTE.
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

  -- Sólo lo que el cliente reconoce como "mi información".
  if coalesce(new.payload->>'tipo','') not in ('imss_historial','issste') then
    return new;
  end if;

  -- Y sólo a quien la estaba esperando: la pidió él, o alguien marcó notificarle.
  espera := coalesce(new.payload->>'solicitante_tipo', '') in ('cliente','bot')
         or coalesce((new.payload->>'notificar_cliente')::boolean, false);
  if not espera then return new; end if;

  select valor into interruptor from trol3.config where clave = 'avisar_consulta_lista';
  if coalesce(interruptor, 'on') = 'off' then return new; end if;

  -- Dos consultas que terminan juntas (historial + ISSSTE, p.ej.) son UN aviso,
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
  return new;
end $$;
