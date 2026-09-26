-- 187 — Carriles: Favoritos · Calientes · Tibios · Fríos (claude/84, 26-sep-2026)
-- Base de la metodología de atención por temperatura. No toca cartera_de ni _cartera_fila.

-- ---------------------------------------------------------------- config
insert into trol3.config (clave, valor) values
  ('toques_tope', '25'),
  ('carril_gesto_dias', '7'),
  ('carril_tocado_reciente_dias', '30')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------- marcas del asesor
create table if not exists trol3.carril_marcas (
  id              uuid primary key default gen_random_uuid(),
  persona_id      uuid not null references trol3.personas(id) on delete cascade,
  marca           text not null check (marca in ('frio','descartado','favorito','despertado')),
  motivo          text,
  nota            text,
  hasta           date,                      -- favorito con fecha
  toques          int  not null default 0,   -- frio: toques nuestros en los últimos 30 d al enfriar
  directo         boolean not null default false, -- despertado: directo a Calientes (sólo trámites)
  miembro_id      uuid references trol3.miembros(id),   -- para quién (dueño al marcar)
  por_miembro_id  uuid references trol3.miembros(id),   -- quién la puso (null = sistema)
  activa          boolean not null default true,
  created_at      timestamptz not null default now(),
  cerrada_en      timestamptz,
  cerrada_motivo  text
);
create index if not exists carril_marcas_persona_activa_idx on trol3.carril_marcas (persona_id) where activa;
create index if not exists carril_marcas_marca_idx on trol3.carril_marcas (marca, activa, created_at);
alter table trol3.carril_marcas enable row level security;
drop policy if exists carril_marcas_miembros on trol3.carril_marcas;
create policy carril_marcas_miembros on trol3.carril_marcas for select using (trol3.es_miembro());

create table if not exists trol3.retos (
  miembro_id uuid not null references trol3.miembros(id),
  dia        date not null,
  meta       int  not null check (meta between 1 and 25),
  primary key (miembro_id, dia)
);
alter table trol3.retos enable row level security;
drop policy if exists retos_miembros on trol3.retos;
create policy retos_miembros on trol3.retos for select using (trol3.es_miembro());

-- ---------------------------------------------------------------- señales
create or replace function trol3._hoy_mx() returns date
language sql stable as $$ select (now() at time zone 'America/Mexico_City')::date $$;

create or replace function trol3._cfg_int(p_clave text, p_default int) returns int
language sql stable security definer set search_path to 'trol3','public' as $$
  select coalesce((select nullif(valor,'')::int from trol3.config where clave = p_clave), p_default)
$$;

-- Último gesto DEL CLIENTE: escribió, abrió su cuenta, contestó (clic de la cartera), eventos de cliente.
create or replace function trol3._ultimo_gesto(p uuid) returns timestamptz
language sql stable security definer set search_path to 'trol3','public' as $$
  select max(t) from (
    select tako_visto_en t from trol3.personas where id = p
    union all select app_visto_en from trol3.personas where id = p
    union all select max(created_at) from trol3.interacciones
              where persona_id = p
                and (direccion = 'entrante' or actor_tipo::text = 'cliente'
                     or metadata->>'resultado' in ('contesto','atendido_chat'))
    union all select max(created_at) from trol3.eventos
              where persona_id = p and tipo in ('handoff','persona_alta','persona_reingreso','link_abierto','documento_subido',
                                                'curp_capturada','cita_creada','oportunidad_interesada','pago_recibido','alta_atribuida')
    union all select max(created_at) from trol3.eventos_archivo
              where persona_id = p and tipo in ('handoff','persona_alta','persona_reingreso','link_abierto','documento_subido',
                                                'curp_capturada','cita_creada','oportunidad_interesada','pago_recibido','alta_atribuida')
  ) g
$$;

-- Último toque NUESTRO: WhatsApp o llamada de asesor o sistema.
create or replace function trol3._ultimo_toque(p uuid) returns timestamptz
language sql stable security definer set search_path to 'trol3','public' as $$
  select max(created_at) from trol3.interacciones
   where persona_id = p and direccion = 'saliente' and actor_tipo::text in ('asesor','sistema') and canal in ('wa','llamada')
$$;

create or replace function trol3._toques_30d(p uuid) returns int
language sql stable security definer set search_path to 'trol3','public' as $$
  select count(*)::int from trol3.interacciones
   where persona_id = p and direccion = 'saliente' and actor_tipo::text in ('asesor','sistema') and canal in ('wa','llamada')
     and created_at > now() - interval '30 days'
