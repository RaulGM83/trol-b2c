-- 249 · El candado 234b callaba el aviso "consulta lista" con que UN campo viniera viejo (Mariana
-- Martínez, 21-oct: Belvo trajo semanas de dic-2025, pero NSS, salario, ley y status sí entraron).
-- Ahora sólo calla si la consulta no dejó ningún dato nuevo validado. Aplicada vía MCP el 21-oct-2026.
do $$
declare src text;
begin
  src := pg_get_functiondef('trol3.tg_avisar_consulta_lista()'::regprocedure);
  src := replace(src,
$a$  if exists (
    select 1 from trol3.eventos x
    where x.persona_id = new.persona_id and x.tipo = 'dato_viejo_ignorado'
      and x.payload ->> 'consulta_id' = new.payload ->> 'consulta_id'
      and x.created_at > now() - interval '1 hour'
  ) then return new; end if;$a$,
$b$  -- 249: sólo si TODO lo que trajo se descartó; un campo viejo entre varios nuevos no calla el aviso.
  if exists (
    select 1 from trol3.eventos x
    where x.persona_id = new.persona_id and x.tipo = 'dato_viejo_ignorado'
      and x.payload ->> 'consulta_id' = new.payload ->> 'consulta_id'
      and x.created_at > now() - interval '1 hour'
  ) and not exists (
    select 1 from trol3.eventos y
    where y.persona_id = new.persona_id and y.tipo = 'dato_nuevo'
      and y.payload ->> 'capa' = 'validado'
      and y.payload ->> 'consulta_id' = new.payload ->> 'consulta_id'
      and y.created_at > now() - interval '1 hour'
  ) then return new; end if;$b$);
  if position('249: sólo si TODO' in src) = 0 then raise exception 'parche 249 no encajó'; end if;
  execute src;
end $$;
