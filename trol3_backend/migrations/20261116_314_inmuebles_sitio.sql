-- 314: inmuebles del catálogo que se muestran en trol.mx/infonavit.
-- El sitio no lee la tabla (trae costos y comisiones): lee esta función, que solo
-- expone lo que ya va en las fichas. Salen los disponibles y los agotados marcados.
-- Aplicada en producción el 16-nov-2026.

alter table trol3.proyectos_inmobiliarios add column if not exists mostrar_agotado boolean not null default false;
comment on column trol3.proyectos_inmobiliarios.mostrar_agotado is 'Si no está disponible, mostrarlo en el sitio como agotado (tipo de inmueble que volveremos a tener).';

create or replace function trol3.inmuebles_sitio()
returns table (clave integer, slug text, nombre text, ubicacion text, m2 numeric, precio numeric, renta numeric, renta_estimada boolean, disponible boolean, ficha_url text, actualizado timestamptz)
language sql stable security definer set search_path to 'trol3','public' as $$
  select p.clave,
         trim(both '-' from regexp_replace(
           translate(lower(coalesce(p.nombre_comercial, p.desarrollo) || ' ' || split_part(coalesce(p.ubicacion_comercial, p.zona), '·', 1)),
                     'áéíóúüñ', 'aeiouun'),
           '[^a-z0-9]+', '-', 'g')) || '-' || p.clave as slug,
         coalesce(p.nombre_comercial, p.desarrollo) as nombre,
         coalesce(p.ubicacion_comercial, p.zona) as ubicacion,
         p.m2, p.escrituracion as precio, p.renta, p.renta_estimada, p.disponible, p.ficha_url, p.updated_at
    from trol3.proyectos_inmobiliarios p
   where p.clave is not null and p.nombre_comercial is not null and (p.disponible or p.mostrar_agotado)
   order by p.disponible desc, p.escrituracion
$$;
revoke all on function trol3.inmuebles_sitio() from public;
grant execute on function trol3.inmuebles_sitio() to anon, authenticated;

-- Códigos de los botones de los pilares.
insert into trol3.codigos_invitacion (codigo, tipo, etiqueta, activo) values
  ('sitio_pen','sitio','Sitio · pilar de pensiones', true),
  ('sitio_inf','sitio','Sitio · pilar de Infonavit (línea de Frans)', true)
on conflict (codigo) do nothing;
