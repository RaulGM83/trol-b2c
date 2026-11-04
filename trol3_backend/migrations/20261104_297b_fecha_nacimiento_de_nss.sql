-- 297b — Año de nacimiento desde el NSS (Raúl, 4-nov-2026: "si no pusieran la CURP se estima con el NSS").
-- Los dígitos 5-6 del NSS son el año de nacimiento. Validado contra la CURP en 10,631 personas con ambos:
-- 94% exacto, 98% a ±1 año, 99.5% a ±2. Devuelve el 1 de julio de ese año (±6 meses).
-- Sólo es respaldo cuando no hay CURP válida (orden: fecha capturada → CURP → NSS). NO se guarda en personas:
-- una fecha estimada se confundiría con la real y bloquearía la que traiga el IMSS. La app la usa en
-- cotizacion-inicial-server.ts (fechaNacimientoDeNss) y marca la cotización como preliminar.
-- Aplicada por MCP el 4-nov-2026.
create or replace function trol3.fecha_nacimiento_de_nss(p_nss text)
returns date
language plpgsql
stable
as $$
declare n text := regexp_replace(coalesce(p_nss, ''), '\D', '', 'g'); yy int; hoy int := extract(year from current_date)::int;
begin
  if n !~ '^[0-9]{11}$' then return null; end if;
  yy := substr(n, 5, 2)::int;
  -- Nadie cotiza con menos de ~15 años: dos dígitos por arriba de (año actual − 15) son del siglo pasado.
  return make_date(case when yy > (hoy - 15) % 100 then 1900 + yy else 2000 + yy end, 7, 1);
end $$;
comment on function trol3.fecha_nacimiento_de_nss(text) is 'Año de nacimiento codificado en el NSS, como 1-jul de ese año (297b). Estimación: no guardar en personas.';
