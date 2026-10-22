-- 257 — Segmentos y lote de la campaña «cambio de Modalidad 40» (claude/106 §8).
--
-- `trol3.v_segmentos_mod40_2026`: toda la base Ley 73 no pensionada, en los
-- segmentos del barrido del 22-oct (A inscrito pagando · B ex-Mod 40 < 12 m ·
-- C Mod 40 en vuelo · D desempleado 60+ con derechos · E desempleado < 60 con
-- derechos · F derechos perdidos · G última Mod 10 · H empleado), con el orden
-- de contacto acordado con Raúl: C → B → A → H (Infonavit ≥ 250k y < 62) → D →
-- G (60+) → F (60+) → resto.
--
-- `trol3.encolar_lote_mod40(p_segmento, p_n, p_dry)`: encola la plantilla
-- `trol_mod40_cambio` (motivo `m40`, que Lukas atiende con §14.7 de v20.9) a las
-- primeras p_n personas del segmento que tengan teléfono, no estén en baja, no
-- la hayan recibido y pasen el candado de una plantilla al día. Con p_dry = true
-- (default) sólo cuenta. ⚠️ Insertar en cola_envios = enviar: correr sólo con la
-- plantilla aprobada en Meta y el motor v5.8 ya recalculado para ese segmento.

create or replace view trol3.v_segmentos_mod40_2026
with (security_invoker = false) as
with d as (
  select persona_id, campo, valor #>> '{}' as v
  from trol3.v_mejor_dato
  where campo in ('ley','status_empleo','ultima_modalidad','conserva_derechos','saldo_infonavit','credito_infonavit_vigente','pension_base','mod40_regimen','mod40_permitida','estatus_nomina')
),
p as (
  select pe.id as persona_id, pe.nombre, pe.apellidos, pe.cabecera_id, pe.fecha_nacimiento,
         extract(year from age(pe.fecha_nacimiento))::int as edad,
         max(v) filter (where campo = 'ley') as ley,
         max(v) filter (where campo = 'status_empleo') as status_empleo,
         max(v) filter (where campo = 'ultima_modalidad') as ultima_modalidad,
         max(v) filter (where campo = 'conserva_derechos') as conserva,
         trol3.to_num_safe(max(v) filter (where campo = 'saldo_infonavit')) as saldo_infonavit,
         max(v) filter (where campo = 'credito_infonavit_vigente') as credito_vigente,
         trol3.to_num_safe(max(v) filter (where campo = 'pension_base')) as pension_base,
         max(v) filter (where campo = 'mod40_regimen') as mod40_regimen,
         max(v) filter (where campo = 'mod40_permitida') as mod40_permitida,
         max(v) filter (where campo = 'estatus_nomina') as estatus_nomina
  from trol3.personas pe join d on d.persona_id = pe.id
  where pe.merged_into is null
  group by pe.id, pe.nombre, pe.apellidos, pe.cabecera_id, pe.fecha_nacimiento
),
s as (
  select p.*,
    exists (select 1 from trol3.oportunidades o where o.persona_id = p.persona_id and o.codigo = 'mod40_retro' and o.estado in ('presentada','interesada','en_proceso')) as mod40_en_vuelo,
    case
      when p.ley is distinct from 'Ley73' or p.status_empleo = 'pensionado' or p.estatus_nomina = 'pensionado' then null
      when exists (select 1 from trol3.oportunidades o where o.persona_id = p.persona_id and o.codigo = 'mod40_retro' and o.estado in ('presentada','interesada','en_proceso')) then 'C'
      when p.mod40_regimen = 'anterior' or (p.ultima_modalidad = 'mod40' and p.status_empleo = 'empleado') then 'A'
      when p.ultima_modalidad = 'mod40' and p.conserva = 'true' then 'B'
      when p.ultima_modalidad = 'independiente' and p.conserva = 'true' then 'G'
      when p.conserva = 'false' then 'F'
      when p.status_empleo = 'empleado' then 'H'
      when p.status_empleo = 'desempleado' and p.edad >= 60 then 'D'
      when p.status_empleo = 'desempleado' then 'E'
      else null end as segmento
  from p
)
select s.persona_id, s.nombre, s.apellidos, trol3.nombre_saludo(s.nombre) as saludo, s.cabecera_id,
       s.edad, s.status_empleo, s.ultima_modalidad, s.conserva = 'true' as derechos_ok,
       s.saldo_infonavit, coalesce(s.credito_vigente, 'false') = 'true' as credito_vigente,
       s.pension_base, s.mod40_regimen, s.mod40_permitida = 'true' as mod40_permitida,
       s.segmento,
       case s.segmento
         when 'C' then 1 when 'B' then 2 when 'A' then 3
         when 'H' then case when coalesce(s.saldo_infonavit, 0) >= 250000 and coalesce(s.credito_vigente, 'false') <> 'true' and s.edad < 62 then 4 else 8 end
         when 'D' then 5
         when 'G' then case when s.edad >= 60 then 6 else 8 end
         when 'F' then case when s.edad >= 60 then 7 else 8 end
         else 8 end as orden,
       (select c.normalizado from trol3.contactos c where c.persona_id = s.persona_id and c.tipo = 'telefono' and not c.no_contactar order by c.principal desc limit 1) as telefono,
       exists (select 1 from trol3.cola_envios q where q.persona_id = s.persona_id and q.plantilla = 'trol_mod40_cambio') as ya_enviada,
       (select max(c.calculo_pensional->'meta'->>'version_sistema') from public.clientes c join trol3.personas pe on pe.legacy_cliente_id = c.id where pe.id = s.persona_id) like '2.8.%' as recalculada_v58
from s
where s.segmento is not null and trol3.es_miembro();

comment on view trol3.v_segmentos_mod40_2026 is '257 (claude/106): segmentos A–H de la campaña «cambio de Modalidad 40» con orden de contacto. Analítica de equipo.';
revoke all on trol3.v_segmentos_mod40_2026 from public, anon;
grant select on trol3.v_segmentos_mod40_2026 to authenticated, service_role;

create or replace function trol3.encolar_lote_mod40(p_segmento text, p_n integer default 50, p_dry boolean default true)
returns jsonb
language plpgsql security definer set search_path to 'trol3','public'
as $fn$
declare r record; n int := 0; omitidas int := 0; ids uuid[] := '{}';
begin
  if not trol3.tiene_rol('admin') then raise exception 'sólo admin'; end if;
  for r in
    select * from trol3.v_segmentos_mod40_2026
     where segmento = p_segmento and telefono is not null and not ya_enviada and recalculada_v58
     order by orden, edad desc
     limit greatest(1, least(p_n, 500))
  loop
    if coalesce((trol3.puede_plantilla(r.persona_id)->>'ok')::boolean, false) = false then omitidas := omitidas + 1; continue; end if;
    if not p_dry then
      perform trol3.encolar_envio(r.persona_id, 'trol_mod40_cambio', 'm40', null,
        jsonb_build_object('campana', 'm40', 'segmento', r.segmento, 'plantilla', 'trol_mod40_cambio', 'notificar_cliente', true));
    end if;
    n := n + 1; ids := ids || r.persona_id;
  end loop;
  return jsonb_build_object('segmento', p_segmento, 'dry', p_dry, 'encoladas', n, 'omitidas_por_candado', omitidas, 'personas', ids);
end $fn$;
revoke all on function trol3.encolar_lote_mod40(text, integer, boolean) from public, anon;
grant execute on function trol3.encolar_lote_mod40(text, integer, boolean) to authenticated, service_role;
