-- 265 · Fríos que se quedan fríos (Raúl, 26-oct): «no contestó» ya no regresa solo a Tibios
-- (antes 3/7/14 días según toques en 30 días: ~340 de 545 fríos ya habían rebotado). Sólo vuelve
-- si el cliente reacciona o alguien lo despierta. «Lo va a pensar» sigue volviendo a los 30 días,
-- pero al final de Tibios (después de los nuevos con potencial).
do $mig$
declare src text; a1 text; a2 text;
begin
  select pg_get_functiondef('trol3.carril_de(uuid)'::regprocedure) into src;
  a1 := $a$                when 'no_contesto' then case when m.toques <= 1 then m.created_at::date + 3
                                             when m.toques = 2 then m.created_at::date + 7
                                             when m.toques = 3 then m.created_at::date + 14 end
$a$;
  if position(a1 in src) = 0 then raise exception '265: ancla carril_de'; end if;
  src := replace(src, a1, '');
  execute src;

  select pg_get_functiondef('trol3.mi_tibios(text,text,integer)'::regprocedure) into src;
  a2 := $a$case x.k->>'origen' when 'despertado' then 0 else 9 end$a$;
  if position(a2 in src) = 0 then raise exception '265: ancla mi_tibios'; end if;
  src := replace(src, a2, $b$case x.k->>'origen' when 'despertado' then 0 when 'cadencia' then 10 else 9 end$b$);
  execute src;
end $mig$;
