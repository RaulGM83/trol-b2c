-- 167: enviar propuesta, y el candado de plantillas en un solo lugar.
--
-- (a) El candado. Raul (21-sep): una plantilla por persona POR DÍA, no cada 7.
-- Vivía escrito dos veces (la acción de la app y cartera_por_activar) y así se
-- habría desajustado al primer cambio. Ahora es un número en trol3.config
-- (`plantilla_horas_minimo`, 24) y una función que todos preguntan:
-- trol3.puede_plantilla(persona) → {ok, motivo, ultima, horas}.
--
-- (b) Enviar propuesta. Hasta hoy "presentar" una oportunidad era moverla de
-- etapa; el cliente no se enteraba (el botón de avisar se usó 1 vez) y en /mi
-- veía un texto genérico. Una propuesta es ahora un objeto del asesor:
-- oportunidades.propuesta = {texto, pension_con_plan, costo, enviada_por,
-- enviada_en}. trol3.enviar_propuesta() la guarda y, si la oportunidad seguía
-- en 'detectada', la pasa a 'presentada' por el camino de siempre (historial,
-- timestamps, bitácora). El aviso por WhatsApp lo manda la app por /avisar.
--
-- (c) parada_de enseña esa propuesta en la parada 3 ("Tu plan"): el texto del
-- asesor manda sobre el genérico de mi_mejor_jugada(), y viajan la pensión con
-- el plan y el costo para que /mi los pinte.
--
-- parada_cliente(uuid): la misma parada que ve el cliente, para el expediente
-- del asesor (parada_de es interna).

insert into trol3.config (clave, valor) values ('plantilla_horas_minimo', '24')
on conflict (clave) do nothing;

create or replace function trol3.puede_plantilla(p_persona uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'trol3', 'public'
as $function$
declare horas int; ult timestamptz;
begin
  select coalesce(nullif(valor, '')::int, 24) into horas from trol3.config where clave = 'plantilla_horas_minimo';
  horas := coalesce(horas, 24);
  if exists (select 1 from trol3.contactos c where c.persona_id = p_persona and c.no_contactar) then
    return jsonb_build_object('ok', false, 'motivo', 'no_contactar', 'horas', horas);
  end if;
  if not exists (select 1 from trol3.contactos c where c.persona_id = p_persona and c.tipo = 'telefono') then
    return jsonb_build_object('ok', false, 'motivo', 'sin_telefono', 'horas', horas);
  end if;
  select max(i.created_at) into ult from trol3.interacciones i
   where i.persona_id = p_persona and i.metadata->>'via' = 'plantilla' and i.metadata->>'enviado' = '1';
  if ult is not null and ult > now() - make_interval(hours => horas) then
    return jsonb_build_object('ok', false, 'motivo', 'muy_pronto', 'ultima', ult, 'horas', horas);
  end if;
  return jsonb_build_object('ok', true, 'ultima', ult, 'horas', horas);
end $function$;

alter table trol3.oportunidades add column if not exists propuesta jsonb;
comment on column trol3.oportunidades.propuesta is '167: lo que el asesor le propuso al cliente {texto, pension_con_plan, costo, enviada_por, enviada_en}. Se ve en /mi como "Tu plan".';

create or replace function trol3.enviar_propuesta(p_op uuid, p_texto text, p_pension numeric default null, p_costo numeric default null)
returns jsonb
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $function$
declare mid uuid := trol3.current_miembro_id(); o record; c record;
begin
  if auth.uid() is not null and not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  select * into o from trol3.oportunidades where id = p_op;
  if not found then raise exception 'oportunidad_no_existe'; end if;
  if o.estado::text not in ('detectada','presentada','interesada') then raise exception 'oportunidad_cerrada'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'falta_texto'; end if;
  select * into c from trol3.catalogo_oportunidades where codigo = o.codigo;

  update trol3.oportunidades
     set propuesta = jsonb_strip_nulls(jsonb_build_object(
           'texto', trim(p_texto), 'pension_con_plan', p_pension, 'costo', p_costo,
           'enviada_por', mid, 'enviada_en', now()))
   where id = p_op;

  if o.estado::text = 'detectada' then
    perform trol3.cambiar_estado_oportunidad(p_op, 'presentada'::trol3.estado_oportunidad, null, null, null, 'Propuesta enviada al cliente');
  end if;

  return jsonb_build_object('ok', true, 'persona_id', o.persona_id, 'codigo', o.codigo,
                            'nombre', coalesce(c.nombre_cliente, c.nombre), 'plantilla', c.plantilla);
end $function$;

create or replace function trol3.parada_cliente(p_persona uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'trol3', 'public'
as $function$
begin
  if auth.uid() is not null and not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  return trol3.parada_de(p_persona);
end $function$;

do $patch$
declare def text; r record;
begin
  def := pg_get_functiondef('trol3.parada_de(uuid)'::regprocedure);
  for r in select * from (values
    ($a$coalesce(c.nombre_cliente, c.nombre) as nombre$a$,
     $b$coalesce(c.nombre_cliente, c.nombre) as nombre, o1.propuesta$b$),
    ($a$texto := null; -- el texto con números lo da mi_mejor_jugada(): una sola fuente$a$,
     $b$texto := nullif(o.propuesta->>'texto', ''); -- 167: lo que su asesor le propuso; si no hay, /mi usa mi_mejor_jugada()$b$),
    ($a$'urgencia', o.urgencia_fecha);$a$,
     $b$'urgencia', o.urgencia_fecha,
                             -- 167: los números de la propuesta del asesor, si la hay
                             'pension_con_plan', o.propuesta->'pension_con_plan', 'costo', o.propuesta->'costo',
                             'propuesta_en', o.propuesta->'enviada_en');$b$)
  ) as t(ancla, nuevo) loop
    if (length(def) - length(replace(def, r.ancla, ''))) / length(r.ancla) <> 1 then raise exception '167: ancla de parada_de: %', r.ancla; end if;
    def := replace(def, r.ancla, r.nuevo);
  end loop;
  execute def;

  def := pg_get_functiondef('trol3.cartera_por_activar(text,integer)'::regprocedure);
  if (length(def) - length(replace(def, $a$and i.created_at > now() - interval '7 days')$a$, ''))) / length($a$and i.created_at > now() - interval '7 days')$a$) <> 1 then raise exception '167: ancla de cartera_por_activar'; end if;
  execute replace(def, $a$and i.created_at > now() - interval '7 days')$a$,
                       $b$and i.created_at > now() - make_interval(hours => coalesce((select nullif(valor, '')::int from trol3.config where clave = 'plantilla_horas_minimo'), 24)))$b$);
end $patch$;

revoke all on function trol3.puede_plantilla(uuid) from public, anon;
revoke all on function trol3.enviar_propuesta(uuid, text, numeric, numeric) from public, anon;
revoke all on function trol3.parada_cliente(uuid) from public, anon;
grant execute on function trol3.puede_plantilla(uuid), trol3.enviar_propuesta(uuid, text, numeric, numeric), trol3.parada_cliente(uuid) to authenticated, service_role;