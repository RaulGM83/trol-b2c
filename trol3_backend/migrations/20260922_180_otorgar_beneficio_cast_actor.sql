-- 180: otorgar_beneficio estaba roto cuando lo llama un miembro.
--
-- El `case when mid is not null then 'asesor' else 'sistema' end` devuelve text, y
-- emitir_evento pide trol3.actor_tipo: "function emitir_evento(uuid, unknown, text, …)
-- does not exist". Es decir: "habilitar de cortesía" desde Beneficios nunca ha
-- funcionado con sesión de miembro (lo destapó la prueba de alta_en_evento, 179).
-- Se castea.

do $patch$
declare
  def text := pg_get_functiondef('trol3.otorgar_beneficio(uuid,text,text,text,text,timestamptz)'::regprocedure);
  ancla text := $a$case when mid is not null then 'asesor' else 'sistema' end, mid,$a$;
  nuevo text := $b$(case when mid is not null then 'asesor' else 'sistema' end)::trol3.actor_tipo, mid,$b$;
begin
  if (length(def) - length(replace(def, ancla, ''))) / length(ancla) <> 1 then raise exception '180: ancla de otorgar_beneficio'; end if;
  execute replace(def, ancla, nuevo);
end $patch$;
