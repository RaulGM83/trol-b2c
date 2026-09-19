-- 140: que a n8n sólo salga lo que n8n atiende, y que "mi link" vuelva a ser un acto.
--
-- El push era una lista negra —todo menos dato_nuevo y handoff— y terminaba
-- mandando ~14,700 POST al mes de los que el workflow usaba 3 tipos: el 94%
-- entraba al switch, no encontraba rama y moría ahí. Con el historial de
-- ejecuciones lleno de ruido, un fallo real no se distingue.
--
-- Invertirlo tiene un costo conocido: un tipo que n8n aprenda a atender hay que
-- darlo de alta aquí. Es a propósito. Que la base sepa a qué se suscribió n8n es
-- lo que hace auditable la lista; la lista negra no decía nada de nadie.
--
-- `handoff` vuelve a salir: estaba filtrado como ruido mientras el workflow lo
-- declaraba como el aviso más importante a las asesoras. Nadie se enteraba.
create or replace function trol3.tg_evento_push()
returns trigger
language plpgsql security definer set search_path to 'trol3', 'public', 'extensions'
as $function$
declare url text; begin
  -- Lo que el workflow "Trol3 — eventos (webhook_eventos)" atiende de verdad.
  if new.tipo not in (
      'handoff',                 -- aviso a las asesoras: pide hablar con un experto
      'consulta_completada',     -- sólo notifica si es del cliente; el filtro fino vive en n8n
      'oportunidad_presentada',  -- dispara plantilla de WhatsApp al cliente
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

-- `mi_link_asesor` corre al PINTAR el expediente, así que el evento contaba
-- aperturas de ficha, no links compartidos: 757 en una semana, diez por sesión
-- para el mismo cliente. Generar el link deja de ser noticia.
create or replace function trol3.mi_link_asesor(p_persona uuid)
returns text
language plpgsql security definer set search_path to 'trol3', 'public'
as $function$
declare mid uuid;
begin
  mid := trol3.current_miembro_id();
  if mid is null then raise exception 'solo_miembros'; end if;
  return trol3.generar_mi_link(p_persona, 'asesor');
end $function$;

-- El evento se emite cuando el asesor se lleva el link, que es cuando de verdad
-- pasó algo con este cliente.
create or replace function trol3.marcar_mi_link_compartido(p_persona uuid)
returns void
language plpgsql security definer set search_path to 'trol3', 'public'
as $function$
declare mid uuid;
begin
  mid := trol3.current_miembro_id();
  if mid is null then raise exception 'solo_miembros'; end if;
  perform trol3.emitir_evento(p_persona, 'mi_link_generado', 'asesor', mid,
    jsonb_build_object('campania', 'asesor', 'accion', 'copiado'));
end $function$;

revoke all on function trol3.marcar_mi_link_compartido(uuid) from public;
grant execute on function trol3.marcar_mi_link_compartido(uuid) to authenticated, service_role;
