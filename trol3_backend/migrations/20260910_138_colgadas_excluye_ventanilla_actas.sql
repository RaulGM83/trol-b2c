-- 138: el barrido de consultas colgadas (10 min) no aplica a ventanilla ni actas.
-- Esas tardan horas (ventanilla: L-V 8-17, ETA 30 min hábiles o más) y tienen su propio
-- cierre: webhook de Jordan + cron horario /api/jordan/reconciliar + botón "Revisar".
create or replace function trol3.cerrar_consultas_colgadas(p_minutos integer default null)
returns integer
language plpgsql security definer set search_path to 'trol3', 'public'
as $function$
declare m int; n int := 0; c record;
begin
  m := coalesce(p_minutos, (select valor::int from trol3.config where clave='consulta_espera_min'), 10);
  for c in
    select id, persona_id, tipo, proveedor, created_at
      from trol3.consultas
     where estado in ('solicitada','en_proceso')
       and legacy_proceso_id is null
       and coalesce(tipo,'') not in ('imss_ventanilla','acta')   -- 138: on demand, cierre propio
       and created_at < now() - (m||' minutes')::interval
       and created_at > now() - interval '7 days'
       and coalesce(error,'') not like 'Falta CURP%'
     for update skip locked
  loop
    update trol3.consultas
       set estado = 'sin_resultado', completed_at = now(),
           error = 'Sin respuesta de '||coalesce(c.proveedor,'el proveedor')||' después de '||m||' min'
     where id = c.id;
    perform trol3.emitir_evento(c.persona_id, 'consulta_sin_respuesta', 'sistema', null,
      jsonb_build_object('consulta_id', c.id, 'tipo', c.tipo, 'proveedor', c.proveedor, 'minutos', m));
    n := n + 1;
  end loop;
  return n;
end $function$;

-- Reabrir las ventanillas/actas que el barrido cerró por error (Jordan sigue trabajándolas).
update trol3.consultas
   set estado = 'en_proceso', error = null, completed_at = null, updated_at = now()
 where tipo in ('imss_ventanilla','acta')
   and estado = 'sin_resultado'
   and error like 'Sin respuesta de jordan_%después de%';
