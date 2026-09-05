-- 110b — la búsqueda del cotitular vuelve a funcionar, y busca como escribe la gente.
--
-- Dos bugs encadenados, encontrados el 5-sep buscando a Eva Santos para una
-- compra conyugal con su esposo:
--
-- 1) `trol3.buscar_personas` tenía DOS versiones — una de 2 argumentos y otra
--    de 4 con defaults. El front del cotitular la llama con `p_q` y `p_limit`,
--    y Postgres no puede elegir: "function is not unique". La RPC fallaba
--    ANTES de buscar nada, así que ni por CURP salía. Y como la pantalla hace
--    `setHallazgos(r.ok ? … : [])`, el error se veía como "no existe esa
--    persona". Un fallo silencioso que costó una tarde.
--
--    Es la misma trampa del 109b: `create or replace` sobre una función a la
--    que se le agregan parámetros NO la reemplaza, crea una sobrecarga. Aquí
--    se paga la deuda: se tira la de 2 argumentos; la de 4 la cubre con sus
--    defaults y `/trabajo` ya la llamaba así.
--
-- 2) El nombre se comparaba como una sola frase:
--    `(nombre||' '||apellidos) ilike '%Eva Santos%'`. Eva está capturada como
--    "Eva Maria" + "Santos Garcia", así que el "Maria" de en medio rompía la
--    coincidencia. Nadie escribe el nombre completo de su cliente. Ahora cada
--    palabra tiene que aparecer, en cualquier orden y en cualquier parte.
--
-- `buscar_cotitular` devuelve además lo que la pantalla necesita para decidir
-- sin una segunda vuelta: si está cotizando, cuánto tiene, con qué capa, y si
-- califica según `saldo_min_cotitular` (110).

drop function if exists trol3.buscar_personas(text, integer);

create or replace function trol3.nombre_coincide(p_nombre text, p_q text)
returns boolean language sql immutable as $$
  select coalesce(
    (select bool_and(coalesce(p_nombre,'') ilike '%'||w||'%')
       from unnest(string_to_array(regexp_replace(trim(coalesce(p_q,'')), '\s+', ' ', 'g'), ' ')) w
      where w <> ''),
    false)
$$;

comment on function trol3.nombre_coincide is
  'true si TODAS las palabras de la busqueda aparecen en el nombre, en cualquier orden. 110b: "Eva Santos" encuentra a "Eva Maria Santos Garcia".';

create or replace function trol3.buscar_cotitular(p_q text, p_limit integer default 8)
returns table(
  id uuid, nombre text, apellidos text, curp text, edad integer, ley text,
  status_empleo text, saldo_infonavit numeric, saldo_capa text,
  credito_vigente boolean, califica boolean, motivo text)
language sql stable security definer
set search_path to 'trol3', 'public'
as $$
  with q as (select trim(coalesce(p_q,'')) s, trol3.tel10(coalesce(p_q,'')) t10),
  minimo as (
    select coalesce((select s.saldo_min_cotitular from trol3.infonavit_supuestos s
                      where s.id = 'default'), 100000)::numeric as v
  ),
  hit as (
    select p.id, p.updated_at
      from trol3.personas p, q
     where trol3.es_miembro()
       and p.merged_into is null
       -- Menos de 3 letras no acota nada: mejor no devolver un listado
       -- arbitrario que el asesor confundiría con resultados de su búsqueda.
       and (
         (length(q.t10) = 10 and exists (
            select 1 from trol3.contactos c
             where c.persona_id = p.id and c.normalizado = q.t10))
         or (length(q.s) >= 3 and (
              p.curp ilike q.s||'%'
              or trol3.nombre_coincide(
                   coalesce(p.nombre,'')||' '||coalesce(p.apellidos,''), q.s)))
       )
     order by p.updated_at desc
     limit greatest(coalesce(p_limit, 8), 1)
  )
  select
    p.id, p.nombre, p.apellidos, p.curp,
    extract(year from age(p.fecha_nacimiento))::int,
    e.ley, e.status_empleo,
    e.saldo_infonavit, e.saldo_infonavit_capa, e.credito_infonavit,
    (e.status_empleo = 'empleado' and coalesce(e.saldo_infonavit,0) > m.v) as califica,
    case
      when e.status_empleo is distinct from 'empleado' then 'no está cotizando'
      when coalesce(e.saldo_infonavit,0) <= m.v then 'saldo Infonavit por debajo del mínimo'
      else null
    end as motivo
  from hit
  join trol3.personas p on p.id = hit.id
  left join trol3.v_expediente e on e.persona_id = p.id
  cross join minimo m
  order by hit.updated_at desc;
$$;

comment on function trol3.buscar_cotitular is
  'Busca al conyuge para un credito conyugal y dice si califica (activo + saldo sobre infonavit_supuestos.saldo_min_cotitular). 110b.';

grant execute on function trol3.buscar_cotitular(text, integer) to authenticated;
