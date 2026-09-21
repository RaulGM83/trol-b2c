-- 164: Mi cartera — a quién le hablo hoy.
--
-- /trabajo contestaba "¿qué personas y qué oportunidades hay?" y el asesor se
-- pregunta "¿a quién le toca que yo le hable hoy, y dónde va mi relación con
-- él?". Es el mismo giro que la 157 le dio a /mi, visto desde el otro lado: las
-- bandejas son "Me toca a mí" / "Le toca al cliente", y la parada de cada
-- cliente sale de la MISMA función que él ve en su cuenta (parada_de).
--
-- Orden de "Me toca a mí" (acordado con Raul, 21-sep). Cada cliente sale una
-- vez, con su motivo más urgente:
--   1 escribio      lo pasaron al equipo (handoff, 14 d) y no hay nota de asesor después
--   2 cita          cita hoy o mañana
--   3 tramite       oportunidad en proceso con pendiente del EQUIPO en su checklist
--   4 contactar     "contactar después" vencido
--   5 propuesta     presentada/interesada por un asesor hace 3+ días, sin entrante después
--   6 abrio_cuenta  abrió su cuenta en 48 h y no escribió
-- "Míos" = soy su experto, o soy dueño/especialista de una oportunidad abierta suya.
-- Acotar a "míos" es también lo que salva a la bandeja 5 de las ~780 oportunidades
-- que quedaron en 'presentada' por lotes de campaña y por la migración de HubSpot.
--
-- "Por activar" es aparte (cartera_por_activar): sin experto, con algo detectado,
-- contactables, agrupados por el nombre que ve el cliente (158).

create or replace function trol3._cartera_fila(p uuid)
returns jsonb
language sql
stable security definer
set search_path to 'trol3', 'public'
as $function$
  select jsonb_build_object(
    'persona_id', per.id,
    'nombre', nullif(trim(coalesce(per.nombre,'') || ' ' || coalesce(per.apellidos,'')), ''),
    'edad', e.edad, 'ley', e.ley, 'semanas', e.semanas,
    'cabecera_id', per.cabecera_id,
    'parada', (pa->>'parada')::int, 'sub', pa->>'sub', 'toca', pa->>'toca',
    'sigue', pa->>'titulo',
    'oportunidad', pa->'oportunidad'->>'nombre',
    'oportunidad_id', pa->'oportunidad'->>'id',
    'oportunidad_estado', pa->'oportunidad'->>'estado',
    -- Proxy de la ventana de 24 h: la última vez que su conversación pasó por api-trol.
    'chat_abierto', coalesce(per.tako_visto_en > now() - interval '24 hours', false),
    'telefono', (select c.normalizado from trol3.contactos c where c.persona_id = per.id and c.tipo = 'telefono' order by c.principal desc limit 1),
    'no_contactar', exists (select 1 from trol3.contactos c where c.persona_id = per.id and c.no_contactar),
    'ultimo_contacto', (select jsonb_build_object('fecha', i.created_at, 'canal', i.canal, 'actor', i.actor_tipo, 'direccion', i.direccion, 'texto', left(i.contenido, 140))
                          from trol3.interacciones i
                         where i.persona_id = per.id and i.actor_tipo::text in ('asesor','cliente','bot') and i.canal <> 'sistema'
                         order by i.created_at desc limit 1),
    'ultima_plantilla', (select max(i.created_at) from trol3.interacciones i
                          where i.persona_id = per.id and i.metadata->>'via' = 'plantilla' and i.metadata->>'enviado' = '1'))
  from trol3.personas per
  left join trol3.v_expediente e on e.persona_id = per.id
  cross join lateral (select trol3.parada_de(per.id) as pa) x
  where per.id = p
$function$;