$$;

-- Potencial = valor_estimado × urgencia (×2 si la ventana cierra en ≤ 6 m, ×1.5 si ≤ 12 m). Sin frescura del SISEC (decisión 7).
create or replace function trol3._potencial(p uuid) returns jsonb
language sql stable security definer set search_path to 'trol3','public' as $$
  with o as (
    select o.id, o.codigo, coalesce(c.nombre_cliente, c.nombre) nombre, coalesce(o.valor_estimado, 0) valor, o.estado, o.urgencia_fecha,
           per.fecha_nacimiento, trol3._hoy_mx() hoy
      from trol3.oportunidades o
      join trol3.catalogo_oportunidades c on c.codigo = o.codigo and c.activo
      join trol3.personas per on per.id = o.persona_id
     where o.persona_id = p and o.estado in ('detectada','presentada','interesada')
       and o.codigo not in ('entender_situacion','asesoria_avanzada','referidos')
  ), f as (
    select o.*,
           least(case when urgencia_fecha >= hoy then urgencia_fecha end,
                 case when codigo in ('pension_hoy','mod40_prospectiva','mod40_retro','reactivacion_mod10','recuperar_ley73','reactivar_derechos') and fecha_nacimiento is not null then
                   case when fecha_nacimiento + interval '60 years' >= hoy then (fecha_nacimiento + interval '60 years')::date
                        when fecha_nacimiento + interval '65 years' >= hoy then (fecha_nacimiento + interval '65 years')::date end end) fecha
      from o
  ), g as (
    select f.*, case when fecha is not null and fecha <= hoy + 183 then 2.0
                     when fecha is not null and fecha <= hoy + 365 then 1.5 else 1.0 end factor
      from f
  )
  select jsonb_build_object('oportunidad_id', id, 'codigo', codigo, 'nombre', nombre, 'estado', estado, 'valor', valor,
                            'urgencia_fecha', fecha, 'factor', factor, 'potencial', round(valor * factor))
    from g order by valor * factor desc, urgencia_fecha asc nulls last limit 1
$$;

-- ---------------------------------------------------------------- el carril de una persona
create or replace function trol3.carril_de(p uuid) returns jsonb
language plpgsql stable security definer set search_path to 'trol3','public' as $$
declare
  per record; m record; hay_marca boolean := false;
  g timestamptz; t timestamptz; hoy date := trol3._hoy_mx();
  gd int := trol3._cfg_int('carril_gesto_dias', 7);
  pot jsonb; en_proc boolean; pide boolean; cita timestamptz; nc boolean; tel boolean;
  carril text; origen text; vuelve date; toques int;
