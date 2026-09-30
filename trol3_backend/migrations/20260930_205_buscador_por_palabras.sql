-- 205 · Buscador de personas más flexible. Antes buscaba el texto tal cual ("sergio salas"
-- no encontraba a "Sergio Felipe Salas Cabrera"). Ahora cada palabra por separado, en
-- cualquier orden y sin acentos. CURP, teléfono y hubspot_id se buscan igual que antes.
-- Se aplica reemplazando sólo la condición de nombre dentro de trol3.buscar_personas.
do $mig$
declare
  def text;
  viejo text := $v$or (length(q.s) >= 4 and (p.curp ilike q.s||'%%' or (coalesce(p.nombre,'')||' '||coalesce(p.apellidos,'')) ilike '%%'||q.s||'%%' or p.hubspot_id = q.s))$v$;
  nuevo text := $n$or (length(q.s) >= 4 and (p.curp ilike q.s||'%%' or p.hubspot_id = q.s
            -- 205: cada palabra por separado y sin acentos ("sergio salas" encuentra a "Sergio Felipe Salas Cabrera")
            or not exists (
              select 1 from regexp_split_to_table(translate(lower(q.s), 'áéíóúüñàèìòù', 'aeiouunaeiou'), '\s+') w
               where w <> '' and position(w in translate(lower(coalesce(p.nombre,'')||' '||coalesce(p.apellidos,'')), 'áéíóúüñàèìòù', 'aeiouunaeiou')) = 0)))$n$;
begin
  select pg_get_functiondef('trol3.buscar_personas(text,integer,text,text)'::regprocedure) into def;
  if position(viejo in def) = 0 then raise exception 'no encontré la condición a reemplazar'; end if;
  execute replace(def, viejo, nuevo);
end $mig$;
