-- 166: una propuesta es de un asesor a SU cliente.
--
-- Probada la 164 con gente real, a Raul le salían 185 "propuestas sin respuesta":
-- son los lotes de campaña C1/C2, que él marcó 'presentada' (actor asesor) sobre
-- personas que no tienen experto y de las que sólo es dueño de la oportunidad.
-- Eso no es una propuesta que alguien esté esperando contestar. La bandeja 5 exige
-- ahora que el cliente tenga experto asignado: hay relación, no sólo un envío.

do $patch$
declare
  def text := pg_get_functiondef('trol3.cartera_de(uuid,text)'::regprocedure);
  ancla text := $a$       and coalesce(o.estado_desde, o.presentada_en) < now() - interval '3 days'$a$;
  nuevo text := $b$       and coalesce(o.estado_desde, o.presentada_en) < now() - interval '3 days'
       and exists (select 1 from trol3.personas pp where pp.id = o.persona_id and pp.cabecera_id is not null)$b$;
begin
  if (length(def) - length(replace(def, ancla, ''))) / length(ancla) <> 1 then raise exception '166: ancla de cartera_de'; end if;
  execute replace(def, ancla, nuevo);
end $patch$;