begin
  select * into per from trol3.personas where id = p;
  if per.id is null then return null; end if;
  select * into m from trol3.carril_marcas where persona_id = p and activa order by created_at desc limit 1;
  hay_marca := m.id is not null;
  g := trol3._ultimo_gesto(p);
  t := trol3._ultimo_toque(p);
  nc := exists (select 1 from trol3.contactos c where c.persona_id = p and c.no_contactar);
  tel := exists (select 1 from trol3.contactos c where c.persona_id = p and c.tipo = 'telefono');
  en_proc := exists (select 1 from trol3.oportunidades o where o.persona_id = p and o.estado = 'en_proceso');
  pide := exists (select 1 from trol3.oportunidades o
                    join trol3.oportunidad_checklist oc on oc.oportunidad_id = o.id and oc.estado = 'pendiente'
                    join trol3.checklist_catalogo cc on cc.id = oc.item_id and cc.quien = 'equipo'
                   where o.persona_id = p and o.estado = 'en_proceso');
  select min(c.inicio) into cita from trol3.citas c
   where c.persona_id = p and c.estado = 'programada' and c.inicio > now() - interval '2 hours'
     and c.inicio < (hoy + 2) at time zone 'America/Mexico_City';
  pot := trol3._potencial(p);
  toques := trol3._toques_30d(p);

  -- Un gesto del cliente posterior a la marca la vence (escribe → Calientes), salvo descartado.
  if hay_marca and m.marca <> 'descartado' and g is not null and g > m.created_at then hay_marca := false; end if;

  if nc or (hay_marca and m.marca = 'descartado') then
    carril := 'descartado'; origen := case when nc then 'no_contactar' else coalesce(m.motivo, 'descartado') end;
  elsif g is not null and g >= now() - make_interval(days => gd) then
    carril := 'calientes'; origen := 'reacciono';
  elsif (per.created_at at time zone 'America/Mexico_City')::date = hoy then
    carril := 'calientes'; origen := 'llego_hoy';
  elsif cita is not null then
    carril := 'calientes'; origen := 'cita';
  elsif hay_marca and m.marca = 'despertado' and m.directo then
    carril := 'calientes'; origen := 'asignado';
  elsif hay_marca and m.marca = 'favorito' and m.hasta is not null and m.hasta <= hoy then
    carril := 'calientes'; origen := 'favorito';
  elsif en_proc and pide then
    carril := 'calientes'; origen := 'tramite';
  elsif t is not null and (t at time zone 'America/Mexico_City')::date = hoy then
    carril := 'calientes'; origen := 'tocado';
  elsif en_proc then
    carril := 'favoritos'; origen := 'en_proceso';
  elsif hay_marca and m.marca = 'favorito' then
    carril := 'favoritos'; origen := 'favorito';
  elsif hay_marca and m.marca = 'frio' then
    vuelve := case m.motivo
                when 'no_contesto' then case when m.toques <= 1 then m.created_at::date + 3
                                             when m.toques = 2 then m.created_at::date + 7
                                             when m.toques = 3 then m.created_at::date + 14 end
                when 'lo_va_a_pensar' then m.created_at::date + 30
              end;
    if vuelve is not null and vuelve <= hoy and (pot->>'potencial')::numeric > 0 and tel then
      carril := 'tibios'; origen := 'cadencia';
    else
      carril := 'frios'; origen := m.motivo;
    end if;
  elsif hay_marca and m.marca = 'despertado' then
    carril := 'tibios'; origen := 'despertado';
  elsif coalesce((pot->>'potencial')::numeric, 0) > 0 and tel then
    carril := 'tibios'; origen := 'potencial';
  else
    carril := 'frios'; origen := case when not tel then 'sin_telefono' else 'sin_potencial' end;
  end if;

  return jsonb_build_object(
    'carril', carril, 'origen', origen,
    'marca', case when hay_marca then jsonb_build_object('id', m.id, 'marca', m.marca, 'motivo', m.motivo, 'nota', m.nota, 'hasta', m.hasta,
                                                         'toques', m.toques, 'directo', m.directo, 'por_miembro_id', m.por_miembro_id, 'en', m.created_at) end,
    'ultimo_gesto', g, 'ultimo_toque', t, 'toques_30d', toques,
    'tocado_reciente', t is not null and t > now() - make_interval(days => trol3._cfg_int('carril_tocado_reciente_dias', 30)),
    'vuelve_el', vuelve, 'potencial', pot, 'en_proceso', en_proc, 'pide_equipo', pide, 'cita', cita,
    'toque', jsonb_build_object('n', least(toques + 1, 4),
                                'tipo', case least(toques + 1, 4) when 1 then 'plantilla' when 2 then 'lukas' when 3 then 'llamada' else 'plantilla' end)
  );
end $$;

-- ---------------------------------------------------------------- listas por pestaña
-- Candidatos "míos": mi cabecera, o llevo un trámite suyo en proceso (no las presentadas de lote: 166). 'equipo' = todos con cabecera.
create or replace function trol3._carril_mios(p_miembro uuid, p_vista text) returns setof uuid
language sql stable security definer set search_path to 'trol3','public' as $$
  select p.id from trol3.personas p
   where p.merged_into is null
     and case when p_vista = 'equipo' then p.cabecera_id is not null
              else p.cabecera_id = p_miembro
                or exists (select 1 from trol3.oportunidades o where o.persona_id = p.id
                            and (o.dueno_id = p_miembro or o.especialista_id = p_miembro)
                            and o.estado = 'en_proceso') end
$$;

create or replace function trol3.mi_calientes(p_vista text default 'mios') returns jsonb
language plpgsql security definer set search_path to 'trol3','public' as $$
declare me uuid := trol3.current_miembro_id(); hoy date := trol3._hoy_mx();
        gd int := trol3._cfg_int('carril_gesto_dias', 7); tope int := trol3._cfg_int('toques_tope', 25);
        filas jsonb; tocados int; react int;
