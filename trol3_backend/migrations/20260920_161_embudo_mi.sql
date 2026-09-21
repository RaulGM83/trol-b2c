-- 161: medir si /mi sirve — recibió el link → lo abrió → hizo algo.
--
-- Pendiente 6 del handoff ("medir quién abre el link y no escribe") y la vara
-- del Hoy nuevo (157–160, en producción desde el 20-sep por la noche). Por semana
-- (lunes, hora de México) y en PERSONAS, no en eventos:
--   recibieron  = se les generó un mi_link (bot, campaña, asesor, /avisar)
--   abrieron    = canjearon el link (link_abierto). No cuenta a quien entra con
--                 sesión viva sin link: es un piso, no el total de visitas.
--   capturaron  = de los que abrieron, declararon algún dato ellos mismos
--   subieron    = … subieron un documento ellos mismos
--   pidieron    = … pidieron una consulta ellos mismos (CURP, actualizar IMSS)
--   al_chat     = … apretaron un botón que abre el chat (handoff de actor cliente)
--   actuaron    = cualquiera de las cuatro
-- Línea base (35 días previos): 342 recibieron, 59 abrieron, 10 capturaron,
-- 0 subieron. Los eventos viejos viven en eventos_archivo (146): se leen los dos.

create or replace view trol3.v_embudo_mi as
with ev as (
  select persona_id, tipo, actor_tipo::text as actor, created_at from trol3.eventos
   where tipo in ('mi_link_generado','link_abierto','handoff')
  union all
  select persona_id, tipo, actor_tipo::text, created_at from trol3.eventos_archivo
   where tipo in ('mi_link_generado','link_abierto','handoff')
),
sem as (
  select persona_id, tipo, actor,
         date_trunc('week', created_at at time zone 'America/Mexico_City')::date as semana
    from ev where persona_id is not null
),
abrio as (select distinct semana, persona_id from sem where tipo = 'link_abierto'),
hizo as (
  select a.semana, a.persona_id,
    exists (select 1 from trol3.datos d where d.persona_id = a.persona_id and d.origen_tipo::text = 'cliente'
              and date_trunc('week', d.created_at at time zone 'America/Mexico_City')::date = a.semana) as capturo,
    exists (select 1 from trol3.documentos d where d.persona_id = a.persona_id and d.origen_tipo::text = 'cliente'
              and date_trunc('week', d.created_at at time zone 'America/Mexico_City')::date = a.semana) as subio,
    exists (select 1 from trol3.consultas c where c.persona_id = a.persona_id and c.solicitante_tipo::text = 'cliente'
              and date_trunc('week', c.created_at at time zone 'America/Mexico_City')::date = a.semana) as pidio,
    exists (select 1 from sem s where s.persona_id = a.persona_id and s.semana = a.semana
              and s.tipo = 'handoff' and s.actor = 'cliente') as al_chat
  from abrio a
)
select r.semana,
       r.recibieron,
       coalesce(h.abrieron, 0)   as abrieron,
       coalesce(h.capturaron, 0) as capturaron,
       coalesce(h.subieron, 0)   as subieron,
       coalesce(h.pidieron, 0)   as pidieron,
       coalesce(h.al_chat, 0)    as al_chat,
       coalesce(h.actuaron, 0)   as actuaron,
       round(100.0 * coalesce(h.abrieron, 0) / nullif(r.recibieron, 0), 1) as pct_abre,
       round(100.0 * coalesce(h.actuaron, 0) / nullif(h.abrieron, 0), 1)   as pct_actua
from (select semana, count(distinct persona_id) as recibieron from sem where tipo = 'mi_link_generado' group by 1) r
left join (
  select semana, count(*) as abrieron,
         count(*) filter (where capturo) as capturaron, count(*) filter (where subio) as subieron,
         count(*) filter (where pidio) as pidieron, count(*) filter (where al_chat) as al_chat,
         count(*) filter (where capturo or subio or pidio or al_chat) as actuaron
    from hizo group by 1
) h using (semana)
order by r.semana desc;

revoke all on trol3.v_embudo_mi from anon, authenticated;