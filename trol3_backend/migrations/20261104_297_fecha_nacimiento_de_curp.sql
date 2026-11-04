-- 297 — Fecha de nacimiento desde la CURP (Raúl, 4-nov-2026: cotización Infonavit preliminar sin historial IMSS).
-- La CURP trae YYMMDD en las posiciones 5-10 y el siglo en la 17 (dígito = 1900s, letra = 2000s). Hasta hoy
-- `personas.fecha_nacimiento` sólo se llenaba cuando llegaba el historial del IMSS; con Jordan caído, un lead
-- con Precalix exitoso se quedaba sin edad y sin cotización. Aquí se llena al capturar la CURP y se rellenan
-- los 303 que estaban en blanco. NUNCA se pisa una fecha ya capturada (hay 24 que difieren de la CURP; se respetan).
-- Aplicada por MCP el 4-nov-2026.

create or replace function trol3.fecha_nacimiento_de_curp(p_curp text)
returns date
language plpgsql
immutable
as $$
declare c text := upper(trim(coalesce(p_curp, ''))); yy int; siglo int; d date;
begin
  if c !~ '^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z][0-9]$' then return null; end if;
  yy := substr(c, 5, 2)::int;
  siglo := case when substr(c, 17, 1) ~ '[0-9]' then 1900 else 2000 end;
  begin
    d := make_date(siglo + yy, substr(c, 7, 2)::int, substr(c, 9, 2)::int);
  exception when others then return null;
  end;
  -- Nadie nace en el futuro ni antes de 1900 con CURP vigente.
  if d > current_date then return null; end if;
  return d;
end $$;

comment on function trol3.fecha_nacimiento_de_curp(text) is 'Fecha de nacimiento codificada en la CURP (297); null si la CURP no es válida.';

create or replace function trol3.tg_persona_fnac_curp()
returns trigger
language plpgsql
as $$
begin
  if new.fecha_nacimiento is null and new.curp is not null then
    new.fecha_nacimiento := trol3.fecha_nacimiento_de_curp(new.curp);
  end if;
  return new;
end $$;

drop trigger if exists persona_fnac_curp on trol3.personas;
create trigger persona_fnac_curp before insert or update of curp, fecha_nacimiento on trol3.personas
  for each row execute function trol3.tg_persona_fnac_curp();

-- Relleno de los que ya estaban (sólo donde no había fecha).
update trol3.personas p
   set fecha_nacimiento = trol3.fecha_nacimiento_de_curp(p.curp)
 where p.fecha_nacimiento is null and p.curp is not null
   and trol3.fecha_nacimiento_de_curp(p.curp) is not null;