begin
  if me is null then raise exception 'no_autorizado'; end if;
  create temp table if not exists _cal (persona_id uuid primary key) on commit drop;
  truncate _cal;
  -- prefiltro barato; carril_de decide
  insert into _cal
  select distinct x.id from (
    select m id from trol3._carril_mios(me, p_vista) m
    union all
    -- huérfanos que escribieron o tienen trámite pidiendo algo: sólo en vista equipo
    select p.id from trol3.personas p where p_vista = 'equipo' and p.cabecera_id is null and p.merged_into is null
       and (greatest(p.tako_visto_en, p.app_visto_en) > now() - make_interval(days => gd)
            or exists (select 1 from trol3.oportunidades o join trol3.oportunidad_checklist oc on oc.oportunidad_id = o.id and oc.estado = 'pendiente'
                         join trol3.checklist_catalogo cc on cc.id = oc.item_id and cc.quien = 'equipo' where o.persona_id = p.id and o.estado = 'en_proceso'))
  ) x
  join trol3.personas p on p.id = x.id
  where greatest(p.tako_visto_en, p.app_visto_en, p.created_at) > now() - make_interval(days => gd + 1)
     or exists (select 1 from trol3.interacciones i where i.persona_id = p.id and i.created_at > now() - make_interval(days => gd + 1))
     or exists (select 1 from trol3.eventos e where e.persona_id = p.id and e.created_at > now() - make_interval(days => gd + 1))
     or exists (select 1 from trol3.citas c where c.persona_id = p.id and c.estado = 'programada' and c.inicio > now() - interval '2 hours' and c.inicio < (hoy + 2) at time zone 'America/Mexico_City')
     or exists (select 1 from trol3.carril_marcas k where k.persona_id = p.id and k.activa and ((k.marca = 'favorito' and k.hasta <= hoy) or (k.marca = 'despertado' and k.directo)))
     or exists (select 1 from trol3.oportunidades o where o.persona_id = p.id and o.estado = 'en_proceso');

  select coalesce(jsonb_agg(f order by
           case f->>'origen' when 'reacciono' then 1 when 'cita' then 2 when 'llego_hoy' then 3 when 'tramite' then 4 when 'favorito' then 5 when 'asignado' then 6 else 7 end,
           (f->>'ultimo_gesto')::timestamptz desc nulls last), '[]'::jsonb),
         count(*) filter (where f->>'origen' = 'tocado'),
         count(*) filter (where f->>'origen' <> 'tocado')
    into filas, tocados, react
    from (select trol3._cartera_fila(c.persona_id) || trol3.carril_de(c.persona_id) f from _cal c) z
   where f->>'carril' = 'calientes';

  return jsonb_build_object('tope', tope, 'tocados', coalesce(tocados, 0), 'reaccionaron', coalesce(react, 0),
                            'libres', greatest(0, tope - coalesce(tocados, 0)), 'filas', filas);
end $$;

-- Toques abiertos = personas que toqué hoy y no han reaccionado (para el tope) · llevas = mis toques de hoy (para el reto).
create or replace function trol3._toques_hoy(p_miembro uuid) returns jsonb
language sql stable security definer set search_path to 'trol3','public' as $$
  with t as (
    select i.persona_id, max(i.created_at) t
      from trol3.interacciones i join trol3.personas p on p.id = i.persona_id
     where i.direccion = 'saliente' and i.actor_tipo::text in ('asesor','sistema') and i.canal in ('wa','llamada')
       and (i.created_at at time zone 'America/Mexico_City')::date = trol3._hoy_mx()
       and (i.actor_id = p_miembro or p.cabecera_id = p_miembro)
     group by 1
  )
  select jsonb_build_object(
    'llevas', (select count(*) from t),
    'abiertos', (select count(*) from t where coalesce(trol3._ultimo_gesto(t.persona_id), '-infinity') < t.t))
$$;

create or replace function trol3.mi_tibios(p_alcance text default 'mios', p_oportunidad text default null, p_limit int default 20) returns jsonb
language plpgsql security definer set search_path to 'trol3','public' as $$
declare me uuid := trol3.current_miembro_id(); hoy date := trol3._hoy_mx();
        tope int := trol3._cfg_int('toques_tope', 25); rec int := trol3._cfg_int('carril_tocado_reciente_dias', 30);
        th jsonb; meta int; grupos jsonb; filas jsonb; grupo text;
