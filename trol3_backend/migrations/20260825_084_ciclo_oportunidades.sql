-- 084a (aplicada aparte, fuera de transacción):
-- alter type trol3.estado_oportunidad add value if not exists 'interesada' after 'presentada';

-- 084b · Ciclo unificado de oportunidades (25-ago-2026)
-- interesada (084a) + motivo de pérdida + proveedor + contactar_despues + historial + cambiar_estado + embudo

-- Catálogos ---------------------------------------------------------------
create table if not exists trol3.catalogo_motivos_perdida (
  codigo text primary key,
  nombre text not null,
  orden int not null default 0,
  activo boolean not null default true
);
insert into trol3.catalogo_motivos_perdida (codigo, nombre, orden) values
  ('no_califica',    'No califica',                 1),
  ('no_interesa',    'No le interesa',              2),
  ('sin_capacidad',  'Sin capacidad de pago',       3),
  ('sin_documentos', 'No entregó documentos',       4),
  ('sin_respuesta',  'No responde',                 5),
  ('otro_proveedor', 'Lo hizo con otro proveedor',  6),
  ('ya_pensionado',  'Ya está pensionado',          7),
  ('otro',           'Otro (ver nota)',             9)
on conflict (codigo) do nothing;

create table if not exists trol3.catalogo_proveedores (
  codigo text primary key,
  nombre text not null,
  lineas text[] not null default '{}',   -- códigos de oportunidad donde aplica
  activo boolean not null default true,
  orden int not null default 0
);
insert into trol3.catalogo_proveedores (codigo, nombre, lineas, orden) values
  ('trol',      'Trol (gestoría propia)', '{pension_hoy,reactivar_derechos,inconsistencia_imss,reconocimiento_semanas,mod40_retro,mod40_prospectiva}', 0),
  ('viraal',    'Viraal',                 '{mod40_retro,mod40_prospectiva,pension_hoy,credito_pension}', 1),
  ('barcco',    'Barcco',                 '{credito_pension}', 2),
  ('astuto',    'Astuto',                 '{mejoravit_activo,credito_infonavit_activo,compra_inmueble,cambio_afore,ahorro_voluntario}', 3),
  ('principal', 'Principal',              '{cambio_afore,ahorro_voluntario}', 4),
  ('sura',      'SURA',                   '{cambio_afore,ahorro_voluntario}', 5),
  ('metlife',   'MetLife',                '{seguros}', 6),
  ('millas',    'Millas',                 '{credito_pension}', 7)
on conflict (codigo) do nothing;

alter table trol3.catalogo_motivos_perdida enable row level security;
alter table trol3.catalogo_proveedores enable row level security;
drop policy if exists cat_mp_read on trol3.catalogo_motivos_perdida;
create policy cat_mp_read on trol3.catalogo_motivos_perdida for select using (true);
drop policy if exists cat_prov_read on trol3.catalogo_proveedores;
create policy cat_prov_read on trol3.catalogo_proveedores for select using (true);
grant select on trol3.catalogo_motivos_perdida, trol3.catalogo_proveedores to authenticated, anon, service_role;

-- Columnas nuevas en oportunidades ------------------------------------------
alter table trol3.oportunidades
  add column if not exists motivo_perdida text references trol3.catalogo_motivos_perdida(codigo),
  add column if not exists proveedor text references trol3.catalogo_proveedores(codigo),
  add column if not exists contactar_despues date,
  add column if not exists interesada_en timestamptz,
  add column if not exists en_proceso_en timestamptz,
  add column if not exists estado_desde timestamptz,
  add column if not exists nota_estado text,
  add column if not exists origen text not null default 'motor';   -- motor | asesor | hubspot | cliente

update trol3.oportunidades set estado_desde = coalesce(cerrada_en, presentada_en, detectada_en, updated_at) where estado_desde is null;
alter table trol3.oportunidades alter column estado_desde set default now();

create index if not exists oportunidades_estado_codigo_idx on trol3.oportunidades (codigo, estado);
create index if not exists oportunidades_contactar_idx on trol3.oportunidades (contactar_despues) where contactar_despues is not null;

-- Historial ---------------------------------------------------------------
create table if not exists trol3.oportunidad_historial (
  id bigserial primary key,
  oportunidad_id uuid not null references trol3.oportunidades(id) on delete cascade,
  persona_id uuid not null,
  codigo text not null,
  estado_anterior trol3.estado_oportunidad,
  estado_nuevo trol3.estado_oportunidad not null,
  motivo_perdida text,
  proveedor text,
  contactar_despues date,
  nota text,
  actor_tipo trol3.actor_tipo not null default 'sistema',
  actor_id uuid,
  origen text not null default 'asesor',
  created_at timestamptz not null default now()
);
create index if not exists op_hist_op_idx on trol3.oportunidad_historial (oportunidad_id, created_at);
create index if not exists op_hist_persona_idx on trol3.oportunidad_historial (persona_id, created_at);
alter table trol3.oportunidad_historial enable row level security;
drop policy if exists op_hist_miembro on trol3.oportunidad_historial;
create policy op_hist_miembro on trol3.oportunidad_historial for select using (trol3.es_miembro());
grant select on trol3.oportunidad_historial to authenticated, service_role;

