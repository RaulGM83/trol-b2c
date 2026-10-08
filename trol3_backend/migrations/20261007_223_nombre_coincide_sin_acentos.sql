-- 223 · nombre_coincide ignoraba acentos: «Giselle Garcia» no encontraba a «Giselle García Cardone» al buscar
-- cotitular en la pestaña Infonavit (buscar_cotitular es la única que la usa). Ahora compara sin acentos ni ñ/ü.
-- Aplicada con apply_migration (sin DML). Probado: 'Giselle Garcia' → García ✓, 'sanudo' → Sañudo ✓.
create or replace function trol3.sin_acentos(t text)
returns text language sql immutable parallel safe
as $$ select translate(lower(coalesce(t,'')), 'áéíóúàèìòùäëïöüâêîôûñçÁÉÍÓÚÀÈÌÒÙÄËÏÖÜÂÊÎÔÛÑÇ', 'aeiouaeiouaeiouaeiouncaeiouaeiouaeiouaeiounc') $$;

create or replace function trol3.nombre_coincide(p_nombre text, p_q text)
returns boolean
language sql
immutable
set search_path to 'trol3', 'public'
as $function$
  select coalesce(
    (select bool_and(trol3.sin_acentos(p_nombre) like '%'||w||'%')
       from unnest(string_to_array(regexp_replace(trim(trol3.sin_acentos(p_q)), '\s+', ' ', 'g'), ' ')) w
      where w <> ''),
    false)
$function$;