begin
  if me is null then raise exception 'no_autorizado'; end if;
  th := trol3._toques_hoy(me);
  select r.meta into meta from trol3.retos r where r.miembro_id = me and r.dia = hoy;

  create temp table if not exists _tib (persona_id uuid primary key, nombre text, potencial numeric, ultimo_toque timestamptz, tramo int, prio int, op_id uuid) on commit drop;
  truncate _tib;

  if p_alcance = 'pozo' then
    -- Sin dueño: como cartera_por_activar, más marcas, más tramos.
    insert into _tib
    select a.persona_id, a.nombre, a.potencial, a.t,
           case when a.t is null or a.t < now() - make_interval(days => rec) then 1 else 2 end, 9, a.op_id
      from (
        select distinct on (o.persona_id) o.persona_id, coalesce(c.nombre_cliente, c.nombre) nombre, o.id op_id,
               coalesce(o.valor_estimado, 0) * case when o.urgencia_fecha >= hoy and o.urgencia_fecha <= hoy + 183 then 2
                                                     when o.urgencia_fecha >= hoy and o.urgencia_fecha <= hoy + 365 then 1.5 else 1 end potencial,
               (select max(i.created_at) from trol3.interacciones i where i.persona_id = o.persona_id and i.direccion = 'saliente'
                   and i.actor_tipo::text in ('asesor','sistema') and i.canal in ('wa','llamada')) t
          from trol3.oportunidades o
          join trol3.catalogo_oportunidades c on c.codigo = o.codigo and c.activo
          join trol3.personas p on p.id = o.persona_id and p.cabecera_id is null and p.merged_into is null
         where o.estado = 'detectada' and o.codigo not in ('entender_situacion','asesoria_avanzada','referidos')
           and coalesce(o.valor_estimado, 0) > 0
           and exists (select 1 from trol3.contactos t where t.persona_id = p.id and t.tipo = 'telefono')
           and not exists (select 1 from trol3.contactos t where t.persona_id = p.id and t.no_contactar)
           and not exists (select 1 from trol3.carril_marcas k where k.persona_id = p.id and k.activa and k.marca in ('frio','descartado','favorito'))
           and coalesce(greatest(p.tako_visto_en, p.app_visto_en), '-infinity') < now() - make_interval(days => trol3._cfg_int('carril_gesto_dias', 7))
         order by o.persona_id, o.valor_estimado desc nulls last
      ) a;
  else
    insert into _tib
    select x.persona_id, x.k->'potencial'->>'nombre', (x.k->'potencial'->>'potencial')::numeric, (x.k->>'ultimo_toque')::timestamptz,
           case when (x.k->>'tocado_reciente')::boolean then 2 else 1 end,
           case x.k->>'origen' when 'despertado' then 0 else 9 end,
           (x.k->'potencial'->>'oportunidad_id')::uuid
      from (select m persona_id, trol3.carril_de(m) k
              from (select m from trol3._carril_mios(me, 'mios') m
                    union select k.persona_id from trol3.carril_marcas k where k.activa and k.marca = 'despertado' and k.miembro_id = me) q) x
     where x.k->>'carril' = 'tibios';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'n', n) order by n desc), '[]'::jsonb) into grupos
    from (select nombre, count(*) n from _tib group by 1) g;
  -- Sin filtro, se trabaja el tema más numeroso (se trabaja por tema; 'todas' lo pide explícito).
  grupo := case when p_oportunidad = 'todas' then null
                else coalesce(p_oportunidad, (select nombre from _tib group by 1 order by count(*) desc limit 1)) end;

  select coalesce(jsonb_agg(fila order by ord), '[]'::jsonb) into filas
    from (
      select trol3._cartera_fila(a.persona_id)
             || case when p_alcance = 'pozo'
                     then jsonb_build_object('carril', 'tibios', 'origen', 'pozo', 'ultimo_toque', a.ultimo_toque,
                                             'potencial', jsonb_build_object('nombre', a.nombre, 'potencial', round(a.potencial), 'oportunidad_id', a.op_id),
                                             'toque', jsonb_build_object('n', least(trol3._toques_30d(a.persona_id) + 1, 4)))
                     else trol3.carril_de(a.persona_id) end
             || jsonb_build_object('tramo', a.tramo, 'oportunidad', a.nombre, 'oportunidad_id', a.op_id) fila,
             row_number() over () ord
        from (select * from _tib a
               where grupo is null or a.nombre = grupo
               order by a.prio, a.tramo,
                        case when a.tramo = 1 then a.potencial end desc nulls last,
                        case when a.tramo = 2 then a.ultimo_toque end asc nulls first
               limit greatest(1, least(coalesce(p_limit, 20), 50))) a
    ) z;

  return jsonb_build_object('alcance', p_alcance, 'tope', tope,
                            'tocados', (th->>'abiertos')::int, 'libres', greatest(0, tope - (th->>'abiertos')::int),
                            'reto', jsonb_build_object('meta', meta, 'llevas', (th->>'llevas')::int),
                            'grupos', grupos, 'grupo', grupo, 'total', (select count(*) from _tib), 'filas', filas);