create or replace function trol3.cartera_de(p_miembro uuid, p_vista text default 'mios')
returns jsonb
language plpgsql
stable security definer
set search_path to 'trol3', 'public'
as $function$
declare me_toca jsonb; le_toca jsonb;
begin
  with mios as (
    select p.id from trol3.personas p
     where p.merged_into is null
       and case when p_vista = 'equipo' then p.cabecera_id is not null
                else p.cabecera_id = p_miembro
                  or exists (select 1 from trol3.oportunidades o where o.persona_id = p.id
                              and (o.dueno_id = p_miembro or o.especialista_id = p_miembro)
                              and o.estado in ('detectada','presentada','interesada','en_proceso')) end
  ),
  ho as (
    select e.persona_id, max(e.created_at) t, (array_agg(e.payload->>'motivo' order by e.created_at desc))[1] motivo
      from (select persona_id, created_at, payload from trol3.eventos where tipo = 'handoff'
            union all
            select persona_id, created_at, payload from trol3.eventos_archivo where tipo = 'handoff') e
      join mios m on m.id = e.persona_id
     where e.created_at > now() - interval '14 days'
     group by 1
  ),
  senales as (
    select h.persona_id, 1 prio, 'escribio' motivo, h.t fecha,
           coalesce('Pidió: ' || nullif(h.motivo, ''), 'Lukas lo pasó al equipo') detalle
      from ho h
     where not exists (select 1 from trol3.interacciones i where i.persona_id = h.persona_id
                        and i.actor_tipo::text = 'asesor' and i.created_at > h.t)
    union all
    select c.persona_id, 2, 'cita', c.inicio, coalesce(nullif(c.titulo, ''), 'Sesión agendada')
      from trol3.citas c join mios m on m.id = c.persona_id
     where c.estado = 'programada' and c.inicio > now() - interval '2 hours'
       and c.inicio < (date_trunc('day', now() at time zone 'America/Mexico_City') + interval '2 days') at time zone 'America/Mexico_City'
    union all
    select o.persona_id, 3, 'tramite', min(oc.created_at),
           'Falta de nuestro lado: ' || string_agg(cc.item, ' · ' order by cc.orden)
      from trol3.oportunidades o join mios m on m.id = o.persona_id
      join trol3.oportunidad_checklist oc on oc.oportunidad_id = o.id and oc.estado = 'pendiente'
      join trol3.checklist_catalogo cc on cc.id = oc.item_id and cc.quien = 'equipo'
     where o.estado = 'en_proceso'
     group by o.persona_id
    union all
    select o.persona_id, 4, 'contactar', min(o.contactar_despues)::timestamptz,
           'Quedamos de buscarle' || coalesce(': ' || nullif(max(o.nota_estado), ''), '')
      from trol3.oportunidades o join mios m on m.id = o.persona_id
     where o.contactar_despues is not null and o.contactar_despues <= current_date
       and o.estado in ('detectada','presentada','interesada','en_proceso')
     group by o.persona_id
    union all
    select o.persona_id, 5, 'propuesta', max(coalesce(o.estado_desde, o.presentada_en)),
           (array_agg(coalesce(c.nombre_cliente, c.nombre) order by o.valor_estimado desc nulls last))[1]
      from trol3.oportunidades o join mios m on m.id = o.persona_id
      join trol3.catalogo_oportunidades c on c.codigo = o.codigo
     where o.estado in ('presentada','interesada')
       and coalesce(o.estado_desde, o.presentada_en) < now() - interval '3 days'
       and exists (select 1 from trol3.oportunidad_historial h where h.oportunidad_id = o.id
                    and h.estado_nuevo in ('presentada','interesada') and h.actor_tipo::text = 'asesor')
       and not exists (select 1 from trol3.interacciones i where i.persona_id = o.persona_id
                        and i.direccion = 'entrante' and i.created_at > coalesce(o.estado_desde, o.presentada_en))
     group by o.persona_id
    union all
    select p.id, 6, 'abrio_cuenta', p.app_visto_en, 'Vio su cuenta y no escribió'
      from trol3.personas p join mios m on m.id = p.id
     where p.app_visto_en > now() - interval '48 hours'
       and not exists (select 1 from trol3.interacciones i where i.persona_id = p.id
                        and i.direccion = 'entrante' and i.created_at > p.app_visto_en)
  ),
  una as (select distinct on (persona_id) * from senales order by persona_id, prio, fecha desc)
  select coalesce(jsonb_agg(trol3._cartera_fila(u.persona_id)
                            || jsonb_build_object('motivo', u.motivo, 'prio', u.prio, 'fecha', u.fecha, 'detalle', u.detalle)
                            order by u.prio, u.fecha), '[]'::jsonb)
    into me_toca
    from una u;

  -- Le toca al cliente: míos, fuera de la bandeja de arriba, y con la pelota de su lado.
  with mios as (
    select p.id from trol3.personas p
     where p.merged_into is null
       and case when p_vista = 'equipo' then p.cabecera_id is not null
                else p.cabecera_id = p_miembro
                  or exists (select 1 from trol3.oportunidades o where o.persona_id = p.id
                              and (o.dueno_id = p_miembro or o.especialista_id = p_miembro)
                              and o.estado in ('detectada','presentada','interesada','en_proceso')) end
  ),
  f as (
    select trol3._cartera_fila(m.id) fila from mios m
     where not exists (select 1 from jsonb_array_elements(me_toca) x where (x->>'persona_id')::uuid = m.id)
  )
  select coalesce(jsonb_agg(fila order by (fila->>'parada')::int desc, fila->'ultimo_contacto'->>'fecha' desc nulls last), '[]'::jsonb)
    into le_toca
    from f where fila->>'toca' = 'cliente' and (fila->>'parada')::int between 1 and 4;

  return jsonb_build_object('me_toca', me_toca, 'le_toca', le_toca);
