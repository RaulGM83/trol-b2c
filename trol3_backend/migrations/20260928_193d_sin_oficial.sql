-- 193d · "No digamos oficiales": la información nos llega del IMSS, pero Trol no es un medio
-- autorizado por el IMSS (Raul, 28-sep). Se cambian los textos que ve el cliente; los nombres
-- de variables y los comentarios se quedan.
do $$
declare f text; src text; nuevo text;
  pares text[][] := array[
    ['Con ella buscamos tu información oficial en el IMSS', 'Con ella buscamos tu información en el IMSS'],
    ['Busquemos tu información oficial', 'Busquemos tu información del IMSS'],
    ['Con tu CURP buscamos tu información oficial en el IMSS', 'Con tu CURP buscamos tu información en el IMSS'],
    ['Obtener tu información oficial del IMSS', 'Obtener tu información del IMSS'],
    ['Tu CURP ya fue validada con la fuente oficial.', 'Tu CURP ya fue validada con el IMSS.'],
    ['no encontramos tu información oficial con ella', 'no encontramos tu información del IMSS con ella'],
    ['No pudimos encontrar tu información oficial con esa CURP.', 'No pudimos encontrar tu información del IMSS con esa CURP.'],
    ['Reporte oficial de semanas cotizadas (SISEC)', 'Reporte de semanas cotizadas (SISEC)'],
    ['Historial oficial (SISEC)', 'Historial del IMSS (SISEC)']];
  i int;
begin
  foreach f in array array['trol3.parada_de(uuid)', 'trol3.mi_misiones()', 'trol3.evaluar_persona(uuid)', 'trol3.aplicar_regla_identidad(uuid)'] loop
    begin
      src := pg_get_functiondef(f::regprocedure);
    exception when others then continue;  -- firma distinta: se atiende abajo por nombre
    end;
    nuevo := src;
    for i in 1 .. array_length(pares, 1) loop nuevo := replace(nuevo, pares[i][1], pares[i][2]); end loop;
    if nuevo <> src then execute nuevo; end if;
  end loop;
  -- las que tienen firmas largas: por nombre
  for f in select p.oid::regprocedure::text from pg_proc p
            where p.pronamespace = 'trol3'::regnamespace and p.prokind = 'f'
              and p.proname in ('declarar', 'registrar_sisec', 'migrar_desde_public', 'sync_desde_cliente', 'evaluar_persona', 'aplicar_regla_identidad', 'mi_misiones')
  loop
    src := pg_get_functiondef(f::regprocedure);
    nuevo := src;
    for i in 1 .. array_length(pares, 1) loop nuevo := replace(nuevo, pares[i][1], pares[i][2]); end loop;
    if nuevo <> src then execute nuevo; end if;
  end loop;
end $$;