end $$;

create or replace function trol3.mi_favoritos(p_vista text default 'mios') returns jsonb
language plpgsql security definer set search_path to 'trol3','public' as $$
declare me uuid := trol3.current_miembro_id(); en_proceso jsonb; favoritos jsonb;
begin
  if me is null then raise exception 'no_autorizado'; end if;
  with cand as (
    select m id from trol3._carril_mios(me, p_vista) m
    union select o.persona_id from trol3.oportunidades o join trol3.personas p on p.id = o.persona_id
           where p_vista = 'equipo' and o.estado = 'en_proceso' and p.cabecera_id is null and p.merged_into is null
    union select k.persona_id from trol3.carril_marcas k where k.activa and k.marca = 'favorito' and (k.miembro_id = me or p_vista = 'equipo')
  ), f as (
    select trol3._cartera_fila(c.id) || trol3.carril_de(c.id) fila from cand c
  )
  select coalesce(jsonb_agg(fila order by (fila->>'ultimo_gesto')::timestamptz desc nulls last) filter (where (fila->>'en_proceso')::boolean), '[]'::jsonb),
         coalesce(jsonb_agg(fila order by (fila->'marca'->>'hasta')::date asc nulls last) filter (where not (fila->>'en_proceso')::boolean and fila->'marca'->>'marca' = 'favorito'), '[]'::jsonb)
    into en_proceso, favoritos
    from f where fila->>'carril' in ('favoritos','calientes');
  return jsonb_build_object('en_proceso', en_proceso, 'favoritos', favoritos);
end $$;

create or replace function trol3.mi_frios(p_vista text default 'mios') returns jsonb
language plpgsql security definer set search_path to 'trol3','public' as $$
declare me uuid := trol3.current_miembro_id(); hoy date := trol3._hoy_mx(); filas jsonb; det jsonb;
begin
  if me is null then raise exception 'no_autorizado'; end if;
  create temp table if not exists _fri (persona_id uuid primary key, fila jsonb) on commit drop;
  truncate _fri;
  insert into _fri
  select c.id, trol3._cartera_fila(c.id) || trol3.carril_de(c.id) from trol3._carril_mios(me, p_vista) c(id);
  delete from _fri where fila->>'carril' <> 'frios';

  select coalesce(jsonb_agg(fila order by (fila->>'ultimo_toque')::timestamptz asc nulls first), '[]'::jsonb) into filas from _fri;

  -- Detonadores v1: cumple 60 / 65 en 90 días · ventana legal en 6 meses (urgencia_fecha)
  with d as (
    select f.persona_id, p.fecha_nacimiento,
           (select min(o.urgencia_fecha) from trol3.oportunidades o where o.persona_id = f.persona_id and o.estado in ('detectada','presentada','interesada') and o.urgencia_fecha >= hoy) ventana
      from _fri f join trol3.personas p on p.id = f.persona_id
  )
  select coalesce(jsonb_agg(x) filter (where (x->>'n')::int > 0), '[]'::jsonb) into det from (
    select jsonb_build_object('codigo', 'cumple_60', 'nombre', 'Cumplen 60 en los próximos 90 días', 'n', count(*), 'personas', coalesce(jsonb_agg(persona_id), '[]'::jsonb)) x
      from d where fecha_nacimiento + interval '60 years' between hoy and hoy + 90
    union all
    select jsonb_build_object('codigo', 'cumple_65', 'nombre', 'Cumplen 65 en los próximos 90 días', 'n', count(*), 'personas', coalesce(jsonb_agg(persona_id), '[]'::jsonb))
      from d where fecha_nacimiento + interval '65 years' between hoy and hoy + 90
    union all
    select jsonb_build_object('codigo', 'ventana_6m', 'nombre', 'La ventana legal cierra en 6 meses', 'n', count(*), 'personas', coalesce(jsonb_agg(persona_id), '[]'::jsonb))
      from d where ventana <= hoy + 183
  ) q;
  return jsonb_build_object('detonadores', det, 'filas', filas);