end $function$;

create or replace function trol3.mi_cartera(p_vista text default 'mios')
returns jsonb
language plpgsql
stable security definer
set search_path to 'trol3', 'public'
as $function$
begin
  if not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  return trol3.cartera_de(trol3.current_miembro_id(), p_vista);
end $function$;

-- Por activar: sin experto, con algo detectado y contactables. Los grupos se
-- cuentan sobre toda la base; las filas son sólo las del grupo pedido.
create or replace function trol3.cartera_por_activar(p_nombre text default null, p_limit int default 20)
returns jsonb
language plpgsql
security definer  -- volátil a propósito: usa una tabla temporal
set search_path to 'trol3', 'public'
as $function$
declare grupos jsonb; filas jsonb;
begin
  if auth.uid() is not null and not trol3.es_miembro() then raise exception 'no_autorizado'; end if;

  create temp table if not exists _pa (persona_id uuid, nombre text, valor numeric, urgencia date, op_id uuid) on commit drop;
  truncate _pa;
  insert into _pa
  select distinct on (o.persona_id) o.persona_id, coalesce(c.nombre_cliente, c.nombre), o.valor_estimado, o.urgencia_fecha, o.id
    from trol3.oportunidades o
    join trol3.catalogo_oportunidades c on c.codigo = o.codigo and c.activo
    join trol3.personas p on p.id = o.persona_id and p.cabecera_id is null and p.merged_into is null
   where o.estado = 'detectada'
     and o.codigo not in ('entender_situacion','asesoria_avanzada','referidos')
     and exists (select 1 from trol3.contactos t where t.persona_id = p.id and t.tipo = 'telefono')
     and not exists (select 1 from trol3.contactos t where t.persona_id = p.id and t.no_contactar)
   order by o.persona_id, case when c.nivel = 1 or o.codigo = 'reactivacion_mod10' then 0 else 1 end, o.valor_estimado desc nulls last;

  select coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'n', n) order by n desc), '[]'::jsonb) into grupos
    from (select nombre, count(*) n from _pa group by 1) g;

  select coalesce(jsonb_agg(fila order by ord), '[]'::jsonb) into filas
    from (
      select trol3._cartera_fila(a.persona_id) || jsonb_build_object('oportunidad', a.nombre, 'oportunidad_id', a.op_id, 'urgencia', a.urgencia) fila,
             row_number() over () ord
        from (
          select a.* from _pa a
           where a.nombre = coalesce(p_nombre, (select nombre from _pa group by 1 order by count(*) desc limit 1))
             and not exists (select 1 from trol3.interacciones i where i.persona_id = a.persona_id
                              and i.metadata->>'via' = 'plantilla' and i.metadata->>'enviado' = '1'
                              and i.created_at > now() - interval '7 days')
           order by (exists (select 1 from trol3.interacciones i where i.persona_id = a.persona_id
                              and i.direccion = 'entrante' and i.created_at > now() - interval '60 days')) desc,
                    a.urgencia asc nulls last, a.valor desc nulls last
           limit greatest(1, least(coalesce(p_limit, 20), 50))
        ) a
    ) z;

  return jsonb_build_object('grupos', grupos, 'grupo', coalesce(p_nombre, (select nombre from _pa group by 1 order by count(*) desc limit 1)), 'filas', filas);
end $function$;

revoke all on function trol3._cartera_fila(uuid) from public, anon, authenticated;
revoke all on function trol3.cartera_de(uuid, text) from public, anon, authenticated;
revoke all on function trol3.mi_cartera(text) from public, anon;
revoke all on function trol3.cartera_por_activar(text, int) from public, anon;
grant execute on function trol3.mi_cartera(text) to authenticated;
grant execute on function trol3.cartera_por_activar(text, int) to authenticated, service_role;
grant execute on function trol3._cartera_fila(uuid), trol3.cartera_de(uuid, text) to service_role;