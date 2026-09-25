-- 186: la CURP de trol3 manda sobre la de public.clientes (Saara Aide, 25-sep).
--
-- Al corregir una CURP en trol3 (`declarar` → personas.curp) el espejo `tg_curp_a_public`
-- sólo escribía en public.clientes si la legacy estaba vacía o mal formada, y
-- `tg_consulta_despachar` armaba el payload de Jordan con `c.curp` (legacy). Resultado:
-- una CURP bien formada pero equivocada se quedaba en legacy para siempre y Jordan
-- buscaba a la persona equivocada aunque trol3 ya tuviera la buena.
--
-- Ahora: (1) el espejo escribe siempre que la CURP de trol3 cambie; (2) el despacho
-- refresca legacy si difiere antes de armar el payload; (3) se alinean las personas que
-- hoy difieren. public.clientes tiene `clientes_curp_key` (única): si otro cliente
-- legacy ya tiene esa CURP no se pisa (quedaría como error de despacho, visible, en
-- vez de tumbar la corrección de la CURP en trol3).

create or replace function trol3.tg_curp_a_public()
returns trigger
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $function$
begin
  if new.curp is not null and new.legacy_cliente_id is not null and (old.curp is distinct from new.curp or old.legacy_cliente_id is distinct from new.legacy_cliente_id) then
    update public.clientes set curp = new.curp
     where id = new.legacy_cliente_id and curp is distinct from new.curp
       and not exists (select 1 from public.clientes x where x.curp = new.curp and x.id <> new.legacy_cliente_id);
  end if;
  return new;
end $function$;

do $$
declare def text; ancla text; nuevo text; n int;
begin
  def := pg_get_functiondef('trol3.tg_consulta_despachar'::regproc);
  ancla := 'if c.curp is null then update public.clientes set curp = p.curp where id = c.id; c.curp := p.curp; end if;';
  nuevo := 'if c.curp is distinct from p.curp then update public.clientes set curp = p.curp where id = c.id and not exists (select 1 from public.clientes x where x.curp = p.curp and x.id <> c.id); c.curp := p.curp; end if;';
  n := (length(def) - length(replace(def, ancla, ''))) / length(ancla);
  if n <> 1 then raise exception 'ancla en tg_consulta_despachar: % coincidencias', n; end if;
  execute replace(def, ancla, nuevo);
end $$;

update public.clientes c set curp = p.curp
from trol3.personas p
where p.legacy_cliente_id = c.id and p.merged_into is null and p.curp is not null and c.curp is distinct from p.curp
  and not exists (select 1 from public.clientes x where x.curp = p.curp and x.id <> c.id);
