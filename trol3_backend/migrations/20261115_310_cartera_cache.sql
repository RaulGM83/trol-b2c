-- 310 · Mi cartera rápida (claude/122, opción A): la clasificación y la fila de cada cliente se guardan
-- y solo se recalculan cuando algo le pasa a esa persona o cuando caducan.
--
-- Cómo funciona
--   · trol3.cartera_cache guarda, por persona, lo que devuelven carril_de() y _cartera_fila().
--   · carril_de() y _cartera_fila() ahora leen de ahí si la fila está limpia y vigente; si no, calculan
--     en vivo como siempre (las originales quedan como _carril_de_vivo y _cartera_fila_vivo).
--     Leer nunca escribe: un hueco en el caché cuesta lo mismo que antes, nunca más.
--   · Cualquier cambio en las tablas de las que depende la fila la marca sucia (disparadores por sentencia).
--   · Un cron cada minuto recalcula las sucias y las que están por caducar (solo clientes con asesor).
--   · Apagador: config.cartera_cache_ttl_min = 0 → todo vuelve a calcularse en vivo, sin tocar nada más.

create table if not exists trol3.cartera_cache (
  persona_id uuid primary key references trol3.personas(id) on delete cascade,
  carril jsonb,
  fila jsonb,
  calculado_en timestamptz,
  sucio boolean not null default true,
  version bigint not null default 0
);
create index if not exists cartera_cache_pendiente_idx on trol3.cartera_cache (calculado_en) where sucio;
alter table trol3.cartera_cache enable row level security;  -- sin políticas: solo por función o servicio
revoke all on trol3.cartera_cache from anon, authenticated;

insert into trol3.config (clave, valor) values ('cartera_cache_ttl_min', '30') on conflict (clave) do nothing;

-- ── Lectura: las funciones de siempre, ahora con caché ─────────────────────────────────────────────
do $outer$
begin
  if to_regprocedure('trol3._carril_de_vivo(uuid)') is null then
    alter function trol3.carril_de(uuid) rename to _carril_de_vivo;
  end if;
  if to_regprocedure('trol3._cartera_fila_vivo(uuid)') is null then
    alter function trol3._cartera_fila(uuid) rename to _cartera_fila_vivo;
  end if;
end $outer$;

