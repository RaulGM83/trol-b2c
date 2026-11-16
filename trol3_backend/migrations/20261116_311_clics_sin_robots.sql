-- 311: los clics de /i/<codigo> distinguen robots de personas.
-- La clasificación es por firma del navegador (user agent); es conservadora.
-- Aplicada en producción el 16-nov-2026.

create or replace function trol3.es_robot_ua(p_ua text) returns boolean
language sql immutable as $$
  select p_ua is null or btrim(p_ua) = ''
    or p_ua ~* '(bot|crawl|spider|slurp|python|curl|wget|headless|preview|facebookexternalhit|whatsapp/|dataprovider|discovery|okhttp|go-http|axios|node-fetch|java/|libwww|lighthouse|scan|monitor|geedo|ibou|http-client|fetch)'
    or p_ua ~ '\(HTML, like Gecko\)'
    or p_ua ~ 'Android 5\.0\)|iPhone OS 13_2_3|iPhone OS 6_0|Nexus 5X Build/MMB29P|Mac OS X 10_11_1'
    or coalesce((regexp_match(p_ua, 'Chrome/(\d+)'))[1]::int, 999) < 120
$$;

alter table trol3.clics_invitacion add column if not exists es_robot boolean not null default false;
update trol3.clics_invitacion set es_robot = trol3.es_robot_ua(user_agent);
create index if not exists clics_invitacion_reales_idx on trol3.clics_invitacion (codigo, created_at) where not es_robot;

create or replace function trol3.registrar_clic(p_codigo text, p_user_agent text default null, p_referer text default null, p_ip text default null)
returns void language plpgsql security definer
set search_path to 'trol3', 'public', 'extensions'
as $function$
declare cod text; sal text;
begin
  cod := trol3.normalizar_codigo(p_codigo);
  if cod is null then return; end if;
  select valor into sal from trol3.config where clave = 'ip_hash_salt';
  insert into trol3.clics_invitacion (codigo, user_agent, referer, ip_hash, es_robot)
  values (cod, left(p_user_agent, 300), left(p_referer, 300),
          case when p_ip is null then null
               else encode(extensions.digest(coalesce(sal,'trol')||p_ip, 'sha256'), 'hex') end,
          trol3.es_robot_ua(p_user_agent));
exception when others then
  -- El redirect nunca se rompe, pero el fallo queda en los logs.
  raise warning 'registrar_clic(%): %', cod, sqlerrm;
  return;
end $function$;

-- Embudo por código: «clics» son solo personas; los robots van aparte.
create or replace view trol3.v_embudo_codigo with (security_invoker = false) as
select codigo, tipo, etiqueta, miembro, clics, altas, con_curp, con_consulta, asesorados, ultima_actividad, clics_robot
from (
  with clic as (
    select codigo,
           count(*) filter (where not es_robot) as clics,
           count(*) filter (where es_robot) as clics_robot,
           max(created_at) filter (where not es_robot) as ultimo_clic
      from trol3.clics_invitacion group by codigo
  ), alta as (
    select p.codigo_origen as codigo,
           count(*) as altas,
           count(*) filter (where p.curp is not null) as con_curp,
           count(*) filter (where exists (select 1 from trol3.consultas c_1 where c_1.persona_id = p.id and c_1.estado = 'completada'::trol3.estado_consulta)) as con_consulta,
           count(*) filter (where p.etapa = any (array['asesorado'::text, 'cliente'::text])) as asesorados,
           max(p.created_at) as ultima_alta
      from trol3.personas p
     where p.codigo_origen is not null and p.merged_into is null
     group by p.codigo_origen
  )
  select coalesce(a.codigo, c.codigo) as codigo, ci.tipo, ci.etiqueta, m.nombre as miembro,
         coalesce(c.clics, 0::bigint) as clics,
         coalesce(a.altas, 0::bigint) as altas,
         coalesce(a.con_curp, 0::bigint) as con_curp,
         coalesce(a.con_consulta, 0::bigint) as con_consulta,
         coalesce(a.asesorados, 0::bigint) as asesorados,
         greatest(c.ultimo_clic, a.ultima_alta) as ultima_actividad,
         coalesce(c.clics_robot, 0::bigint) as clics_robot
    from alta a
    full join clic c on c.codigo = a.codigo
    left join trol3.codigos_invitacion ci on ci.codigo = coalesce(a.codigo, c.codigo)
    left join trol3.miembros m on m.id = ci.miembro_id
) q_311
where trol3.es_miembro();

-- Panel de evento: los clics que muestra son solo de personas.
do $$
declare d text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'trol3' and p.proname = 'evento_panel';
  if position('not ci.es_robot' in d) > 0 then return; end if;
  if position('where ci.codigo = p_codigo and (p_desde' in d) = 0 then
    raise exception 'evento_panel cambió; revisar a mano';
  end if;
  execute replace(d, 'where ci.codigo = p_codigo and (p_desde', 'where ci.codigo = p_codigo and not ci.es_robot and (p_desde');
end $$;
