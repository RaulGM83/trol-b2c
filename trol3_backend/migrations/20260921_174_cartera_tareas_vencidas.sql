-- 174: un compromiso vencido sube al cliente a "Me toca a mí" (fase 5).
--
-- La pantalla de Tareas sale del menú y pasa a ser la pestaña "Mis pendientes" de
-- Mi cartera. Para que un compromiso no dependa de que alguien abra esa pestaña,
-- una tarea pendiente que vence hoy o ya venció mete a ese cliente en la bandeja
-- "Me toca a mí" con el motivo a la vista. Manda el RESPONSABLE de la tarea, no el
-- experto del cliente: si me encargaron algo de un cliente ajeno, me toca igual.
-- En la vista de equipo salen las de todos.

do $patch$
declare
  def text := pg_get_functiondef('trol3.cartera_de(uuid,text)'::regprocedure);
  ancla text := $a$    union all
    select o.persona_id, 3, 'tramite', min(oc.created_at),$a$;
  nuevo text := $b$    union all
    -- 174: compromisos con fecha cumplida
    select t.persona_id, 3, 'tarea', min(t.vence_el)::timestamptz,
           case when count(*) = 1 then 'Pendiente: ' || max(t.titulo)
                else count(*) || ' pendientes vencidos: ' || string_agg(t.titulo, ' · ' order by t.vence_el) end
      from trol3.tareas t
     where t.estado = 'pendiente' and t.persona_id is not null and t.vence_el <= current_date
       and (p_vista = 'equipo' or t.responsable_id = p_miembro)
     group by t.persona_id
    union all
    select o.persona_id, 3, 'tramite', min(oc.created_at),$b$;
begin
  if (length(def) - length(replace(def, ancla, ''))) / length(ancla) <> 1 then raise exception '174: ancla de cartera_de'; end if;
  execute replace(def, ancla, nuevo);
end $patch$;
