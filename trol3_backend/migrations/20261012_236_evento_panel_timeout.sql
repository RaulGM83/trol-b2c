-- 236 · Panel del evento: timeout por v_expediente en join (12-oct-2026)
--
-- `evento_panel` hacía `left join trol3.v_expediente e on e.persona_id = per.id`. Como el planner
-- estima ~7,000 personas para el filtro «codigo_origen = X or consentimiento con X» (OR con subplan),
-- elige hash join y construye v_expediente COMPLETA (550k filas de datos, ~4.5 s) aunque haya 2
-- registrados. Con RLS de la sesión del equipo eso pasa el statement_timeout → «canceling
-- statement due to statement timeout» en /trabajo/evento/panel. Un lateral no ayuda: el predicado
-- no se empuja dentro de la vista (DISTINCT ON + GROUP BY). Misma lección que 223: v_expediente
-- se lee con el id concreto. Helper plpgsql (opaco para el planner, se ejecuta por fila):
-- 5,309 ms → 70 ms con los 2 registrados de hoy. Lo mismo en `evento_registrados` (pasillo).

create or replace function trol3._expediente_resumen(p uuid)
returns table(ley text, semanas numeric, pension_base numeric)
language plpgsql
stable
security definer
set search_path to 'trol3', 'public'
as $$
begin
  return query select x.ley, x.semanas, x.pension_base from trol3.v_expediente x where x.persona_id = p;
end $$;

revoke all on function trol3._expediente_resumen(uuid) from public, anon, authenticated;

do $mig$
declare src text;
begin
  select pg_get_functiondef('trol3.evento_panel(text,integer)'::regprocedure) into src;
  if position($a$from per left join trol3.v_expediente e on e.persona_id = per.id$a$ in src) = 0 then raise exception '236: ancla evento_panel'; end if;
  src := replace(src, $a$from per left join trol3.v_expediente e on e.persona_id = per.id$a$,
                      $b$from per left join lateral trol3._expediente_resumen(per.id) e on true$b$);
  execute src;

  select pg_get_functiondef('trol3.evento_registrados(text,integer)'::regprocedure) into src;
  if position($a$left join trol3.v_expediente e on e.persona_id = p.id$a$ in src) = 0 then raise exception '236: ancla evento_registrados'; end if;
  src := replace(src, $a$left join trol3.v_expediente e on e.persona_id = p.id$a$,
                      $b$left join lateral trol3._expediente_resumen(p.id) e on true$b$);
  execute src;
end $mig$;
