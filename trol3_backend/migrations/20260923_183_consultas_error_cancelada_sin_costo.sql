-- 183: Jordan no cobra los errores ni las canceladas (Raul, 23-sep).
--
-- `pedir_consulta` graba el costo unitario al crear la consulta y nadie lo bajaba a cero
-- cuando terminaba en `error` o `cancelada`: el análisis de agosto–septiembre contaba
-- $546 de Jordan que nunca se pagaron. Un trigger lo deja en cero al cerrar en esos dos
-- estados (para cualquier proveedor: tampoco Belvo cobra un error de su lado), y se
-- corrige lo histórico. `sin_resultado` SÍ se cobra: el proveedor sí buscó.

create or replace function trol3.tg_consulta_costo_cero()
returns trigger
language plpgsql
as $function$
begin
  if new.estado in ('error','cancelada') and coalesce(new.costo, 0) <> 0 then new.costo := 0; end if;
  return new;
end $function$;

drop trigger if exists consulta_costo_cero on trol3.consultas;
create trigger consulta_costo_cero before insert or update of estado on trol3.consultas
  for each row execute function trol3.tg_consulta_costo_cero();

update trol3.consultas set costo = 0 where estado in ('error','cancelada') and coalesce(costo, 0) <> 0;
