-- 165: que la cartera no se muera con la cartera de Raul.
--
-- La 164 calculaba la fila completa (parada_de incluida, ~13 ms) de TODOS los
-- "míos" para saber a quién le toca, y la CTE sin materializar la recalculaba en
-- cada referencia. Raul es dueño de oportunidades de 259 personas: statement
-- timeout. Ahora "Le toca al cliente" parte de candidatos baratos —soy su
-- experto, o llevo una oportunidad suya que ya pasó de 'detectada'—, toma los 60
-- de movimiento más reciente y sólo a ésos les calcula la fila, una vez.

do $patch$
declare
  def text := pg_get_functiondef('trol3.cartera_de(uuid,text)'::regprocedure);
  ancla text := $a$  f as (
    select trol3._cartera_fila(m.id) fila from mios m
     where not exists (select 1 from jsonb_array_elements(me_toca) x where (x->>'persona_id')::uuid = m.id)
  )$a$;
  nuevo text := $b$  cand as (
    select m.id from mios m join trol3.personas p on p.id = m.id
     where not exists (select 1 from jsonb_array_elements(me_toca) x where (x->>'persona_id')::uuid = m.id)
       and (p.cabecera_id is not null and (p_vista = 'equipo' or p.cabecera_id = p_miembro)
            or exists (select 1 from trol3.oportunidades o where o.persona_id = m.id
                        and o.estado in ('presentada','interesada','en_proceso')
                        and (o.dueno_id = p_miembro or o.especialista_id = p_miembro)))
     order by p.updated_at desc
     limit 60
  ),
  f as materialized (select trol3._cartera_fila(c.id) fila from cand c)$b$;
begin
  if (length(def) - length(replace(def, ancla, ''))) / length(ancla) <> 1 then raise exception '165: ancla de cartera_de'; end if;
  execute replace(def, ancla, nuevo);
end $patch$;