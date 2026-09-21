-- 173: el índice único de la bandeja deja de ser parcial.
--
-- El lector de Granola inserta con ON CONFLICT (reunion_id, pregunta_hash) vía PostgREST,
-- que no manda el predicado: un índice parcial no se puede inferir y el upsert fallaría.
-- Sin el WHERE se comporta igual: las propuestas a mano llevan reunion_id NULL y los NULL
-- nunca chocan entre sí.

drop index if exists trol3.fichas_propuestas_reunion_uq;
create unique index fichas_propuestas_reunion_uq on trol3.fichas_propuestas (reunion_id, pregunta_hash);