create or replace function trol3.carril_de(p uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'trol3', 'public'
as $fn$
declare r jsonb; ttl int;
begin
  perform trol3._guard_miembro();  -- 211: candado (el caché no se lo salta)
  ttl := trol3._cfg_int('cartera_cache_ttl_min', 0);
  if ttl > 0 then
    select cc.carril into r from trol3.cartera_cache cc
     where cc.persona_id = p and not cc.sucio and cc.carril is not null
       and cc.calculado_en > now() - make_interval(mins => ttl);
    if r is not null then return r; end if;
  end if;
  return trol3._carril_de_vivo(p);
end $fn$;
revoke all on function trol3.carril_de(uuid) from public, anon;
grant execute on function trol3.carril_de(uuid) to authenticated, service_role;

create or replace function trol3._cartera_fila(p uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'trol3', 'public'
as $fn$
declare r jsonb; ttl int;
begin
  ttl := trol3._cfg_int('cartera_cache_ttl_min', 0);
  if ttl > 0 then
    select cc.fila into r from trol3.cartera_cache cc
     where cc.persona_id = p and not cc.sucio and cc.fila is not null
       and cc.calculado_en > now() - make_interval(mins => ttl);
    if r is not null then return r; end if;
  end if;
  return trol3._cartera_fila_vivo(p);
end $fn$;
revoke all on function trol3._cartera_fila(uuid) from public, anon, authenticated;
grant execute on function trol3._cartera_fila(uuid) to service_role;

-- ── Invalidación: lo que cambie de una persona marca su fila como sucia ─────────────────────────────
-- Por sentencia (no por renglón) para que las cargas masivas cuesten una sola actualización.
-- Nunca tumba la escritura original: si algo falla aquí, la fila caduca sola a los pocos minutos.
create or replace function trol3._tg_cartera_sucia()
returns trigger
language plpgsql security definer
set search_path to 'trol3', 'public'
as $fn$
begin
  begin
    update trol3.cartera_cache cc set sucio = true, version = cc.version + 1
     where cc.persona_id in (select c2.persona_id from trol3.cartera_cache c2
                              where c2.persona_id in (select n.persona_id from nuevas n where n.persona_id is not null)
                              order by c2.persona_id for update);
  exception when others then null;
  end;
  return null;
end $fn$;

create or replace function trol3._tg_cartera_sucia_persona()
returns trigger
language plpgsql security definer
set search_path to 'trol3', 'public'
as $fn$
begin
  begin
    update trol3.cartera_cache cc set sucio = true, version = cc.version + 1
     where cc.persona_id in (select c2.persona_id from trol3.cartera_cache c2
                              where c2.persona_id in (select n.id from nuevas n)
                              order by c2.persona_id for update);
  exception when others then null;
  end;
  return null;
end $fn$;
revoke all on function trol3._tg_cartera_sucia() from public, anon, authenticated;
revoke all on function trol3._tg_cartera_sucia_persona() from public, anon, authenticated;

do $outer$
declare t text;
begin
  foreach t in array array['carril_marcas', 'interacciones', 'eventos', 'citas', 'oportunidades', 'oportunidad_checklist',
                           'contactos', 'datos', 'consultas', 'checklist_items', 'no_sabe', 'beneficios'] loop
    if not exists (select 1 from information_schema.columns where table_schema = 'trol3' and table_name = t and column_name = 'persona_id') then
      raise notice '310: % no tiene persona_id; se omite', t;
      continue;
    end if;
    execute format('drop trigger if exists zz_cartera_sucia_ins on trol3.%I', t);
    execute format('drop trigger if exists zz_cartera_sucia_upd on trol3.%I', t);
    execute format('create trigger zz_cartera_sucia_ins after insert on trol3.%I referencing new table as nuevas for each statement execute function trol3._tg_cartera_sucia()', t);
    execute format('create trigger zz_cartera_sucia_upd after update on trol3.%I referencing new table as nuevas for each statement execute function trol3._tg_cartera_sucia()', t);
  end loop;
  drop trigger if exists zz_cartera_sucia_upd on trol3.personas;
  create trigger zz_cartera_sucia_upd after update on trol3.personas referencing new table as nuevas
    for each statement execute function trol3._tg_cartera_sucia_persona();
end $outer$;

-- ── Calentador: recalcula las sucias y las que están por caducar, confirmando renglón por renglón ────
-- (para no retener candados mientras calcula). Sin SECURITY DEFINER ni SET: lo exige el COMMIT.
create or replace procedure trol3.cartera_cache_calentar(p_max integer default 400)
language plpgsql
as $proc$
declare r record; v bigint; k jsonb; f jsonb; ttl int := trol3._cfg_int('cartera_cache_ttl_min', 0);
begin
  if ttl <= 0 then return; end if;
  if not pg_try_advisory_lock(hashtext('trol3.cartera_cache_calentar')) then return; end if;  -- no encimar corridas
  insert into trol3.cartera_cache (persona_id)
  select p.id from trol3.personas p where p.cabecera_id is not null and p.merged_into is null
  on conflict (persona_id) do nothing;
  commit;
  for r in
    select cc.persona_id
      from trol3.cartera_cache cc
      join trol3.personas p on p.id = cc.persona_id and p.merged_into is null and p.cabecera_id is not null
     where cc.sucio or cc.calculado_en is null or cc.calculado_en < now() - make_interval(mins => greatest(ttl - 5, 1))
     order by (cc.calculado_en is null) desc, cc.sucio desc, cc.calculado_en nulls first
     limit p_max
  loop
    select cc.version into v from trol3.cartera_cache cc where cc.persona_id = r.persona_id;
    begin
      k := trol3._carril_de_vivo(r.persona_id);
      f := trol3._cartera_fila_vivo(r.persona_id);
      -- Solo se da por limpia si nadie la ensució mientras se calculaba.
      update trol3.cartera_cache cc set carril = k, fila = f, calculado_en = now(), sucio = false
       where cc.persona_id = r.persona_id and cc.version = v;
    exception when others then
      raise warning '310: no se pudo calcular la fila de %: %', r.persona_id, sqlerrm;
    end;
    commit;
  end loop;
  perform pg_advisory_unlock(hashtext('trol3.cartera_cache_calentar'));
end $proc$;
revoke all on procedure trol3.cartera_cache_calentar(integer) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'trol3-cartera-cache';
select cron.schedule('trol3-cartera-cache', '* * * * *', $$call trol3.cartera_cache_calentar(400)$$);