end $$;

-- ---------------------------------------------------------------- acciones
create or replace function trol3._cerrar_marcas(p_persona uuid, p_motivo text) returns void
language sql security definer set search_path to 'trol3','public' as $$
  update trol3.carril_marcas set activa = false, cerrada_en = now(), cerrada_motivo = p_motivo where persona_id = p_persona and activa
$$;

-- Enfriar (frio + motivo) · Descartar · Favorito (hasta opcional)
create or replace function trol3.carril_marcar(p_persona uuid, p_marca text, p_motivo text default null, p_nota text default null, p_hasta date default null) returns jsonb
language plpgsql security definer set search_path to 'trol3','public' as $$
declare me uuid := trol3.current_miembro_id(); mid uuid; cab uuid;
begin
  if me is null then raise exception 'no_autorizado'; end if;
  if p_marca not in ('frio','descartado','favorito') then raise exception 'marca_invalida'; end if;
  if p_marca = 'frio' and coalesce(p_motivo, '') = '' then raise exception 'falta_motivo'; end if;
  select cabecera_id into cab from trol3.personas where id = p_persona;
  perform trol3._cerrar_marcas(p_persona, 'remarcada');
  insert into trol3.carril_marcas (persona_id, marca, motivo, nota, hasta, toques, miembro_id, por_miembro_id)
  values (p_persona, p_marca, p_motivo, p_nota, p_hasta, case when p_marca = 'frio' then trol3._toques_30d(p_persona) else 0 end, coalesce(cab, me), me)
  returning id into mid;
  if p_marca = 'descartado' and p_motivo = 'no_contactar' then
    update trol3.contactos set no_contactar = true, no_contactar_motivo = coalesce(p_nota, 'pidió no ser contactado') where persona_id = p_persona and tipo = 'telefono';
  end if;
  perform trol3.emitir_evento(p_persona, 'carril_marca', 'asesor', me,
          jsonb_build_object('marca', p_marca, 'motivo', p_motivo, 'nota', p_nota, 'hasta', p_hasta));
  return trol3.carril_de(p_persona);
end $$;

-- Despertar: sin p_para = lo saco de Fríos (vuelve a Tibios por potencial). Con p_para (admin/coach) = hasta arriba de los Tibios de ese asesor;
-- p_directo = a Calientes de ese asesor, sólo si tiene trámite en proceso (decisión 17).
create or replace function trol3.carril_despertar(p_persona uuid, p_para uuid default null, p_nota text default null, p_directo boolean default false) returns jsonb
language plpgsql security definer set search_path to 'trol3','public' as $$
declare me uuid := trol3.current_miembro_id(); cab uuid;
begin
  if me is null then raise exception 'no_autorizado'; end if;
  if p_para is not null and p_para <> me and not (trol3.tiene_rol('admin') or trol3.tiene_rol('coach')) then raise exception 'solo_admin'; end if;
  if p_directo and not exists (select 1 from trol3.oportunidades o where o.persona_id = p_persona and o.estado = 'en_proceso') then
    raise exception 'directo_solo_tramites';
  end if;
  perform trol3._cerrar_marcas(p_persona, 'despertada');
  if p_para is not null then
    select cabecera_id into cab from trol3.personas where id = p_persona;
    if cab is null then
      update trol3.personas set cabecera_id = p_para where id = p_persona;
      update trol3.oportunidades set dueno_id = p_para where persona_id = p_persona and dueno_id is null;
      perform trol3.emitir_evento(p_persona, 'cabecera_asignada', 'asesor', me, jsonb_build_object('para', p_para));
    end if;
    insert into trol3.carril_marcas (persona_id, marca, nota, directo, miembro_id, por_miembro_id)
    values (p_persona, 'despertado', p_nota, p_directo, p_para, me);
  end if;
  perform trol3.emitir_evento(p_persona, 'carril_marca', 'asesor', me, jsonb_build_object('marca', 'despertado', 'para', p_para, 'directo', p_directo, 'nota', p_nota));
  return trol3.carril_de(p_persona);
end $$;

