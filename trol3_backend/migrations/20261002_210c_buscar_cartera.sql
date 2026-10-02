-- 210c · Buscar sin salir de Mi cartera (claude/95): mismas filas que las listas
-- (_cartera_fila || carril_de), así cada resultado trae su carril y sus gestos.
create or replace function trol3.buscar_cartera(p_q text, p_limit int default 20) returns jsonb
language plpgsql stable security definer set search_path to 'trol3', 'public' as $function$
declare me uuid := trol3.current_miembro_id(); filas jsonb;
begin
  if me is null then raise exception 'no_autorizado'; end if;
  if coalesce(trim(p_q), '') = '' then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(trol3._cartera_fila(b.id) || trol3.carril_de(b.id) order by b.created_at desc), '[]'::jsonb)
    into filas
    from trol3.buscar_personas(p_q, p_limit, 'actividad', 'desc') b;
  return filas;
end $function$;
grant execute on function trol3.buscar_cartera(text, int) to authenticated;
