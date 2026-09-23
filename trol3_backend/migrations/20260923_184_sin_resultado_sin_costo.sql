-- 184: tampoco se cobra `sin_resultado` (Raul, 23-sep). Sólo cuesta lo que llegó completo.

create or replace function trol3.tg_consulta_costo_cero()
returns trigger
language plpgsql
as $function$
begin
  if new.estado in ('error','cancelada','sin_resultado') and coalesce(new.costo, 0) <> 0 then new.costo := 0; end if;
  return new;
end $function$;

update trol3.consultas set costo = 0 where estado = 'sin_resultado' and coalesce(costo, 0) <> 0;