-- Asignar (admin/coach): trámites huérfanos o cualquier cliente, de uno en uno o en bloque.
create or replace function trol3.asignar_cabecera(p_personas uuid[], p_miembro uuid) returns int
language plpgsql security definer set search_path to 'trol3','public' as $$
declare me uuid := trol3.current_miembro_id(); n int := 0; pid uuid;
begin
  if me is null or not (trol3.tiene_rol('admin') or trol3.tiene_rol('coach')) then raise exception 'solo_admin'; end if;
  if not exists (select 1 from trol3.miembros m where m.id = p_miembro and m.activo) then raise exception 'miembro_invalido'; end if;
  foreach pid in array p_personas loop
    update trol3.personas set cabecera_id = p_miembro where id = pid and coalesce(cabecera_id, '00000000-0000-0000-0000-000000000000') <> p_miembro;
    if found then
      update trol3.oportunidades set dueno_id = p_miembro where persona_id = pid and (dueno_id is null or estado = 'en_proceso');
      perform trol3.emitir_evento(pid, 'cabecera_asignada', 'asesor', me, jsonb_build_object('para', p_miembro, 'por', me));
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;

create or replace function trol3.fijar_reto(p_meta int) returns jsonb
language plpgsql security definer set search_path to 'trol3','public' as $$
declare me uuid := trol3.current_miembro_id();
begin
  if me is null then raise exception 'no_autorizado'; end if;
  insert into trol3.retos (miembro_id, dia, meta) values (me, trol3._hoy_mx(), least(greatest(p_meta, 1), 25))
  on conflict (miembro_id, dia) do update set meta = excluded.meta;
  return trol3._toques_hoy(me) || jsonb_build_object('meta', least(greatest(p_meta, 1), 25));
end $$;

-- ---------------------------------------------------------------- la noche
-- Tocados hoy que no reaccionaron → Fríos "no_contesto" (con su contador). Marcas vencidas por un gesto posterior → cerradas.
create or replace function trol3.carril_noche() returns jsonb
language plpgsql security definer set search_path to 'trol3','public' as $$
declare hoy date := trol3._hoy_mx(); bajados int := 0; cerradas int := 0; r record;
begin
  -- 1. marcas vencidas: el cliente escribió después de la marca (salvo descartado)
  with v as (
    select k.id from trol3.carril_marcas k
     where k.activa and k.marca <> 'descartado' and coalesce(trol3._ultimo_gesto(k.persona_id), '-infinity') > k.created_at
  )
  update trol3.carril_marcas k set activa = false, cerrada_en = now(), cerrada_motivo = 'reacciono'
    from v where k.id = v.id;
  get diagnostics cerradas = row_count;

  -- 2. tocados hoy sin reacción
  for r in
    select i.persona_id, max(i.created_at) t, p.cabecera_id
      from trol3.interacciones i join trol3.personas p on p.id = i.persona_id and p.merged_into is null
     where i.direccion = 'saliente' and i.actor_tipo::text in ('asesor','sistema') and i.canal in ('wa','llamada')
       and (i.created_at at time zone 'America/Mexico_City')::date = hoy
     group by 1, 3
  loop
    continue when coalesce(trol3._ultimo_gesto(r.persona_id), '-infinity') >= r.t;
    continue when exists (select 1 from trol3.oportunidades o where o.persona_id = r.persona_id and o.estado = 'en_proceso');
    continue when exists (select 1 from trol3.carril_marcas k where k.persona_id = r.persona_id and k.activa and k.marca in ('frio','descartado','favorito'));
    perform trol3._cerrar_marcas(r.persona_id, 'no_contesto');
    insert into trol3.carril_marcas (persona_id, marca, motivo, toques, miembro_id, por_miembro_id)
    values (r.persona_id, 'frio', 'no_contesto', trol3._toques_30d(r.persona_id), r.cabecera_id, null);
    bajados := bajados + 1;
  end loop;
  return jsonb_build_object('dia', hoy, 'bajados', bajados, 'marcas_cerradas', cerradas);
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'trol3-carril-noche';
select cron.schedule('trol3-carril-noche', '55 5 * * *', $$select trol3.carril_noche()$$);  -- 23:55 CDMX

-- ---------------------------------------------------------------- permisos
grant execute on function trol3.carril_de(uuid), trol3.mi_calientes(text), trol3.mi_tibios(text, text, int), trol3.mi_favoritos(text), trol3.mi_frios(text),
                          trol3.carril_marcar(uuid, text, text, text, date), trol3.carril_despertar(uuid, uuid, text, boolean),
                          trol3.asignar_cabecera(uuid[], uuid), trol3.fijar_reto(int)
  to authenticated, service_role;
revoke execute on function trol3.carril_noche() from public, anon, authenticated;