-- Trigger: cada cambio de estado deja historial (salvo carga masiva con GUC)
create or replace function trol3.tg_historial_oportunidad() returns trigger
language plpgsql security definer set search_path to 'trol3','public' as $$
declare mid uuid;
begin
  if coalesce(current_setting('trol3.skip_historial', true), '') = 'on' then return new; end if;
  if tg_op = 'UPDATE' and new.estado is not distinct from old.estado
     and new.motivo_perdida is not distinct from old.motivo_perdida
     and new.proveedor is not distinct from old.proveedor
     and new.contactar_despues is not distinct from old.contactar_despues then
    return new;
  end if;
  if tg_op = 'INSERT' and new.estado in ('posible','detectada') then return new; end if;  -- ruido del motor
  mid := trol3.current_miembro_id();
  insert into trol3.oportunidad_historial (oportunidad_id, persona_id, codigo, estado_anterior, estado_nuevo, motivo_perdida, proveedor, contactar_despues, nota, actor_tipo, actor_id, origen)
  values (new.id, new.persona_id, new.codigo, case when tg_op='UPDATE' then old.estado end, new.estado, new.motivo_perdida, new.proveedor, new.contactar_despues, new.nota_estado,
          case when mid is not null then 'asesor'::trol3.actor_tipo else 'sistema'::trol3.actor_tipo end, mid, new.origen);
  return new;
end $$;
drop trigger if exists historial_oportunidad on trol3.oportunidades;
create trigger historial_oportunidad after insert or update on trol3.oportunidades
  for each row execute function trol3.tg_historial_oportunidad();

-- estado_desde se mueve solo cuando cambia el estado
create or replace function trol3.tg_estado_desde_oportunidad() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then new.estado_desde := now(); end if;
  return new;
end $$;
drop trigger if exists estado_desde_oportunidad on trol3.oportunidades;
create trigger estado_desde_oportunidad before update on trol3.oportunidades
  for each row execute function trol3.tg_estado_desde_oportunidad();

-- Cambiar estado (asesor / especialista) -------------------------------------
create or replace function trol3.cambiar_estado_oportunidad(
  p_op uuid,
  p_estado trol3.estado_oportunidad,
  p_motivo text default null,
  p_proveedor text default null,
  p_contactar_despues date default null,
  p_nota text default null
) returns trol3.oportunidades
language plpgsql security definer set search_path to 'trol3','public' as $$
declare mid uuid := trol3.current_miembro_id(); o trol3.oportunidades; ahora timestamptz := now();
begin
  if mid is null then raise exception 'no_miembro'; end if;
  select * into o from trol3.oportunidades where id = p_op for update;
  if o.id is null then raise exception 'oportunidad_no_existe'; end if;
  if p_estado = 'perdida' and coalesce(p_motivo, o.motivo_perdida) is null then raise exception 'motivo_requerido'; end if;
  if p_estado = 'posible' then raise exception 'estado_reservado_motor'; end if;

  update trol3.oportunidades set
    estado = p_estado,
    motivo_perdida = case when p_estado = 'perdida' then coalesce(p_motivo, motivo_perdida) else null end,
    proveedor = coalesce(p_proveedor, proveedor),
    contactar_despues = case when p_estado in ('ganada','perdida','no_aplica') then null else p_contactar_despues end,
    nota_estado = p_nota,
    origen = 'asesor',
    presentada_en = case when p_estado in ('presentada','interesada','en_proceso','ganada') then coalesce(presentada_en, ahora) else presentada_en end,
    interesada_en = case when p_estado in ('interesada','en_proceso','ganada') then coalesce(interesada_en, ahora) else interesada_en end,
    en_proceso_en = case when p_estado in ('en_proceso','ganada') then coalesce(en_proceso_en, ahora) else en_proceso_en end,
    cerrada_en = case when p_estado in ('ganada','perdida','no_aplica') then ahora else null end,
    resultado = case when p_estado in ('ganada','perdida','no_aplica') then p_estado::text else null end,
    dueno_id = coalesce(dueno_id, mid),
    especialista_id = case when dueno_id is not null and dueno_id <> mid and p_estado in ('en_proceso','ganada','perdida') then coalesce(especialista_id, mid) else especialista_id end
  where id = p_op
  returning * into o;

  if p_nota is not null and length(trim(p_nota)) > 0 then
    perform trol3.registrar_interaccion(o.persona_id, 'nota', 'asesor', mid, 'saliente',
      format('[%s → %s] %s', o.codigo, p_estado, p_nota), false,
      jsonb_build_object('oportunidad_id', p_op, 'estado', p_estado, 'motivo', o.motivo_perdida, 'proveedor', o.proveedor));
  end if;
  return o;
