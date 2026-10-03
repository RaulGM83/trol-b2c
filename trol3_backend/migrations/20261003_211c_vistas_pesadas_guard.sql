-- 211c · Las vistas analíticas de equipo (duplicados, segmentos, embudo, conversaciones)
-- recorren toda la base: con `security_invoker` el RLS se evalúa fila por fila y
-- v_personas_duplicadas pasó de ms a timeout. Vuelven a `security definer` pero con
-- `where trol3.es_miembro()` adentro: un cliente ve 0 filas, el equipo lo ve rápido.
do $$
declare v text; src text;
begin
  foreach v in array array['v_personas_duplicadas','v_segmentos_campana','v_segmentos_gestoria','v_segmento_mod10_viraal','v_embudo_codigo','v_conversaciones_tako']
  loop
    src := pg_get_viewdef(('trol3.' || v)::regclass, true);
    src := regexp_replace(src, ';\s*$', '');
    if position('211c' in src) > 0 then continue; end if;
    execute format('create or replace view trol3.%I as select * from (%s) q_211c where trol3.es_miembro()', v, src);
    execute format('alter view trol3.%I set (security_invoker = false)', v);
    execute format('comment on view trol3.%I is %L', v, '211c: security definer con filtro es_miembro() adentro (sólo equipo; un cliente ve 0 filas).');
  end loop;
end $$;
