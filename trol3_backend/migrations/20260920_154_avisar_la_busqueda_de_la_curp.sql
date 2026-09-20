-- 154: que la promesa de Lukas la cumpla quien la hizo.
--
-- "En unos minutos te aviso por aquí" se dice justo después de que el cliente
-- entrega su CURP. Esa búsqueda la crea tg_curp_consultas con solicitante
-- 'sistema' y notificar_cliente en false, así que era precisamente la que NO
-- avisaba: sólo salían las 10 que el cliente pide a mano desde /mi, que son las
-- que menos falta hacen porque ahí ya está mirando la pantalla.
--
-- El corte es quién capturó la CURP, porque es quien prometió algo:
--   - la capturó un asesor (hay sesión de miembro detrás) → él está hablando con
--     el cliente y se lo dice; un WhatsApp encima sobra.
--   - la capturó el bot o el propio cliente desde /mi → hubo una promesa.
create or replace function trol3.tg_curp_consultas()
returns trigger
language plpgsql
security definer
set search_path to 'trol3','public'
as $$
declare avisar boolean;
begin
  if new.curp is not null and (tg_op = 'INSERT' or old.curp is distinct from new.curp) then
    -- Sin sesión de miembro = la puso el bot o el cliente: alguien le prometió aviso.
    avisar := trol3.current_miembro_id() is null;
    -- enlaza/crea la fila legacy con el marcador de camino nuevo
    perform trol3.enlazar_legacy(new.id);
    -- CDA (Millas) solo si no hay cuenta registrada reciente. Nunca se avisa:
    -- el cliente no sabe que existe y no es un momento suyo.
    if not exists (select 1 from trol3.datos d where d.persona_id = new.id and d.campo = 'cuenta_registrada' and d.obtenido_en > now() - interval '180 days') then
      perform trol3.pedir_consulta(new.id, 'cda', 'sistema', null, 'trol', false, 'auto al capturar CURP', false, 'cda');
    end if;
    -- Búsqueda IMSS oficial desde trol3 (dedup interno de pedir_consulta evita repetir)
    perform trol3.pedir_consulta(new.id, 'imss_historial', 'sistema', null, 'trol', avisar, 'auto al capturar CURP', false, null);
  end if;
  return new;
exception when others then return new;
end $$;

-- 154: el tope de una hora.
--
-- Una consulta que tarda más de una hora en completarse ya no es "en unos
-- minutos te aviso": o se quedó atorada, o viene de un lote que se reprocesa.
-- En los dos casos el cliente no está esperando nada y el mensaje llega de la
-- nada. El tope sólo aplica al camino automático; si el cliente la pidió él
-- mismo, se le avisa aunque haya tardado, porque sabe que la pidió.
create or replace function trol3.tg_avisar_consulta_lista()
returns trigger
language plpgsql
security definer
set search_path to 'trol3','public','extensions'
as $$
declare
  base text; llave text; interruptor text;
  pidio_el_cliente boolean; e record; nacida timestamptz;
begin
  if new.tipo <> 'consulta_completada' then return new; end if;

  -- Sólo lo que el cliente reconoce como "mi información".
  if coalesce(new.payload->>'tipo','') not in ('imss_historial','issste') then
    return new;
  end if;

  pidio_el_cliente := coalesce(new.payload->>'solicitante_tipo','') in ('cliente','bot');

  if not pidio_el_cliente then
    -- Camino automático: sólo si alguien marcó avisarle Y sigue siendo reciente.
    if not coalesce((new.payload->>'notificar_cliente')::boolean, false) then return new; end if;
    select c.created_at into nacida from trol3.consultas c
      where c.id = (new.payload->>'consulta_id')::uuid;
    if nacida is null or nacida < now() - interval '1 hour' then return new; end if;
  end if;

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