end $$;
grant execute on function trol3.cambiar_estado_oportunidad(uuid, trol3.estado_oportunidad, text, text, date, text) to authenticated, service_role;

-- Cliente ve también 'interesada'
drop policy if exists op_self on trol3.oportunidades;
create policy op_self on trol3.oportunidades for select
  using (persona_id = trol3.current_persona_id() and estado in ('detectada','presentada','interesada','en_proceso','ganada'));

-- Lista de trabajo: incluye interesada, respeta contactar_despues
create or replace function trol3.resumen_lista_trabajo(p_miembro uuid default null)
returns table(codigo text, n bigint, valor numeric)
language sql stable security definer set search_path to 'trol3','public' as $$
  select o.codigo, count(*), sum(o.valor_estimado)
  from trol3.oportunidades o join trol3.catalogo_oportunidades c on c.codigo = o.codigo
  where o.estado in ('detectada','presentada','interesada','en_proceso') and c.en_lista_trabajo
    and (o.contactar_despues is null or o.contactar_despues <= current_date)
    and (p_miembro is null or o.dueno_id = p_miembro or o.especialista_id = p_miembro)
    and trol3.es_miembro()
  group by o.codigo order by 2 desc
$$;

-- Embudo por línea -------------------------------------------------------------
create or replace function trol3.embudo_oportunidades(p_codigo text default null, p_miembro uuid default null)
returns table(codigo text, nombre text, nivel smallint, estado trol3.estado_oportunidad, n bigint, valor numeric, dias_prom numeric, con_fecha bigint)
language sql stable security definer set search_path to 'trol3','public' as $$
  select o.codigo, c.nombre, c.nivel, o.estado, count(*), sum(o.valor_estimado),
         round(avg(extract(epoch from (now() - o.estado_desde)) / 86400)::numeric, 1),
         count(*) filter (where o.contactar_despues is not null and o.contactar_despues > current_date)
  from trol3.oportunidades o join trol3.catalogo_oportunidades c on c.codigo = o.codigo
  where trol3.es_miembro() and o.estado <> 'posible'
    and (p_codigo is null or o.codigo = p_codigo)
    and (p_miembro is null or o.dueno_id = p_miembro or o.especialista_id = p_miembro)
  group by o.codigo, c.nombre, c.nivel, c.orden, o.estado
  order by c.nivel, c.orden, o.estado
$$;
grant execute on function trol3.embudo_oportunidades(text, uuid) to authenticated, service_role;

-- Lista para especialista (una línea, una etapa)
create or replace function trol3.lista_embudo(p_codigo text, p_estado trol3.estado_oportunidad default null, p_miembro uuid default null, p_limit int default 200)
returns table(
  id uuid, persona_id uuid, nombre text, telefono text, estado trol3.estado_oportunidad, valor_estimado numeric,
  urgencia_fecha date, motivo text, motivo_perdida text, proveedor text, contactar_despues date,
  estado_desde timestamptz, dias_en_etapa int, dueno text, especialista text, nota_estado text
)
language sql stable security definer set search_path to 'trol3','public' as $$
  select o.id, o.persona_id, trim(coalesce(p.nombre,'')||' '||coalesce(p.apellidos,'')) as nombre,
         (select c.valor from trol3.contactos c where c.persona_id = p.id and c.tipo = 'telefono' order by c.principal desc nulls last, c.created_at limit 1) as telefono,
         o.estado, o.valor_estimado, o.urgencia_fecha, o.motivo, o.motivo_perdida, o.proveedor, o.contactar_despues,
         o.estado_desde, (extract(epoch from (now() - o.estado_desde)) / 86400)::int,
         md.nombre, me.nombre, o.nota_estado
  from trol3.oportunidades o
  join trol3.personas p on p.id = o.persona_id and p.merged_into is null
  left join trol3.miembros md on md.id = o.dueno_id
  left join trol3.miembros me on me.id = o.especialista_id
  where trol3.es_miembro() and o.codigo = p_codigo
    and (p_estado is null or o.estado = p_estado)
    and (p_estado is not null or o.estado in ('detectada','presentada','interesada','en_proceso'))
    and (p_miembro is null or o.dueno_id = p_miembro or o.especialista_id = p_miembro)
  order by case when o.contactar_despues is not null and o.contactar_despues > current_date then 1 else 0 end,
           o.urgencia_score desc, o.valor_estimado desc nulls last, o.estado_desde
  limit p_limit
$$;
grant execute on function trol3.lista_embudo(text, trol3.estado_oportunidad, uuid, int) to authenticated, service_role;

-- 084c · estado_desde: el trigger solo lo mueve si nadie lo fijó explícitamente (carga masiva con fecha real)
create or replace function trol3.tg_estado_desde_oportunidad() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado and new.estado_desde is not distinct from old.estado_desde then
    new.estado_desde := now();
  end if;
  return new;
end $$;
