-- 212 · Limpieza (claude/96). 3-oct-2026.
--
--   1. Tablas scratch y respaldos viejos salen de `public`/`trol3` al esquema `archivo`
--      (no se borran: cuando Raul quiera, `drop schema archivo cascade`). Nada las referencia
--      (revisado en pg_proc y pg_views). Se quedan donde están `recalculo_v56_cola` y
--      `recalculo_v57_cola` (las usan `recalculo_v5x_tomar/cerrar`) y `contrafactual_batch_estado`.
--   2. Índices en las FKs sin índice (uuid) de trol3: carril_de, cartera y expediente recorren
--      citas, oportunidades, marcas y datos por persona.
--   3. `search_path` fijo en las funciones de trol3 que no lo tenían (linter).

-- 1 ---------------------------------------------------------------------------------------
create schema if not exists archivo;
do $$ begin execute 'revoke all on schema archivo from public, anon, authenticated'; end $$;
do $$
declare t text;
begin
  foreach t in array array[
    'public.cola_mod40_top200', 'public.cola_infonavit_alto', 'public.cola_belvo_top100',
    'public._calib_curva_procesos', 'public._v57_cambio',
    'public.clientes_backup_pre_reset_2026_04_26_v2', 'public.clientes_nombres_backup_20260613',
    'public.partner_transactions_backup_2026_05_01',
    'public.backtest_lista_busqueda', 'public.backtest_lista_busqueda_lote2',
    'trol3.recalculo_20260827', 'trol3.snapshot_ops_20260901']
  loop
    if to_regclass(t) is not null then
      execute format('alter table %s set schema archivo', t);
    end if;
  end loop;
end $$;
comment on schema archivo is '212: respaldos y scratch fuera de la API. Se puede borrar entero cuando ya no haga falta.';

-- 2 ---------------------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, a.attname as col, c.conrelid::regclass::text as tname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
     where c.contype = 'f' and c.connamespace = 'trol3'::regnamespace and array_length(c.conkey, 1) = 1
       and a.atttypid = 'uuid'::regtype
       and not exists (select 1 from pg_index i join pg_attribute a2 on a2.attrelid = i.indrelid and a2.attnum = i.indkey[0]
                        where i.indrelid = c.conrelid and a2.attname = a.attname)
  loop
    execute format('create index if not exists %I on %s (%I)', 'ix_' || replace(r.tname, 'trol3.', '') || '_' || r.col, r.tbl, r.col);
  end loop;
end $$;

-- 3 ---------------------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'trol3' and p.prokind = 'f'
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = trol3, public', f.sig);
  end loop;
end $$;
