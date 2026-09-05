-- 107: limpieza del nombre de pila para el {{1}} de las plantillas.
-- Dos problemas distintos en la base:
--   a) nombres en MAYUSCULAS (JOSE, JUAN...) -> son validos, solo mal capitalizados: initcap.
--   b) tokens inservibles ('de', '—', 'J.', 'Ma.', 'VIC', 'Solo') -> saludo neutro.
-- El saludo neutro es 'buen día', que deja "Hola buen día, le escribimos de Trol Financiero."

create or replace function trol3.nombre_saludo(p_nombre text)
returns text language sql immutable as $$
  select case
    when t is null                       then 'buen día'
    when length(t) < 3                   then 'buen día'
    when right(t,1) = '.'                then 'buen día'
    when t !~ '^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ][A-Za-zÁÉÍÓÚÜÑáéíóúüñ''-]+$' then 'buen día'
    when lower(t) = any(array[
      'de','del','la','las','los','el','y','na','sr','sra','srita','don','dona',
      'test','prueba','cliente','solo','sin','nan','null','none','xxx','asd'])
                                         then 'buen día'
    else initcap(t)
  end
  from (select nullif(trim(split_part(coalesce(p_nombre,''),' ',1)),'') as t) s
$$;

create or replace function trol3.nombre_dudoso(p_nombre text)
returns boolean language sql immutable as $$
  select trol3.nombre_saludo(p_nombre) = 'buen día'
$$;

comment on function trol3.nombre_saludo(text) is
'Nombre de pila utilizable para el {{1}} de una plantilla de WhatsApp. Corrige MAYUSCULAS con initcap y devuelve el saludo neutro "buen día" cuando el token no sirve como nombre (particulas, iniciales, basura).';
