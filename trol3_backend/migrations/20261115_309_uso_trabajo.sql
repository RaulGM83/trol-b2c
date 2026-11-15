-- 309 · Medición de uso de /trabajo (claude/122): qué pantalla y qué pestaña abre cada asesor.
-- Sirve para comparar las vueltas por expediente antes y después de la ficha previa.
-- La app registra una vista cada vez que cambia la ruta o la pestaña (no en cada recarga).

create table if not exists trol3.uso_trabajo (
  id bigint generated always as identity primary key,
  miembro_id uuid not null,
  ruta text not null,
  persona_id uuid,
  tab text,
  accion text not null default 'vista',
  created_at timestamptz not null default now()
);
create index if not exists uso_trabajo_fecha_idx on trol3.uso_trabajo (created_at);
create index if not exists uso_trabajo_persona_idx on trol3.uso_trabajo (persona_id, created_at) where persona_id is not null;
alter table trol3.uso_trabajo enable row level security;  -- sin políticas: solo por función o servicio
revoke all on trol3.uso_trabajo from anon, authenticated;

create or replace function trol3.registrar_uso(p_ruta text, p_tab text default null, p_accion text default 'vista')
returns void
language plpgsql security definer
set search_path to 'trol3', 'public'
as $fn$
declare mid uuid := trol3.current_miembro_id(); pid uuid; r text := left(coalesce(p_ruta, ''), 160);
begin
  if mid is null or r = '' then return; end if;
  if r ~ '^/trabajo/p/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' then
    pid := substring(r from '^/trabajo/p/([0-9a-f-]{36})')::uuid;
    r := '/trabajo/p';
  end if;
  insert into trol3.uso_trabajo (miembro_id, ruta, persona_id, tab, accion)
  values (mid, r, pid, nullif(left(coalesce(p_tab, ''), 40), ''), coalesce(nullif(left(p_accion, 40), ''), 'vista'));
end $fn$;
revoke all on function trol3.registrar_uso(text, text, text) from public, anon;
grant execute on function trol3.registrar_uso(text, text, text) to authenticated, service_role;

-- Vueltas por expediente y día: cuántas vistas, cuántas pestañas distintas y cuánto duró.
create or replace view trol3.v_uso_expediente as
select (u.created_at at time zone 'America/Mexico_City')::date as dia,
       u.miembro_id, m.nombre as miembro, u.persona_id,
       count(*) filter (where u.accion = 'vista') as vistas,
       count(distinct coalesce(u.tab, 'relacion')) filter (where u.accion = 'vista') as pestanas,
       count(*) filter (where u.accion = 'panel_actualizar') as panel_abierto,
       count(*) filter (where u.accion = 'consulta_pedida') as consultas_pedidas,
       min(u.created_at) as primera, max(u.created_at) as ultima,
       round(extract(epoch from max(u.created_at) - min(u.created_at)) / 60)::int as minutos
  from trol3.uso_trabajo u
  left join trol3.miembros m on m.id = u.miembro_id
 where u.persona_id is not null and trol3.es_miembro()
 group by 1, 2, 3, 4;
revoke all on trol3.v_uso_expediente from anon;
grant select on trol3.v_uso_expediente to authenticated, service_role;

-- Qué pantallas se usan: vistas por día, miembro, ruta y pestaña.
create or replace view trol3.v_uso_pantallas as
select (u.created_at at time zone 'America/Mexico_City')::date as dia,
       u.miembro_id, m.nombre as miembro, u.ruta, coalesce(u.tab, '') as tab, u.accion,
       count(*) as veces, count(distinct u.persona_id) as personas
  from trol3.uso_trabajo u
  left join trol3.miembros m on m.id = u.miembro_id
 where trol3.es_miembro()
 group by 1, 2, 3, 4, 5, 6;
revoke all on trol3.v_uso_pantallas from anon;
grant select on trol3.v_uso_pantallas to authenticated, service_role;
