-- 160: el chat y la cuenta se terminan la frase uno al otro.
--
-- (a) La franja. El cliente aprieta el link de un aviso de Tako ("ya llegó tu
-- información…") y caía en la pantalla de siempre: la promesa del chat no
-- aterrizaba en nada. parada_de() devuelve ahora `aviso`: lo último que le
-- avisamos por WhatsApp en las últimas 48 h, tal como /avisar lo dejó escrito en
-- su historial (para_cliente = 1). Pasadas 48 h deja de ser "por qué viniste".
--
-- (b) El lazo de vuelta. Principio (Raul, 20-sep): Tako avisa RESULTADOS, no le
-- hace eco a las acciones. "Vi que subiste tu INE" es ruido y le llega mientras
-- sigue dentro de la app. El único resultado que hoy produce una acción suya es
-- éste: sube su constancia → el parser la lee → cambian sus números. Eso termina
-- como consulta_completada de calculo_base / proveedor sisec.
--   · sólo si ÉL subió una constancia en las últimas 2 h (no las del asesor);
--   · sólo como system-event: va SIN plantilla, así que si su ventana de 24 h
--     está cerrada no sale nada — se entera por la franja al volver;
--   · un aviso por persona cada 2 h, contando cualquier aviso al cliente.
-- Nace APAGADO: Lukas todavía no conoce el evento (prompt v20.4). Al pegarlo:
--   update trol3.config set valor='on' where clave='avisar_numeros_actualizados';

do $patch$
declare
  def text := pg_get_functiondef('trol3.parada_de(uuid)'::regprocedure);
  ancla text := $a$'tramite', coalesce(tramite, '[]'::jsonb));$a$;
  nuevo text := $b$'tramite', coalesce(tramite, '[]'::jsonb),
    -- 160: por qué vino. Lo último que le avisamos por WhatsApp, 48 h.
    'aviso', (select jsonb_build_object('texto', i.contenido, 'fecha', i.created_at, 'evento', i.metadata->>'evento')
                from trol3.interacciones i
               where i.persona_id = p_persona and i.visible_cliente
                 and i.metadata->>'para_cliente' = '1'
                 and i.created_at > now() - interval '48 hours'
               order by i.created_at desc limit 1));$b$;
begin
  if (length(def) - length(replace(def, ancla, ''))) / length(ancla) <> 1 then raise exception '160: ancla de parada_de'; end if;
  execute replace(def, ancla, nuevo);
end $patch$;

insert into trol3.config (clave, valor) values ('avisar_numeros_actualizados', 'off')
on conflict (clave) do nothing;

create or replace function trol3.tg_avisar_numeros_actualizados()
returns trigger
language plpgsql
security definer
set search_path to 'trol3', 'public', 'extensions'
as $function$
declare base text; llave text; interruptor text; e record;
begin
  if new.tipo <> 'consulta_completada' then return new; end if;
  if coalesce(new.payload->>'tipo','') <> 'calculo_base' or coalesce(new.payload->>'proveedor','') <> 'sisec' then return new; end if;

  -- Sólo cuando el resultado viene de algo que hizo ÉL.
  if not exists (
    select 1 from trol3.documentos d
     where d.persona_id = new.persona_id and d.tipo = 'constancia_semanas'
       and d.origen_tipo = 'cliente' and d.created_at > now() - interval '2 hours'
  ) then return new; end if;

  select valor into interruptor from trol3.config where clave = 'avisar_numeros_actualizados';
  if coalesce(interruptor, 'on') = 'off' then return new; end if;

  if exists (
    select 1 from trol3.interacciones i
     where i.persona_id = new.persona_id and i.metadata->>'para_cliente' = '1'
       and i.created_at > now() - interval '2 hours'
  ) then return new; end if;

  select valor into llave from trol3.config where clave = 'api_key';
  if coalesce(llave,'') = '' then return new; end if;
  select coalesce((select valor from trol3.config where clave = 'api_trol_url'),
                  'https://orgagfdxygtjiwqvgckw.supabase.co/functions/v1/api-trol')
    into base;

  select ley, semanas into e from trol3.v_expediente where persona_id = new.persona_id;

  -- Sin 'plantilla' a propósito: fuera de la ventana de 24 h esto no reabre el chat.
  perform net.http_post(
    url := base || '/avisar',
    headers := jsonb_build_object('content-type','application/json','x-trol-key', llave),
    body := jsonb_build_object(
      'persona_id', new.persona_id,
      'evento', 'numeros_actualizados',
      'resumen', 'Leímos tu constancia de semanas y actualizamos tus números.',
      'payload', jsonb_strip_nulls(jsonb_build_object('ley', e.ley, 'semanas', e.semanas, 'origen', 'constancia'))
    ),
    timeout_milliseconds := 20000
  );
  return new;
exception when others then
  return new;
end $function$;

drop trigger if exists avisar_numeros_actualizados on trol3.eventos;
create trigger avisar_numeros_actualizados
  after insert on trol3.eventos
  for each row when (new.tipo = 'consulta_completada')
  execute function trol3.tg_avisar_numeros_actualizados();