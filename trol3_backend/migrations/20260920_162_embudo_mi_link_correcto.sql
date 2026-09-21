-- 162: el embudo de /mi, midiendo el link correcto.
--
-- La 161 nació mal y duró una hora. `link_abierto` sólo lo emite la ruta vieja
-- /e/<persona> (la del código por SMS); el mi_link (/m/ y /c/) NO emite evento:
-- su uso queda en public.b2c_magic_tokens (usado_at, usos). Y `mi_link_generado`
-- cuenta también los ~110 expedientes por semana que un asesor abre en /trabajo
-- (campania = 'asesor', ~7 tokens por persona: uno por carga de página), que
-- nadie le manda al cliente. Comparar esas dos cosas dio el "59 de 342 (17%)"
-- con el que arrancó claude/70: ese número no significa nada.
--
-- Ahora: recibieron = personas con un token que SÍ iba para ellas (todo menos
-- 'asesor'); abrieron = lo canjearon. Lo demás, igual que en la 161.

drop view if exists trol3.v_embudo_mi;
create view trol3.v_embudo_mi as
with tok as (
  select p.id as persona_id,
         date_trunc('week', t.creado_at at time zone 'America/Mexico_City')::date as semana,
         bool_or(t.usado_at is not null) as abrio
    from public.b2c_magic_tokens t
    join trol3.personas p on p.legacy_cliente_id = t.cliente_id
   where coalesce(t.campania, '') <> 'asesor'
   group by 1, 2
),
hizo as (
  select k.semana, k.persona_id,
    exists (select 1 from trol3.datos d where d.persona_id = k.persona_id and d.origen_tipo::text = 'cliente'
              and date_trunc('week', d.created_at at time zone 'America/Mexico_City')::date = k.semana) as capturo,
    exists (select 1 from trol3.documentos d where d.persona_id = k.persona_id and d.origen_tipo::text = 'cliente'
              and date_trunc('week', d.created_at at time zone 'America/Mexico_City')::date = k.semana) as subio,
    exists (select 1 from trol3.consultas c where c.persona_id = k.persona_id and c.solicitante_tipo::text = 'cliente'
              and date_trunc('week', c.created_at at time zone 'America/Mexico_City')::date = k.semana) as pidio,
    exists (select 1 from (select persona_id, actor_tipo, created_at from trol3.eventos where tipo = 'handoff'
                           union all
                           select persona_id, actor_tipo, created_at from trol3.eventos_archivo where tipo = 'handoff') h
             where h.persona_id = k.persona_id and h.actor_tipo::text = 'cliente'
               and date_trunc('week', h.created_at at time zone 'America/Mexico_City')::date = k.semana) as al_chat
  from tok k where k.abrio
)
select k.semana,
       count(*)                                  as recibieron,
       count(*) filter (where k.abrio)           as abrieron,
       count(*) filter (where h.capturo)         as capturaron,
       count(*) filter (where h.subio)           as subieron,
       count(*) filter (where h.pidio)           as pidieron,
       count(*) filter (where h.al_chat)         as al_chat,
       count(*) filter (where h.capturo or h.subio or h.pidio or h.al_chat) as actuaron,
       round(100.0 * count(*) filter (where k.abrio) / nullif(count(*), 0), 1) as pct_abre,
       round(100.0 * count(*) filter (where h.capturo or h.subio or h.pidio or h.al_chat)
             / nullif(count(*) filter (where k.abrio), 0), 1) as pct_actua
from tok k left join hizo h using (semana, persona_id)
group by 1 order by 1 desc;

revoke all on trol3.v_embudo_mi from anon, authenticated;