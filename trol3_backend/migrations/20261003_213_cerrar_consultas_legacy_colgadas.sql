-- 213 · Cierre de las consultas legacy colgadas (claude/96 §3.1). 3-oct-2026. Decisión de Raul.
--
-- 737 consultas con `legacy_proceso_id` (547 calculo_base, 188 infonavit, 2 imss_historial) llevaban
-- desde feb–may en `solicitada`/`en_proceso`: el watchdog las salta a propósito (legacy y > 7 días).
-- Se cierran como `sin_resultado` con los triggers de la tabla apagados, para no emitir
-- `consulta_sin_respuesta` ni avisos a 700 clientes por algo que pasó hace meses.
-- Se dejan las 11 con error 'Falta CURP…': esas esperan la CURP y se disparan solas al llegar.
do $$
declare n int;
begin
  execute 'alter table trol3.consultas disable trigger user';
  execute $q$
    update trol3.consultas
       set estado = 'sin_resultado', completed_at = now(), updated_at = now(),
           error = coalesce(error, '') || case when coalesce(error, '') = '' then '' else ' · ' end
                   || 'Cerrada por antigüedad (213): proceso legacy sin respuesta'
     where estado in ('solicitada', 'en_proceso')
       and created_at < now() - interval '2 days'
       and legacy_proceso_id is not null
       and coalesce(error, '') not like 'Falta CURP%'
  $q$;
  get diagnostics n = row_count;
  execute 'alter table trol3.consultas enable trigger user';
  raise notice '213: cerradas %', n;
  if n > 800 or n < 700 then raise exception '213: esperaba ~737 y fueron %', n; end if;
end $$;
